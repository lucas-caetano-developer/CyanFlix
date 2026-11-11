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
  const [formRole, setFormRole] = useState("Protagonista");
  const [formArchetypes, setFormArchetypes] = useState<string[]>([]);
  const [formVoiceActorId, setFormVoiceActorId] = useState("");
  const [formVoiceAudioUrl, setFormVoiceAudioUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
      if (character?.workId) {
        navigate(`/admin/characters/work/${character.workId}`);
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
    setFormRole(character.role || "Protagonista");
    setFormArchetypes(parseArchetypes(character.archetype));
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
      setFormPhotoUrl(res.photoUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError("Erro ao enviar foto: " + msg);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
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
      role: formRole.trim() || null,
      archetype: formArchetypes.join(", ") || null,
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

  const work = character.work;
  const actor = character.voiceActor;

  return (
    <div className="admin-page">
      {/* Top breadcrumb */}
      <div className="admin-breadcrumb-bar">
        {work ? (
          <Link to={`/admin/characters/work/${work.id}`} className="admin-back-link">
            ← Voltar para {work.title}
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
                {work ? `Personagem de ${work.title}` : "Personagem"}
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
            {work && (
              <Link to={`/admin/characters/work/${work.id}`} className="admin-work-badge">
                🎬 {work.title} ({work.contentKind.toUpperCase()})
              </Link>
            )}
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

        {/* Sidebar: Work Info */}
        <aside className="admin-voice-actor-detail-sidebar">
          {work && (
            <div className="admin-card">
              <h3 className="admin-card__title">Obra de Origem</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <h4 style={{ margin: 0, color: "#ffffff", fontSize: "1.1rem" }}>{work.title}</h4>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <span className="admin-role-badge">{work.contentKind}</span>
                  {work.year && <span className="admin-archetype-badge">{work.year}</span>}
                </div>
                {work.synopsis && (
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5 }}>
                    {work.synopsis}
                  </p>
                )}
                <Link to={`/admin/characters/work/${work.id}`} className="btn btn--secondary btn--sm" style={{ marginTop: "0.5rem" }}>
                  Ver Todos Personagens da Obra →
                </Link>
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

              {/* Photo Upload (Local file from PC only) */}
              <div className="admin-form-group">
                <label className="admin-label">Foto do Personagem (Arquivo Local do PC)</label>
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
                      <img src={formPhotoUrl} alt="Prévia" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {formName.trim().charAt(0).toUpperCase() || "🎭"}
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
                        {isUploadingPhoto ? "Salvando foto…" : formPhotoUrl ? "📁 Trocar Foto do PC" : "📁 Selecionar Foto do PC"}
                      </button>
                      {formPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setFormPhotoUrl("")}
                        >
                          Remover Foto
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
                        Arraste uma foto aqui ou selecione um arquivo do computador (PNG, JPG, WEBP).
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

              {/* Voice Sample with Mini Player */}
              {character.workId && (
                <div className="admin-form-group">
                  <label className="admin-label">Amostra de Voz da Dublagem</label>
                  <MiniVideoAudioClipper
                    workId={character.workId}
                    currentVoiceAudioUrl={formVoiceAudioUrl}
                    onVoiceAudioChange={setFormVoiceAudioUrl}
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
                  disabled={updateMutation.isPending || isUploadingPhoto}
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
