import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Account } from "../../lib/types";
import { Badge } from "../../components/ui/Badge";

export function AdminClientsPage() {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });

  const accounts = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: api.getAdminAccounts,
    enabled: session.data?.role === "owner",
  });

  // Create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const createAccount = useMutation({
    mutationFn: api.createAccount,
    onSuccess: async () => {
      setUsername("");
      setPassword("");
      setRole("viewer");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      api.updateAccount(id, { disabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    createAccount.mutate({ username: username.trim(), password, role });
  };

  if (session.data?.role !== "owner") {
    return (
      <div className="admin-page">
        <div className="admin-catalog__empty">
          <p>Apenas a conta principal (proprietário/owner) possui permissão para gerenciar contas de clientes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Gerenciamento de Acessos</span>
          <h1 className="admin-page__title">Contas de Clientes</h1>
          <p className="admin-page__subtitle">
            Crie novas contas, controle o status de ativação/inatividade e exclua acessos de clientes.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreateOpen(true)}
          >
            + Nova Conta de Cliente
          </button>
        </div>
      </div>

      {/* Account Table */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Função</th>
              <th>Perfis Vinculados</th>
              <th>Status</th>
              <th>Criada em</th>
              <th style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.data?.map((acc: Account) => (
              <tr key={acc.id}>
                <td>
                  <div className="admin-account-cell">
                    <strong>{acc.username}</strong>
                    {acc.id === session.data?.accountId && (
                      <span className="admin-badge-current">(Sua conta atual)</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`admin-type-tag admin-type-tag--${acc.role === "owner" ? "collection" : "system"}`}>
                    {acc.role === "owner" ? "Proprietário" : acc.role === "admin" ? "Administrador" : "Cliente / Viewer"}
                  </span>
                </td>
                <td>
                  <span>{acc._count?.profiles ?? 0} perfil(is)</span>
                </td>
                <td>
                  <Badge
                    variant={acc.disabled ? "incomplete" : "dub"}
                    label={acc.disabled ? "Inativa" : "Ativa"}
                  />
                </td>
                <td>{new Date(acc.createdAt).toLocaleDateString("pt-BR")}</td>
                <td style={{ textAlign: "right" }}>
                  <div className="admin-row-actions">
                    {acc.role === "owner" ? (
                      <span className="admin-owner-protected">Protegida</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          disabled={updateAccount.isPending}
                          onClick={() => updateAccount.mutate({ id: acc.id, disabled: !acc.disabled })}
                        >
                          {acc.disabled ? "Ativar Conta" : "Inativar Conta"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setDeleteTarget(acc)}
                        >
                          Excluir Conta
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {!accounts.isLoading && !accounts.data?.length && (
              <tr>
                <td colSpan={6} className="admin-table__empty">
                  Nenhuma conta de cliente cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Account Modal */}
      {createOpen && (
        <div className="admin-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <div className="admin-dialog-card" role="dialog" aria-modal="true" aria-label="Nova Conta de Cliente">
            <h3>Nova Conta de Cliente</h3>
            <p>Cadastre um novo login para acesso à plataforma CyanFlix.</p>

            <form onSubmit={handleCreateSubmit} className="admin-form-vertical">
              <label className="admin-form-group">
                <span>Nome de Usuário</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: cliente_silva"
                  autoComplete="off"
                  minLength={3}
                  maxLength={64}
                  required
                  className="admin-input"
                />
              </label>

              <label className="admin-form-group">
                <span>Senha Inicial</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  autoComplete="new-password"
                  minLength={4}
                  required
                  className="admin-input"
                />
              </label>

              <label className="admin-form-group">
                <span>Função de Acesso</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
                  className="admin-select"
                >
                  <option value="viewer">Cliente (Apenas Streaming / Viewer)</option>
                  <option value="admin">Administrador (Acesso ao Painel Admin)</option>
                </select>
              </label>

              {createAccount.isError && (
                <div className="admin-danger-error">
                  {createAccount.error instanceof Error
                    ? createAccount.error.message
                    : "Falha ao criar conta. Verifique usuário e senha."}
                </div>
              )}

              <div className="admin-dialog-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={createAccount.isPending}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={createAccount.isPending}
                >
                  {createAccount.isPending ? "Criando…" : "Criar Conta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="admin-modal-backdrop">
          <div className="admin-dialog-card" role="dialog" aria-modal="true" aria-label="Confirmar exclusão de conta">
            <h3>Excluir Conta de Cliente</h3>
            <p>
              Tem certeza que deseja excluir a conta de <strong>{deleteTarget.username}</strong>?
            </p>
            <p className="admin-text-danger">
              ⚠️ Esta operação é irreversível. Todos os perfis, listas de favoritos e históricos de reprodução desta conta serão permanentemente excluídos.
            </p>

            {deleteAccount.isError && (
              <div className="admin-danger-error">
                {deleteAccount.error instanceof Error
                  ? deleteAccount.error.message
                  : "Não foi possível excluir a conta."}
              </div>
            )}

            <div className="admin-dialog-actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={deleteAccount.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={deleteAccount.isPending}
                onClick={() => deleteAccount.mutate(deleteTarget.id)}
              >
                {deleteAccount.isPending ? "Excluindo…" : "Excluir Definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
