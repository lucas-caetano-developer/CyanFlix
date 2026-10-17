import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

const states = ['', 'waiting_files', 'uploading', 'validating', 'promoting', 'confirmed', 'failed'];

export function PublicationOperationsPanel() {
  const client = useQueryClient();
  const [state, setState] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const session = useQuery({ queryKey: ['session'], queryFn: api.getSession });
  const publications = useQuery({ queryKey: ['admin', 'publications', state, cursor], queryFn: () => api.getAdminPublications(cursor, state) });
  const detail = useQuery({ queryKey: ['admin', 'publication', selectedId], queryFn: () => api.getAdminPublication(selectedId!), enabled: Boolean(selectedId) });
  const retry = useMutation({ mutationFn: api.retryPublication, onSuccess: async () => client.invalidateQueries({ queryKey: ['admin', 'publications'] }) });
  const remove = useMutation({
    mutationFn: () => api.deleteAdminPublication(selectedId!, deleteConfirmation),
    onSuccess: async () => {
      setDeleteOpen(false); setDeleteConfirmation(''); setSelectedId(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'publications'] }),
        client.invalidateQueries({ queryKey: ['admin', 'storage'] }),
        client.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        client.invalidateQueries({ queryKey: ['admin', 'audit'] }),
      ]);
    },
  });

  return <section className="admin__section" id="publications">
    <div className="admin__section-heading"><div><h2 className="admin__section-title">Publicações</h2><p className="admin__section-description">Manifestos, recibos, revisões, diferenças e retomada segura.</p></div>
      <select value={state} onChange={(event) => { setState(event.target.value); setCursor(undefined); }} aria-label="Filtrar publicações por estado">{states.map((value) => <option key={value} value={value}>{value || 'Todos os estados'}</option>)}</select>
    </div>
    <div className="admin__table">{publications.data?.items?.map((publication) => <div className="admin__publication-row" key={publication.id}>
      <button className="admin__publication-open" onClick={() => setSelectedId(publication.id)}><strong>{publication.packageId}</strong><span>{publication._count?.files ?? 0} arquivos · {formatBytes(publication.totalSizeBytes)}</span></button>
      <Badge variant={publication.state === 'confirmed' ? 'dub' : publication.state === 'failed' ? 'incomplete' : 'kind'} label={publication.state} />
      <span>{new Date(publication.createdAt).toLocaleString('pt-BR')}</span>
      {publication.state === 'failed' && <button className="btn btn--secondary" disabled={retry.isPending} onClick={() => retry.mutate(publication.id)}>Tentar novamente</button>}
    </div>)}</div>
    {publications.data?.nextCursor && <button className="btn btn--secondary admin__load-more" onClick={() => setCursor(publications.data?.nextCursor ?? undefined)}>Próxima página</button>}

    {selectedId && <div className="admin__editor" role="dialog" aria-modal="true" aria-label="Detalhes da publicação"><div className="admin__editor-card admin__editor-card--wide">
      <div className="admin__editor-header"><div><strong>{detail.data?.packageId ?? 'Carregando publicação'}</strong><span>{detail.data?.manifestSha256}</span></div><button aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}>×</button></div>
      {detail.data && <>
        <div className="admin__manifest-summary"><span>Estado <strong>{detail.data.state}</strong></span><span>Recibo <strong>{detail.data.receipt?.status ?? 'pendente'}</strong></span><span>Revisão <strong>{detail.data.receipt?.remoteRevision ?? '—'}</strong></span><span>Tamanho <strong>{formatBytes(detail.data.totalSizeBytes)}</strong></span></div>
        <div className="admin__diff"><strong>Diferenças para revisão {detail.data.diff.previousRevision ?? 'inicial'}</strong><span>{detail.data.diff.added.length} adicionados · {detail.data.diff.changed.length} alterados · {detail.data.diff.removed.length} removidos</span>
          {[...detail.data.diff.added.slice(0, 8).map((path) => `+ ${path}`), ...detail.data.diff.changed.slice(0, 8).map((path) => `~ ${path}`), ...detail.data.diff.removed.slice(0, 8).map((path) => `− ${path}`)].map((line) => <code key={line}>{line}</code>)}
        </div>
        <details><summary>Arquivos e checksums ({detail.data.files?.length ?? 0})</summary><div className="admin__file-list">{detail.data.files?.map((file) => <div key={file.relativePath}><code>{file.relativePath}</code><span>{file.receivedAt ? 'Recebido' : 'Pendente'} · {formatBytes(file.receivedBytes ?? file.expectedBytes)}</span></div>)}</div></details>
        <div className="admin__danger-zone">
          <div><strong>Excluir pacote por completo</strong><span>Remove staging, arquivos publicados, recibo, revisão e registro. Revisões ativas são protegidas.</span></div>
          <button className="btn btn--danger" disabled={session.data?.role !== 'owner'} title={session.data?.role !== 'owner' ? 'Somente o proprietário pode excluir pacotes' : undefined} onClick={() => { setDeleteConfirmation(''); setDeleteOpen(true); }}>Excluir pacote</button>
        </div>
        {deleteOpen && <div className="admin__delete-confirmation">
          <strong>Confirmação obrigatória</strong>
          <p>Esta operação não pode ser desfeita. Digite o package_id completo:</p>
          <code>{detail.data.packageId}</code>
          <input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="pkg_…" aria-label="Confirmar package id" />
          {remove.error && <span className="admin__form-error">{remove.error.message}</span>}
          <div className="admin__editor-actions"><button className="btn btn--secondary" disabled={remove.isPending} onClick={() => setDeleteOpen(false)}>Cancelar</button><button className="btn btn--danger" disabled={remove.isPending || deleteConfirmation !== detail.data.packageId} onClick={() => remove.mutate()}>{remove.isPending ? 'Excluindo…' : 'Excluir definitivamente'}</button></div>
        </div>}
      </>}
    </div></div>}
  </section>;
}

function formatBytes(value?: number | null) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[index]}`;
}
