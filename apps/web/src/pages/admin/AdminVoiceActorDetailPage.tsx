import { useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { parseArchetypes } from "../../lib/characterConstants";

export function AdminVoiceActorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Modal state (accessible via header button)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: actor, isLoading, isError } = useQuery({
    queryKey: ["admin", "voice-actor", id],
    queryFn: () => (id ? api.getAdminVoiceActor(id) : Promise.reject(new Error("ID ausente"))),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; photoUrl?: string | null; bio?: string | null }) =>
      id ? api.updateAdminVoiceActor(id, data) : Promise.reject(new Error("ID ausente")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actor", id] });
      setIsEditModalOpen(false);
    },
    onError: (err: Error) => {
      setEditError(err.message || "Erro ao salvar alterações");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (actorId: string) => api.deleteAdminVoiceActor(actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      navigate("/admin/voice-actors");
    },
    onError: (err: Error) => {
      alert("Erro ao excluir dublador: " + err.message);
    },
  });

  const openEditModal = () => {
    if (!actor) return;
    setEditName(actor.name || "");
    setEditPhotoUrl(actor.photoUrl || "");
    setEditBio(actor.bio || "");
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const uploadFile = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setEditError(null);
    try {
      const res = await api.uploadVoiceActorPhoto(file);
      setEditPhotoUrl(res.photoUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setEditError("Erro ao enviar foto: " + message);
    } finally {
      setIsUploading(false);
      if (editFileInputRef.current) editFileInputRef.current.value = "";
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = editName.trim();
    if (!cleanName) {
      setEditError("O nome do dublador é obrigatório.");
      return;
    }
    updateMutation.mutate({
      name: cleanName,
      photoUrl: editPhotoUrl.trim() || null,
      bio: editBio.trim() || null,
    });
  };

  if (isLoading) {
    return (
      <div className="admin-page">
        <div className="admin-voice-actors__loading">
          <p>Carregando perfil do dublador…</p>
        </div>
      </div>
    );
  }

  if (isError || !actor) {
    return (
      <div className="admin-page">
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">⚠️</div>
          <h3>Dublador não encontrado</h3>
          <p>O dublador solicitado não existe ou foi removido.</p>
          <Link to="/admin/voice-actors" className="btn btn--secondary">
            ← Voltar para Dubladores
          </Link>
        </div>
      </div>
    );
  }

  const characters = actor.characters || [];

  return (
    <div className="admin-page">
      {/* Top breadcrumb */}
      <div className="admin-breadcrumb-bar">
        <Link to="/admin/voice-actors" className="admin-back-link">
          ← Voltar para Dubladores
        </Link>
      </div>

      {/* Presentation Hero Profile Showcase */}
      <div className="admin-profile-hero">
        <div className="admin-profile-hero__avatar-wrap">
          {actor.photoUrl ? (
            <img src={actor.photoUrl} alt={actor.name} className="admin-profile-hero__avatar" />
          ) : (
            <div className="admin-profile-hero__placeholder">
              {actor.name.trim().charAt(0).toUpperCase() || "🎙️"}
            </div>
          )}
        </div>
        <div className="admin-profile-hero__body">
          <div className="admin-profile-hero__title-row">
            <div>
              <span className="admin-page__eyebrow">Dublador Oficial</span>
              <h1 className="admin-profile-hero__name">{actor.name}</h1>
            </div>
            <div className="admin-profile-hero__actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={openEditModal}
              >
                ✏️ Editar Dublador
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => {
                  if (confirm(`Deseja realmente remover o dublador "${actor.name}"?`)) {
                    deleteMutation.mutate(actor.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>

          <p className="admin-profile-hero__bio">
            {actor.bio || "Nenhuma biografia detalhada cadastrada para este dublador."}
          </p>

          <div className="admin-profile-hero__meta">
            <span>🎭 <strong>{characters.length}</strong> personagem{characters.length === 1 ? "" : "s"} vinculado{characters.length === 1 ? "" : "s"}</span>
            <span>📅 Cadastrado em {new Date(actor.createdAt).toLocaleDateString("pt-BR")}</span>
            <span>💾 Fotos 100% locais no servidor</span>
          </div>
        </div>
      </div>

      {/* Characters Showcase Section */}
      <div className="admin-card">
        <div className="admin-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "0.85rem" }}>
          <div>
            <h2 className="admin-card__title" style={{ margin: 0, border: 0, padding: 0 }}>
              Personagens Dublados
            </h2>
            <p className="admin-card__subtitle" style={{ margin: "0.25rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              Personagens interpretados por {actor.name} nas produções do catálogo.
            </p>
          </div>
          <Link to="/admin/characters" className="btn btn--secondary btn--sm">
            + Gerenciar Personagens
          </Link>
        </div>

        {characters.length === 0 ? (
          <div className="admin-voice-actor-characters-placeholder">
            <div className="admin-characters-placeholder__icon">🎭</div>
            <h3>Nenhum personagem vinculado a este dublador ainda</h3>
            <p>
              Ao cadastrar ou editar personagens nas obras do catálogo, vincule {actor.name} como o dublador oficial para que apareçam aqui.
            </p>
            <Link to="/admin/characters" className="btn btn--primary btn--sm">
              Ver Catálogo de Personagens
            </Link>
          </div>
        ) : (
          <div className="admin-characters__grid">
            {characters.map((char) => (
              <div key={char.id} className="admin-character-card">
                <Link to={`/admin/characters/${char.id}`} className="admin-character-card__link">
                  <div className="admin-character-card__avatar-wrap">
                    {char.photoUrl ? (
                      <img src={char.photoUrl} alt={char.name} className="admin-character-card__avatar" loading="lazy" />
                    ) : (
                      <div className="admin-character-card__avatar-placeholder">
                        {char.name.trim().charAt(0).toUpperCase() || "🎭"}
                      </div>
                    )}
                  </div>
                  <div className="admin-character-card__content">
                    <h3 className="admin-character-card__name">{char.name}</h3>
                    {char.works && char.works.length > 0 ? (
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {char.works.map((w) => (
                          <span key={w.id} className="admin-work-badge" title={w.title}>
                            🎬 {w.title}
                          </span>
                        ))}
                      </div>
                    ) : char.work ? (
                      <span className="admin-work-badge" title={char.work.title}>
                        🎬 {char.work.title}
                      </span>
                    ) : null}
                    <div className="admin-character-badges">
                      {char.role && <span className="admin-role-badge">{char.role}</span>}
                      {parseArchetypes(char.archetype).map((arch) => (
                        <span key={arch} className="admin-archetype-badge">{arch}</span>
                      ))}
                    </div>
                  </div>
                </Link>

                {char.voiceAudioUrl && (
                  <div className="admin-character-audio-preview">
                    <audio controls src={char.voiceAudioUrl} className="admin-audio-player" preload="none" />
                  </div>
                )}

                <div className="admin-character-card__actions">
                  <Link to={`/admin/characters/${char.id}`} className="btn btn--secondary btn--xs">
                    Ver Personagem
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Voice Actor Modal */}
      {isEditModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Editar Dublador: {actor.name}</h3>
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
              {editError && (
                <div className="admin-alert admin-alert--danger">{editError}</div>
              )}

              <div className="admin-form-group">
                <label htmlFor="edit-actor-name" className="admin-label">
                  Nome Completo <span className="admin-required">*</span>
                </label>
                <input
                  id="edit-actor-name"
                  type="text"
                  className="admin-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Foto de Perfil (Arquivo Local do PC)</label>
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
                    if (file) void uploadFile(file);
                  }}
                >
                  <div className="admin-photo-preview">
                    {editPhotoUrl ? (
                      <img src={editPhotoUrl} alt="Prévia" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {editName.trim().charAt(0).toUpperCase() || "🎙️"}
                      </div>
                    )}
                  </div>
                  <div className="admin-photo-upload-info">
                    <input
                      type="file"
                      ref={editFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadFile(file);
                      }}
                      accept="image/png, image/jpeg, image/webp, image/avif"
                      style={{ display: "none" }}
                      id="actor-photo-file-edit-detail"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? "Salvando foto…" : editPhotoUrl ? "📁 Trocar Foto do PC" : "📁 Selecionar Foto do PC"}
                      </button>
                      {editPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setEditPhotoUrl("")}
                        >
                          Remover Foto
                        </button>
                      )}
                    </div>
                    {isUploading ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto no servidor…
                      </span>
                    ) : editPhotoUrl ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--success">
                        ✓ Foto salva localmente no disco do servidor
                      </span>
                    ) : (
                      <p className="admin-photo-local-note">
                        Selecione ou arraste uma foto do computador. O arquivo é armazenado localmente no servidor para funcionamento offline.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-form-group">
                <label htmlFor="edit-actor-bio" className="admin-label">
                  Biografia / Descrição
                </label>
                <textarea
                  id="edit-actor-bio"
                  className="admin-textarea"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Breve histórico profissional, estúdios habituais, curiosidades..."
                  rows={4}
                />
              </div>

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
                  disabled={updateMutation.isPending || isUploading}
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
