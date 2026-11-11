# DynaDuo4 MCP 0.5.0

Proposta de promoção preparada em 2026-11-11, ainda não publicada nem aprovada
como release. Comparação: produção Git `f6e1c7d` (0.4.0) → integração `b63956f`.
Inclui todo o delta de develop, não apenas a última alteração CRM.

## O que mudou

- **Configuração incompatível:** `DYNADUO_ENV` tornou-se obrigatório, sem default.
  Aceita `v3-prod`, `v4-homolog` ou `v4-prod`; ausente/inválido impede o arranque.
  É declaração do operador, não descoberta nem prova de qual banco está em uso.
- Nova ferramenta de leitura `crm_server_info`: ambiente, URL base, versão do
  adaptador e contrato/capabilities consultados no ERP. Cache de diagnóstico de
  60 segundos, independente do gate de compatibilidade para mutações.
  Textos de `crm_get_summary` e `crm_check_changes` também identificam o ambiente.
- Leituras CRM **e Projetos** repetem 429/502/503/504 de forma limitada: GET e
  somente o POST read-only de conferência de mudanças. Padrão: 3 tentativas
  totais, espera máxima 5000 ms, backoff inicial 500 ms; timeout padrão 30000 ms
  é orçamento total, incluindo espera. `Retry-After` aceita segundos ou HTTP-date;
  se não cabe no teto/orçamento, retorna o erro sem repetir cedo. Há propagação
  de cancelamento nas leituras. Não há retry de mutação, erro de rede ou parse.
- `crm_check_changes` pede `includeMetadata=true` ao ERP. Envelope válido mantém
  `base` e `checkedAt` do produtor, com `baseVerification=verified`; resposta
  antiga em array mantém compatibilidade e declara `legacy`, sem base verificada.
  Envelope inválido é erro. `verified` significa formato/fornecimento pelo ERP,
  **não** comparação com destino esperado: o consumidor guarda e compara a base.
- `crm_list_assignees` aceita `includeCarteira` opcional: omitido preserva o
  catálogo legado; true/false seguem literalmente para o ERP. Com true, o
  produtor pode incluir históricos visíveis, com `podeReceber`/`motivo`.
  Presença no catálogo não significa permissão de atribuição.
- Erro 403 conserva código textual fornecido pelo ERP (ex.: `crm_access_denied`)
  ou usa `forbidden`. Consumidores que esperavam `api_error` para todo 403 devem
  ajustar o tratamento. 401/404 continuam `api_error`; 409 continua `conflict`.
- Na governança interna, entram gate rápido de coerência da release, changelog,
  descrição automática de PR por commits e registros de validação/backlogs.
  Esses documentos internos não fazem parte da allowlist pública.

## O que não mudou

- MCP local **stdio**, sem servidor HTTP público, banco direto ou nova regra de
  autorização/tenant no adaptador. Toda operação passa pela API com `X-Api-Key`.
- Leitura e escrita continuam separadas; nomes existentes e schemas de escrita
  não mudaram. `expectedVersion` é a versão decidida pelo consumidor: não há
  releitura automática para substituir token, cache de token de recurso ou retry
  de conflito/mutação. Em 409, reler e reconciliar antes de uma nova decisão.
- Revisões, propriedades extras e `updatedAt=null` são preservadas, sem inventar
  datas. Identidade de base não detecta restore no mesmo destino nem mudança de
  visibilidade. Revisões só se comparam dentro da mesma origem/base.
- Sem nova dependência, mudança de licença MIT/terceiros ou DDL do adaptador.
  Esta entrega não aplica SQL nem atualiza API/ERP. Gate verde offline não atesta
  implantação ou dados de produção.
- Pacote permanece `private: true`, sem publicação npm. Distribuição é por Git,
  launcher `bin/dynaduo4-mcp.mjs` e runtime compilado. Merge em main aciona
  automaticamente publicação nos dois destinos declarados, após quality; não
  existe uma pausa manual entre esse merge e a distribuição.

## Como aplicar e reverter

1. Antes de autorizar a promoção, aprovar versão/notas e confirmar o contrato da
   API no ambiente alvo. Preservar referência exata do pacote anterior e cópia
   local protegida da configuração do cliente; não registrar token em evidência.
2. Conferir API/capabilities antes do cliente. Novos metadados de lote e carteira
   dependem do suporte do produtor. API antiga pode devolver array `legacy`;
   consumidores que exigem identidade verificada devem recusar esse modo.
3. Configurar `DYNADUO_ENV` coerente com `DYNADUO_API_URL` no ambiente do cliente
   MCP ou no arquivo de ambiente local. Não trocar URL/token por causa do rótulo.
   As três variáveis obrigatórias são `DYNADUO_ENV`, `DYNADUO_API_URL` e
   `DYNADUO_API_TOKEN`. Node >=20; token de escrita apenas para ferramentas de escrita.
4. Receber o commit aprovado do repositório de distribuição, instalar conforme o
   README público e reiniciar o processo/cliente MCP. Runtime público já compilado;
   não executar build ou migração ERP como parte desta atualização do adaptador.
5. Confirmar versão 0.5.0 no handshake e `crm_server_info`, ambiente/URL esperados,
   leitura de baixo impacto e base do lote comparada ao valor esperado. Teste de
   escrita real só em rodada separada explicitamente autorizada.
6. Para rollback do adaptador, restaurar o commit/pacote 0.4.0 previamente guardado
   e a configuração compatível, reiniciando o cliente. Não reescrever histórico
   público. Rollback da API/ERP é decisão separada do seu responsável; não há
   reversão de banco ou comando de deploy autorizado nestas notas.

Parâmetros opcionais novos: `DYNADUO_API_RETRY_MAX_ATTEMPTS` (inteiro 1..5,
1 desliga retry) e `DYNADUO_API_RETRY_MAX_DELAY_MS` (inteiro 500..60000).
A ausência preserva os defaults acima; não é necessário configurá-los para migrar.

## Evidências e limites

- Escopo integrado: PRs #42 (descrição de PR), #45 (registro/gate), #46/#49
  (backlogs), #47 (identidade/configuração) e #50 (resiliência/contrato CRM).
- Fontes: `src/config.ts`, `src/version.ts`, `src/modules/crm/server-info.ts`,
  `src/modules/crm/tools.ts`, `src/modules/projetos/tools.ts`,
  `src/shared/http/dynaduo-api-client.ts`, `src/shared/mcp.ts`,
  `bitbucket-pipelines.yml`, `tools/check-release-record.sh` e testes associados.
- O gate coalescido de compatibilidade CRM pode aguardar seu timeout antes de
  observar cancelamento de um consumidor; não se promete cancelamento instantâneo.
- Aprovação humana de versão/notas e conferência da decisão de licença vigente
  continuam pendentes. Este texto não assina aprovação nem autoriza merge/deploy.
- Nenhum canal foi atualizado nesta preparação. Leituras/gates locais não
  certificam API de produção nem instalação nos clientes.
