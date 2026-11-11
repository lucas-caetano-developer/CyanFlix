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

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newBio, setNewBio] = useState("");
  const [isUploadingNew, setIsUploadingNew] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOverCreate, setIsDragOverCreate] = useState(false);

  // Quick Edit Modal state
  const [editingActor, setEditingActor] = useState<VoiceActor | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isUploadingEdit, setIsUploadingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOverEdit, setIsDragOverEdit] = useState(false);

  // Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: actors = [], isLoading } = useQuery({
    queryKey: ["admin", "voice-actors", debouncedSearch],
    queryFn: () => api.getAdminVoiceActors(debouncedSearch),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; photoUrl?: string | null; bio?: string | null }) =>
      api.createAdminVoiceActor(data),
    onSuccess: (newActor) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      setIsCreateOpen(false);
      resetCreateForm();
      navigate(`/admin/voice-actors/${newActor.id}`);
    },
    onError: (err: Error) => {
      setCreateError(err.message || "Erro ao cadastrar dublador");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; photoUrl?: string | null; bio?: string | null } }) =>
      api.updateAdminVoiceActor(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-actors"] });
      setEditingActor(null);
    },
    onError: (err: Error) => {
      setEditError(err.message || "Erro ao atualizar dublador");
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

  const resetCreateForm = () => {
    setNewName("");
    setNewPhotoUrl("");
    setNewBio("");
    setCreateError(null);
  };

  const openEditModal = (actor: VoiceActor) => {
    setEditingActor(actor);
    setEditName(actor.name || "");
    setEditPhotoUrl(actor.photoUrl || "");
    setEditBio(actor.bio || "");
    setEditError(null);
  };

  const uploadFile = async (
    file: File,
    setPhotoUrl: (url: string) => void,
    setUploading: (loading: boolean) => void,
    setError: (err: string | null) => void,
    fileInputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadVoiceActorPhoto(file);
      setPhotoUrl(res.photoUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError("Erro ao enviar foto: " + message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      setCreateError("O nome do dublador é obrigatório.");
      return;
    }
    createMutation.mutate({
      name: cleanName,
      photoUrl: newPhotoUrl.trim() || null,
      bio: newBio.trim() || null,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActor) return;
    const cleanName = editName.trim();
    if (!cleanName) {
      setEditError("O nome do dublador é obrigatório.");
      return;
    }
    updateMutation.mutate({
      id: editingActor.id,
      data: {
        name: cleanName,
        photoUrl: editPhotoUrl.trim() || null,
        bio: editBio.trim() || null,
      },
    });
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Gestão de Elenco & Voz</span>
          <h1 className="admin-page__title">Dubladores</h1>
          <p className="admin-page__subtitle">
            Gerencie o cadastro de dubladores oficiais. As fotos são salvas localmente para funcionamento 100% offline.
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
                resetCreateForm();
                setIsCreateOpen(true);
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
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() => openEditModal(actor)}
                  title="Editar dados do dublador"
                >
                  ✏️ Editar
                </button>
                <Link
                  to={`/admin/voice-actors/${actor.id}`}
                  className="btn btn--secondary btn--xs"
                  title="Ver perfil completo e personagens"
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
      {isCreateOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Novo Dublador</h3>
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
              {createError && (
                <div className="admin-alert admin-alert--danger">{createError}</div>
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
                <label className="admin-label">Foto de Perfil (Arquivo Local do PC)</label>
                <div
                  className={`admin-photo-upload-box ${isDragOverCreate ? "admin-photo-upload-box--dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverCreate(true);
                  }}
                  onDragLeave={() => setIsDragOverCreate(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverCreate(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      void uploadFile(file, setNewPhotoUrl, setIsUploadingNew, setCreateError, createFileInputRef);
                    }
                  }}
                >
                  <div className="admin-photo-preview">
                    {newPhotoUrl ? (
                      <img src={newPhotoUrl} alt="Prévia" className="admin-photo-preview__img" />
                    ) : (
                      <div className="admin-photo-preview__placeholder">
                        {newName.trim().charAt(0).toUpperCase() || "🎙️"}
                      </div>
                    )}
                  </div>
                  <div className="admin-photo-upload-info">
                    <input
                      type="file"
                      ref={createFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void uploadFile(file, setNewPhotoUrl, setIsUploadingNew, setCreateError, createFileInputRef);
                        }
                      }}
                      accept="image/png, image/jpeg, image/webp, image/avif"
                      style={{ display: "none" }}
                      id="actor-photo-file-create"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => createFileInputRef.current?.click()}
                        disabled={isUploadingNew}
                      >
                        {isUploadingNew ? "Salvando foto…" : newPhotoUrl ? "📁 Trocar Foto do PC" : "📁 Selecionar Foto do PC"}
                      </button>
                      {newPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => setNewPhotoUrl("")}
                        >
                          Remover Foto
                        </button>
                      )}
                    </div>
                    {isUploadingNew ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--uploading">
                        ⏳ Enviando e armazenando foto no servidor…
                      </span>
                    ) : newPhotoUrl ? (
                      <span className="admin-photo-upload-status admin-photo-upload-status--success">
                        ✓ Foto salva localmente no disco do servidor
                      </span>
                    ) : (
                      <p className="admin-photo-local-note">
                        Arraste uma foto aqui ou selecione um arquivo do computador (PNG, JPG, WEBP). A foto será gravada localmente no servidor para uso 100% offline.
                      </p>
                    )}
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
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={createMutation.isPending || isUploadingNew}
                >
                  {createMutation.isPending ? "Cadastrando…" : "Salvar Dublador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição Rápida de Dublador */}
      {editingActor && (
        <div className="admin-modal-overlay" onClick={() => setEditingActor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Editar Dublador: {editingActor.name}</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setEditingActor(null)}
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
                  className={`admin-photo-upload-box ${isDragOverEdit ? "admin-photo-upload-box--dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverEdit(true);
                  }}
                  onDragLeave={() => setIsDragOverEdit(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverEdit(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      void uploadFile(file, setEditPhotoUrl, setIsUploadingEdit, setEditError, editFileInputRef);
                    }
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
                        if (file) {
                          void uploadFile(file, setEditPhotoUrl, setIsUploadingEdit, setEditError, editFileInputRef);
                        }
                      }}
                      accept="image/png, image/jpeg, image/webp, image/avif"
                      style={{ display: "none" }}
                      id="actor-photo-file-edit"
                    />
                    <div className="admin-photo-upload-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={isUploadingEdit}
                      >
                        {isUploadingEdit ? "Salvando foto…" : editPhotoUrl ? "📁 Trocar Foto do PC" : "📁 Selecionar Foto do PC"}
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
                    {isUploadingEdit ? (
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
                  onClick={() => setEditingActor(null)}
                  disabled={updateMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={updateMutation.isPending || isUploadingEdit}
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
