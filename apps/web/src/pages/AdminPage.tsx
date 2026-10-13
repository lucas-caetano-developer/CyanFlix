import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ImportPanel } from "../features/import/ImportPanel";
import { Badge } from "../components/ui/Badge";
import { Publication } from "../lib/types";

export function AdminPage() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: api.getAdminDashboard,
  });

  const { data: publications } = useQuery({
    queryKey: ["admin", "publications"],
    queryFn: api.getAdminPublications,
    refetchInterval: 5000,
  });

  const getBadgeVariant = (state: string) => {
    switch (state) {
      case "confirmed": return "dub"; // green
      case "failed": return "incomplete"; // red
      case "uploading": 
      case "waiting_files": return "leg"; // gold
      default: return "kind";
    }
  };

  return (
    <div className="admin">
      <div className="admin__header">
        <h1 className="admin__title">Painel Administrativo</h1>
        <button 
          className="btn btn--secondary"
          onClick={() => navigate("/browse")}
        >
          Voltar ao Streaming
        </button>
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
      </div>

      <ImportPanel />

      <div className="admin__section">
        <h2 className="admin__section-title">Histórico de Publicações</h2>
        <div className="admin__table">
          {publications && publications.length > 0 ? (
            publications.map((pub: Publication) => (
              <div key={pub.id} className="admin__table-row">
                <div className="admin__package-id">{pub.packageId}</div>
                <div className="admin__state">
                  <Badge variant={getBadgeVariant(pub.state)} label={pub.state} />
                </div>
                <div className="admin__files">
                  {pub.files?.filter((f: any) => f.receivedAt)?.length || 0} / {pub.files?.length || 0} arquivos
                </div>
                <div className="admin__date">
                  {new Date(pub.createdAt).toLocaleString("pt-BR")}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--text-muted)", padding: "1rem" }}>
              Nenhuma publicação encontrada
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
