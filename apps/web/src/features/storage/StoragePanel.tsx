import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function StoragePanel() {
  const storage = useQuery({ queryKey: ['admin', 'storage'], queryFn: api.getAdminStorage });
  const data = storage.data;
  if (!data) return null;
  const used = data.disk ? data.disk.totalBytes - data.disk.freeBytes : null;
  const percent = data.disk && used !== null ? Math.min(100, used / data.disk.totalBytes * 100) : 0;
  return <section className="admin__section" id="storage"><h2 className="admin__section-title">Armazenamento</h2>
    <div className="admin__storage-grid"><Metric label="Assets" value={formatBytes(data.assets.bytes)} detail={`${data.assets.count} registros`} /><Metric label="Objetos de mídia" value={formatBytes(data.media.bytes)} detail={`${data.media.count} registros`} /><Metric label="Publicações" value={formatBytes(data.publications.bytes)} detail={`${data.publications.count} pacotes`} /><Metric label="Cache H.264" value={formatBytes(data.transcodeCache.bytes)} detail={`${data.transcodeCache.count} jobs`} /></div>
    {data.disk && <div className="admin__disk"><div><strong>Volume de dados</strong><span>{formatBytes(used)} usados de {formatBytes(data.disk.totalBytes)}</span></div><progress className="admin__disk-track" value={percent} max="100" aria-label={`${Math.round(percent)}% do armazenamento utilizado`} /></div>}
  </section>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="admin__storage-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function formatBytes(value: number | null) { if (!value) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024))); return `${(value / 1024 ** index).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[index]}`; }
