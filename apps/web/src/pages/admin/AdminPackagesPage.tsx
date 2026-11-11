import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { formatBytes } from "../../lib/utils";
import type { Publication, Revision } from "../../lib/types";

const states = [
  { value: "", label: "Todos os status" },
  { value: "confirmed", label: "Confirmados" },
  { value: "failed", label: "Falhas" },
  { value: "validating", label: "Validando" },
  { value: "promoting", label: "Promovendo" },
  { value: "uploading", label: "Recebendo arquivos" },
  { value: "waiting_files", label: "Aguardando arquivos" },
];

export function AdminPackagesPage() {
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState<"packages" | "revisions">("packages");

  // Packages state
  const [stateFilter, setStateFilter] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Deletion modal state
  const [deletePackageOpen, setDeletePackageOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [targetPackage, setTargetPackage] = useState<{ id: string; packageId: string } | null>(null);

  const session = useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });

  const publications = useQuery({
    queryKey: ["admin", "publications", stateFilter, cursor],
    queryFn: () => api.getAdminPublications(cursor, stateFilter),
    enabled: activeTab === "packages",
  });

  const detail = useQuery({
    queryKey: ["admin", "publication", selectedPackageId],
    queryFn: () => api.getAdminPublication(selectedPackageId!),
    enabled: Boolean(selectedPackageId),
  });

  const revisions = useQuery({
    queryKey: ["admin", "revisions"],
    queryFn: api.getAdminRevisions,
    enabled: activeTab === "revisions",
  });

  const retry = useMutation({
    mutationFn: api.retryPublication,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "publications"] }),
        client.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ]);
    },
  });

  const activateRevision = useMutation({
    mutationFn: api.activateRevision,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "revisions"] }),
        client.invalidateQueries({ queryKey: ["home"] }),
        client.invalidateQueries({ queryKey: ["work"] }),
        client.invalidateQueries({ queryKey: ["playback"] }),
      ]);
    },
  });

  const removePublication = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: string }) =>
      api.deleteAdminPublication(id, confirm),
    onSuccess: async () => {
      setDeletePackageOpen(false);
      setDeleteConfirmation("");
      setTargetPackage(null);
      setSelectedPackageId(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "publications"] }),
        client.invalidateQueries({ queryKey: ["admin", "revisions"] }),
        client.invalidateQueries({ queryKey: ["admin", "storage"] }),
        client.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
        client.invalidateQueries({ queryKey: ["admin", "catalog"] }),
      ]);
    },
  });

  const openDeleteModal = (id: string, packageId: string) => {
    setTargetPackage({ id, packageId });
    setDeleteConfirmation("");
    setDeletePackageOpen(true);
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Repositório & Ingestão</span>
          <h1 className="admin-page__title">Pacotes e Revisões</h1>
          <p className="admin-page__subtitle">
            Monitore o recebimento de pacotes, retome falhas, audite arquivos e confira as revisões ativas ou substituídas por obra.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === "packages" ? "admin-tab--active" : ""}`}
          onClick={() => setActiveTab("packages")}
        >
          📦 Pacotes Recebidos
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === "revisions" ? "admin-tab--active" : ""}`}
          onClick={() => setActiveTab("revisions")}
        >
          🔄 Revisões do Catálogo
        </button>
      </div>

      {/* TAB 1: PACOTES RECEBIDOS */}
      {activeTab === "packages" && (
        <section className="admin-packages-section">
          <div className="admin-packages__toolbar">
            <label className="admin-filter-select-label">
              <span>Status do Pacote:</span>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                  setCursor(undefined);
                }}
                className="admin-select"
              >
                {states.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Package ID</th>
                  <th>Tipo</th>
                  <th>Arquivos / Tamanho</th>
                  <th>Status</th>
                  <th>Data de Recebimento</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {publications.data?.items?.map((pub: Publication) => (
                  <tr key={pub.id}>
                    <td>
                      <div className="admin-pkg-id-cell">
                        <strong>{pub.packageId}</strong>
                        {pub.errorMessage && (
                          <span className="admin-pkg-error-hint" title={pub.errorMessage}>
                            ⚠️ {pub.errorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="admin-type-tag admin-type-tag--system">
                        {pub.packageType === "episode_replacement"
                          ? "Substituição de Ep"
                          : pub.packageType === "season"
                          ? "Temporada"
                          : pub.packageType === "movie"
                          ? "Filme"
                          : pub.packageType ?? "Pacote"}
                      </span>
                    </td>
                    <td>
                      <span>{pub._count?.files ?? 0} arquivos</span>
                      <small className="admin-text-muted"> · {formatBytes(pub.totalSizeBytes)}</small>
                    </td>
                    <td>
                      <Badge
                        variant={
                          pub.state === "confirmed"
                            ? "dub"
                            : pub.state === "failed"
                            ? "incomplete"
                            : "kind"
                        }
                        label={
                          pub.state === "confirmed"
                            ? "Confirmado"
                            : pub.state === "failed"
                            ? "Falhou"
                            : pub.state === "validating"
                            ? "Validando"
                            : pub.state === "promoting"
                            ? "Promovendo"
                            : pub.state === "uploading"
                            ? "Recebendo"
                            : pub.state
                        }
                      />
                    </td>
                    <td>{new Date(pub.createdAt).toLocaleString("pt-BR")}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="admin-row-actions">
                        {pub.state === "failed" && (
                          <button
                            type="button"
                            className="btn btn--primary btn--xs"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(pub.id)}
                            title="Continuar validação e finalização do pacote"
                          >
                            ▶ Continuar Falha
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          onClick={() => setSelectedPackageId(pub.id)}
                        >
                          Ver Detalhes
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          disabled={session.data?.role !== "owner"}
                          onClick={() => openDeleteModal(pub.id, pub.packageId)}
                          title="Excluir pacote por completo"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!publications.isLoading && !publications.data?.items?.length && (
                  <tr>
                    <td colSpan={6} className="admin-table__empty">
                      Nenhum pacote encontrado com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {publications.data?.nextCursor && (
            <div className="admin-pagination">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setCursor(publications.data?.nextCursor ?? undefined)}
              >
                Carregar mais pacotes
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: REVISÕES DO CATÁLOGO */}
      {activeTab === "revisions" && (
        <section className="admin-revisions-section">
          <div className="admin-info-banner">
            <div className="admin-info-banner__icon">🔄</div>
            <div className="admin-info-banner__text">
              <strong>Histórico de Revisões e Substituições de Pacotes</strong>
              <p>
                Acompanhe os pacotes vinculados a cada obra. Você pode identificar se um pacote é de uma <strong>temporada inteira</strong> ou de um <strong>episódio específico</strong>, checar se a revisão está <strong>ativa</strong> ou se foi <strong>substituída por outro pacote</strong>, e excluir pacotes por completo.
              </p>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Obra / Título</th>
                  <th>Escopo do Pacote</th>
                  <th>Revisão</th>
                  <th>Status no Catálogo</th>
                  <th>Package ID</th>
                  <th>Data</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {revisions.data?.map((rev: Revision) => (
                  <tr key={rev.id}>
                    <td>
                      <strong>{rev.workTitle}</strong>
                    </td>
                    <td>
                      <div className="admin-scope-cell">
                        <span className="admin-type-tag admin-type-tag--system">
                          {rev.packageType === "episode_replacement"
                            ? "Substituição de Ep"
                            : rev.packageType === "season"
                            ? "Temporada Inteira"
                            : "Filme Completo"}
                        </span>
                        <span className="admin-scope-detail">
                          {rev.packageType === "episode_replacement"
                            ? `${rev.episodeNumber ? `E${String(rev.episodeNumber).padStart(2, "0")} · ` : ""}${rev.episodeTitle || rev.seasonTitle || rev.scopeKey}`
                            : rev.seasonTitle || rev.scopeKey}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-rev-num">v{rev.number}</span>
                    </td>
                    <td>
                      {rev.active ? (
                        <Badge variant="dub" label="🟢 Ativo" />
                      ) : (
                        <Badge variant="incomplete" label="⚪ Substituído" />
                      )}
                    </td>
                    <td>
                      <code className="admin-code-sm">{rev.packageId}</code>
                    </td>
                    <td>{new Date(rev.createdAt).toLocaleString("pt-BR")}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="admin-row-actions">
                        {!rev.active && (
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            disabled={activateRevision.isPending}
                            onClick={() => activateRevision.mutate(rev.id)}
                            title="Ativar esta versão no catálogo"
                          >
                            Ativar Revisão
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          disabled={session.data?.role !== "owner"}
                          onClick={() => {
                            if (rev.publicationId) {
                              openDeleteModal(rev.publicationId, rev.packageId);
                            }
                          }}
                          title="Excluir pacote por completo"
                        >
                          Apagar Pacote
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!revisions.isLoading && !revisions.data?.length && (
                  <tr>
                    <td colSpan={7} className="admin-table__empty">
                      Nenhuma revisão de catálogo encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Package Detail Modal */}
      {selectedPackageId && detail.data && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setSelectedPackageId(null)}
        >
          <div
            className="admin-editor-drawer admin-editor-drawer--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do pacote"
          >
            <div className="admin-editor-drawer__header">
              <div>
                <h2>{detail.data.packageId}</h2>
                <small>SHA-256: {detail.data.manifestSha256}</small>
              </div>
              <button
                type="button"
                className="admin-editor-drawer__close"
                onClick={() => setSelectedPackageId(null)}
                aria-label="Fechar detalhes"
              >
                ✕
              </button>
            </div>

            <div className="admin-editor-drawer__body">
              {detail.data.errorMessage && (
                <div className="admin-failure-alert-box">
                  <div className="admin-failure-alert-box__header">
                    <span className="admin-failure-alert-box__icon">⚠️</span>
                    <div>
                      <h4>Falha no Processamento do Pacote</h4>
                      <p className="admin-failure-alert-box__msg">
                        {detail.data.errorMessage}
                      </p>
                    </div>
                  </div>
                  <div className="admin-failure-alert-box__meta">
                    <span>Tentativas de finalização: <strong>{detail.data.finalizationAttempts ?? 1}</strong></span>
                    {detail.data.finalizationWorkerId && (
                      <span>Worker: <code>{detail.data.finalizationWorkerId}</code></span>
                    )}
                    {detail.data.finalizationNextAttemptAt && (
                      <span>Próxima tentativa agendada: {new Date(detail.data.finalizationNextAttemptAt).toLocaleTimeString("pt-BR")}</span>
                    )}
                  </div>
                  {detail.data.state === "failed" && (
                    <div className="admin-failure-alert-box__action">
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(detail.data!.id)}
                      >
                        {retry.isPending ? "Reiniciando…" : "▶ Retomar Processamento / Tentar Novamente"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="admin-manifest-summary">
                <div className="admin-summary-pill">
                  <span>Status:</span>
                  <strong>{detail.data.state}</strong>
                </div>
                <div className="admin-summary-pill">
                  <span>Recibo:</span>
                  <strong>{detail.data.receipt?.status ?? "pendente"}</strong>
                </div>
                <div className="admin-summary-pill">
                  <span>Revisão:</span>
                  <strong>{detail.data.receipt?.remoteRevision ?? "—"}</strong>
                </div>
                <div className="admin-summary-pill">
                  <span>Tamanho Total:</span>
                  <strong>{formatBytes(detail.data.totalSizeBytes)}</strong>
                </div>
              </div>

              {detail.data.diff && (
                <div className="admin-editor-section">
                  <h3 className="admin-editor-section__title">
                    Diferenças para a revisão {detail.data.diff.previousRevision ?? "inicial"}
                  </h3>
                  <div className="admin-diff-counts">
                    <span>+{detail.data.diff.added.length} adicionados</span>
                    <span>~{detail.data.diff.changed.length} alterados</span>
                    <span>-{detail.data.diff.removed.length} removidos</span>
                  </div>
                  <div className="admin-diff-list">
                    {[
                      ...detail.data.diff.added.map((p) => `+ ${p}`),
                      ...detail.data.diff.changed.map((p) => `~ ${p}`),
                      ...detail.data.diff.removed.map((p) => `- ${p}`),
                    ].slice(0, 15).map((line) => (
                      <code key={line} className="admin-diff-line">
                        {line}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="admin-editor-section">
                <h3 className="admin-editor-section__title">
                  Arquivos do Pacote ({detail.data.files?.length ?? 0})
                </h3>
                <div className="admin-files-scroll">
                  {detail.data.files?.map((f) => (
                    <div key={f.relativePath} className="admin-file-entry">
                      <code>{f.relativePath}</code>
                      <span>
                        {f.receivedAt ? "✓ Recebido" : "⏳ Pendente"} ·{" "}
                        {formatBytes(f.receivedBytes ?? f.expectedBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-danger-zone">
                <div className="admin-danger-zone__header">
                  <h3 className="admin-danger-zone__title">Excluir Pacote por Completo</h3>
                  <p className="admin-danger-zone__desc">
                    Remove staging, arquivos em disco, recibo, revisões e registro completo do pacote.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={session.data?.role !== "owner"}
                  onClick={() => openDeleteModal(detail.data!.id, detail.data!.packageId)}
                >
                  Excluir este pacote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletePackageOpen && targetPackage && (
        <div className="admin-modal-backdrop">
          <div className="admin-dialog-card" role="dialog" aria-modal="true" aria-label="Confirmar exclusão de pacote">
            <h3>Confirmação Obrigatória</h3>
            <p>
              Esta ação excluirá permanentemente todos os arquivos e metadados deste pacote. Digite o <code>package_id</code> completo para confirmar:
            </p>
            <div className="admin-dialog-code-box">
              <code>{targetPackage.packageId}</code>
            </div>

            <input
              autoFocus
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="Digite o package_id…"
              className="admin-input"
              aria-label="Confirmar package id"
            />

            {removePublication.error && (
              <div className="admin-danger-error">
                {removePublication.error.message}
              </div>
            )}

            <div className="admin-dialog-actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={removePublication.isPending}
                onClick={() => setDeletePackageOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={removePublication.isPending || deleteConfirmation.trim() !== targetPackage.packageId}
                onClick={() =>
                  removePublication.mutate({
                    id: targetPackage.id,
                    confirm: deleteConfirmation.trim(),
                  })
                }
              >
                {removePublication.isPending ? "Excluindo…" : "Excluir Definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
