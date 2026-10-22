import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AdminCatalogWork } from '../../lib/types';
import { formatBytes } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { useDebounce } from '../../hooks/useDebounce';

export function CatalogEditorialPanel() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [selected, setSelected] = useState<AdminCatalogWork | null>(null);
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [confirmTitle, setConfirmTitle] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const catalog = useQuery({ queryKey: ['admin', 'catalog', debouncedQuery], queryFn: () => api.getAdminCatalog(debouncedQuery) });
  const audit = useQuery({ queryKey: ['admin', 'audit', selected?.id], queryFn: () => api.getAdminAudit(selected!.id), enabled: Boolean(selected) });
  const detail = useQuery({ queryKey: ['admin', 'work-detail', selected?.id], queryFn: () => api.getAdminWork(selected!.id), enabled: Boolean(selected) });
  const deletionPreview = useQuery({ queryKey: ['admin', 'work-deletion', selected?.id], queryFn: () => api.getWorkDeletionPreview(selected!.id), enabled: Boolean(selected), retry: false });
  const deletion = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: string }) => api.deleteAdminWork(id, confirm),
    onSuccess: async () => {
      setSelected(null);
      setConfirmTitle('');
      setDeleteError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'publications'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'revisions'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '';
      try {
        const parsed = JSON.parse(message) as { error?: unknown };
        setDeleteError(typeof parsed.error === 'string' ? parsed.error : message || 'Falha ao excluir a obra');
      } catch {
        setDeleteError(message || 'Falha ao excluir a obra');
      }
    },
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateEditorialWork>[1] }) => api.updateEditorialWork(id, data),
    onSuccess: async (updated) => {
      setSelected((current) => current ? { ...current, ...updated } : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit', updated.id] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['work', updated.id] }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
      ]);
    },
  });
  const visibility = useMutation({
    mutationFn: ({ type, id, hidden }: { type: 'season' | 'episode'; id: string; hidden: boolean }) => type === 'season' ? api.updateAdminSeason(id, hidden) : api.updateAdminEpisode(id, hidden),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'work-detail', selected?.id] }), queryClient.invalidateQueries({ queryKey: ['home'] }), queryClient.invalidateQueries({ queryKey: ['work', selected?.id] })]),
  });
  const presentation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) => api.updatePresentationAsset(selected!.id, type, id),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'work-detail', selected?.id] }), queryClient.invalidateQueries({ queryKey: ['home'] }), queryClient.invalidateQueries({ queryKey: ['work', selected?.id] })]),
  });

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.override?.title ?? '');
    setSynopsis(selected.override?.synopsis ?? '');
    setConfirmTitle('');
    setDeleteError('');
  }, [selected]);

  return (
    <section className="admin__section" id="catalog">
      <h2 className="admin__section-title">Catálogo editorial</h2>
      <p className="admin__section-description">Overrides não alteram o manifesto importado. Campos vazios voltam a usar o valor canônico.</p>
      <input className="admin__catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar obra para editar" />
      <div className="admin__table">
        {catalog.data?.items.map((work) => (
          <div className="admin__catalog-row" key={work.id}>
            <div className="admin__revision-title"><strong>{work.title}</strong><span>{work.year ?? 'Ano não informado'} · {work.seasonCount} temporada(s) · {work.episodeCount} episódio(s)</span></div>
            <Badge variant={`kind-${work.contentKind}`} label={work.contentKind} />
            {work.featured && <Badge variant="dub" label="Destaque" />}
            {work.hidden && <Badge variant="incomplete" label="Oculta" />}
            <button className="btn btn--secondary" onClick={() => setSelected(work)}>Editar</button>
          </div>
        ))}
      </div>

      {selected && <div className="admin__editor" role="dialog" aria-modal="true" aria-label={`Editar ${selected.title}`}>
        <div className="admin__editor-card">
          <div className="admin__editor-header"><div><strong>{selected.title}</strong><span>Canônico: {selected.canonicalTitle}</span></div><button aria-label="Fechar editor" onClick={() => setSelected(null)}>×</button></div>
          <label>Título editorial<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={selected.canonicalTitle} /></label>
          <label>Sinopse editorial<textarea value={synopsis} onChange={(event) => setSynopsis(event.target.value)} placeholder={selected.canonicalSynopsis ?? 'Sem sinopse canônica'} rows={7} /></label>
          <div className="admin__editor-options">
            <label><input type="checkbox" checked={selected.featured} onChange={(event) => update.mutate({ id: selected.id, data: { featured: event.target.checked } })} /> Destaque na home</label>
            <label><input type="checkbox" checked={selected.hidden} onChange={(event) => update.mutate({ id: selected.id, data: { hidden: event.target.checked } })} /> Ocultar do catálogo</label>
          </div>
          <div className="admin__editor-actions"><button className="btn btn--primary" disabled={update.isPending} onClick={() => update.mutate({ id: selected.id, data: { title, synopsis } })}>Salvar override</button><button className="btn btn--secondary" onClick={() => { setTitle(''); setSynopsis(''); update.mutate({ id: selected.id, data: { title: null, synopsis: null } }); }}>Restaurar texto canônico</button></div>
          <div className="admin__structure"><strong>Artes de apresentação</strong><p>Escolha qual versão aparece primeiro sem alterar o manifesto.</p><div className="admin__asset-grid">{detail.data?.assets.map((asset) => <div key={asset.id}>{asset.publicPath ? <img src={asset.publicPath} alt="" /> : <span>Sem preview</span>}<small>{asset.type}</small><button className="btn btn--secondary" disabled={presentation.isPending} onClick={() => presentation.mutate({ type: asset.type, id: asset.id })}>Usar esta arte</button></div>)}</div></div>
          <div className="admin__structure"><strong>Temporadas e episódios</strong>{detail.data?.seasons.map((season) => <details key={season.id}><summary><span>T{season.number} · {season.title || 'Sem título'}</span><button className="btn btn--secondary" disabled={visibility.isPending} onClick={(event) => { event.preventDefault(); visibility.mutate({ type: 'season', id: season.id, hidden: !season.hidden }); }}>{season.hidden ? 'Exibir' : 'Ocultar'}</button></summary><div className="admin__episode-list">{season.episodes.map((episode) => <div key={episode.id}><span>E{episode.number} · {episode.title || 'Sem título'} {!episode.activeRevisionId && <Badge variant="incomplete" label="Sem mídia ativa" />}</span><button className="btn btn--secondary" disabled={visibility.isPending} onClick={() => visibility.mutate({ type: 'episode', id: episode.id, hidden: !episode.hidden })}>{episode.hidden ? 'Exibir' : 'Ocultar'}</button></div>)}</div></details>)}</div>
          <div className="admin__danger-zone">
            <strong>Excluir obra permanentemente</strong>
            <p>Remove a obra, temporadas, episódios, favoritos, progresso, coleções, publicações, mídias e caches de transcode vinculados. Ocultar continua sendo a alternativa reversível.</p>
            {deletionPreview.isLoading && <span>Calculando impacto…</span>}
            {deletionPreview.isError && <span className="admin__danger-error">Não foi possível consultar a exclusão. Apenas o proprietário pode apagar obras.</span>}
            {deletionPreview.data && <>
              <div className="admin__danger-counts">
                <span>{deletionPreview.data.counts.seasons} temporada(s)</span>
                <span>{deletionPreview.data.counts.episodes} episódio(s)</span>
                <span>{deletionPreview.data.counts.publications} publicação(ões)</span>
                <span>{deletionPreview.data.counts.assets} asset(s)</span>
                <span>{deletionPreview.data.counts.mediaObjects} mídia(s)</span>
                <span>{deletionPreview.data.counts.favorites} favorito(s)</span>
                <span>{deletionPreview.data.counts.progress} progresso(s)</span>
                <span>{deletionPreview.data.counts.collectionItems} coleção(ões)</span>
                <span>{deletionPreview.data.counts.transcodeJobs} cache(s) H.264</span>
                <span>{formatBytes(deletionPreview.data.counts.bytes)} em disco</span>
              </div>
              {deletionPreview.data.blockers.map((blocker) => <span className="admin__danger-error" key={blocker}>{blocker}</span>)}
              <label>Digite o título canônico <strong>{deletionPreview.data.work.title}</strong> para confirmar
                <input type="text" value={confirmTitle} onChange={(event) => setConfirmTitle(event.target.value)} placeholder={deletionPreview.data.work.title} disabled={!deletionPreview.data.canDelete || deletion.isPending} />
              </label>
              {deleteError && <span className="admin__danger-error">{deleteError}</span>}
              <button className="btn btn--danger" disabled={!deletionPreview.data.canDelete || deletion.isPending || confirmTitle.trim() !== deletionPreview.data.work.title} onClick={() => deletion.mutate({ id: selected.id, confirm: confirmTitle.trim() })}>{deletion.isPending ? 'Excluindo…' : 'Excluir obra permanentemente'}</button>
            </>}
          </div>
          <div className="admin__audit"><strong>Auditoria recente</strong>{audit.data?.slice(0, 5).map((entry) => <span key={entry.id}>{entry.actor.username} · {new Date(entry.createdAt).toLocaleString('pt-BR')}</span>)}</div>
        </div>
      </div>}
    </section>
  );
}
