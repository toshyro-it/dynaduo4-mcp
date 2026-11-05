import { z } from 'zod';
import { result, safe, validationError } from '../../shared/mcp.js';
import { entityRef, objectList, out, pagedData, resumoItem } from '../../shared/outputs.js';
import { firstInvertedRange } from '../../shared/validation.js';
import { crmCardIdInputShape, crmCheckInputShape, crmInteractionInputShape, crmEmittersInputShape, crmFilterShape, crmSearchEntitiesInputShape, crmSearchInputShape, } from './schemas.js';
function filters(input) {
    return {
        arquivado: input.arquivado,
        assunto: input.assunto,
        cliente: input.cliente,
        texto: input.texto,
        tags: input.tags,
        acompanhando: input.acompanhando,
        status: input.status,
        idresponsavel: input.idresponsavel,
        criadoDe: input.criadoDe,
        criadoAte: input.criadoAte,
        interagidoDe: input.interagidoDe,
        interagidoAte: input.interagidoAte,
    };
}
const crmSummaryOutput = out(z.looseObject({
    total: z.number().int(),
    porStatus: z.array(resumoItem),
    porResponsavel: z.array(resumoItem),
    porAno: z.array(resumoItem),
}));
// Rejeita intervalos de data invertidos antes do HTTP. Retorna o erro, ou null se ok.
function rangeError(input) {
    const label = firstInvertedRange([
        ['criadoDe/criadoAte', input.criadoDe, input.criadoAte],
        ['interagidoDe/interagidoAte', input.interagidoDe, input.interagidoAte],
    ]);
    return label ? validationError(`Intervalo invertido em ${label}: a data inicial é posterior à final.`) : null;
}
export function registerCrmTools(server, api) {
    server.registerTool('crm_search_cards', {
        title: 'Pesquisar cards do CRM',
        description: 'Lista cards do CRM com paginação e filtros. Use filtros de data para recortes históricos. ' +
            'Se hasNext for true, existem cards mais antigos ainda não retornados. Para responder ' +
            'perguntas de quantidade, use crm_get_summary.',
        inputSchema: crmSearchInputShape,
        outputSchema: out(pagedData),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const invalid = rangeError(input);
        if (invalid)
            return invalid;
        const data = await api.get('crm/paged', {
            page: input.page,
            pageSize: input.pageSize,
            ...filters(input),
        });
        return result(data, `Foram retornados ${data.items.length} de ${data.totalCount} cards. ` +
            `Página ${data.page} de ${data.totalPages}; hasNext=${data.hasNext}.`);
    }));
    server.registerTool('crm_get_summary', {
        title: 'Obter contagens do CRM',
        description: 'Responde perguntas de quantidade sem paginar cards. Aceita os mesmos filtros de ' +
            'crm_search_cards e devolve total e agrupamentos por status, responsável e ano.',
        inputSchema: crmFilterShape,
        outputSchema: crmSummaryOutput,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const invalid = rangeError(input);
        if (invalid)
            return invalid;
        const data = await api.get('crm/resumo', filters(input));
        return result(data, `O recorte contém ${data.total} cards.`);
    }));
    server.registerTool('crm_get_card', {
        title: 'Obter card do CRM por projeção',
        description: 'Lê state (revisão/data), operational (campos/tags e ID/version da primeira raiz sobrevivente, sem narrativa) ou full (inclui narrativas). ' +
            'Card fora do escopo do usuário responde como inexistente.',
        inputSchema: crmCardIdInputShape,
        outputSchema: out(entityRef),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async ({ id, view, knownEtag }) => {
        if (knownEtag && view !== 'state')
            return validationError('knownEtag exige view=state.');
        if (view === 'state') {
            const response = await api.getConditional(`crm/${id}/state`, {}, knownEtag);
            return result({ id, ...response.data, changed: !response.notModified, etag: response.etag }, response.notModified ? `Card ${id} permanece igual.` : `Estado do card ${id}.`);
        }
        // An old API omits this field even when a root exists. Fail explicitly rather than
        // confusing unsupported metadata with an actual card without a surviving root.
        if (view === 'operational')
            await api.ensureCrmCompatibility(['existing-initial-interaction']);
        const data = await api.get(`crm/${id}`, view === 'full' ? {} : { view });
        const assunto = typeof data.assunto === 'string' ? data.assunto : 'sem assunto';
        return result(data, `Card ${id}: ${assunto}.`);
    }));
    server.registerTool('crm_list_tags', {
        title: 'Listar tags do CRM',
        description: 'Lista tags ativas com ID e descrição. Use esta ferramenta antes de preencher o filtro tags.',
        inputSchema: {},
        outputSchema: out(objectList),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async () => {
        const data = await api.get('crm/tags');
        return result(data, `Foram encontradas ${data.length} tags ativas.`);
    }));
    server.registerTool('crm_list_assignees', {
        title: 'Listar responsáveis do CRM',
        description: 'Lista usuários elegíveis a responsável por cards. O ID retornado pode ser usado em idresponsavel.',
        inputSchema: {},
        outputSchema: out(objectList),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async () => {
        const data = await api.get('crm/responsaveis');
        return result(data, `Foram encontrados ${data.length} responsáveis elegíveis.`);
    }));
    server.registerTool('crm_search_entities', {
        title: 'Buscar clientes/prospects do CRM',
        description: 'Busca clientes e prospects elegíveis para criar um card, retornando id, tipo, nome e ativo. ' +
            'Use o id em idcliente (tipo cliente) ou idprospect (tipo prospect) de crm_create_card.',
        inputSchema: crmSearchEntitiesInputShape,
        outputSchema: out(objectList),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const data = await api.get('crm/entidades', {
            query: input.query,
            tipo: input.tipo,
            limite: input.limite,
        });
        return result(data, `Foram encontradas ${data.length} entidades.`);
    }));
    server.registerTool('crm_list_emitters', {
        title: 'Listar emissores do CRM',
        description: 'Lista emissores permitidos para criar um card, com id, nome e ativo. O id preenche idemissor ' +
            'em crm_create_card. Aceita busca parcial por nome.',
        inputSchema: crmEmittersInputShape,
        outputSchema: out(objectList),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const data = await api.get('crm/emissores', {
            query: input.query,
            limite: input.limite,
        });
        return result(data, `Foram encontrados ${data.length} emissores.`);
    }));
    server.registerTool('crm_check_changes', {
        title: 'Conferir mudanças em lote',
        description: 'Compara até 100 revisões conhecidas sem baixar narrativas. unchanged: igual; changed: reler a projeção necessária; unavailable: inexistente ou fora do escopo, sem autorizar exclusão automática. Revisões de bases diferentes são incomparáveis.',
        inputSchema: crmCheckInputShape,
        outputSchema: out(z.object({ items: z.array(z.object({
                id: z.number().int(), state: z.enum(['changed', 'unchanged', 'unavailable']),
                current: z.looseObject({ id: z.number().int(), version: z.number().int(), revision: z.uuid(), updatedAt: z.string().nullable() }).nullable(),
            })), checkedAt: z.string() })),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, safe(async ({ items }) => {
        const data = await api.post('crm/changes/check', { items });
        return result({ items: data, checkedAt: new Date().toISOString() }, `Conferidos ${data.length} cards.`);
    }));
    server.registerTool('crm_get_interaction', {
        title: 'Ler uma interação',
        description: 'full lê texto e versão; state lê metadados e hash opcional sem narrativa. knownContentHash retorna contentChanged sem buscar texto. Hash só compara conteúdo, não ordena bases. Use version em expectedVersion ao editar; updatedAt null significa histórico desconhecido.',
        inputSchema: crmInteractionInputShape, outputSchema: out(entityRef),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, safe(async ({ cardId, idInteracao, view, includeContentHash, knownContentHash }) => {
        if (view === 'full' && (includeContentHash || knownContentHash))
            return validationError('includeContentHash e knownContentHash exigem view=state.');
        if (view === 'state') {
            await api.ensureCrmCompatibility(['interaction-content-hash']);
            const data = await api.get(`crm/${cardId}/interacoes/${idInteracao}/state`, { includeContentHash: includeContentHash || !!knownContentHash });
            // Missing/invalid server hash must never be interpreted as unchanged or different.
            if ((includeContentHash || knownContentHash) &&
                (typeof data.contentHash !== 'string' || !/^sha256:utf8-lf-v1:[0-9a-f]{64}$/.test(data.contentHash)))
                return validationError('API não retornou um contentHash válido; comparação indisponível.');
            return result({ ...data, ...(knownContentHash ? { contentChanged: data.contentHash !== knownContentHash } : {}) }, `Estado da interação ${idInteracao} do card ${cardId}.`);
        }
        const data = await api.get(`crm/${cardId}/interacoes/${idInteracao}`);
        return result(data, `Interação ${idInteracao} do card ${cardId}.`);
    }));
}
