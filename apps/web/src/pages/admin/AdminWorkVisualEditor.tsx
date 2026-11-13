import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  formatBytes,
  getPosterUrl,
  getBackdropUrl,
  getTrailerUrl,
  getGenres,
  getCertification,
} from "../../lib/utils";

interface AdminWorkVisualEditorProps {
  workId: string;
  onBack: () => void;
}

export function AdminWorkVisualEditor({ workId, onBack }: AdminWorkVisualEditorProps) {
  const queryClient = useQueryClient();

  // Queries
  const { data: work, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "work-detail", workId],
    queryFn: () => api.getAdminWork(workId),
  });

  const deletionPreview = useQuery({
    queryKey: ["admin", "work-deletion", workId],
    queryFn: () => api.getWorkDeletionPreview(workId),
    enabled: Boolean(workId),
    retry: false,
  });

  // Local editable state for Work
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [year, setYear] = useState<number | undefined>(undefined);
  const [contentKind, setContentKind] = useState<"movie" | "series" | "anime">("movie");
  const [synopsis, setSynopsis] = useState("");
  const [certification, setCertification] = useState<string>("L");
  const [genres, setGenres] = useState<string[]>([]);
  const [newGenreInput, setNewGenreInput] = useState("");
  const [hidden, setHidden] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);

  // Seasons / Episodes state
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
  const [episodeTitles, setEpisodeTitles] = useState<Record<string, string>>({});
  const [episodeSynopses, setEpisodeSynopses] = useState<Record<string, string>>({});

  // Media / Trailer modal & Upload progress
  const [trailerModalOpen, setTrailerModalOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Deletion modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // File input refs
  const backdropInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const trailerInputRef = useRef<HTMLInputElement>(null);
  const episodeThumbInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Initialize form state when work data loads
  useEffect(() => {
    if (!work) return;
    const initialTitle = work.editorialOverride?.title ?? work.title ?? "";
    const initialSynopsis = work.editorialOverride?.synopsis ?? work.synopsis ?? "";
    const initialHidden = work.editorialOverride?.hidden ?? work.hidden ?? false;
    const initialFeatured = work.editorialOverride?.featured ?? false;
    const initialGenres = getGenres(work.metadata as Record<string, unknown> | undefined);
    const initialCert = getCertification(work.metadata as Record<string, unknown> | undefined) || "L";

    setTitle(initialTitle);
    setOriginalTitle(work.originalTitle ?? "");
    setYear(work.year ?? undefined);
    setContentKind(work.contentKind);
    setSynopsis(initialSynopsis);
    setGenres(initialGenres);
    setCertification(initialCert);
    setHidden(initialHidden);
    setFeatured(initialFeatured);

    // Trailer URL
    const trailer = getTrailerUrl(work as any) || (work.metadata as any)?.trailer_url || null;
    setTrailerUrl(trailer);

    // Initial season
    if (work.seasons && work.seasons.length > 0) {
      setSelectedSeasonNumber(work.seasons[0].number);
      const titlesMap: Record<string, string> = {};
      const synopsesMap: Record<string, string> = {};
      for (const season of work.seasons) {
        for (const ep of season.episodes) {
          titlesMap[ep.id] = ep.title ?? `Episódio ${ep.number}`;
          synopsesMap[ep.id] = ep.synopsis ?? "";
        }
      }
      setEpisodeTitles(titlesMap);
      setEpisodeSynopses(synopsesMap);
    }
  }, [work]);

  // Mutations
  const updateMetadata = useMutation({
    mutationFn: (data: {
      title?: string | null;
      originalTitle?: string | null;
      year?: number | null;
      contentKind?: "movie" | "series" | "anime";
      synopsis?: string | null;
      hidden?: boolean | null;
      featured?: boolean | null;
      genres?: string[];
      certification?: string | null;
      trailerUrl?: string | null;
    }) => api.updateAdminWorkMetadata(workId, data),
    onSuccess: () => {
      setSaveSuccessMessage("Metadados da obra salvos com sucesso!");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", workId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work", workId] }),
      ]);
    },
  });

  const updateEpisode = useMutation({
    mutationFn: ({ episodeId, data }: { episodeId: string; data: { title?: string | null; synopsis?: string | null; hidden?: boolean; number?: number } }) =>
      api.updateAdminEpisodeMetadata(episodeId, data),
    onSuccess: () => {
      setSaveSuccessMessage(`Episódio atualizado com sucesso!`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", workId] }),
        queryClient.invalidateQueries({ queryKey: ["work", workId] }),
      ]);
    },
  });

  const updateSeason = useMutation({
    mutationFn: ({ seasonId, data }: { seasonId: string; data: { title?: string | null; hidden?: boolean } }) =>
      api.updateAdminSeasonMetadata(seasonId, data),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", workId] }),
        queryClient.invalidateQueries({ queryKey: ["work", workId] }),
      ]);
    },
  });

  const deleteWork = useMutation({
    mutationFn: (confirmTitle: string) => api.deleteAdminWork(workId, confirmTitle),
    onSuccess: () => {
      setDeleteModalOpen(false);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
      onBack();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      setDeleteError(msg);
    },
  });

  // Upload handler for Work assets (trailer, poster, backdrop)
  const handleUploadWorkAsset = async (type: "trailer" | "poster" | "backdrop", file: File) => {
    setUploadStatus(`Enviando ${type === "trailer" ? "trailer" : type === "poster" ? "pôster" : "backdrop"} (${formatBytes(file.size)})...`);
    try {
      const res = await api.uploadWorkAsset(workId, type, file);
      setUploadStatus(null);
      setSaveSuccessMessage(`${type === "trailer" ? "Trailer" : "Imagem"} importado com sucesso!`);
      setTimeout(() => setSaveSuccessMessage(null), 4000);
      if (type === "trailer" && res.asset.publicPath) {
        setTrailerUrl(res.asset.publicPath);
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", workId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work", workId] }),
      ]);
    } catch (err) {
      setUploadStatus(null);
      alert(`Falha no upload: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Upload handler for Episode thumbnail
  const handleUploadEpisodeThumb = async (episodeId: string, file: File) => {
    setUploadStatus(`Enviando miniatura do episódio (${formatBytes(file.size)})...`);
    try {
      await api.uploadEpisodeThumbnail(episodeId, file);
      setUploadStatus(null);
      setSaveSuccessMessage("Capa do episódio atualizada!");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "work-detail", workId] }),
        queryClient.invalidateQueries({ queryKey: ["work", workId] }),
      ]);
    } catch (err) {
      setUploadStatus(null);
      alert(`Falha no upload: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveAll = () => {
    updateMetadata.mutate({
      title: title.trim() || null,
      originalTitle: originalTitle.trim() || null,
      year: year ? Number(year) : null,
      contentKind,
      synopsis: synopsis.trim() || null,
      hidden,
      featured,
      genres,
      certification,
      trailerUrl,
    });
  };

  const addGenre = () => {
    const trimmed = newGenreInput.trim();
    if (trimmed && !genres.includes(trimmed)) {
      setGenres([...genres, trimmed]);
      setNewGenreInput("");
    }
  };

  const removeGenre = (genreToRemove: string) => {
    setGenres(genres.filter((g) => g !== genreToRemove));
  };

  if (isLoading) {
    return (
      <div className="admin-visual-editor-loading">
        <div className="admin-spinner" />
        <p>Carregando editor visual da obra…</p>
      </div>
    );
  }

  if (isError || !work) {
    return (
      <div className="admin-visual-editor-error">
        <h2>Não foi possível carregar a obra</h2>
        <p>{error instanceof Error ? error.message : "Obra não encontrada"}</p>
        <button type="button" className="btn btn--secondary" onClick={onBack}>
          ← Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const currentPoster = getPosterUrl(work as any);
  const currentBackdrop = getBackdropUrl(work as any);
  const selectedSeason = work.seasons?.find((s) => s.number === selectedSeasonNumber) || work.seasons?.[0];

  return (
    <div className="admin-visual-editor">
      {/* Top Floating Control Bar */}
      <header className="admin-visual-editor__topbar">
        <div className="admin-visual-editor__topbar-left">
          <button
            type="button"
            className="btn btn--secondary btn--sm admin-visual-editor__back-btn"
            onClick={onBack}
          >
            ← Voltar ao Catálogo
          </button>
          <div className="admin-visual-editor__work-crumb">
            <span className="admin-visual-editor__crumb-kind">{contentKind.toUpperCase()}</span>
            <strong className="admin-visual-editor__crumb-title">{title || work.title}</strong>
          </div>
        </div>

        <div className="admin-visual-editor__topbar-right">
          {saveSuccessMessage && (
            <div className="admin-toast-feedback admin-toast-feedback--success">
              ✓ {saveSuccessMessage}
            </div>
          )}
          {uploadStatus && (
            <div className="admin-toast-feedback admin-toast-feedback--info">
              ⏳ {uploadStatus}
            </div>
          )}

          {/* Quick Visibility Switch */}
          <button
            type="button"
            className={`btn-action-toggle ${!hidden ? "btn-action-toggle--active-eye" : ""}`}
            onClick={() => setHidden(!hidden)}
            title="Alternar visibilidade para os clientes"
          >
            {!hidden ? "👁️ Visível aos Clientes" : "⚪ Oculto para Clientes"}
          </button>

          {/* Quick Featured Switch */}
          <button
            type="button"
            className={`btn-action-toggle ${featured ? "btn-action-toggle--active-star" : ""}`}
            onClick={() => setFeatured(!featured)}
            title="Alternar destaque na Home"
          >
            {featured ? "⭐ Em Destaque na Home" : "☆ Destaque Inativo"}
          </button>

          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={updateMetadata.isPending}
            onClick={handleSaveAll}
          >
            {updateMetadata.isPending ? "Salvando…" : "💾 Salvar Metadados"}
          </button>

          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => {
              setConfirmDeleteTitle("");
              setDeleteError("");
              setDeleteModalOpen(true);
            }}
          >
            🗑️ Excluir
          </button>
        </div>
      </header>

      {/* Hidden File Inputs */}
      <input
        ref={backdropInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadWorkAsset("backdrop", file);
          e.target.value = "";
        }}
      />
      <input
        ref={posterInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadWorkAsset("poster", file);
          e.target.value = "";
        }}
      />
      <input
        ref={trailerInputRef}
        type="file"
        accept="video/mp4,video/mp2t,video/webm,video/x-matroska,.ts,.mp4,.webm,.mkv,.mov"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadWorkAsset("trailer", file);
          e.target.value = "";
        }}
      />

      {/* In-Context Visual Presentation (Matching TitlePage) */}
      <div className="title-page title-page--admin-editable">
        <header className="title-page__hero">
          {/* Backdrop with overlay edit button */}
          <div className="title-page__backdrop">
            {currentBackdrop ? (
              <img src={currentBackdrop} alt={`Backdrop de ${title}`} />
            ) : (
              <div className="title-page__backdrop-fallback" />
            )}
            <div className="title-page__backdrop-gradient" />

            {/* Editable Backdrop Action Overlay */}
            <div className="admin-overlay-ctrl admin-overlay-ctrl--backdrop">
              <button
                type="button"
                className="btn btn--secondary btn--sm admin-overlay-btn"
                onClick={() => backdropInputRef.current?.click()}
              >
                🖼️ Alterar Imagem de Fundo (Backdrop)
              </button>
            </div>
          </div>

          <div className="title-page__content">
            <div className="title-page__header">
              {/* Poster with overlay edit button */}
              <div className="title-page__poster-wrapper admin-editable-poster">
                <div className="title-page__poster">
                  {currentPoster ? (
                    <img src={currentPoster} alt={`Capa de ${title}`} />
                  ) : (
                    <div className="title-page__poster-fallback">Sem Pôster</div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs admin-poster-edit-btn"
                  onClick={() => posterInputRef.current?.click()}
                >
                  📷 Alterar Capa / Pôster
                </button>
              </div>

              {/* Title, metadata and in-context editable fields */}
              <div className="title-page__info">
                <div className="title-page__eyebrow admin-eyebrow-row">
                  <select
                    value={contentKind}
                    onChange={(e) => setContentKind(e.target.value as any)}
                    className="admin-select-kind"
                  >
                    <option value="movie">Filme</option>
                    <option value="series">Série</option>
                    <option value="anime">Anime</option>
                  </select>

                  <span className="title-page__eyebrow-dot" aria-hidden="true" />
                  <span className="admin-canonical-hint">
                    ID Canônico: <code>{work.id}</code>
                  </span>
                </div>

                {/* Editable Title */}
                <div className="admin-editable-field admin-editable-field--title">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título da obra..."
                    className="admin-input-title"
                    aria-label="Título da obra"
                  />
                </div>

                {/* Editable Original Title */}
                <div className="admin-editable-field admin-editable-field--original-title">
                  <input
                    type="text"
                    value={originalTitle}
                    onChange={(e) => setOriginalTitle(e.target.value)}
                    placeholder="Título original (opcional)..."
                    className="admin-input-sub"
                    aria-label="Título original"
                  />
                </div>

                {/* Metadata Row: Year, Certification, Kind */}
                <div className="admin-metadata-editor-row">
                  <div className="admin-meta-item">
                    <label>Ano:</label>
                    <input
                      type="number"
                      value={year ?? ""}
                      onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Ex: 2024"
                      className="admin-input-year"
                    />
                  </div>

                  <div className="admin-meta-item">
                    <label>Classificação:</label>
                    <select
                      value={certification}
                      onChange={(e) => setCertification(e.target.value)}
                      className="admin-select-cert"
                    >
                      <option value="L">Livre</option>
                      <option value="10">10 anos</option>
                      <option value="12">12 anos</option>
                      <option value="14">14 anos</option>
                      <option value="16">16 anos</option>
                      <option value="18">18 anos</option>
                    </select>
                  </div>
                </div>

                {/* Genres Editor Tags */}
                <div className="admin-genres-editor">
                  <span className="admin-genres-label">Gêneros:</span>
                  <div className="admin-genres-tags">
                    {genres.map((g) => (
                      <span key={g} className="admin-genre-tag">
                        {g}
                        <button
                          type="button"
                          onClick={() => removeGenre(g)}
                          className="admin-genre-remove"
                          title={`Remover ${g}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <div className="admin-genre-add">
                      <input
                        type="text"
                        placeholder="Adicionar gênero..."
                        value={newGenreInput}
                        onChange={(e) => setNewGenreInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addGenre();
                          }
                        }}
                      />
                      <button type="button" onClick={addGenre} className="btn btn--secondary btn--xs">
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Editable Synopsis */}
                <div className="admin-editable-field admin-editable-field--synopsis">
                  <label className="admin-field-label">Sinopse da Obra:</label>
                  <textarea
                    rows={4}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    placeholder="Digite a sinopse completa da obra que será exibida para os clientes..."
                    className="admin-textarea-synopsis"
                  />
                  <div className="admin-char-count">{synopsis.length} caracteres</div>
                </div>

                {/* Actions: Trailer Upload & Preview */}
                <div className="admin-actions-bar">
                  {trailerUrl ? (
                    <div className="admin-trailer-loaded-group">
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => setTrailerModalOpen(true)}
                      >
                        ▶ Assistir Trailer Atual
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => trailerInputRef.current?.click()}
                      >
                        🔄 Substituir Trailer (MP4, TS, MKV, WebM)
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--xs"
                        onClick={() => setTrailerUrl(null)}
                        title="Remover trailer"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <div className="admin-trailer-upload-group">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm admin-btn-highlight"
                        onClick={() => trailerInputRef.current?.click()}
                      >
                        🎬 Importar Trailer (MP4, TS, MKV, WebM)
                      </button>
                      <span className="admin-upload-hint">
                        Arquivos em .ts ou .mkv são convertidos automaticamente se necessário.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Body: Seasons & Episodes (for series/anime or works with episodes) */}
        {work.seasons && work.seasons.length > 0 && (
          <div className="title-page__body admin-visual-editor__body">
            <section className="title-page__section admin-seasons-section">
              <div className="admin-section-header">
                <div>
                  <h2 className="admin-section-header__title">Temporadas e Episódios</h2>
                  <p className="admin-section-header__subtitle">
                    Edite títulos, sinopses e capas de cada episódio diretamente. O que você alterar aqui reflete imediatamente para os clientes.
                  </p>
                </div>
              </div>

              {/* Seasons Selector Tabs */}
              <div className="admin-seasons-tabs">
                {work.seasons.map((season) => (
                  <button
                    key={season.id}
                    type="button"
                    className={`admin-season-tab ${
                      selectedSeasonNumber === season.number ? "admin-season-tab--active" : ""
                    } ${season.hidden ? "admin-season-tab--hidden" : ""}`}
                    onClick={() => setSelectedSeasonNumber(season.number)}
                  >
                    <span>Temporada {season.number}</span>
                    {season.hidden && <span className="admin-badge-hidden-pill">Oculta</span>}
                    <small>({season.episodes?.length ?? 0} eps)</small>
                  </button>
                ))}
              </div>

              {/* Selected Season Controls */}
              {selectedSeason && (
                <div className="admin-selected-season-panel">
                  <div className="admin-season-quick-controls">
                    <strong>Temporada {selectedSeason.number}:</strong>
                    <button
                      type="button"
                      className={`btn-action-toggle ${
                        !selectedSeason.hidden ? "btn-action-toggle--active-eye" : ""
                      }`}
                      onClick={() =>
                        updateSeason.mutate({
                          seasonId: selectedSeason.id,
                          data: { hidden: !selectedSeason.hidden },
                        })
                      }
                    >
                      {!selectedSeason.hidden ? "👁️ Temporada Visível" : "⚪ Temporada Oculta"}
                    </button>
                  </div>

                  {/* Episodes List with in-context editing */}
                  <div className="admin-episodes-grid">
                    {selectedSeason.episodes?.map((episode) => {
                      const thumb = episode.assets?.find(
                        (a) => a.type === "thumbnail_webp" || a.type === "thumbnail" || a.type === "episode_thumbnail"
                      )?.publicPath;

                      return (
                        <div
                          key={episode.id}
                          className={`admin-episode-edit-card ${
                            episode.hidden ? "admin-episode-edit-card--hidden" : ""
                          }`}
                        >
                          {/* Thumbnail with overlay upload */}
                          <div className="admin-episode-edit-card__media">
                            {thumb ? (
                              <img src={thumb} alt={`Capa do episódio ${episode.number}`} />
                            ) : (
                              <div className="admin-episode-edit-card__media-fallback">
                                <span>Sem Capa</span>
                              </div>
                            )}

                            <input
                              ref={(el) => (episodeThumbInputRefs.current[episode.id] = el)}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUploadEpisodeThumb(episode.id, file);
                                e.target.value = "";
                              }}
                            />

                            <button
                              type="button"
                              className="btn btn--secondary btn--xs admin-episode-thumb-btn"
                              onClick={() => episodeThumbInputRefs.current[episode.id]?.click()}
                            >
                              📷 Alterar Capa
                            </button>
                          </div>

                          {/* Episode Details */}
                          <div className="admin-episode-edit-card__info">
                            <div className="admin-episode-card-top">
                              <span className="admin-episode-card-badge">
                                EPISÓDIO {episode.number}
                              </span>

                              <div className="admin-episode-visibility-toggle">
                                <button
                                  type="button"
                                  className={`btn-action-toggle ${
                                    !episode.hidden ? "btn-action-toggle--active-eye" : ""
                                  }`}
                                  onClick={() =>
                                    updateEpisode.mutate({
                                      episodeId: episode.id,
                                      data: { hidden: !episode.hidden },
                                    })
                                  }
                                >
                                  {!episode.hidden ? "👁️ Visível" : "⚪ Oculto"}
                                </button>
                              </div>
                            </div>

                            {/* In-place Title input */}
                            <div className="admin-form-group">
                              <label>Título do Episódio:</label>
                              <input
                                type="text"
                                value={episodeTitles[episode.id] ?? ""}
                                onChange={(e) =>
                                  setEpisodeTitles({
                                    ...episodeTitles,
                                    [episode.id]: e.target.value,
                                  })
                                }
                                placeholder={`Episódio ${episode.number}`}
                                className="admin-input"
                              />
                            </div>

                            {/* In-place Synopsis textarea */}
                            <div className="admin-form-group">
                              <label>Sinopse do Episódio:</label>
                              <textarea
                                rows={2}
                                value={episodeSynopses[episode.id] ?? ""}
                                onChange={(e) =>
                                  setEpisodeSynopses({
                                    ...episodeSynopses,
                                    [episode.id]: e.target.value,
                                  })
                                }
                                placeholder="Sinopse do episódio..."
                                className="admin-textarea"
                              />
                            </div>

                            <div className="admin-episode-card-actions">
                              <button
                                type="button"
                                className="btn btn--primary btn--xs"
                                disabled={updateEpisode.isPending}
                                onClick={() =>
                                  updateEpisode.mutate({
                                    episodeId: episode.id,
                                    data: {
                                      title: episodeTitles[episode.id]?.trim() || null,
                                      synopsis: episodeSynopses[episode.id]?.trim() || null,
                                    },
                                  })
                                }
                              >
                                💾 Salvar Episódio
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Trailer Video Player Dialog */}
      {trailerModalOpen && trailerUrl && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setTrailerModalOpen(false)}
        >
          <div className="admin-video-modal" role="dialog" aria-modal="true" aria-label="Trailer">
            <div className="admin-video-modal__header">
              <h3>Trailer: {title || work.title}</h3>
              <button
                type="button"
                className="admin-editor-drawer__close"
                onClick={() => setTrailerModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-video-modal__body">
              <video
                src={trailerUrl}
                controls
                autoPlay
                className="admin-trailer-video-player"
              />
            </div>
          </div>
        </div>
      )}

      {/* Deletion Modal */}
      {deleteModalOpen && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setDeleteModalOpen(false)}
        >
          <div className="admin-dialog-card" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
            <h3>Excluir Obra Permanentemente</h3>
            <p>
              Esta ação removerá completamente a obra <strong>{work.title}</strong>, incluindo todas as temporadas, episódios, metadados e arquivos vinculados em disco.
            </p>

            {deletionPreview.data && (
              <div className="admin-danger-counts">
                <span>{deletionPreview.data.counts.seasons} temporadas</span>
                <span>{deletionPreview.data.counts.episodes} episódios</span>
                <span>{deletionPreview.data.counts.assets} assets</span>
                <span>{deletionPreview.data.counts.mediaObjects} mídias</span>
              </div>
            )}

            <p>Digite o título canônico exato da obra para confirmar:</p>
            <div className="admin-dialog-code-box">
              <code>{work.title}</code>
            </div>

            <input
              type="text"
              value={confirmDeleteTitle}
              onChange={(e) => setConfirmDeleteTitle(e.target.value)}
              placeholder="Digite o título exato..."
              className="admin-input"
            />

            {deleteError && <div className="admin-danger-error">{deleteError}</div>}

            <div className="admin-dialog-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={deleteWork.isPending || confirmDeleteTitle.trim() !== work.title.trim()}
                onClick={() => deleteWork.mutate(confirmDeleteTitle.trim())}
              >
                {deleteWork.isPending ? "Excluindo…" : "Excluir Definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
