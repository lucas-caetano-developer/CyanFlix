import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/utils";

export function AdminOverviewPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: api.getAdminDashboard,
  });

  const { data: storage, isLoading: storageLoading } = useQuery({
    queryKey: ["admin", "storage"],
    queryFn: api.getAdminStorage,
  });

  const diskTotal = storage?.disk?.totalBytes ?? 0;
  const diskFree = storage?.disk?.freeBytes ?? 0;
  const diskUsed = diskTotal > 0 && diskFree <= diskTotal ? diskTotal - diskFree : 0;
  const diskPercent = diskTotal > 0 ? Math.min(100, Math.round((diskUsed / diskTotal) * 100)) : 0;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Painel de Controle</span>
          <h1 className="admin-page__title">Visão Geral</h1>
          <p className="admin-page__subtitle">
            Métricas da plataforma, capacidade de armazenamento e atalhos rápidos de gestão.
          </p>
        </div>
      </div>

      {/* Storage Section */}
      <section className="admin-overview__storage-card">
        <div className="admin-overview__storage-header">
          <div>
            <h2 className="admin-overview__section-title">Armazenamento em Disco</h2>
            <p className="admin-overview__section-desc">Capacidade alocada para o repositório de mídias e caches.</p>
          </div>
          {storage?.disk && (
            <div className="admin-overview__storage-badge">
              <strong>{diskPercent}%</strong> usado
            </div>
          )}
        </div>

        {storage?.disk ? (
          <div className="admin-overview__disk-bar-container">
            <div className="admin-overview__disk-bar">
              <div
                className="admin-overview__disk-bar-fill"
                style={{ width: `${diskPercent}%` }}
                aria-valuenow={diskPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
              />
            </div>
            <div className="admin-overview__disk-labels">
              <span>{formatBytes(diskUsed)} utilizados</span>
              <span>{formatBytes(diskFree)} livres de {formatBytes(diskTotal)}</span>
            </div>
          </div>
        ) : storageLoading ? (
          <div className="admin-overview__loading-box">Consultando informações de disco…</div>
        ) : null}

        <div className="admin-overview__storage-grid">
          <div className="admin-storage-item">
            <div className="admin-storage-item__icon">🎬</div>
            <div className="admin-storage-item__info">
              <span className="admin-storage-item__label">Mídias HLS</span>
              <strong className="admin-storage-item__val">{formatBytes(storage?.media.bytes)}</strong>
              <small>{storage?.media.count ?? 0} arquivos prontos</small>
            </div>
          </div>

          <div className="admin-storage-item">
            <div className="admin-storage-item__icon">🎨</div>
            <div className="admin-storage-item__info">
              <span className="admin-storage-item__label">Assets de Apresentação</span>
              <strong className="admin-storage-item__val">{formatBytes(storage?.assets.bytes)}</strong>
              <small>{storage?.assets.count ?? 0} pôsteres e capas</small>
            </div>
          </div>

          <div className="admin-storage-item">
            <div className="admin-storage-item__icon">📦</div>
            <div className="admin-storage-item__info">
              <span className="admin-storage-item__label">Pacotes Ingeridos</span>
              <strong className="admin-storage-item__val">{formatBytes(storage?.publications.bytes)}</strong>
              <small>{storage?.publications.count ?? 0} arquivos em pacotes</small>
            </div>
          </div>

          <div className="admin-storage-item">
            <div className="admin-storage-item__icon">⚡</div>
            <div className="admin-storage-item__info">
              <span className="admin-storage-item__label">Cache de Transcode</span>
              <strong className="admin-storage-item__val">{formatBytes(storage?.transcodeCache.bytes)}</strong>
              <small>{storage?.transcodeCache.count ?? 0} fluxos convertidos</small>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="admin-overview__metrics-section">
        <h2 className="admin-overview__section-title">Estatísticas do Catálogo</h2>
        <div className="admin-overview__metrics-grid">
          <div className="admin-metric-card">
            <div className="admin-metric-card__value">{statsLoading ? "…" : stats?.works ?? 0}</div>
            <div className="admin-metric-card__label">Obras Cadastradas</div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-card__value">{statsLoading ? "…" : stats?.seasons ?? 0}</div>
            <div className="admin-metric-card__label">Temporadas</div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-card__value">{statsLoading ? "…" : stats?.episodes ?? 0}</div>
            <div className="admin-metric-card__label">Episódios Totais</div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-card__value">{statsLoading ? "…" : stats?.publications ?? 0}</div>
            <div className="admin-metric-card__label">Publicações Processadas</div>
          </div>

          <div className="admin-metric-card">
            <div className="admin-metric-card__value">
              {statsLoading ? "…" : (stats?.publicationProcessing ?? 0) + (stats?.publicationRetrying ?? 0)}
            </div>
            <div className="admin-metric-card__label">Pacotes na Fila</div>
          </div>

          <div className={`admin-metric-card ${(stats?.publicationFailed ?? 0) > 0 ? "admin-metric-card--alert" : ""}`}>
            <div className="admin-metric-card__value">{statsLoading ? "…" : stats?.publicationFailed ?? 0}</div>
            <div className="admin-metric-card__label">Falhas de Pacote</div>
          </div>
        </div>
      </section>

      {/* Quick Navigation Cards */}
      <section className="admin-overview__quick-nav">
        <h2 className="admin-overview__section-title">Acesso Rápido às Seções</h2>
        <div className="admin-overview__actions-grid">
          <Link to="/admin/publish" className="admin-quick-card">
            <div className="admin-quick-card__icon">📥</div>
            <div className="admin-quick-card__content">
              <strong>Publicação</strong>
              <p>Importe novas obras, temporadas ou episódios enviando pastas ou arquivos de pacote.</p>
            </div>
            <span className="admin-quick-card__arrow">→</span>
          </Link>

          <Link to="/admin/catalog" className="admin-quick-card">
            <div className="admin-quick-card__icon">🎬</div>
            <div className="admin-quick-card__content">
              <strong>Catálogo de Obras</strong>
              <p>Edite títulos, sinopses, capas, visibilidade e defina os destaques principais.</p>
            </div>
            <span className="admin-quick-card__arrow">→</span>
          </Link>

          <Link to="/admin/home-sections" className="admin-quick-card">
            <div className="admin-quick-card__icon">📑</div>
            <div className="admin-quick-card__content">
              <strong>Seções da Home</strong>
              <p>Configure quais subtítulos e fileiras aparecem para os clientes e organize a ordem.</p>
            </div>
            <span className="admin-quick-card__arrow">→</span>
          </Link>

          <Link to="/admin/packages" className="admin-quick-card">
            <div className="admin-quick-card__icon">📦</div>
            <div className="admin-quick-card__content">
              <strong>Pacotes e Revisões</strong>
              <p>Acompanhe pacotes recebidos, retome falhas, confira revisões ativas e exclua pacotes.</p>
            </div>
            <span className="admin-quick-card__arrow">→</span>
          </Link>

          <Link to="/admin/clients" className="admin-quick-card">
            <div className="admin-quick-card__icon">👥</div>
            <div className="admin-quick-card__content">
              <strong>Gerenciamento de Clientes</strong>
              <p>Crie novas contas de acesso, ative ou inative usuários e gerencie permissões.</p>
            </div>
            <span className="admin-quick-card__arrow">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
