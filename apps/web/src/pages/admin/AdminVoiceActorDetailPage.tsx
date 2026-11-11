import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export function AdminVoiceActorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [bio, setBio] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: actor, isLoading, isError } = useQuery({
    queryKey: ["admin", "voice-actor", id],
    queryFn: () => (id ? api.getAdminVoiceActor(id) : Promise.reject(new Error("ID ausente"))),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (actor) {
      setName(actor.name || "");
      setPhotoUrl(actor.photoUrl || "");
      setBio(actor.bio || "");
    }
  }, [actor]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; photoUrl?: string | null; bio?: string | null }) =>
      id ? api.updateAdminVoiceActor(id, data) : Promise.reject(new Error("ID ausente")),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actor", id] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Erro ao salvar alterações");
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const res = await api.uploadVoiceActorPhoto(file);
      setPhotoUrl(res.photoUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage("Erro ao enviar foto: " + message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage("O nome do dublador não pode ficar vazio.");
      return;
    }
    setErrorMessage(null);
    updateMutation.mutate({
      name: cleanName,
      photoUrl: photoUrl.trim() || null,
      bio: bio.trim() || null,
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

  const hasChanges =
    name !== (actor.name || "") ||
    photoUrl !== (actor.photoUrl || "") ||
    bio !== (actor.bio || "");

  return (
    <div className="admin-page">
      {/* Top breadcrumb */}
      <div className="admin-breadcrumb-bar">
        <Link to="/admin/voice-actors" className="admin-back-link">
          ← Voltar para Dubladores
        </Link>
      </div>

      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Perfil do Dublador</span>
          <h1 className="admin-page__title">{actor.name}</h1>
          <p className="admin-page__subtitle">
            Edite as informações biográficas e prepare a relação de personagens dublados por este profissional.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => {
              if (confirm(`Deseja realmente remover permanentemente o perfil de "${actor.name}"?`)) {
                deleteMutation.mutate(actor.id);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Excluindo…" : "Excluir Dublador"}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="admin-alert admin-alert--success">
          Alterações salvas com sucesso!
        </div>
      )}

      {errorMessage && (
        <div className="admin-alert admin-alert--danger">
          {errorMessage}
        </div>
      )}

      <div className="admin-voice-actor-detail-layout">
        {/* Main Details Form */}
        <div className="admin-voice-actor-detail-main">
          <form onSubmit={handleSave} className="admin-card admin-voice-actor-form">
            <h2 className="admin-card__title">Informações Principais</h2>

            <div className="admin-form-group">
              <label htmlFor="actor-name" className="admin-label">
                Nome do Dublador <span className="admin-required">*</span>
              </label>
              <input
                id="actor-name"
                type="text"
                className="admin-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Foto de Perfil</label>
              <div className="admin-photo-upload-container">
                <div className="admin-photo-preview admin-photo-preview--lg">
                  {photoUrl ? (
                    <img src={photoUrl} alt={name} className="admin-photo-preview__img" />
                  ) : (
                    <div className="admin-photo-preview__placeholder">
                      {name.trim().charAt(0).toUpperCase() || "🎙️"}
                    </div>
                  )}
                </div>
                <div className="admin-photo-controls">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/png, image/jpeg, image/webp"
                    style={{ display: "none" }}
                    id="detail-actor-photo"
                  />
                  <div className="admin-photo-btn-row">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? "Enviando arquivo…" : "📁 Enviar Nova Foto"}
                    </button>
                    {photoUrl && (
                      <button
                        type="button"
                        className="btn btn--danger btn--xs"
                        onClick={() => setPhotoUrl("")}
                      >
                        Remover Foto
                      </button>
                    )}
                  </div>
                  <span className="admin-photo-hint">ou cole a URL direta da imagem:</span>
                  <input
                    type="url"
                    className="admin-input"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://... ou /media/..."
                  />
                </div>
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="actor-bio" className="admin-label">
                Biografia e Descrição
              </label>
              <textarea
                id="actor-bio"
                className="admin-textarea"
                rows={6}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Escreva uma descrição completa sobre a trajetória do dublador, estúdios, prêmios ou curiosidades..."
              />
            </div>

            <div className="admin-form-actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={updateMutation.isPending || isUploading || !hasChanges}
              >
                {updateMutation.isPending ? "Salvando…" : "Salvar Alterações"}
              </button>
              {hasChanges && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setName(actor.name || "");
                    setPhotoUrl(actor.photoUrl || "");
                    setBio(actor.bio || "");
                    setErrorMessage(null);
                  }}
                >
                  Descartar Alterações
                </button>
              )}
            </div>
          </form>

          {/* Section: Future Characters */}
          <div className="admin-card admin-voice-actor-characters-card">
            <div className="admin-card__header">
              <div>
                <h2 className="admin-card__title">Personagens Dublados</h2>
                <p className="admin-card__subtitle">
                  Personagens e produções associadas a este dublador no CyanFlix.
                </p>
              </div>
              <span className="admin-badge-future">Em breve</span>
            </div>

            <div className="admin-voice-actor-characters-placeholder">
              <div className="admin-characters-placeholder__icon">🎭</div>
              <h3>Módulo de Personagens em Desenvolvimento</h3>
              <p>
                A funcionalidade para vincular este dublador a personagens específicos de filmes, séries e animes será implementada a seguir.
              </p>
              <div className="admin-characters-placeholder__features">
                <div className="admin-feature-pill">✨ Associação por Obra & Episódio</div>
                <div className="admin-feature-pill">🎙️ Nome do Personagem</div>
                <div className="admin-feature-pill">🖼️ Foto do Personagem</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <aside className="admin-voice-actor-detail-sidebar">
          <div className="admin-card">
            <h3 className="admin-card__title">Metadados do Registro</h3>
            <div className="admin-meta-list">
              <div className="admin-meta-item">
                <span className="admin-meta-item__label">ID no Sistema</span>
                <code className="admin-meta-item__code">{actor.id}</code>
              </div>
              <div className="admin-meta-item">
                <span className="admin-meta-item__label">Cadastrado em</span>
                <span className="admin-meta-item__value">
                  {new Date(actor.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="admin-meta-item">
                <span className="admin-meta-item__label">Última atualização</span>
                <span className="admin-meta-item__value">
                  {new Date(actor.updatedAt).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
