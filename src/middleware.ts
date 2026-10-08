import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { buildContentSecurityPolicy, buildHstsHeader } from '@/lib/security/csp';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000';
  const pathname = request.nextUrl.pathname;
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';

  // 1. Injetar x-tenant-host nos headers da requisição
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-host', host);

  // 2. Proteção contra Brute Force em /admin/login via POST
  if (pathname === '/admin/login' && request.method === 'POST') {
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 5,
      windowSeconds: 60,
      prefix: 'auth_login',
    });

    if (!rateLimit.success) {
      return new NextResponse(
        JSON.stringify({
          error: 'Muitas tentativas de login. Aguarde 1 minuto antes de tentar novamente.',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimit.reset),
          },
        }
      );
    }
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 3. Injetar Headers de Segurança Essenciais
  response.headers.set('x-tenant-host', host);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy());

  const hsts = buildHstsHeader();
  if (hsts) {
    response.headers.set('Strict-Transport-Security', hsts);
  }

  // 4. Criar cliente Supabase para atualizar sessão se necessário
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // 5. Proteger rotas /admin (exceto /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Interceptar todas as rotas exceto arquivos estáticos, favicon, imagens, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
