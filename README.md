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

`POST /v1/publications/{upload_id}/complete` aceita a finalização com HTTP 202 e executa a
validação em segundo plano. Repetir a chamada é idempotente: enquanto estiver em
`validating`/`promoting`, a API devolve o estado existente; quando estiver `confirmed`, devolve
o mesmo recibo. Clientes devem acompanhar o processamento com
`GET /v1/publications/{upload_id}`.

A API apenas aceita a finalização e persiste o estado `validating`. O serviço `worker` consome
essa fila, valida o pacote, promove os arquivos e cria a revisão e o recibo. Se o worker for
reiniciado, publicações em `validating` ou `promoting` são retomadas sem novo envio.

Cada finalização recebe um lease exclusivo renovado por heartbeat. Isso permite executar mais de
uma réplica do worker sem processar deliberadamente o mesmo pacote em paralelo. Falhas são
reagendadas com backoff exponencial até `PUBLICATION_MAX_ATTEMPTS`; depois disso a publicação entra
em `failed` e pode ser novamente concluída para reiniciar as tentativas.

O Admin recebe alterações operacionais por SSE em `/api/admin/events`; o Nginx desativa buffering
apenas nessa rota. O worker também executa uma auditoria por período configurado em
`INTEGRITY_INTERVAL_HOURS`: todos os assets confirmados têm existência e tamanho verificados, e
`INTEGRITY_HASH_SAMPLE_SIZE` arquivos formam uma amostra rotativa para validação SHA-256.

## Conta inicial e perfis

Na primeira inicialização após as migrations, a API cria a conta `owner` usando `ADMIN_PASSWORD`
somente como credencial de bootstrap. A senha persistida usa `scrypt` com salt; alterações futuras
em `ADMIN_PASSWORD` não substituem a senha da conta existente. Perfis legados sem conta são
associados a esse owner durante a migração lógica de inicialização.

Contas têm função `owner`, `admin` ou `viewer`. Apenas owner/admin acessam `/api/admin/*`, e cada
conta só pode ler ou alterar os próprios perfis, favoritos e progresso. O owner pode administrar
contas por `GET/POST/PATCH /api/admin/accounts`.

Alterações editoriais de título, sinopse, visibilidade e destaque são armazenadas em
`EditorialOverride`; o manifesto e os registros canônicos de ingestão permanecem intactos. Cada
mudança gera um `AuditLog` com a conta responsável e os valores anterior e posterior.

Perfis podem ter PIN numérico opcional e classificação etária máxima. O desbloqueio cria uma
sessão de perfil assinada em cookie HTTP-only, vinculada à conta autenticada. O limite etário é
aplicado pela API em catálogo, busca, detalhes, favoritos, progresso e playback; o hash do PIN
nunca é retornado ao frontend.

A coleta de revisões é executada pelo worker através de uma fila persistente. O Admin apresenta
um preview e somente permite enfileirar publicações confirmadas, antigas e sem referências em
temporadas ou episódios. `REVISION_RETENTION_DAYS` controla a idade mínima e
`REVISION_KEEP_PER_SCOPE` preserva as revisões mais recentes para rollback.

Quando o dispositivo não suporta o HEVC canônico, o worker gera um cache H.264 adaptativo com
representações 1080p, 720p e 480p, omitindo níveis acima da resolução original. Áudio e legendas
continuam referenciando os assets imutáveis da publicação; a ladder temporária permanece sujeita
às políticas de proteção, tamanho e expiração do cache.

## Testes

- `pnpm test`: contratos, autenticação, workers e testes de componentes com Vitest/Testing Library.
- `pnpm test:unit`: somente os testes do frontend.
- `pnpm test:e2e`: fluxos Viewer/Admin no Chromium com Playwright.

Na primeira execução local do E2E, instale o navegador com `pnpm exec playwright install chromium`.

O manifesto de uma temporada contém o inventário de todos os segmentos HLS e usa o limite
específico `MANIFEST_BODY_LIMIT_BYTES` (64 MiB por padrão). Esse limite não amplia as demais
rotas JSON. Cada arquivo de mídia é enviado separadamente como `application/octet-stream` e
encaminhado diretamente para o staging em disco, com hash calculado durante o stream; a API
não carrega o arquivo inteiro na memória. O limite por arquivo continua sendo
`MAX_UPLOAD_SIZE_BYTES`.

O gateway mantém conexões persistentes com a API durante publicações. Isso é importante para
pacotes HLS com milhares de segmentos: remover o `keepalive` faz cada arquivo pagar uma nova
conexão TCP interna e reduz drasticamente a vazão efetiva.

Uploads repetidos são idempotentes: um arquivo já confirmado com o mesmo tamanho e SHA-256
retorna sucesso sem ser gravado novamente. A API também impede duas gravações simultâneas do
mesmo caminho. Tentativas incompletas podem ser removidas pelo publicador somente mediante
confirmação do `package_id` e do hash selado do manifesto.

No painel **Admin → Publicações**, o proprietário pode excluir um pacote por completo. A tela
exige que o `package_id` inteiro seja digitado e remove staging, biblioteca, arquivos, recibo,
revisão e registro do banco. Uma revisão ativa ou ainda referenciada pelo catálogo nunca é
excluída; outra revisão precisa ser ativada primeiro.

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

A atualização atual inclui a migration aditiva `20261014001000_editorial_collections`.
Execute `pnpm db:migrate` antes de iniciar API e worker quando o deploy não usar o serviço
automático de migrations.

O frontend também pode ser instalado como PWA. O service worker guarda somente o shell e os
assets estáticos versionados; APIs autenticadas, biblioteca, HLS e fallback nunca entram no cache.

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

## Atalhos do Reprodutor

Atalhos de teclado: `Espaço`/`K` alternar reprodução; `←`/`→` e `J`/`L` buscar ∓/±10s (segurar acelera para 30s/60s); `↑`/`↓` volume ±10% (ou D-pad TV); `M` mudo; `F` tela cheia; `C` legendas; `0`–`9` posição 0%–90%; `Esc`/Voltar fecha camadas (painel → controles → tela cheia → voltar); teclas de mídia de controle remoto suportadas.
