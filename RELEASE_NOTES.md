# DynaDuo4 MCP 0.5.1

Versão de correção editorial, publicada a partir do merge desta versão em `main`.
Não há mudança de comportamento do adaptador em relação a `0.5.0`: o runtime é o
mesmo e, nele, o que muda de fato é o número que ele anuncia. A versão existe
porque o artefato publicado como `0.5.0`, em 2026-11-11, carregava uma nota de
entrega que se declarava "proposta de promoção, ainda não publicada nem aprovada
como release" — estado que deixou de ser verdade no mesmo dia em que a publicação
aconteceu.

## O que mudou

- **Nota de entrega corrigida.** Este texto descreve o que a versão é, e não o
  estado de uma preparação. O `RELEASE_NOTES.md` publicado com `0.5.0` não é
  reescrito: a publicação anterior permanece íntegra no histórico de distribuição
  e no `CHANGELOG.md` deste repositório. Corrigir o texto dentro do próprio
  `0.5.0` trocaria uma nota errada por uma publicação reescrita.
- **Número anunciado ao cliente.** `serverInfo.version` do protocolo MCP e o
  campo de versão de `crm_server_info` leem a mesma constante do manifesto, agora
  `0.5.1`. Quem registra a versão do adaptador verá `0.5.1`.
- **Correção interna do teste de contrato de distribuição.** O teste que confere
  o shebang de `bin/dynaduo4-mcp.mjs` passou a normalizar o fim de linha antes da
  comparação. Em checkout Windows com `core.autocrlf=true` a cópia de trabalho
  recebe CRLF e o teste comparava o prefixo literal em LF, produzindo um vermelho
  falso que o CI Linux não reproduzia. O blob versionado, o binário e o
  `.gitattributes` não mudaram; nenhum checkout de terceiro é afetado.

## O que não mudou

- Nenhuma ferramenta MCP, schema, código de erro, política de retry, envelope de
  lote ou regra de autorização/tenant foi alterada em relação a `0.5.0`. Quem já
  opera `0.5.0` não precisa mudar configuração, chamada ou tratamento de resposta.
- As variáveis continuam as mesmas: `DYNADUO_ENV` (`v3-prod`, `v4-homolog` ou
  `v4-prod`, obrigatória e sem default), `DYNADUO_API_URL` e `DYNADUO_API_TOKEN`.
  Nenhuma variável nova, nenhuma removida.
- Sem nova dependência, sem mudança de licença (a decisão vigente é `D4-LIC-01`,
  fechada em 2026-11-05), sem DDL e sem migração. O pacote continua
  `private: true`, distribuído por Git, sem publicação npm.
- Continua MCP local **stdio**, sem servidor HTTP público e sem acesso direto a
  banco; toda operação passa pela API do DynaDuo4 com `X-Api-Key`.

## Como aplicar e reverter

1. Guarde a referência exata do pacote em uso no cliente antes de atualizar; não
   registre token em evidência.
2. Instale o commit da branch de distribuição conforme o README público e
   reinicie o processo/cliente MCP. Não há build, migração de banco ou passo de
   aplicação nesta versão.
3. Confirme `0.5.1` no handshake e em `crm_server_info`, com o ambiente e a URL
   esperados, e uma leitura de baixo impacto.
4. Para reverter, reinstale o commit `0.5.0` previamente guardado e reinicie. O
   artefato `0.5.0` continua publicado e funcionalmente equivalente; a diferença
   é o texto da nota e o número anunciado. Não reescreva histórico publicado nem
   reaproveite o número `0.5.1` para outro conteúdo.

## Evidências e limites

- Publicação automática no merge em `main`, pelos dois destinos declarados em
  `distribution.json`: branch `dist` no Bitbucket e `main` em
  `toshyro-it/dynaduo4-mcp`. O `provenance.json` dos dois destinos declara a
  mesma árvore e o mesmo `sourceCommit`, igual ao commit de `main` publicado.
- Gates desta versão: `tools/check-release-record.sh`, `npm run typecheck`,
  `npm test` e `npm run build`, os mesmos que o step `quality` do pipeline roda.
  A suíte local roda em Windows; o CI em Linux é a matriz oficial.
- Fontes da correção: `distribution/release/RELEASE_NOTES.md`, `CHANGELOG.md`
  (entradas `0.5.0` e `0.5.1`), `docs/BACKLOG.md` (`B-005`) e
  `tests/dist-contract.test.ts`.
- Esta entrega não instala nada em cliente, não atualiza a API/ERP e não aplica
  SQL. Gate verde não certifica ambiente de produção.
