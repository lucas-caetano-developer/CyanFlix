import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Account } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';

export function AccountAccessPanel() {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession });
  const accounts = useQuery({
    queryKey: ['admin', 'accounts'],
    queryFn: api.getAdminAccounts,
    enabled: session.data?.role === 'owner',
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');

  const createAccount = useMutation({
    mutationFn: api.createAccount,
    onSuccess: async () => {
      setUsername('');
      setPassword('');
      setRole('viewer');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
    },
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.updateAccount(id, { disabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] }),
  });

  if (session.data?.role !== 'owner') return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    createAccount.mutate({ username, password, role });
  }

  return (
    <section className="admin__section" id="accounts">
      <h2 className="admin__section-title">Contas e acessos</h2>
      <p className="admin__section-description">Crie acessos individuais. Cada conta mantém seus próprios perfis, favoritos e progresso.</p>
      <form className="admin__account-form" onSubmit={submit}>
        <label>
          <span>Usuário</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" minLength={3} maxLength={64} required />
        </label>
        <label>
          <span>Senha inicial</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
        </label>
        <label>
          <span>Função</span>
          <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'viewer')}>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="btn btn--primary" disabled={createAccount.isPending}>Criar conta</button>
      </form>
      {createAccount.isError && <div className="admin__error">Não foi possível criar a conta. Verifique usuário e senha.</div>}
      <div className="admin__table admin__accounts">
        {accounts.data?.map((account: Account) => (
          <div className="admin__account-row" key={account.id}>
            <div className="admin__revision-title"><strong>{account.username}</strong><span>{account._count?.profiles ?? 0} perfil(is)</span></div>
            <Badge variant={account.disabled ? 'incomplete' : 'dub'} label={account.disabled ? 'Desativada' : 'Ativa'} />
            <span className="admin__account-role">{account.role}</span>
            <span>{new Date(account.createdAt).toLocaleDateString('pt-BR')}</span>
            {account.role === 'owner' ? <span className="admin__owner-label">Conta principal</span> : (
              <button className="btn btn--secondary" disabled={updateAccount.isPending} onClick={() => updateAccount.mutate({ id: account.id, disabled: !account.disabled })}>
                {account.disabled ? 'Reativar' : 'Desativar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
