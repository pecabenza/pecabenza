'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  KeyRound,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type { TenantRole } from '@/types/database.types';

interface MemberRow {
  id: string;
  userId: string;
  role: TenantRole;
  isActive: boolean;
  createdAt: string;
  email: string;
  name: string;
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<TenantRole>('tenant_manager');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formulário: Alterar minha senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newOwnPassword, setNewOwnPassword] = useState('');
  const [confirmOwnPassword, setConfirmOwnPassword] = useState('');
  const [savingOwnPassword, setSavingOwnPassword] = useState(false);

  // Formulário: Criar novo usuário
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newRole, setNewRole] = useState<TenantRole>('tenant_manager');
  const [creatingUser, setCreatingUser] = useState(false);

  // Redefinir senha de membro específico
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao carregar usuários.');
      }
      setCurrentUserId(data.currentUserId || '');
      setCurrentUserEmail(data.currentUserEmail || '');
      setCurrentUserRole(data.currentUserRole || 'tenant_manager');
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (err: any) {
      setError(err?.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newOwnPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newOwnPassword !== confirmOwnPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }

    setSavingOwnPassword(true);
    try {
      const res = await fetch('/api/admin/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword: newOwnPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Não foi possível alterar sua senha.');
        return;
      }
      setCurrentPassword('');
      setNewOwnPassword('');
      setConfirmOwnPassword('');
      setSuccess('Sua senha foi alterada com sucesso.');
    } catch {
      setError('Erro de conexão ao alterar senha.');
    } finally {
      setSavingOwnPassword(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newUserPassword,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Não foi possível criar o usuário.');
        return;
      }
      setNewName('');
      setNewEmail('');
      setNewUserPassword('');
      setNewRole('tenant_manager');
      setSuccess(`Usuário ${data.member?.email} criado e vinculado com sucesso.`);
      await loadUsers();
    } catch {
      setError('Erro de conexão ao criar usuário.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateMember = async (
    memberId: string,
    patch: { role?: TenantRole; isActive?: boolean; newPassword?: string }
  ) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Não foi possível atualizar o usuário.');
        return;
      }
      setResetTargetId(null);
      setResetPasswordValue('');
      setSuccess('Usuário atualizado com sucesso.');
      await loadUsers();
    } catch {
      setError('Erro de conexão ao atualizar usuário.');
    }
  };

  const isAdmin = currentUserRole === 'tenant_admin';

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-600" />
            Usuários, Permissões & Senha
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Gerencie sua senha de acesso, crie contas da equipe e controle os níveis de permissão.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 1. Alterar Minha Senha */}
      <form
        onSubmit={handleChangeOwnPassword}
        className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <h2 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              Alterar Minha Senha
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Conectado como <strong>{currentUserEmail || '—'}</strong> (
              {currentUserRole === 'tenant_admin' ? 'Administrador' : 'Gerente Operacional'})
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Senha atual *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Nova senha (mín. 8) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newOwnPassword}
              onChange={(e) => setNewOwnPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Confirmar nova senha *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmOwnPassword}
              onChange={(e) => setConfirmOwnPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingOwnPassword}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
          >
            {savingOwnPassword ? 'Salvando...' : 'Atualizar Minha Senha'}
          </button>
        </div>
      </form>

      {/* 2. Criar Novo Usuário (apenas tenant_admin) */}
      {isAdmin && (
        <form
          onSubmit={handleCreateUser}
          className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4"
        >
          <div className="border-b border-stone-100 pb-3">
            <h2 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-600" />
              Criar Novo Usuário
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              <strong>Administrador</strong> tem acesso total; <strong>Gerente Operacional</strong> opera pedidos, KDS e cardápio.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Nome *</label>
              <input
                type="text"
                required
                minLength={2}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Ana Cozinha"
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">E-mail *</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="equipe@benza.com.br"
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Senha inicial (mín. 8) *
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Permissão *</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as TenantRole)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm bg-white"
              >
                <option value="tenant_manager">Gerente Operacional</option>
                <option value="tenant_admin">Administrador (Total)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingUser}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
            >
              {creatingUser ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      )}

      {/* 3. Lista de Usuários & Permissões */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="border-b border-stone-100 pb-3">
          <h2 className="font-bold text-stone-900 text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            Usuários do Estabelecimento ({members.length})
          </h2>
        </div>

        {loading ? (
          <p className="text-xs text-stone-500">Carregando usuários...</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{m.name}</span>
                      {isSelf && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Você
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          m.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {m.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 truncate">{m.email}</p>
                  </div>

                  {isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          void handleUpdateMember(m.id, { role: e.target.value as TenantRole })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs font-medium"
                      >
                        <option value="tenant_manager">Gerente Operacional</option>
                        <option value="tenant_admin">Administrador</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateMember(m.id, { isActive: !m.isActive })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-xs font-semibold text-stone-700"
                      >
                        {m.isActive ? 'Desativar' : 'Ativar'}
                      </button>

                      {resetTargetId === m.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="password"
                            minLength={8}
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            placeholder="Nova senha (8+)"
                            className="w-32 px-2 py-1 rounded-lg border border-stone-200 bg-white text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateMember(m.id, { newPassword: resetPasswordValue })
                            }
                            className="px-2.5 py-1 rounded-lg bg-stone-900 text-white text-xs font-bold"
                          >
                            Salvar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setResetTargetId(m.id);
                            setResetPasswordValue('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-xs font-semibold text-stone-700"
                        >
                          Redefinir senha
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-stone-600">
                      {m.role === 'tenant_admin' ? 'Administrador' : 'Gerente Operacional'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

