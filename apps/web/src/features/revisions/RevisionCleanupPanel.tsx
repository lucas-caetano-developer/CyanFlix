import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';

export function RevisionCleanupPanel() {
  const queryClient = useQueryClient();
  const cleanup = useQuery({ queryKey: ['admin', 'revision-cleanup'], queryFn: api.getRevisionCleanup });
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const available = new Set(cleanup.data?.candidates.map((candidate) => candidate.publicationId) ?? []);
    setSelected((current) => current.filter((id) => available.has(id)));
  }, [cleanup.data]);
  const queue = useMutation({
    mutationFn: api.queueRevisionCleanup,
    onSuccess: async () => {
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'revision-cleanup'] });
    },
  });
  const retry = useMutation({
    mutationFn: api.retryRevisionCleanup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'revision-cleanup'] }),
  });
  const policy = cleanup.data?.policy;

  return (
    <section className="admin__section" id="revision-cleanup">
      <h2 className="admin__section-title">Coleta segura de revisões</h2>
      <p className="admin__section-description">
        Preview conservador: mantém no mínimo {policy?.keepPerScope ?? '…'} revisões por escopo e somente considera publicações com mais de {policy?.retentionDays ?? '…'} dias, sem referências ativas de temporada ou episódio.
      </p>
      <div className="admin__cleanup-summary">
        <strong>{cleanup.data?.candidates.length ?? 0} elegível(is)</strong>
        <span>{formatBytes(cleanup.data?.candidates.reduce((total, item) => total + (item.sizeBytes ?? 0), 0) ?? 0)} recuperáveis</span>
        <button className="btn btn--secondary" disabled={!selected.length || queue.isPending} onClick={() => { if (window.confirm(`Enfileirar a exclusão de ${selected.length} publicação(ões)?`)) queue.mutate(selected); }}>Coletar selecionadas</button>
      </div>
      <div className="admin__table">
        {cleanup.data?.candidates.map((candidate) => (
          <label className="admin__cleanup-row" key={candidate.publicationId}>
            <input type="checkbox" checked={selected.includes(candidate.publicationId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.publicationId] : current.filter((id) => id !== candidate.publicationId))} />
            <div className="admin__revision-title"><strong>{candidate.packageId}</strong><span>{candidate.scopeKey} · revisão {candidate.revisionNumber}</span></div>
            <span>{formatBytes(candidate.sizeBytes ?? 0)}</span>
            <span>{new Date(candidate.createdAt).toLocaleDateString('pt-BR')}</span>
          </label>
        ))}
        {!cleanup.data?.candidates.length && <div className="admin__empty">Nenhuma revisão sem referência atende à política de retenção.</div>}
      </div>
      {!!cleanup.data?.jobs.length && <div className="admin__cleanup-jobs">
        <strong>Execuções recentes</strong>
        {cleanup.data.jobs.slice(0, 10).map((job) => <div className="admin__cleanup-job" key={job.id}>
          <Badge variant={job.state === 'completed' ? 'dub' : job.state === 'failed' ? 'incomplete' : 'kind'} label={job.state} />
          <span className="admin__package-id">{job.publicationId}</span>
          <span>{job.error ?? `${formatBytes(job.sizeBytes ?? 0)} · tentativa ${job.attempts}`}</span>
          {job.state === 'failed' && <button className="btn btn--secondary" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>Tentar novamente</button>}
        </div>)}
      </div>}
      {(queue.isError || retry.isError) && <div className="admin__error">A operação não pôde ser concluída; o worker não removeu revisões que voltaram a ter referência.</div>}
    </section>
  );
}
