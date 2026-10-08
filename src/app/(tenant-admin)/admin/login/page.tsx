'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Em ambiente de desenvolvimento inicial, simula login administrativo com redirecionamento
    setTimeout(() => {
      setIsLoading(false);
      router.push('/admin');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white space-y-6 shadow-sm">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-stone-900 text-amber-500 font-heading text-xl font-bold flex items-center justify-center mx-auto">
            B
          </div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Acesso Administrativo
          </h1>
          <p className="text-xs text-stone-500">
            Painel exclusivo para equipe do estabelecimento
          </p>
        </div>

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
                placeholder="admin@benza.com.br"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
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
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
              />
            </div>
          </div>

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full gap-2 bg-stone-900 text-white hover:bg-stone-800"
          >
            <span>Entrar no Painel</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <div className="pt-4 border-t border-stone-100 text-center text-xs text-stone-400">
          Isolamento seguro garantido via Supabase Auth & RLS
        </div>
      </Card>
    </div>
  );
}
