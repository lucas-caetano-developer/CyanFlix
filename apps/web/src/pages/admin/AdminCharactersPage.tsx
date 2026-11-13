import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { MiniVideoAudioClipper } from "../../components/admin/MiniVideoAudioClipper";
import { CharacterArchetypeSelector } from "../../components/admin/CharacterArchetypeSelector";
import { CHARACTER_ROLES } from "../../lib/characterConstants";
import type { VoiceActor } from "../../lib/types";

export function AdminCharactersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newBodyPhotoUrl, setNewBodyPhotoUrl] = useState("");
  const [newRole, setNewRole] = useState("Protagonista");
  const [newArchetypes, setNewArchetypes] = useState<string[]>([]);
  const [newProfileSentiments, setNewProfileSentiments] = useState("");
  const [newVoiceActorId, setNewVoiceActorId] = useState("");
  const [newVoiceAudioUrl, setNewVoiceAudioUrl] = useState<string | null>(null);
  const [newThemeColor, setNewThemeColor] = useState("#00d4ff");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingBodyPhoto, setIsUploadingBodyPhoto] = useState(false);
  const [isDragOverBody, setIsDragOverBody] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const bodyPhotoInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: catalogData, isLoading: isLoadingCatalog } = useQuery({
    queryKey: ["admin", "catalog", debouncedSearch],
    queryFn: () => api.getAdminCatalog(debouncedSearch),
  });

  const { data: characters = [] } = useQuery({
    queryKey: ["admin", "characters"],
    queryFn: () => api.getAdminCharacters(),
  });

  const { data: voiceActors = [] } = useQuery({
    queryKey: ["admin", "voice-actors"],
    queryFn: () => api.getAdminVoiceActors(),
  });

  // Calculate characters count per work
  const charCountByWork = characters.reduce<Record<string, number>>((acc, char) => {
    const wIds = char.works && char.works.length > 0 ? char.works.map((w) => w.id) : char.workId ? [char.workId] : [];
    for (const wId of wIds) {
      acc[wId] = (acc[wId] || 0) + 1;
    }
    return acc;
  }, {});

  const works = catalogData?.items || [];

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      workId: string;
      photoUrl?: string | null;
      bodyPhotoUrl?: string | null;
      role?: string | null;
      archetype?: string | null;
      profileSentiments?: string | null;
      voiceAudioUrl?: string | null;
      voiceActorId?: string | null;
      themeColor?: string | null;
    }) => api.createAdminCharacter(data),
    onSuccess: (newChar) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      setIsCreateOpen(false);
      resetCreateForm();
      navigate(`/admin/characters/${newChar.id}`);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Erro ao cadastrar personagem");
    },
  });

  const resetCreateForm = () => {
    setSelectedWorkId(works[0]?.id || "");
    setNewName("");
    setNewPhotoUrl("");
    setNewBodyPhotoUrl("");
    setNewRole("Protagonista");
    setNewArchetypes([]);
    setNewProfileSentiments("");
    setNewVoiceActorId("");
    setNewVoiceAudioUrl(null);
    setNewThemeColor("#00d4ff");
    setFormError(null);
  };

  const uploadPhoto = async (file: File) => {
    if (!file) return;
    setIsUploadingPhoto(true);
    setFormError(null);
    try {
      const res = await api.uploadCharacterPhoto(file);
      setNewPhotoUrl(res.photoUrl || res.url || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError("Erro ao enviar foto de perfil: " + msg);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const uploadBodyPhoto = async (file: File) => {
    if (!file) return;
    setIsUploadingBodyPhoto(true);
    setFormError(null);
    try {
      const res = await api.uploadCharacterPhoto(file);
      setNewBodyPhotoUrl(res.bodyPhotoUrl || res.photoUrl || res.url || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError("Erro ao enviar foto de corpo: " + msg);
    } finally {
      setIsUploadingBodyPhoto(false);
      if (bodyPhotoInputRef.current) bodyPhotoInputRef.current.value = "";
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      setFormError("O nome do personagem é obrigatório.");
      return;
    }
    if (!selectedWorkId) {
      setFormError("Selecione uma obra para o personagem.");
      return;
    }
    createMutation.mutate({
      name: cleanName,
      workId: selectedWorkId,
      photoUrl: newPhotoUrl.trim() || null,
      bodyPhotoUrl: newBodyPhotoUrl.trim() || null,
      role: newRole.trim() || null,
      archetype: newArchetypes.join(", ") || null,
      profileSentiments: newProfileSentiments.trim() || null,
      voiceAudioUrl: newVoiceAudioUrl,
      voiceActorId: newVoiceActorId.trim() || null,
      themeColor: newThemeColor.trim() || null,
    });
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Gestão de Personagens & Vozes</span>
          <h1 className="admin-page__title">Personagens</h1>
          <p className="admin-page__subtitle">
            Selecione uma obra do catálogo para gerenciar seus personagens, associar aos dubladores oficiais e gravar amostras de voz.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              resetCreateForm();
              setIsCreateOpen(true);
            }}
          >
            + Adicionar Personagem
          </button>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="admin-catalog__toolbar">
        <div className="admin-catalog__search-box">
          <span className="admin-catalog__search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por obra ou produção do catálogo…"
            className="admin-catalog__search-input"
          />
          {search && (
            <button
              className="admin-catalog__search-clear"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
        <div className="admin-filter-group">
          <span className="admin-filter-group__label">
            {isLoadingCatalog ? "Carregando obras…" : `${works.length} obra${works.length === 1 ? "" : "s"} encontrada${works.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Works Grid */}
      {isLoadingCatalog ? (
        <div className="admin-voice-actors__loading">
          <p>Carregando obras do catálogo…</p>
        </div>
      ) : works.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">🎬</div>
          <h3>Nenhuma obra encontrada</h3>
          <p>
            {search ? `Nenhuma obra corresponde à busca "${search}".` : "Publique filmes, séries ou animes no catálogo para gerenciar seus personagens."}
          </p>
        </div>
      ) : (
        <div className="admin-characters-works-grid">
          {works.map((work) => {
            const count = charCountByWork[work.id] || 0;
            return (
              <Link
                key={work.id}
                to={`/admin/characters/work/${work.id}`}
                className="admin-work-card"
              >
                <div className="admin-work-card__poster" style={{ display: "grid", placeItems: "center", color: "#38bdf8", fontSize: "1.75rem", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  🎬
                </div>
                <div className="admin-work-card__content">
                  <span className="admin-work-card__kind">{work.contentKind}</span>
                  <h3 className="admin-work-card__title" title={work.title}>
                    {work.title}
                  </h3>
                  <div className="admin-work-card__count">
                    <span>👥 <strong>{count}</strong> personagem{count === 1 ? "" : "s"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Character Modal */}
      {isCreateOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Novo Personagem</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="admin-modal__form">
              {formError && (
                <div className="admin-alert admin-alert--danger">{formError}</div>
              )}

              {/* Work selection */}
              <div className="admin-form-group">
                <label htmlFor="char-work" className="admin-label">
                  Obra do Catálogo <span className="admin-required">*</span>
                </label>
                <select
                  id="char-work"
                  className="admin-select"
                  value={selectedWorkId}
                  onChange={(e) => setSelectedWorkId(e.target.value)}
                  required
                >
                  <option value="" disabled>Selecione a produção…</option>
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      [{w.contentKind.toUpperCase()}] {w.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div className="admin-form-group">
                <label htmlFor="char-name" className="admin-label">
                  Nome do Personagem <span className="admin-required">*</span>
                </label>
                <input
                  id="char-name"
                  type="text"
                  className="admin-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Eren Yeager, Goku, Buzz Lightyear..."
                  required
                />
              </div>

              {/* Profile Photo Upload */}
              <div className="admin-form-group">
                <label className="admin-label">Foto de Perfil (Avatar / Rosto) — Opcional</label>
                <div
                  className={`admin-photo-upload-box ${isDragOver ? "admin-photo-upload-box--dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                >
                  <div className="admin-photo-preview">
                    {newPhotoUrl ? (
                      <img src={newPhotoUrl} alt="Prévia do perfil" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {newName.trim().charAt(0).toUpperCase() || "👤"}
                      </div>
                    )}
                  </div>
                  <div className="admin-photo-upload-info">
                    <input
                      type="file"
                      ref={photoInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadPhoto(file);
                      }}
                      accept="image/png, image/jpeg, image/webp, image/avif"
                      style={{ display: "none" }}
                      id="char-photo-create"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                      >
                        {isUploadingPhoto ? "Salvando foto…" : newPhotoUrl ? "📁 Trocar Foto de Perfil" : "📁 Selecionar Foto de Perfil"}
                      </button>
                      {newPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setNewPhotoUrl("")}
                        >
                          Remover Perfil
                        </button>
                      )}
                    </div>
                    {isUploadingPhoto ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto no servidor…
                      </span>
                    ) : newPhotoUrl ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--success">
                        ✓ Foto salva localmente no disco do servidor
                      </span>
                    ) : (
                      <p className="admin-photo-local-note">
                        Foto de avatar / rosto para ícones e cards (PNG, JPG, WEBP).
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Body Photo Upload */}
              <div className="admin-form-group">
                <label className="admin-label">Foto de Corpo (Visual Completo) — Opcional</label>
                <div
                  className={`admin-photo-upload-box ${isDragOverBody ? "admin-photo-upload-box--dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverBody(true);
                  }}
                  onDragLeave={() => setIsDragOverBody(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverBody(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void uploadBodyPhoto(file);
                  }}
                >
                  <div className="admin-photo-preview admin-photo-preview--body">
                    {newBodyPhotoUrl ? (
                      <img src={newBodyPhotoUrl} alt="Prévia de corpo" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder" style={{ fontSize: "1.25rem" }}>
                        🧍
                      </div>
                    )}
                  </div>
                  <div className="admin-photo-upload-info">
                    <input
                      type="file"
                      ref={bodyPhotoInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadBodyPhoto(file);
                      }}
                      accept="image/png, image/jpeg, image/webp, image/avif"
                      style={{ display: "none" }}
                      id="char-body-photo-create"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => bodyPhotoInputRef.current?.click()}
                        disabled={isUploadingBodyPhoto}
                      >
                        {isUploadingBodyPhoto ? "Salvando foto…" : newBodyPhotoUrl ? "📁 Trocar Foto de Corpo" : "📁 Selecionar Foto de Corpo"}
                      </button>
                      {newBodyPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setNewBodyPhotoUrl("")}
                        >
                          Remover Corpo
                        </button>
                      )}
                    </div>
                    {isUploadingBodyPhoto ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto de corpo no servidor…
                      </span>
                    ) : newBodyPhotoUrl ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--success">
                        ✓ Foto de corpo salva localmente no disco
                      </span>
                    ) : (
                      <p className="admin-photo-local-note">
                        Imagem de corpo inteiro para exibição na página do personagem (PNG, JPG, WEBP).
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Voice Actor Selector */}
              <div className="admin-form-group">
                <label htmlFor="char-voice-actor" className="admin-label">
                  Dublador Oficial (Cadastrado)
                </label>
                <select
                  id="char-voice-actor"
                  className="admin-select"
                  value={newVoiceActorId}
                  onChange={(e) => setNewVoiceActorId(e.target.value)}
                >
                  <option value="">Nenhum / Não informado</option>
                  {voiceActors.map((actor: VoiceActor) => (
                    <option key={actor.id} value={actor.id}>
                      🎙️ {actor.name}
                    </option>
                  ))}
                </select>
                <span className="admin-form-hint">
                  Vincule a um dublador cadastrado. O personagem aparecerá automaticamente na página de perfil do dublador.
                </span>
              </div>

              {/* Role & Archetype Selection */}
              <div className="admin-form-group">
                <label htmlFor="char-role" className="admin-label">
                  Tipo / Papel
                </label>
                <select
                  id="char-role"
                  className="admin-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  {CHARACTER_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} — {role.description}
                    </option>
                  ))}
                </select>
                <span className="admin-form-hint">
                  Função estrutural do personagem na narrativa (seleção única).
                </span>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">
                  Arquétipo(s) Narrativo(s) e Comportamental(is)
                </label>
                <span className="admin-form-hint" style={{ marginBottom: "0.5rem", display: "block" }}>
                  Selecione um ou múltiplos arquétipos que definem a personalidade e o padrão narrativo.
                </span>
                <CharacterArchetypeSelector
                  selected={newArchetypes}
                  onChange={setNewArchetypes}
                />
              </div>

              {/* Cor Tema */}
              <div className="admin-form-group">
                <label htmlFor="char-theme-color" className="admin-label">
                  Cor de Tema do Personagem
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  <input
                    type="color"
                    id="char-theme-color"
                    value={newThemeColor || "#00d4ff"}
                    onChange={(e) => setNewThemeColor(e.target.value)}
                    style={{
                      width: "44px",
                      height: "38px",
                      padding: "2px",
                      borderRadius: "6px",
                      border: "1px solid #334155",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  />
                  <input
                    type="text"
                    className="admin-input"
                    value={newThemeColor}
                    onChange={(e) => setNewThemeColor(e.target.value)}
                    placeholder="#00D4FF"
                    style={{ width: "120px", textTransform: "uppercase", fontWeight: 600 }}
                  />
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    {[
                      "#0284C7",
                      "#059669",
                      "#9333EA",
                      "#E11D48",
                      "#EA580C",
                      "#DC2626",
                      "#F43F5E",
                      "#EAB308",
                      "#64748B",
                      "#38BDF8",
                      "#10B981",
                      "#7C3AED",
                    ].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewThemeColor(c)}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          backgroundColor: c,
                          border: newThemeColor.toLowerCase() === c.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
                          cursor: "pointer",
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <span className="admin-form-hint">
                  Cor de destaque para banners promocionais e cards do personagem.
                </span>
              </div>

              {/* Profile & Sentiments */}
              <div className="admin-form-group">
                <label htmlFor="char-new-profile-sentiments" className="admin-label">
                  Perfil e Sentimentos
                </label>
                <textarea
                  id="char-new-profile-sentiments"
                  className="admin-input"
                  rows={4}
                  placeholder="Descreva a psicologia, conflitos internos, medos e sentimentos do personagem..."
                  value={newProfileSentiments}
                  onChange={(e) => setNewProfileSentiments(e.target.value)}
                />
                <span className="admin-form-hint">
                  Descrição detalhada das motivações, dilemas internos e personalidade do personagem.
                </span>
              </div>

              {/* Voice Sample Clipper with Mini Player */}
              {selectedWorkId && (
                <div className="admin-form-group">
                  <label className="admin-label">Amostra de Voz da Dublagem</label>
                  <MiniVideoAudioClipper
                    workId={selectedWorkId}
                    currentVoiceAudioUrl={newVoiceAudioUrl}
                    onVoiceAudioChange={setNewVoiceAudioUrl}
                  />
                </div>
              )}

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={createMutation.isPending || isUploadingPhoto || isUploadingBodyPhoto}
                >
                  {createMutation.isPending ? "Cadastrando…" : "Salvar Personagem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
