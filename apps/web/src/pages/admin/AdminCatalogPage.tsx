import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { AdminCatalogWork } from "../../lib/types";
import { formatBytes } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { useDebounce } from "../../hooks/useDebounce";

export function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<AdminCatalogWork | null>(null);

  // Form states for selected work
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const catalog = useQuery({
    queryKey: ["admin", "catalog", debouncedSearch],
    queryFn: () => api.getAdminCatalog(debouncedSearch),
  });

  const detail = useQuery({
    queryKey: ["admin", "work-detail", selected?.id],
    queryFn: () => api.getAdminWork(selected!.id),
    enabled: Boolean(selected),
  });

  const deletionPreview = useQuery({
    queryKey: ["admin", "work-deletion", selected?.id],
    queryFn: () => api.getWorkDeletionPreview(selected!.id),
    enabled: Boolean(selected),
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateEditorialWork>[1] }) =>
      api.updateEditorialWork(id, data),
    onSuccess: async (updated) => {
      setSelected((curr) => (curr ? { ...curr, ...updated } : curr));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", updated.id] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work", updated.id] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
    },
  });

  const visibility = useMutation({
    mutationFn: ({ type, id, hidden }: { type: "season" | "episode"; id: string; hidden: boolean }) =>
      type === "season" ? api.updateAdminSeason(id, hidden) : api.updateAdminEpisode(id, hidden),
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", selected?.id] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work", selected?.id] }),
      ]),
  });

  const presentation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      api.updatePresentationAsset(selected!.id, type, id),
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", selected?.id] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work", selected?.id] }),
      ]),
  });

  const deletion = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: string }) => api.deleteAdminWork(id, confirm),
    onSuccess: async () => {
      setSelected(null);
      setConfirmTitle("");
      setDeleteError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "publications"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "revisions"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "";
      try {
        const parsed = JSON.parse(msg) as { error?: unknown };
        setDeleteError(typeof parsed.error === "string" ? parsed.error : msg || "Falha ao excluir a obra");
      } catch {
        setDeleteError(msg || "Falha ao excluir a obra");
      }
    },
  });

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.override?.title ?? "");
    setSynopsis(selected.override?.synopsis ?? "");
    setConfirmTitle("");
    setDeleteError("");
  }, [selected]);

  // Filter items
  const items = catalog.data?.items ?? [];
  const filteredWorks = items.filter((work) => {
    if (kindFilter !== "all" && work.contentKind !== kindFilter) return false;
    if (statusFilter === "visible" && work.hidden) return false;
    if (statusFilter === "hidden" && !work.hidden) return false;
    if (statusFilter === "featured" && !work.featured) return false;
    return true;
  });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Biblioteca de Conteúdo</span>
          <h1 className="admin-page__title">Catálogo</h1>
          <p className="admin-page__subtitle">
            Gerencie todas as obras, controle a visibilidade para os clientes, defina os destaques na home e altere capas e metadados.
          </p>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="admin-catalog__toolbar">
        <div className="admin-catalog__search-box">
          <span className="admin-catalog__search-icon">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou título canônico…"
            className="admin-catalog__search-input"
          />
          {search && (
            <button className="admin-catalog__search-clear" onClick={() => setSearch("")} aria-label="Limpar busca">
              ✕
            </button>
          )}
        </div>

        <div className="admin-catalog__filters">
          <div className="admin-filter-group">
            <span className="admin-filter-group__label">Tipo:</span>
            <div className="admin-filter-pills">
              <button
                type="button"
                className={`admin-filter-pill ${kindFilter === "all" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setKindFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${kindFilter === "movie" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setKindFilter("movie")}
              >
                Filmes
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${kindFilter === "series" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setKindFilter("series")}
              >
                Séries
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${kindFilter === "anime" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setKindFilter("anime")}
              >
                Animes
              </button>
            </div>
          </div>

          <div className="admin-filter-group">
            <span className="admin-filter-group__label">Status:</span>
            <div className="admin-filter-pills">
              <button
                type="button"
                className={`admin-filter-pill ${statusFilter === "all" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${statusFilter === "visible" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setStatusFilter("visible")}
              >
                Visíveis
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${statusFilter === "hidden" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setStatusFilter("hidden")}
              >
                Ocultos
              </button>
              <button
                type="button"
                className={`admin-filter-pill ${statusFilter === "featured" ? "admin-filter-pill--active" : ""}`}
                onClick={() => setStatusFilter("featured")}
              >
                Destaques
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Works Grid */}
      <div className="admin-catalog__grid">
        {filteredWorks.map((work) => (
          <div key={work.id} className={`admin-work-card ${work.hidden ? "admin-work-card--hidden" : ""}`}>
            <div className="admin-work-card__body">
              <div className="admin-work-card__top">
                <div className="admin-work-card__badges">
                  <Badge variant={`kind-${work.contentKind}`} label={work.contentKind} />
                  {work.featured && <Badge variant="dub" label="⭐ Destaque" />}
                  {work.hidden ? (
                    <Badge variant="incomplete" label="🔴 Oculta" />
                  ) : (
                    <Badge variant="sub" label="🟢 Visível" />
                  )}
                </div>
                <span className="admin-work-card__year">{work.year ?? "—"}</span>
              </div>

              <h3 className="admin-work-card__title" title={work.title}>
                {work.title}
              </h3>
              {work.canonicalTitle !== work.title && (
                <span className="admin-work-card__canonical" title={`Canônico: ${work.canonicalTitle}`}>
                  Canônico: {work.canonicalTitle}
                </span>
              )}

              <div className="admin-work-card__stats">
                <span>{work.seasonCount} temporada(s)</span>
                <span>•</span>
                <span>{work.episodeCount} episódio(s)</span>
              </div>

              {/* Quick Actions Row */}
              <div className="admin-work-card__actions">
                <button
                  type="button"
                  className={`btn-action-toggle ${work.featured ? "btn-action-toggle--active-star" : ""}`}
                  title={work.featured ? "Remover destaque" : "Destacar na home"}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: work.id, data: { featured: !work.featured } })}
                >
                  ⭐ {work.featured ? "Destaque" : "Destacar"}
                </button>

                <button
                  type="button"
                  className={`btn-action-toggle ${!work.hidden ? "btn-action-toggle--active-eye" : ""}`}
                  title={work.hidden ? "Tornar visível aos clientes" : "Ocultar dos clientes"}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: work.id, data: { hidden: !work.hidden } })}
                >
                  {work.hidden ? "👁️ Exibir" : "🙈 Ocultar"}
                </button>

                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setSelected(work)}
                >
                  Editar Obra
                </button>
              </div>
            </div>
          </div>
        ))}

        {!catalog.isLoading && filteredWorks.length === 0 && (
          <div className="admin-catalog__empty">
            <span className="admin-catalog__empty-icon">🎬</span>
            <p>Nenhuma obra encontrada com os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* Comprehensive Edit Modal / Drawer */}
      {selected && (
        <div className="admin-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="admin-editor-drawer" role="dialog" aria-modal="true" aria-label={`Editar ${selected.title}`}>
            <div className="admin-editor-drawer__header">
              <div>
                <h2>{selected.title}</h2>
                <small>Canônico: {selected.canonicalTitle}</small>
              </div>
              <button
                type="button"
                className="admin-editor-drawer__close"
                onClick={() => setSelected(null)}
                aria-label="Fechar editor"
              >
                ✕
              </button>
            </div>

            <div className="admin-editor-drawer__body">
              {/* Overrides form */}
              <div className="admin-editor-section">
                <h3 className="admin-editor-section__title">Textos Editoriais</h3>
                <p className="admin-editor-section__desc">
                  Substitua o título e sinopse sem alterar o manifesto original. Se deixar em branco, o valor canônico é utilizado.
                </p>

                <div className="admin-form-group">
                  <label htmlFor="edit-title">Título Editorial</label>
                  <input
                    id="edit-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={selected.canonicalTitle}
                    className="admin-input"
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="edit-synopsis">Sinopse Editorial</label>
                  <textarea
                    id="edit-synopsis"
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    placeholder={selected.canonicalSynopsis ?? "Sem sinopse canônica"}
                    rows={5}
                    className="admin-textarea"
                  />
                </div>

                <div className="admin-editor-drawer__toggles">
                  <label className="admin-switch-label">
                    <input
                      type="checkbox"
                      checked={selected.featured}
                      onChange={(e) => update.mutate({ id: selected.id, data: { featured: e.target.checked } })}
                    />
                    <span>Destaque na página inicial (Home)</span>
                  </label>

                  <label className="admin-switch-label">
                    <input
                      type="checkbox"
                      checked={!selected.hidden}
                      onChange={(e) => update.mutate({ id: selected.id, data: { hidden: !e.target.checked } })}
                    />
                    <span>Visível para os clientes no catálogo</span>
                  </label>
                </div>

                <div className="admin-editor-drawer__actions">
                  <button
                    className="btn btn--primary"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: selected.id, data: { title, synopsis } })}
                  >
                    {update.isPending ? "Salvando…" : "Salvar Alterações"}
                  </button>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setTitle("");
                      setSynopsis("");
                      update.mutate({ id: selected.id, data: { title: null, synopsis: null } });
                    }}
                  >
                    Restaurar Canônico
                  </button>
                </div>
              </div>

              {/* Presentation Assets */}
              <div className="admin-editor-section">
                <h3 className="admin-editor-section__title">Artes de Apresentação</h3>
                <p className="admin-editor-section__desc">
                  Escolha qual pôster ou imagem de fundo é apresentada aos clientes.
                </p>
                <div className="admin-assets-grid">
                  {detail.data?.assets.map((asset) => (
                    <div key={asset.id} className="admin-asset-card">
                      <div className="admin-asset-card__preview">
                        {asset.publicPath ? (
                          <img src={asset.publicPath} alt={asset.type} />
                        ) : (
                          <span className="admin-asset-card__no-img">Sem pré-visualização</span>
                        )}
                      </div>
                      <div className="admin-asset-card__meta">
                        <span className="admin-asset-card__type">{asset.type}</span>
                        <button
                          className="btn btn--secondary btn--sm"
                          disabled={presentation.isPending}
                          onClick={() => presentation.mutate({ type: asset.type, id: asset.id })}
                        >
                          Usar esta arte
                        </button>
                      </div>
                    </div>
                  ))}
                  {!detail.data?.assets.length && (
                    <div className="admin-catalog__empty-small">Nenhuma arte encontrada para esta obra.</div>
                  )}
                </div>
              </div>

              {/* Seasons & Episodes structure */}
              <div className="admin-editor-section">
                <h3 className="admin-editor-section__title">Temporadas e Episódios</h3>
                <p className="admin-editor-section__desc">
                  Controle a visibilidade granular de cada temporada ou episódio individual.
                </p>
                <div className="admin-seasons-list">
                  {detail.data?.seasons.map((season) => (
                    <details key={season.id} className="admin-season-accordion" open>
                      <summary className="admin-season-summary">
                        <span>
                          <strong>Temporada {season.number}</strong>
                          {season.title ? ` · ${season.title}` : ""}
                        </span>
                        <div className="admin-season-summary__actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={visibility.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              visibility.mutate({ type: "season", id: season.id, hidden: !season.hidden });
                            }}
                          >
                            {season.hidden ? "👁️ Exibir Temporada" : "🙈 Ocultar Temporada"}
                          </button>
                        </div>
                      </summary>

                      <div className="admin-episodes-table">
                        {season.episodes.map((ep) => (
                          <div key={ep.id} className="admin-episode-row">
                            <span className="admin-episode-row__num">E{ep.number}</span>
                            <span className="admin-episode-row__title">
                              {ep.title || "Sem título"}
                              {!ep.activeRevisionId && (
                                <Badge variant="incomplete" label="Sem mídia ativa" />
                              )}
                            </span>
                            <button
                              type="button"
                              className="btn btn--secondary btn--xs"
                              disabled={visibility.isPending}
                              onClick={() =>
                                visibility.mutate({ type: "episode", id: ep.id, hidden: !ep.hidden })
                              }
                            >
                              {ep.hidden ? "Exibir" : "Ocultar"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {/* Permanent deletion (Danger zone) */}
              <div className="admin-danger-zone">
                <div className="admin-danger-zone__header">
                  <h3 className="admin-danger-zone__title">Excluir Obra Permanentemente</h3>
                  <p className="admin-danger-zone__desc">
                    Remove a obra, temporadas, episódios, favoritos, progresso, coleções, arquivos e caches vinculados.
                  </p>
                </div>

                {deletionPreview.isLoading && <p>Calculando impacto da exclusão…</p>}
                {deletionPreview.data && (
                  <div className="admin-danger-zone__details">
                    <div className="admin-danger-counts">
                      <span>{deletionPreview.data.counts.seasons} temporada(s)</span>
                      <span>{deletionPreview.data.counts.episodes} episódio(s)</span>
                      <span>{deletionPreview.data.counts.publications} pacote(s)</span>
                      <span>{deletionPreview.data.counts.assets} arte(s)</span>
                      <span>{deletionPreview.data.counts.mediaObjects} mídia(s)</span>
                      <span>{formatBytes(deletionPreview.data.counts.bytes)} em disco</span>
                    </div>

                    {deletionPreview.data.blockers.map((blocker) => (
                      <div className="admin-danger-error" key={blocker}>
                        ⚠️ {blocker}
                      </div>
                    ))}

                    <label className="admin-form-group">
                      <span>
                        Para confirmar, digite exatamente: <strong>{deletionPreview.data.work.title}</strong>
                      </span>
                      <input
                        type="text"
                        value={confirmTitle}
                        onChange={(e) => setConfirmTitle(e.target.value)}
                        placeholder={deletionPreview.data.work.title}
                        disabled={!deletionPreview.data.canDelete || deletion.isPending}
                        className="admin-input"
                      />
                    </label>

                    {deleteError && <div className="admin-danger-error">{deleteError}</div>}

                    <button
                      className="btn btn--danger"
                      disabled={
                        !deletionPreview.data.canDelete ||
                        deletion.isPending ||
                        confirmTitle.trim() !== deletionPreview.data.work.title
                      }
                      onClick={() => deletion.mutate({ id: selected.id, confirm: confirmTitle.trim() })}
                    >
                      {deletion.isPending ? "Excluindo…" : "Excluir Definitivamente do CyanFlix"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
