import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { EditorialCollection } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';
import { useDebounce } from '../../hooks/useDebounce';

export function EditorialCollectionsPanel() {
  const client = useQueryClient();
  const collections = useQuery({ queryKey: ['admin', 'collections'], queryFn: api.getAdminCollections });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = collections.data?.find((collection) => collection.id === selectedId) ?? null;
  const [newTitle, setNewTitle] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const catalog = useQuery({ queryKey: ['admin', 'catalog', 'collections', debouncedSearch], queryFn: () => api.getAdminCatalog(debouncedSearch), enabled: Boolean(selected && selected.state === 'draft') });
  const [form, setForm] = useState({ title: '', slug: '', description: '', sortOrder: 0, active: true, featured: false, workIds: [] as string[] });
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setForm({ title: selected.title, slug: selected.slug, description: selected.description ?? '', sortOrder: selected.sortOrder, active: selected.active, featured: selected.featured, workIds: selected.items.map((item) => item.workId) });
    setPreviewReady(false);
  }, [selected]);

  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['admin', 'collections'] }), client.invalidateQueries({ queryKey: ['home'] })]);
  };
  const create = useMutation({ mutationFn: api.createAdminCollection, onSuccess: async (value) => { setNewTitle(''); await refresh(); setSelectedId(value.id); } });
  const save = useMutation({ mutationFn: () => api.updateAdminCollection(selectedId!, { ...form, description: form.description || null }), onSuccess: async () => { setPreviewReady(false); await refresh(); } });
  const preview = useMutation({ mutationFn: () => api.previewAdminCollection(selectedId!), onSuccess: (value) => setPreviewReady(value.valid) });
  const publish = useMutation({ mutationFn: () => api.publishAdminCollection(selectedId!), onSuccess: refresh });
  const unpublish = useMutation({ mutationFn: () => api.unpublishAdminCollection(selectedId!), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deleteAdminCollection(selectedId!), onSuccess: async () => { setSelectedId(null); await refresh(); } });
  const busy = create.isPending || save.isPending || preview.isPending || publish.isPending || unpublish.isPending || remove.isPending;
  const selectedWorks = new Map((selected?.items ?? []).map((item) => [item.workId, item.work]));
  for (const work of catalog.data?.items ?? []) selectedWorks.set(work.id, work);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...form.workIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setForm((current) => ({ ...current, workIds: next }));
    setPreviewReady(false);
  };

  return <section className="admin__section" id="collections">
    <h2 className="admin__section-title">Coleções editoriais</h2>
    <p className="admin__section-description">Monte fileiras da home em rascunho, revise a disponibilidade e publique somente após o preview.</p>
    <form className="admin__collection-create" onSubmit={(event) => { event.preventDefault(); if (newTitle.trim()) create.mutate({ title: newTitle }); }}>
      <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Nome da nova coleção" maxLength={120} />
      <button className="btn btn--primary" disabled={busy || !newTitle.trim()}>Criar rascunho</button>
    </form>
    <div className="admin__table">
      {collections.data?.map((collection) => <button type="button" className={`admin__collection-row ${selectedId === collection.id ? 'admin__collection-row--selected' : ''}`} key={collection.id} onClick={() => setSelectedId(collection.id)}>
        <span><strong>{collection.title}</strong><small>{collection.items.length} obra(s) · ordem {collection.sortOrder}</small></span>
        <Badge variant={collection.state === 'published' ? 'dub' : 'kind'} label={collection.state === 'published' ? 'Publicada' : 'Rascunho'} />
      </button>)}
      {!collections.data?.length && <div className="admin__empty">Nenhuma coleção editorial criada.</div>}
    </div>

    {selected && <div className="admin__collection-editor">
      <div className="admin__editor-header"><div><strong>{selected.title}</strong><span>{selected.slug}</span></div><button aria-label="Fechar coleção" onClick={() => setSelectedId(null)}>×</button></div>
      {selected.state === 'published' ? <>
        <p>Esta versão está visível na home. Retorne-a para rascunho antes de editar.</p>
        <button className="btn btn--secondary" disabled={busy} onClick={() => unpublish.mutate()}>Retirar da home e editar</button>
      </> : <>
        <div className="admin__collection-fields">
          <label>Título<input value={form.title} onChange={(event) => { setForm({ ...form, title: event.target.value }); setPreviewReady(false); }} /></label>
          <label>Slug<input value={form.slug} onChange={(event) => { setForm({ ...form, slug: event.target.value }); setPreviewReady(false); }} /></label>
          <label>Ordem<input type="number" min="0" max="10000" value={form.sortOrder} onChange={(event) => { setForm({ ...form, sortOrder: Number(event.target.value) }); setPreviewReady(false); }} /></label>
          <label className="admin__collection-description">Descrição<textarea rows={3} maxLength={500} value={form.description} onChange={(event) => { setForm({ ...form, description: event.target.value }); setPreviewReady(false); }} /></label>
          <label><input type="checkbox" checked={form.active} onChange={(event) => { setForm({ ...form, active: event.target.checked }); setPreviewReady(false); }} /> Ativa</label>
          <label><input type="checkbox" checked={form.featured} onChange={(event) => { setForm({ ...form, featured: event.target.checked }); setPreviewReady(false); }} /> Destaque editorial</label>
        </div>
        <input className="admin__catalog-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar obra para adicionar" />
        <div className="admin__collection-picker">{catalog.data?.items.slice(0, 12).map((work) => {
          const added = form.workIds.includes(work.id);
          return <button type="button" key={work.id} disabled={added} onClick={() => { setForm((current) => ({ ...current, workIds: [...current.workIds, work.id] })); setPreviewReady(false); }}>{work.title}{added ? ' · adicionada' : ' · adicionar'}</button>;
        })}</div>
        <div className="admin__collection-items">{form.workIds.map((workId, index) => {
          const work = selectedWorks.get(workId);
          return <div key={workId}><span>{index + 1}. {work?.title ?? workId}</span><span><button aria-label={`Subir ${work?.title ?? workId}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button aria-label={`Descer ${work?.title ?? workId}`} disabled={index === form.workIds.length - 1} onClick={() => move(index, 1)}>↓</button><button onClick={() => { setForm((current) => ({ ...current, workIds: current.workIds.filter((id) => id !== workId) })); setPreviewReady(false); }}>Remover</button></span></div>;
        })}</div>
        <div className="admin__editor-actions"><button className="btn btn--secondary" disabled={busy} onClick={() => save.mutate()}>Salvar rascunho</button><button className="btn btn--secondary" disabled={busy} onClick={() => preview.mutate()}>Gerar preview</button><button className="btn btn--primary" disabled={busy || !previewReady} onClick={() => publish.mutate()}>Publicar na home</button><button className="btn btn--danger" disabled={busy} onClick={() => window.confirm('Excluir este rascunho?') && remove.mutate()}>Excluir</button></div>
        {preview.data && <div className={`admin__collection-preview ${preview.data.valid ? 'admin__collection-preview--valid' : ''}`}><strong>{preview.data.valid ? 'Preview aprovado' : 'Preview bloqueado'}</strong><span>{preview.data.items.length} obra(s) · {preview.data.items.filter((item) => !item.eligible).length} indisponível(is)</span></div>}
      </>}
      {(create.error || save.error || preview.error || publish.error || unpublish.error || remove.error) && <div className="admin__error">Não foi possível concluir a operação.</div>}
    </div>}
  </section>;
}
