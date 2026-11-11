import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { useDebounce } from "../../hooks/useDebounce";
import { AdminWorkVisualEditor } from "./AdminWorkVisualEditor";

export function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["admin", "catalog", debouncedSearch],
    queryFn: () => api.getAdminCatalog(debouncedSearch),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateEditorialWork>[1] }) =>
      api.updateEditorialWork(id, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
    },
  });

  if (selectedWorkId) {
    return (
      <AdminWorkVisualEditor
        workId={selectedWorkId}
        onBack={() => {
          setSelectedWorkId(null);
          void queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] });
        }}
      />
    );
  }

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
            placeholder="Buscar por título ou canônico…"
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
                  onClick={() => setSelectedWorkId(work.id)}
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
    </div>
  );
}
