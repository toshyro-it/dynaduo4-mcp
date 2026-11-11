import { z } from 'zod';
import { result, safe } from '../../shared/mcp.js';
import { out } from '../../shared/outputs.js';
// Identidade declarada + o que a API diz do contrato. Sem token em nenhum campo: o cliente
// HTTP usa o token só no header e nada dele é ecoado para o consumidor.
export const serverInfoOutput = out(z.looseObject({
    environment: z.enum(['v3-prod', 'v4-homolog', 'v4-prod']),
    baseUrl: z.string(),
    adapterVersion: z.string(),
    contractVersion: z.number().int().nullable(),
    capabilities: z.array(z.string()).nullable(),
    fetchedAt: z.string(),
}));
export function registerCrmServerInfo(server, api, identity) {
    server.registerTool('crm_server_info', {
        title: 'Identificar a base do CRM em uso',
        description: 'Declara em qual base este servidor está: ambiente (DYNADUO_ENV), URL base, versão do ' +
            'adaptador e o contrato lido de GET crm/capabilities (contractVersion e capabilities). ' +
            'Somente leitura; não concede escopo nem autoriza escrita. Consulte antes de ler ou ' +
            'escrever quando houver dúvida sobre a base.',
        inputSchema: {},
        outputSchema: serverInfoOutput,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (_input, { signal }) => {
        const contract = await api.getCrmContractInfo(signal);
        const data = {
            environment: identity.environment,
            baseUrl: identity.apiBaseUrl,
            adapterVersion: identity.adapterVersion,
            contractVersion: contract.contractVersion,
            capabilities: contract.capabilities,
            fetchedAt: contract.fetchedAt,
        };
        return result(data, `Ambiente ${data.environment} em ${data.baseUrl} (adaptador ${data.adapterVersion}): ` +
            `contrato ${data.contractVersion ?? 'desconhecido'}, ` +
            `${data.capabilities?.length ?? 0} capacidades.`);
    }));
}
