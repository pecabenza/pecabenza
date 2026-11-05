'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/admin';
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    urlError === 'unauthorized'
      ? 'Sua conta não possui permissão para acessar este painel.'
      : urlError === 'session_expired'
      ? 'Sua sessão expirou. Por favor, autentique-se novamente.'
      : null
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      // 1. Autenticar no Supabase Auth via credenciais
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMessage('Credenciais inválidas. Verifique seu e-mail e senha.');
        setIsLoading(false);
        return;
      }

      // 2. Verificar se o usuário possui vínculo ativo com este tenant no servidor
      const verifyRes = await fetch('/api/admin/auth/verify');
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        // Usuário válido no Supabase, porém sem autorização neste tenant
        await supabase.auth.signOut();
        setErrorMessage(
          verifyData.error || 'Acesso negado: seu usuário não possui vínculo com este estabelecimento.'
        );
        setIsLoading(false);
        return;
      }

      // 3. Sucesso: Redirecionar para a rota administrativa
      router.push(redirectPath);
      router.refresh();
    } catch {
      setErrorMessage('Ocorreu um erro ao processar o login. Tente novamente em instantes.');
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-8 bg-white space-y-6 shadow-sm border border-stone-200">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-stone-900 text-amber-500 font-heading text-xl font-bold flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-amber-500" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-stone-900">
          Acesso Administrativo
        </h1>
        <p className="text-xs text-stone-500">
          Painel exclusivo para equipe de gestão do estabelecimento
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-600">
            E-mail de Acesso
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu-email@estabelecimento.com.br"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Senha
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800"
            />
          </div>
        </div>

        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full gap-2 bg-stone-900 text-white hover:bg-stone-800 mt-2"
        >
          <span>Entrar no Painel</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>

      <div className="pt-4 border-t border-stone-100 text-center text-xs text-stone-400">
        Isolamento seguro garantido via Supabase Auth & RLS
      </div>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-sm text-stone-500">Carregando painel de login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
