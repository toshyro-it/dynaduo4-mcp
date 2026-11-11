import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCrmServerInfo } from './modules/crm/server-info.js';
import { registerCrmTools } from './modules/crm/tools.js';
import { registerCrmWriteTools } from './modules/crm/write-tools.js';
import { registerProjetoTools } from './modules/projetos/tools.js';
import { registerProjetoWriteTools } from './modules/projetos/write-tools.js';
import { DynaDuoApiClient } from './shared/http/dynaduo-api-client.js';
import { ADAPTER_VERSION } from './version.js';
// fetchImpl é injetável para testes (API simulada); em produção usa o fetch global.
export function createServer(config, fetchImpl) {
    const server = new McpServer({
        name: 'dynaduo4-mcp',
        version: ADAPTER_VERSION,
    }, {
        instructions: 'Confira a base com crm_server_info antes de ler ou escrever quando houver dúvida; o ambiente declarado (DYNADUO_ENV) aparece no texto de crm_get_summary e crm_check_changes. ' +
            'Para perguntas de quantidade use os resumos (crm_get_summary, projeto_get_summary) em vez de paginar. ' +
            'Para conferir oportunidades conhecidas use crm_check_changes e releia só a projeção necessária. ' +
            'Descubra a raiz existente com crm_get_card operational; confira texto com crm_get_interaction state e knownContentHash antes de pedir full. ' +
            'Hash compara conteúdo; nunca decide qual origem é mais recente. Vincule origem somente após conferir a identidade do destino. ' +
            'updatedAt é a data da origem; revisões só permitem comparar igualdade na mesma base. ' +
            'Mutações CRM retornam mínimo por padrão; returnMode=full recupera o detalhe. ' +
            'Em listagens, hasNext=true significa que ainda há itens não retornados. ' +
            'O acesso sempre respeita o usuário e o tenant associados ao token configurado.',
    });
    const identity = {
        environment: config.environment,
        apiBaseUrl: config.apiBaseUrl,
        adapterVersion: ADAPTER_VERSION,
    };
    const api = new DynaDuoApiClient({
        baseUrl: config.apiBaseUrl,
        token: config.apiToken,
        timeoutMs: config.apiTimeoutMs,
        ...(config.apiRetryMaxAttempts !== undefined ? { retryMaxAttempts: config.apiRetryMaxAttempts } : {}),
        ...(config.apiRetryMaxDelayMs !== undefined ? { retryMaxDelayMs: config.apiRetryMaxDelayMs } : {}),
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
    registerCrmServerInfo(server, api, identity);
    registerCrmTools(server, api, identity);
    registerCrmWriteTools(server, api);
    registerProjetoTools(server, api);
    registerProjetoWriteTools(server, api);
    return server;
}
