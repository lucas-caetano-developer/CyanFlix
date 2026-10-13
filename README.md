# CyanFlix

Serviço privado de streaming e destino dos pacotes produzidos pelo Player. A ingestão segue
o contrato `PACOTE.md` da raiz do projeto: manifesto selado, checksums integrais, upload
retomável, revisões e recibo confirmado.

## Desenvolvimento local

Requer Node.js 22+, Corepack e PostgreSQL 16.

```powershell
Copy-Item .env.example .env
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm build
```

Substitua todos os valores `change-me` antes de iniciar em modo de produção.

## Docker Compose

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

O gateway local usa `http://localhost:8080`. Somente o gateway deve ser publicado; API,
worker e PostgreSQL permanecem internos.

## Publicação

O Player troca `PUBLISHER_TOKEN` por um token temporário e executa:

```text
POST /v1/auth/token
POST /v1/publications
PUT  /v1/publications/{upload_id}/files/{relative_path}
POST /v1/publications/{upload_id}/complete
GET  /v1/publications/{upload_id}
```

Todos os arquivos exigem `Content-Length` e `X-Content-SHA256`. O recibo somente é emitido
depois da validação integral e da promoção transacional do catálogo.

## Implantação no Coolify

1. Crie um recurso **Docker Compose** apontando para a pasta/repositório do CyanFlix.
2. Associe o domínio HTTPS ao serviço `gateway`, porta interna `80`.
3. Não exponha `api`, `worker` ou `postgres` diretamente.
4. Mantenha persistentes os volumes `postgres-data` e `media-data`.
5. Configure as variáveis obrigatórias abaixo.

Variáveis obrigatórias:

```text
APP_URL=https://seu-dominio
POSTGRES_DB=cyanflix
POSTGRES_USER=cyanflix
POSTGRES_PASSWORD=<senha longa>
DATABASE_URL=postgresql://cyanflix:<senha URL-encoded>@postgres:5432/cyanflix
ADMIN_PASSWORD=<senha de acesso ao site, mínimo 24 caracteres>
SESSION_SECRET=<segredo aleatório, mínimo 32 caracteres>
PUBLISHER_TOKEN=<segredo aleatório, mínimo 32 caracteres>
```

Variáveis de capacidade e fallback estão documentadas em `.env.example`. A migration é
executada por um serviço de execução única antes da API iniciar.

## Persistência e backup

- Banco: volume `postgres-data`.
- Biblioteca, staging e cache: volume `media-data`, montado em `/data`.
- Faça backup consistente dos dois volumes antes de atualizar.
- Para restaurar, interrompa API e worker, restaure ambos e só então suba o Compose.

O cache em `/data/transcode-cache` pode ser descartado. A biblioteca em `/data/library` e o
PostgreSQL precisam ser preservados juntos.

## Segurança

- catálogo, APIs, mídia HLS e fallback exigem sessão autenticada;
- cookies são `HttpOnly`, `SameSite=Strict` e `Secure` sob HTTPS;
- o painel não armazena tokens em `localStorage`;
- upload usa token temporário e limites por arquivo, pacote e quantidade;
- nunca registre senhas, `PUBLISHER_TOKEN` ou tokens temporários.
