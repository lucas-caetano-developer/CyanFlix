import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ImportPanel } from "../features/import/ImportPanel";
import { Badge } from "../components/ui/Badge";
import { IntegrityCheck, Revision } from "../lib/types";
import { AccountAccessPanel } from "../features/accounts/AccountAccessPanel";
import { useEffect, useState } from "react";
import { CatalogEditorialPanel } from "../features/catalog/CatalogEditorialPanel";
import { RevisionCleanupPanel } from "../features/revisions/RevisionCleanupPanel";
import { EditorialCollectionsPanel } from "../features/collections/EditorialCollectionsPanel";
import { PublicationOperationsPanel } from "../features/publications/PublicationOperationsPanel";
import { StoragePanel } from "../features/storage/StoragePanel";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    const events = new EventSource("/api/admin/events");
    events.onopen = () => setLiveStatus("live");
    events.onerror = () => setLiveStatus("offline");
    events.addEventListener("operations", (event) => {
      setLiveStatus("live");
      const payload = JSON.parse((event as MessageEvent<string>).data) as { changed?: string[] };
      const changed = new Set(payload.changed ?? []);
      if (changed.has("publications")) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "publications"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      }
      if (changed.has("transcodes")) void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      if (changed.has("revisions")) void queryClient.invalidateQueries({ queryKey: ["admin", "revisions"] });
      if (changed.has("cleanup")) void queryClient.invalidateQueries({ queryKey: ["admin", "revision-cleanup"] });
      if (changed.has("accounts")) void queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] });
      if (changed.has("integrity")) void queryClient.invalidateQueries({ queryKey: ["admin", "integrity"] });
      if (changed.has("catalog")) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] });
        void queryClient.invalidateQueries({ queryKey: ["home"] });
        void queryClient.invalidateQueries({ queryKey: ["work"] });
        void queryClient.invalidateQueries({ queryKey: ["search"] });
      }
    });
    return () => events.close();
  }, [queryClient]);

  const { data: stats } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: api.getAdminDashboard,
  });

  const { data: revisions } = useQuery({
    queryKey: ["admin", "revisions"],
    queryFn: api.getAdminRevisions,
  });
  const { data: integrityChecks } = useQuery({
    queryKey: ["admin", "integrity"],
    queryFn: api.getAdminIntegrity,
  });
  const activateRevision = useMutation({
    mutationFn: api.activateRevision,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "revisions"] }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["work"] }),
        queryClient.invalidateQueries({ queryKey: ["playback"] }),
      ]);
    },
  });
  return (
    <div className="admin">
      <div className="admin__header">
        <div>
          <div className="admin__eyebrow">Central operacional</div>
          <h1 className="admin__title">Visão geral</h1>
          <p className="admin__subtitle">Acompanhe catálogo, ingestão, revisões e capacidade da plataforma.</p>
          <div className={`admin__live admin__live--${liveStatus}`}><span />{liveStatus === "live" ? "Atualização ao vivo" : liveStatus === "connecting" ? "Conectando…" : "Reconectando…"}</div>
        </div>
      </div>

      <div className="admin__stats">
        <div className="admin__stat">
          <div className="admin__stat-value">{stats?.works ?? 0}</div>
          <div className="admin__stat-label">Obras</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{stats?.seasons ?? 0}</div>
          <div className="admin__stat-label">Temporadas</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{stats?.episodes ?? 0}</div>
          <div className="admin__stat-label">Episódios</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{stats?.publications ?? 0}</div>
          <div className="admin__stat-label">Publicações</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{stats?.transcodes ?? 0}</div>
          <div className="admin__stat-label">Transcodes</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{(stats?.publicationProcessing ?? 0) + (stats?.publicationRetrying ?? 0)}</div>
          <div className="admin__stat-label">Na fila</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-value">{(stats?.publicationFailed ?? 0) + (stats?.transcodeFailed ?? 0)}</div>
          <div className="admin__stat-label">Falhas</div>
        </div>
      </div>

      <ImportPanel />

      <CatalogEditorialPanel />

      <EditorialCollectionsPanel />

      <StoragePanel />

      <AccountAccessPanel />

      <div className="admin__section" id="integrity">
        <h2 className="admin__section-title">Integridade da biblioteca</h2>
        <p className="admin__section-description">Verificação periódica de existência e tamanho de todos os assets confirmados, com amostragem rotativa de SHA-256.</p>
        <div className="admin__table">
          {integrityChecks?.length ? integrityChecks.map((check: IntegrityCheck) => (
            <div className="admin__integrity-row" key={check.id}>
              <Badge variant={check.state === "passed" ? "dub" : check.state === "failed" ? "incomplete" : "kind"} label={check.state} />
              <span>{check.checkedAssets.toLocaleString("pt-BR")} assets</span>
              <span>{check.hashedAssets.toLocaleString("pt-BR")} hashes</span>
              <span>{check.missingAssets} ausentes · {check.corruptAssets} divergentes</span>
              <span>{new Date(check.startedAt).toLocaleString("pt-BR")}</span>
            </div>
          )) : <div className="admin__empty">A primeira verificação será iniciada pelo worker.</div>}
        </div>
      </div>

      <PublicationOperationsPanel />

      <div className="admin__section" id="revisions">
        <h2 className="admin__section-title">Revisões do Catálogo</h2>
        <p className="admin__section-description">
          Ativar uma revisão altera atomicamente as artes e mídias servidas. Episódios preservados por publicações parciais continuam apontando para sua última versão válida. Substituições de episódio têm revisão própria e não alteram a temporada; ativar uma revisão de temporada desfaz as substituições dos episódios que ela contém.
        </p>
        <div className="admin__table">
          {revisions && revisions.length > 0 ? revisions.map((revision: Revision) => (
            <div key={revision.id} className="admin__revision-row">
              <div className="admin__revision-title">
                <strong>{revision.workTitle}</strong>
                <span>{revision.packageType === "episode_replacement"
                  ? `Substituição · ${revision.episodeNumber ? `E${String(revision.episodeNumber).padStart(2, '0')} · ` : ''}${revision.episodeTitle || revision.seasonTitle || revision.scopeKey}`
                  : revision.seasonTitle || (revision.packageType === "movie" ? "Filme" : revision.scopeKey)}</span>
              </div>
              <div>Revisão {revision.number}</div>
              <div className="admin__package-id">{revision.packageId}</div>
              <Badge variant={revision.active ? "dub" : "kind"} label={revision.active ? "Ativa" : "Arquivada"} />
              <button
                className="btn btn--secondary"
                disabled={revision.active || activateRevision.isPending}
                onClick={() => {
                  if (window.confirm(`Ativar a revisão ${revision.number} de ${revision.workTitle}?`)) {
                    activateRevision.mutate(revision.id);
                  }
                }}
              >
                {revision.active ? "Em uso" : "Ativar"}
              </button>
            </div>
          )) : (
            <div className="admin__empty">Nenhuma revisão confirmada encontrada</div>
          )}
        </div>
        {activateRevision.isError && (
          <div className="admin__error">Não foi possível ativar a revisão. Tente novamente.</div>
        )}
      </div>

      <RevisionCleanupPanel />
    </div>
  );
}
