import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import type { VoiceActor } from "../../lib/types";

export function AdminVoiceActorsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newBio, setNewBio] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: actors = [], isLoading } = useQuery({
    queryKey: ["admin", "voice-actors", debouncedSearch],
    queryFn: () => api.getAdminVoiceActors(debouncedSearch),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; photoUrl?: string | null; bio?: string | null }) =>
      api.createAdminVoiceActor(data),
    onSuccess: (newActor) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      setIsModalOpen(false);
      resetForm();
      navigate(`/admin/voice-actors/${newActor.id}`);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Erro ao cadastrar dublador");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminVoiceActor(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      alert("Erro ao excluir dublador: " + err.message);
      setDeletingId(null);
    },
  });

  const resetForm = () => {
    setNewName("");
    setNewPhotoUrl("");
    setNewBio("");
    setFormError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setFormError(null);
    try {
      const res = await api.uploadVoiceActorPhoto(file);
      setNewPhotoUrl(res.photoUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError("Erro ao enviar foto: " + message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      setFormError("O nome do dublador é obrigatório.");
      return;
    }
    createMutation.mutate({
      name: cleanName,
      photoUrl: newPhotoUrl.trim() || null,
      bio: newBio.trim() || null,
    });
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Gestão de Elenco & Voz</span>
          <h1 className="admin-page__title">Dubladores</h1>
          <p className="admin-page__subtitle">
            Gerencie o cadastro de dubladores oficiais. No futuro, você poderá vincular os personagens e produções aos respectivos dubladores.
          </p>
        </div>
        <div className="admin-page__header-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
          >
            + Adicionar Dublador
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
            placeholder="Buscar por nome do dublador…"
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
            {isLoading ? "Carregando…" : `${actors.length} dublador${actors.length === 1 ? "" : "es"} encontrado${actors.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Grid of Voice Actors */}
      {isLoading ? (
        <div className="admin-voice-actors__loading">
          <p>Carregando dubladores…</p>
        </div>
      ) : actors.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">🎙️</div>
          <h3>{search ? "Nenhum dublador encontrado" : "Nenhum dublador cadastrado ainda"}</h3>
          <p>
            {search
              ? `Nenhum resultado para "${search}". Tente outro termo.`
              : "Comece cadastrando os dubladores que dão voz às produções do seu catálogo."}
          </p>
          {!search && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
            >
              Cadastrar Primeiro Dublador
            </button>
          )}
        </div>
      ) : (
        <div className="admin-voice-actors__grid">
          {actors.map((actor) => (
            <div key={actor.id} className="admin-voice-actor-card">
              <Link to={`/admin/voice-actors/${actor.id}`} className="admin-voice-actor-card__link">
                <div className="admin-voice-actor-card__avatar-wrap">
                  {actor.photoUrl ? (
                    <img
                      src={actor.photoUrl}
                      alt={actor.name}
                      className="admin-voice-actor-card__avatar"
                      loading="lazy"
                    />
                  ) : (
                    <div className="admin-voice-actor-card__avatar-placeholder">
                      {actor.name.trim().charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div className="admin-voice-actor-card__content">
                  <h3 className="admin-voice-actor-card__name">{actor.name}</h3>
                  {actor.bio && (
                    <p className="admin-voice-actor-card__bio">{actor.bio}</p>
                  )}
                  <span className="admin-voice-actor-card__date">
                    Cadastrado em {new Date(actor.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </Link>
              <div className="admin-voice-actor-card__actions">
                <Link
                  to={`/admin/voice-actors/${actor.id}`}
                  className="btn btn--secondary btn--xs"
                  title="Ver detalhes e editar"
                >
                  Ver Perfil
                </Link>
                <button
                  type="button"
                  className="btn btn--danger btn--xs"
                  onClick={() => {
                    if (confirm(`Deseja realmente remover o dublador "${actor.name}"?`)) {
                      setDeletingId(actor.id);
                      deleteMutation.mutate(actor.id);
                    }
                  }}
                  disabled={deletingId === actor.id}
                  title="Excluir dublador"
                >
                  {deletingId === actor.id ? "…" : "Excluir"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação de Dublador */}
      {isModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Novo Dublador</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="admin-modal__form">
              {formError && (
                <div className="admin-alert admin-alert--danger">{formError}</div>
              )}

              <div className="admin-form-group">
                <label htmlFor="voice-actor-name" className="admin-label">
                  Nome Completo <span className="admin-required">*</span>
                </label>
                <input
                  id="voice-actor-name"
                  type="text"
                  className="admin-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Wendel Bezerra, Guilherme Briggs..."
                  required
                  autoFocus
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Foto de Perfil</label>
                <div className="admin-photo-upload-container">
                  <div className="admin-photo-preview">
                    {newPhotoUrl ? (
                      <img src={newPhotoUrl} alt="Prévia" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {newName.trim().charAt(0).toUpperCase() || "🎙️"}
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
                      id="actor-photo-file"
                    />
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? "Enviando arquivo…" : "📁 Enviar do Computador"}
                    </button>
                    <span className="admin-photo-hint">ou cole a URL da imagem abaixo:</span>
                    <input
                      type="url"
                      className="admin-input"
                      value={newPhotoUrl}
                      onChange={(e) => setNewPhotoUrl(e.target.value)}
                      placeholder="https://exemplo.com/foto.jpg ou /media/..."
                    />
                  </div>
                </div>
              </div>

              <div className="admin-form-group">
                <label htmlFor="voice-actor-bio" className="admin-label">
                  Biografia / Descrição
                </label>
                <textarea
                  id="voice-actor-bio"
                  className="admin-textarea"
                  value={newBio}
                  onChange={(e) => setNewBio(e.target.value)}
                  placeholder="Breve histórico profissional, estúdios habituais, curiosidades..."
                  rows={3}
                />
              </div>

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={createMutation.isPending || isUploading}
                >
                  {createMutation.isPending ? "Cadastrando…" : "Salvar Dublador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
