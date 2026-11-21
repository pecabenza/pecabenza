import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface NormalizedCepResponse {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cep: string }> }
) {
  const { cep } = await params;
  const cleanCep = (cep || '').replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    return NextResponse.json({ error: 'CEP inválido. Informe 8 dígitos.' }, { status: 400 });
  }

  // 1. Tenta ViaCEP com timeout curto
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.erro && (data.logradouro || data.localidade)) {
        const normalized: NormalizedCepResponse = {
          cep: cleanCep,
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: (data.uf || '').toUpperCase(),
        };
        return NextResponse.json(normalized, { status: 200 });
      }
    }
  } catch {
    // Segue para fallback BrasilAPI
  }

  // 2. Fallback: BrasilAPI
  try {
    const resBr = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (resBr.ok) {
      const dataBr = await resBr.json();
      const normalized: NormalizedCepResponse = {
        cep: cleanCep,
        street: dataBr.street || '',
        neighborhood: dataBr.neighborhood || '',
        city: dataBr.city || '',
        state: (dataBr.state || '').toUpperCase(),
      };
      return NextResponse.json(normalized, { status: 200 });
    }
  } catch {
    // Segue para resposta 404
  }

  return NextResponse.json({ error: 'CEP não encontrado.' }, { status: 404 });
}

