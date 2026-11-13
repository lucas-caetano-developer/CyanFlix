import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { MiniVideoAudioClipper } from "../../components/admin/MiniVideoAudioClipper";
import { CharacterArchetypeSelector } from "../../components/admin/CharacterArchetypeSelector";
import { CHARACTER_ROLES, parseArchetypes, resolveCharacterRole } from "../../lib/characterConstants";
import type { Character, VoiceActor } from "../../lib/types";

export function AdminWorkCharactersPage() {
  const { workId } = useParams<{ workId: string }>();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formBodyPhotoUrl, setFormBodyPhotoUrl] = useState("");
  const [formRole, setFormRole] = useState("Protagonista");
  const [formArchetypes, setFormArchetypes] = useState<string[]>([]);
  const [formProfileSentiments, setFormProfileSentiments] = useState("");
  const [formVoiceActorId, setFormVoiceActorId] = useState("");
  const [formVoiceAudioUrl, setFormVoiceAudioUrl] = useState<string | null>(null);
  const [formThemeColor, setFormThemeColor] = useState("#00d4ff");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingBodyPhoto, setIsUploadingBodyPhoto] = useState(false);
  const [isDragOverBody, setIsDragOverBody] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const bodyPhotoInputRef = useRef<HTMLInputElement>(null);

  // Deleting state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Query work details
  const { data: workDetail } = useQuery({
    queryKey: ["admin", "work-detail", workId],
    queryFn: () => (workId ? api.getAdminWork(workId) : null),
    enabled: Boolean(workId),
  });

  // Query characters for this work
  const { data: characters = [], isLoading: isLoadingChars } = useQuery({
    queryKey: ["admin", "characters", { workId }],
    queryFn: () => (workId ? api.getAdminCharacters({ workId }) : []),
    enabled: Boolean(workId),
  });

  // Query all voice actors for the selector
  const { data: voiceActors = [] } = useQuery({
    queryKey: ["admin", "voice-actors"],
    queryFn: () => api.getAdminVoiceActors(),
  });

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message || "Erro ao cadastrar personagem");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Character> }) =>
      api.updateAdminCharacter(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      setEditingCharacter(null);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message || "Erro ao atualizar personagem");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminCharacter(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      alert("Erro ao excluir personagem: " + err.message);
      setDeletingId(null);
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormPhotoUrl("");
    setFormBodyPhotoUrl("");
    setFormRole("Protagonista");
    setFormArchetypes([]);
    setFormProfileSentiments("");
    setFormVoiceActorId("");
    setFormVoiceAudioUrl(null);
    setFormThemeColor("#00d4ff");
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEditModal = (char: Character) => {
    setEditingCharacter(char);
    setFormName(char.name || "");
    setFormPhotoUrl(char.photoUrl || "");
    setFormBodyPhotoUrl(char.bodyPhotoUrl || "");
    setFormRole(resolveCharacterRole(char.role));
    setFormArchetypes(parseArchetypes(char.archetype));
    setFormProfileSentiments(char.profileSentiments || "");
    setFormVoiceActorId(char.voiceActorId || "");
    setFormVoiceAudioUrl(char.voiceAudioUrl || null);
    setFormThemeColor(char.themeColor || "#00d4ff");
    setFormError(null);
  };

  const uploadPhoto = async (file: File) => {
    if (!file) return;
    setIsUploadingPhoto(true);
    setFormError(null);
    try {
      const res = await api.uploadCharacterPhoto(file);
      setFormPhotoUrl(res.photoUrl || res.url || "");
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
      setFormBodyPhotoUrl(res.bodyPhotoUrl || res.photoUrl || res.url || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError("Erro ao enviar foto de corpo: " + msg);
    } finally {
      setIsUploadingBodyPhoto(false);
      if (bodyPhotoInputRef.current) bodyPhotoInputRef.current.value = "";
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workId) return;
    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError("O nome do personagem é obrigatório.");
      return;
    }

    if (editingCharacter) {
      updateMutation.mutate({
        id: editingCharacter.id,
        data: {
          name: cleanName,
          workId,
          photoUrl: formPhotoUrl.trim() || null,
          bodyPhotoUrl: formBodyPhotoUrl.trim() || null,
          role: formRole.trim() || null,
          archetype: formArchetypes.join(", ") || null,
          profileSentiments: formProfileSentiments.trim() || null,
          voiceAudioUrl: formVoiceAudioUrl,
          voiceActorId: formVoiceActorId.trim() || null,
          themeColor: formThemeColor.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: cleanName,
        workId,
        photoUrl: formPhotoUrl.trim() || null,
        bodyPhotoUrl: formBodyPhotoUrl.trim() || null,
        role: formRole.trim() || null,
        archetype: formArchetypes.join(", ") || null,
        profileSentiments: formProfileSentiments.trim() || null,
        voiceAudioUrl: formVoiceAudioUrl,
        voiceActorId: formVoiceActorId.trim() || null,
        themeColor: formThemeColor.trim() || null,
      });
    }
  };

  const work = workDetail;

  const filteredCharacters = characters.filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="admin-page">
      {/* Top breadcrumb */}
      <div className="admin-breadcrumb-bar">
        <Link to="/admin/characters" className="admin-back-link">
          ← Voltar para Obras
        </Link>
      </div>

      {/* Header with Work Info */}
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">
            {work ? `Obra: ${work.contentKind.toUpperCase()}` : "Personagens da Obra"}
          </span>
          <h1 className="admin-page__title">{work ? work.title : "Carregando Obra…"}</h1>
          <p className="admin-page__subtitle">
            Gerencie todos os personagens desta produção, vincule seus dubladores e grave clipes de voz.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button type="button" className="btn btn--primary" onClick={openCreateModal}>
            + Adicionar Personagem
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-catalog__toolbar">
        <div className="admin-catalog__search-box">
          <span className="admin-catalog__search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do personagem…"
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
            {isLoadingChars ? "Carregando…" : `${filteredCharacters.length} personagem${filteredCharacters.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Characters Grid */}
      {isLoadingChars ? (
        <div className="admin-voice-actors__loading">
          <p>Carregando personagens…</p>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">🎭</div>
          <h3>{search ? "Nenhum personagem encontrado" : "Nenhum personagem cadastrado nesta obra"}</h3>
          <p>
            {search
              ? `Nenhum personagem corresponde a "${search}".`
              : "Cadastre os personagens principais e secundários desta obra para enriquecer a experiência dos usuários."}
          </p>
          {!search && (
            <button type="button" className="btn btn--primary" onClick={openCreateModal}>
              Cadastrar Primeiro Personagem
            </button>
          )}
        </div>
      ) : (
        <div className="admin-characters__grid">
          {filteredCharacters.map((char) => (
            <div key={char.id} className="admin-character-card">
              <Link to={`/admin/characters/${char.id}`} className="admin-character-card__link">
                <div
                  className="admin-character-card__avatar-wrap"
                  style={char.themeColor ? { borderColor: char.themeColor, boxShadow: `0 0 10px ${char.themeColor}33` } : undefined}
                >
                  {char.photoUrl ? (
                    <img src={char.photoUrl} alt={char.name} className="admin-character-card__avatar" loading="lazy" />
                  ) : char.bodyPhotoUrl ? (
                    <img src={char.bodyPhotoUrl} alt={char.name} className="admin-character-card__avatar" loading="lazy" />
                  ) : (
                    <div className="admin-character-card__avatar-placeholder">
                      {char.name.trim().charAt(0).toUpperCase() || "🎭"}
                    </div>
                  )}
                </div>
                <div className="admin-character-card__content">
                  <h3 className="admin-character-card__name">{char.name}</h3>

                  <div className="admin-character-badges">
                    {char.themeColor && (
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          backgroundColor: char.themeColor,
                          boxShadow: `0 0 8px ${char.themeColor}`,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                        title={`Cor tema: ${char.themeColor}`}
                      />
                    )}
                    {char.role && <span className="admin-role-badge">{char.role}</span>}
                    {parseArchetypes(char.archetype).map((arch) => (
                      <span key={arch} className="admin-archetype-badge">{arch}</span>
                    ))}
                  </div>

                  {char.voiceActor ? (
                    <span className="admin-character-voice-actor" title={`Dublador: ${char.voiceActor.name}`}>
                      {char.voiceActor.photoUrl ? (
                        <img src={char.voiceActor.photoUrl} alt="" className="admin-character-voice-actor__thumb" />
                      ) : (
                        <span>🎙️</span>
                      )}
                      <span>{char.voiceActor.name}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.4rem" }}>
                      Sem dublador vinculado
                    </span>
                  )}
                </div>
              </Link>

              {char.voiceAudioUrl && (
                <div className="admin-character-audio-preview">
                  <audio controls src={char.voiceAudioUrl} className="admin-audio-player" preload="none" />
                </div>
              )}

              <div className="admin-character-card__actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() => openEditModal(char)}
                  title="Editar personagem"
                >
                  ✏️ Editar
                </button>
                <Link
                  to={`/admin/characters/${char.id}`}
                  className="btn btn--secondary btn--xs"
                  title="Ver perfil de apresentação"
                >
                  Ver Perfil
                </Link>
                <button
                  type="button"
                  className="btn btn--danger btn--xs"
                  onClick={() => {
                    if (confirm(`Deseja realmente remover o personagem "${char.name}"?`)) {
                      setDeletingId(char.id);
                      deleteMutation.mutate(char.id);
                    }
                  }}
                  disabled={deletingId === char.id}
                  title="Excluir personagem"
                >
                  {deletingId === char.id ? "…" : "Excluir"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Criar ou Editar Personagem */}
      {(isCreateOpen || editingCharacter) && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingCharacter(null);
          }}
        >
          <div className="admin-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>{editingCharacter ? `Editar Personagem: ${editingCharacter.name}` : "Novo Personagem"}</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingCharacter(null);
                }}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="admin-modal__form">
              {formError && (
                <div className="admin-alert admin-alert--danger">{formError}</div>
              )}

              {/* Name */}
              <div className="admin-form-group">
                <label htmlFor="char-modal-name" className="admin-label">
                  Nome do Personagem <span className="admin-required">*</span>
                </label>
                <input
                  id="char-modal-name"
                  type="text"
                  className="admin-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Eren Yeager, Goku, Buzz Lightyear..."
                  required
                  autoFocus
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
                    {formPhotoUrl ? (
                      <img src={formPhotoUrl} alt="Prévia do perfil" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {formName.trim().charAt(0).toUpperCase() || "👤"}
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
                      id="char-modal-photo"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                      >
                        {isUploadingPhoto ? "Salvando foto…" : formPhotoUrl ? "📁 Trocar Foto de Perfil" : "📁 Selecionar Foto de Perfil"}
                      </button>
                      {formPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setFormPhotoUrl("")}
                        >
                          Remover Perfil
                        </button>
                      )}
                    </div>
                    {isUploadingPhoto ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto no servidor…
                      </span>
                    ) : formPhotoUrl ? (
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
                    {formBodyPhotoUrl ? (
                      <img src={formBodyPhotoUrl} alt="Prévia de corpo" className="admin-photo-preview__img" />
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
                      id="char-modal-body-photo"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => bodyPhotoInputRef.current?.click()}
                        disabled={isUploadingBodyPhoto}
                      >
                        {isUploadingBodyPhoto ? "Salvando foto…" : formBodyPhotoUrl ? "📁 Trocar Foto de Corpo" : "📁 Selecionar Foto de Corpo"}
                      </button>
                      {formBodyPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setFormBodyPhotoUrl("")}
                        >
                          Remover Corpo
                        </button>
                      )}
                    </div>
                    {isUploadingBodyPhoto ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto de corpo no servidor…
                      </span>
                    ) : formBodyPhotoUrl ? (
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
                <label htmlFor="char-modal-actor" className="admin-label">
                  Dublador Oficial (Cadastrado)
                </label>
                <select
                  id="char-modal-actor"
                  className="admin-select"
                  value={formVoiceActorId}
                  onChange={(e) => setFormVoiceActorId(e.target.value)}
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
                <label htmlFor="char-modal-role" className="admin-label">
                  Tipo / Papel
                </label>
                <select
                  id="char-modal-role"
                  className="admin-select"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                >
                  {!CHARACTER_ROLES.some((r) => r.value === formRole) && formRole && (
                    <option value={formRole}>
                      {formRole} (Atual)
                    </option>
                  )}
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
                  Selecione um ou múltiplos arquétipos que definem a essência e personalidade do personagem.
                </span>
                <CharacterArchetypeSelector
                  selected={formArchetypes}
                  onChange={setFormArchetypes}
                />
              </div>

              {/* Cor Tema */}
              <div className="admin-form-group">
                <label htmlFor="char-modal-theme-color" className="admin-label">
                  Cor de Tema do Personagem
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  <input
                    type="color"
                    id="char-modal-theme-color"
                    value={formThemeColor || "#00d4ff"}
                    onChange={(e) => setFormThemeColor(e.target.value)}
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
                    value={formThemeColor}
                    onChange={(e) => setFormThemeColor(e.target.value)}
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
                        onClick={() => setFormThemeColor(c)}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          backgroundColor: c,
                          border: formThemeColor.toLowerCase() === c.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
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
                <label htmlFor="char-modal-profile-sentiments" className="admin-label">
                  Perfil e Sentimentos
                </label>
                <textarea
                  id="char-modal-profile-sentiments"
                  className="admin-input"
                  rows={4}
                  placeholder="Descreva a psicologia, conflitos internos, medos e sentimentos do personagem..."
                  value={formProfileSentiments}
                  onChange={(e) => setFormProfileSentiments(e.target.value)}
                />
                <span className="admin-form-hint">
                  Descrição detalhada das motivações, dilemas internos e personalidade do personagem.
                </span>
              </div>

              {/* Voice Sample with Mini Player */}
              {workId && (
                <div className="admin-form-group">
                  <label className="admin-label">Amostra de Voz da Dublagem</label>
                  <MiniVideoAudioClipper
                    workId={workId}
                    currentVoiceAudioUrl={formVoiceAudioUrl}
                    onVoiceAudioChange={setFormVoiceAudioUrl}
                    onSaveDirect={editingCharacter ? async (url) => {
                      await api.updateAdminCharacter(editingCharacter.id, { voiceAudioUrl: url });
                      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
                    } : undefined}
                  />
                </div>
              )}

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingCharacter(null);
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={createMutation.isPending || updateMutation.isPending || isUploadingPhoto || isUploadingBodyPhoto}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Salvando…"
                    : editingCharacter
                    ? "Salvar Alterações"
                    : "Cadastrar Personagem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
