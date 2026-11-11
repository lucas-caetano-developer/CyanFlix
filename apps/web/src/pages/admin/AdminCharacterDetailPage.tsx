import { useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { MiniVideoAudioClipper } from "../../components/admin/MiniVideoAudioClipper";
import { CharacterArchetypeSelector } from "../../components/admin/CharacterArchetypeSelector";
import { CHARACTER_ROLES, parseArchetypes } from "../../lib/characterConstants";
import type { Character, VoiceActor } from "../../lib/types";

export function AdminCharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formBodyPhotoUrl, setFormBodyPhotoUrl] = useState("");
  const [formRole, setFormRole] = useState("Protagonista");
  const [formArchetypes, setFormArchetypes] = useState<string[]>([]);
  const [formProfileSentiments, setFormProfileSentiments] = useState("");
  const [formVoiceActorId, setFormVoiceActorId] = useState("");
  const [formVoiceAudioUrl, setFormVoiceAudioUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingBodyPhoto, setIsUploadingBodyPhoto] = useState(false);
  const [isDragOverBody, setIsDragOverBody] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const bodyPhotoInputRef = useRef<HTMLInputElement>(null);

  const { data: character, isLoading, isError } = useQuery({
    queryKey: ["admin", "character", id],
    queryFn: () => (id ? api.getAdminCharacter(id) : Promise.reject(new Error("ID ausente"))),
    enabled: Boolean(id),
  });

  const { data: voiceActors = [] } = useQuery({
    queryKey: ["admin", "voice-actors"],
    queryFn: () => api.getAdminVoiceActors(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Character>) =>
      id ? api.updateAdminCharacter(id, data) : Promise.reject(new Error("ID ausente")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "character", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      setIsEditModalOpen(false);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Erro ao salvar alterações");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (charId: string) => api.deleteAdminCharacter(charId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
      const redirectWorkId = character?.works?.[0]?.id || character?.workId;
      if (redirectWorkId) {
        navigate(`/admin/characters/work/${redirectWorkId}`);
      } else {
        navigate("/admin/characters");
      }
    },
    onError: (err: Error) => {
      alert("Erro ao excluir personagem: " + err.message);
    },
  });

  const openEditModal = () => {
    if (!character) return;
    setFormName(character.name || "");
    setFormPhotoUrl(character.photoUrl || "");
    setFormBodyPhotoUrl(character.bodyPhotoUrl || "");
    setFormRole(character.role || "Protagonista");
    setFormArchetypes(parseArchetypes(character.archetype));
    setFormProfileSentiments(character.profileSentiments || "");
    setFormVoiceActorId(character.voiceActorId || "");
    setFormVoiceAudioUrl(character.voiceAudioUrl || null);
    setFormError(null);
    setIsEditModalOpen(true);
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

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError("O nome do personagem é obrigatório.");
      return;
    }
    updateMutation.mutate({
      name: cleanName,
      photoUrl: formPhotoUrl.trim() || null,
      bodyPhotoUrl: formBodyPhotoUrl.trim() || null,
      role: formRole.trim() || null,
      archetype: formArchetypes.join(", ") || null,
      profileSentiments: formProfileSentiments.trim() || null,
      voiceAudioUrl: formVoiceAudioUrl,
      voiceActorId: formVoiceActorId.trim() || null,
    });
  };

  if (isLoading) {
    return (
      <div className="admin-page">
        <div className="admin-voice-actors__loading">
          <p>Carregando perfil do personagem…</p>
        </div>
      </div>
    );
  }

  if (isError || !character) {
    return (
      <div className="admin-page">
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">⚠️</div>
          <h3>Personagem não encontrado</h3>
          <p>O personagem solicitado não existe ou foi removido.</p>
          <Link to="/admin/characters" className="btn btn--secondary">
            ← Voltar para Personagens
          </Link>
        </div>
      </div>
    );
  }

  const works = character?.works && character.works.length > 0 ? character.works : character?.work ? [character.work] : [];
  const primaryWork = works[0];
  const actor = character?.voiceActor;

  return (
    <div className="admin-page">
      {/* Top breadcrumb */}
      <div className="admin-breadcrumb-bar">
        {primaryWork ? (
          <Link to={`/admin/characters/work/${primaryWork.id}`} className="admin-back-link">
            ← Voltar para {primaryWork.title}
          </Link>
        ) : (
          <Link to="/admin/characters" className="admin-back-link">
            ← Voltar para Personagens
          </Link>
        )}
      </div>

      {/* Hero Showcase Banner */}
      <div className="admin-profile-hero">
        <div className="admin-profile-hero__avatar-wrap">
          {character.photoUrl ? (
            <img src={character.photoUrl} alt={character.name} className="admin-profile-hero__avatar" />
          ) : character.bodyPhotoUrl ? (
            <img src={character.bodyPhotoUrl} alt={character.name} className="admin-profile-hero__avatar" />
          ) : (
            <div className="admin-profile-hero__placeholder">
              {character.name.trim().charAt(0).toUpperCase() || "🎭"}
            </div>
          )}
        </div>
        <div className="admin-profile-hero__body">
          <div className="admin-profile-hero__title-row">
            <div>
              <span className="admin-page__eyebrow">
                {works.length > 1
                  ? `Personagem presente em ${works.length} obras`
                  : primaryWork
                  ? `Personagem de ${primaryWork.title}`
                  : "Personagem"}
              </span>
              <h1 className="admin-profile-hero__name">{character.name}</h1>
            </div>
            <div className="admin-profile-hero__actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={openEditModal}>
                ✏️ Editar Personagem
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => {
                  if (confirm(`Deseja realmente remover o personagem "${character.name}"?`)) {
                    deleteMutation.mutate(character.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {works.map((w) => (
              <Link key={w.id} to={`/admin/characters/work/${w.id}`} className="admin-work-badge">
                🎬 {w.title} ({w.contentKind.toUpperCase()})
              </Link>
            ))}
            {character.role && <span className="admin-role-badge">{character.role}</span>}
            {parseArchetypes(character.archetype).map((arch) => (
              <span key={arch} className="admin-archetype-badge">{arch}</span>
            ))}
          </div>

          <div className="admin-profile-hero__meta">
            <span>📅 Cadastrado em {new Date(character.createdAt).toLocaleDateString("pt-BR")}</span>
            <span>💾 Armazenamento de mídia 100% offline</span>
          </div>
        </div>
      </div>

      <div className="admin-voice-actor-detail-layout">
        {/* Main Content */}
        <div className="admin-voice-actor-detail-main">
          {/* Perfil & Sentimentos Showcase */}
          {character.profileSentiments ? (
            <div className="admin-card">
              <h2 className="admin-card__title">Perfil & Sentimentos</h2>
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "1.25rem 1.5rem",
                  borderRadius: "0.75rem",
                  color: "#cbd5e1",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                }}
              >
                {character.profileSentiments}
              </div>
            </div>
          ) : (
            <div className="admin-card">
              <h2 className="admin-card__title">Perfil & Sentimentos</h2>
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px dashed rgba(255,255,255,0.1)", padding: "1.25rem", borderRadius: "0.75rem", textAlign: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 0.75rem 0" }}>
                  Nenhuma descrição de perfil e sentimentos cadastrada.
                </p>
                <button type="button" className="btn btn--secondary btn--xs" onClick={openEditModal}>
                  Adicionar Descrição
                </button>
              </div>
            </div>
          )}

          {/* Voice Actor Showcase */}
          <div className="admin-card">
            <h2 className="admin-card__title">Dublador Oficial</h2>
            {actor ? (
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.08)", padding: "1.25rem", borderRadius: "0.75rem" }}>
                <div style={{ width: "72px", height: "72px", borderRadius: "50%", padding: "2px", background: "linear-gradient(135deg, #00d4ff, #7928ca)", flexShrink: 0 }}>
                  {actor.photoUrl ? (
                    <img src={actor.photoUrl} alt={actor.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#1e293b", color: "#00d4ff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "1.5rem" }}>
                      🎙️
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: "0 0 0.25rem 0", color: "#ffffff", fontSize: "1.2rem" }}>{actor.name}</h3>
                  <p style={{ margin: "0 0 0.75rem 0", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.4 }}>
                    {actor.bio || "Dublador profissional cadastrado no sistema."}
                  </p>
                  <Link to={`/admin/voice-actors/${actor.id}`} className="btn btn--secondary btn--xs">
                    Ver Perfil Completo do Dublador →
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px dashed rgba(255,255,255,0.1)", padding: "1.5rem", borderRadius: "0.75rem", textAlign: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 0.75rem 0" }}>
                  Nenhum dublador oficial vinculado a este personagem ainda.
                </p>
                <button type="button" className="btn btn--secondary btn--sm" onClick={openEditModal}>
                  Vincular Dublador
                </button>
              </div>
            )}
          </div>

          {/* Voice Sample Showcase */}
          <div className="admin-card">
            <h2 className="admin-card__title">Amostra de Voz (Dublagem em Português)</h2>
            {character.voiceAudioUrl ? (
              <div className="admin-voice-sample-card">
                <div className="admin-voice-sample-card__header">
                  <span className="admin-voice-sample-card__icon">🎙️</span>
                  <div>
                    <h3 className="admin-voice-sample-card__title">Gravação Oficial do Personagem</h3>
                    <p className="admin-voice-sample-card__desc">
                      Áudio extraído diretamente das cenas da obra com processamento FFmpeg local.
                    </p>
                  </div>
                </div>
                <audio controls src={character.voiceAudioUrl} style={{ width: "100%", height: "42px" }} />
              </div>
            ) : (
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px dashed rgba(255,255,255,0.1)", padding: "1.5rem", borderRadius: "0.75rem", textAlign: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 0.75rem 0" }}>
                  Nenhuma amostra de voz registrada para este personagem.
                </p>
                <button type="button" className="btn btn--secondary btn--sm" onClick={openEditModal}>
                  🎬 Gravar Voz com o Mini Player
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Work Info & Body Photo */}
        <aside className="admin-voice-actor-detail-sidebar">
          {character.bodyPhotoUrl && (
            <div className="admin-card admin-character-body-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 className="admin-card__title" style={{ margin: 0 }}>Visual de Corpo Inteiro</h3>
                <span className="admin-archetype-badge">Corpo</span>
              </div>
              <div className="admin-character-body-wrap">
                <img
                  src={character.bodyPhotoUrl}
                  alt={`Visual de corpo de ${character.name}`}
                  className="admin-character-body-img"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          {works.length > 0 && (
            <div className="admin-card" style={character.bodyPhotoUrl ? { marginTop: "1.5rem" } : undefined}>
              <h3 className="admin-card__title">{works.length > 1 ? "Obras Vinculadas" : "Obra de Origem"}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {works.map((w) => (
                  <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingBottom: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <h4 style={{ margin: 0, color: "#ffffff", fontSize: "1.05rem" }}>{w.title}</h4>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <span className="admin-role-badge">{w.contentKind}</span>
                      {w.year && <span className="admin-archetype-badge">{w.year}</span>}
                    </div>
                    {w.synopsis && (
                      <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.4 }}>
                        {w.synopsis}
                      </p>
                    )}
                    <Link to={`/admin/characters/work/${w.id}`} className="btn btn--secondary btn--xs" style={{ marginTop: "0.4rem", alignSelf: "flex-start" }}>
                      Ver Todos Personagens da Obra →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="admin-card" style={{ marginTop: "1.5rem" }}>
            <h3 className="admin-card__title">Metadados</h3>
            <div className="admin-meta-list">
              <div className="admin-meta-item">
                <span className="admin-meta-item__label">ID do Personagem</span>
                <code className="admin-meta-item__code">{character.id}</code>
              </div>
              <div className="admin-meta-item">
                <span className="admin-meta-item__label">Cadastrado em</span>
                <span className="admin-meta-item__value">
                  {new Date(character.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Edit Character Modal */}
      {isEditModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Editar Personagem: {character.name}</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="admin-modal__form">
              {formError && (
                <div className="admin-alert admin-alert--danger">{formError}</div>
              )}

              {/* Name */}
              <div className="admin-form-group">
                <label htmlFor="char-edit-name" className="admin-label">
                  Nome do Personagem <span className="admin-required">*</span>
                </label>
                <input
                  id="char-edit-name"
                  type="text"
                  className="admin-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
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
                      id="char-edit-photo-file"
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
                        ⏳ Enviando e armazenando foto de perfil no servidor…
                      </span>
                    ) : formPhotoUrl ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--success">
                        ✓ Foto de perfil salva localmente no disco
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
                      id="char-edit-body-photo-file"
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
                <label htmlFor="char-edit-actor" className="admin-label">
                  Dublador Oficial (Cadastrado)
                </label>
                <select
                  id="char-edit-actor"
                  className="admin-select"
                  value={formVoiceActorId}
                  onChange={(e) => setFormVoiceActorId(e.target.value)}
                >
                  <option value="">Nenhum / Não informado</option>
                  {voiceActors.map((a: VoiceActor) => (
                    <option key={a.id} value={a.id}>
                      🎙️ {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role & Archetype Selection */}
              <div className="admin-form-group">
                <label htmlFor="char-edit-role" className="admin-label">
                  Tipo / Papel
                </label>
                <select
                  id="char-edit-role"
                  className="admin-select"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
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
                  Selecione um ou múltiplos arquétipos que definem a essência e personalidade do personagem.
                </span>
                <CharacterArchetypeSelector
                  selected={formArchetypes}
                  onChange={setFormArchetypes}
                />
              </div>

              {/* Profile & Sentiments */}
              <div className="admin-form-group">
                <label htmlFor="char-edit-profile-sentiments" className="admin-label">
                  Perfil e Sentimentos
                </label>
                <textarea
                  id="char-edit-profile-sentiments"
                  className="admin-input"
                  rows={4}
                  placeholder="Descreva o perfil psicológico, conflitos, sentimentos e essência do personagem..."
                  value={formProfileSentiments}
                  onChange={(e) => setFormProfileSentiments(e.target.value)}
                />
                <span className="admin-form-hint">
                  Descrição detalhada das motivações, dilemas internos e personalidade do personagem.
                </span>
              </div>

              {/* Voice Sample with Mini Player */}
              {primaryWork && (
                <div className="admin-form-group">
                  <label className="admin-label">Amostra de Voz da Dublagem</label>
                  <MiniVideoAudioClipper
                    workId={primaryWork.id}
                    currentVoiceAudioUrl={formVoiceAudioUrl}
                    onVoiceAudioChange={setFormVoiceAudioUrl}
                    onSaveDirect={async (url) => {
                      await api.updateAdminCharacter(character.id, { voiceAudioUrl: url });
                      void queryClient.invalidateQueries({ queryKey: ["admin", "character", character.id] });
                    }}
                  />
                </div>
              )}

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={updateMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={updateMutation.isPending || isUploadingPhoto || isUploadingBodyPhoto}
                >
                  {updateMutation.isPending ? "Salvando…" : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
