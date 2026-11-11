import { ImportPanel } from "../../features/import/ImportPanel";

export function AdminPublishPage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="admin-page__eyebrow">Ingestão de Conteúdo</span>
          <h1 className="admin-page__title">Publicação</h1>
          <p className="admin-page__subtitle">
            Importe novas obras para o catálogo selecionando a pasta do pacote ou os arquivos de manifesto e mídias.
          </p>
        </div>
      </div>

      <div className="admin-publish-container">
        <ImportPanel />
      </div>
    </div>
  );
}
