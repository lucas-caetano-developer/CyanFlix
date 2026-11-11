import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { HomeSectionConfig } from "../../lib/types";

export function AdminHomeSectionsPage() {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<HomeSectionConfig[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "home-sections"],
    queryFn: api.getHomeSections,
  });

  useEffect(() => {
    if (query.data) {
      setSections(query.data);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (updated: HomeSectionConfig[]) => api.updateHomeSections(updated),
    onSuccess: async (data) => {
      setSections(data.sections);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "home-sections"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
      ]);
    },
    onError: (err) => {
      alert(`Falha ao salvar seções: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const toggleEnabled = (index: number) => {
    const next = [...sections];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setSections(next);
  };

  const updateTitle = (index: number, newTitle: string) => {
    const next = [...sections];
    next[index] = { ...next[index], title: newTitle };
    setSections(next);
  };

  const resetTitle = (index: number) => {
    const next = [...sections];
    next[index] = { ...next[index], title: next[index].defaultTitle };
    setSections(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    // update sortOrder
    const reordered = next.map((item, idx) => ({ ...item, sortOrder: idx }));
    setSections(reordered);
  };

  const resetAllToDefaults = () => {
    if (!window.confirm("Deseja restaurar todas as seções e subtítulos para a ordem e visibilidade padrão?")) return;
    const reset = sections.map((sec, idx) => ({
      ...sec,
      title: sec.defaultTitle,
      enabled: true,
      sortOrder: idx,
    }));
    setSections(reset);
    mutation.mutate(reset);
  };

  const handleSave = () => {
    mutation.mutate(sections);
  };

  const activeCount = sections.filter((s) => s.enabled).length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Layout e Experiência</span>
          <h1 className="admin-page__title">Seções da Home</h1>
          <p className="admin-page__subtitle">
            Configure quais subtítulos e sessões são exibidos para os clientes, a ordem na página inicial e renomeie qualquer título.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={resetAllToDefaults}
            disabled={mutation.isPending}
          >
            Restaurar Padrão
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Salvando…" : "Salvar Alterações"}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="admin-alert admin-alert--success">
          ✓ Seções e subtítulos da Home atualizados com sucesso! As alterações já estão visíveis para os clientes.
        </div>
      )}

      {/* Info card */}
      <div className="admin-info-banner">
        <div className="admin-info-banner__icon">ℹ️</div>
        <div className="admin-info-banner__text">
          <strong>Configuração de Sessões da Página Inicial</strong>
          <p>
            Todas as sessões sugeridas (Animes, Ação, Filmes Mais Assistidos, Séries, Destaques, etc.) já estão pré-configuradas abaixo.
            Utilize os seletores para <strong>ativar ou desativar</strong> cada sessão na tela dos clientes, arraste ou use as setas para <strong>reordenar</strong>, e altere o texto no campo de subtítulo para personalizar o nome da fileira.
          </p>
        </div>
        <div className="admin-info-banner__stat">
          <strong>{activeCount} de {sections.length}</strong>
          <span>sessões ativas</span>
        </div>
      </div>

      {/* Section List */}
      <div className="admin-sections-list">
        {sections.map((sec, index) => {
          const isModified = sec.title.trim() !== sec.defaultTitle.trim();
          return (
            <div
              key={sec.id}
              className={`admin-section-item ${!sec.enabled ? "admin-section-item--disabled" : ""}`}
            >
              {/* Order Controls */}
              <div className="admin-section-item__order">
                <button
                  type="button"
                  className="btn-icon"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Subir ${sec.title}`}
                  title="Subir posição"
                >
                  ▲
                </button>
                <span className="admin-section-item__index">{index + 1}</span>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Descer ${sec.title}`}
                  title="Descer posição"
                >
                  ▼
                </button>
              </div>

              {/* Status Toggle Switch */}
              <div className="admin-section-item__visibility">
                <label className="admin-toggle-switch" title={sec.enabled ? "Sessão visível para os clientes" : "Sessão oculta dos clientes"}>
                  <input
                    type="checkbox"
                    checked={sec.enabled}
                    onChange={() => toggleEnabled(index)}
                  />
                  <span className="admin-toggle-switch__slider" />
                </label>
                <span className="admin-section-item__status-text">
                  {sec.enabled ? "Visível" : "Oculta"}
                </span>
              </div>

              {/* Title & Subtitle Edit */}
              <div className="admin-section-item__details">
                <div className="admin-section-item__input-row">
                  <label htmlFor={`sec-title-${sec.id}`} className="sr-only">Subtítulo da sessão</label>
                  <input
                    id={`sec-title-${sec.id}`}
                    type="text"
                    value={sec.title}
                    onChange={(e) => updateTitle(index, e.target.value)}
                    placeholder={sec.defaultTitle}
                    className="admin-input admin-section-item__input"
                  />
                  {isModified && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--xs"
                      onClick={() => resetTitle(index)}
                      title={`Restaurar para: ${sec.defaultTitle}`}
                    >
                      Restaurar padrão
                    </button>
                  )}
                </div>
                <div className="admin-section-item__meta">
                  <span className="admin-section-item__key">Identificador: <code>{sec.id}</code></span>
                  {isModified && (
                    <span className="admin-section-item__default-hint">
                      Padrão: <em>{sec.defaultTitle}</em>
                    </span>
                  )}
                </div>
              </div>

              {/* Type Badge */}
              <div className="admin-section-item__badge">
                <span className={`admin-type-tag admin-type-tag--${sec.type}`}>
                  {sec.type === "genre" ? "Gênero" : sec.type === "collection" ? "Coleção" : "Sistema"}
                </span>
              </div>
            </div>
          );
        })}

        {query.isLoading && (
          <div className="admin-catalog__empty">
            <p>Carregando configurações de seções…</p>
          </div>
        )}
      </div>

      <div className="admin-page__footer-bar">
        <span>Total: {sections.length} seções disponíveis</span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Salvando…" : "Salvar Alterações"}
        </button>
      </div>
    </div>
  );
}
