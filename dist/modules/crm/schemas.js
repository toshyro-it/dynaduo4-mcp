import { z } from 'zod';
import { isoDate, utf16Text } from '../../shared/validation.js';
export const crmFilterShape = {
    arquivado: z.boolean()
        .optional()
        .describe('true para arquivados, false para não arquivados; omitido traz ambos.'),
    assunto: z.string().trim().min(1).optional()
        .describe('Busca parcial no título do card.'),
    cliente: z.string().trim().min(1).optional()
        .describe('Busca parcial no apelido do cliente ou prospect.'),
    texto: z.string().trim().min(1).optional()
        .describe('Busca parcial no conteúdo das interações.'),
    tags: z.array(z.number().int().positive()).optional()
        .describe('IDs das tags; combine com crm_list_tags para descobrir os IDs.'),
    acompanhando: z.boolean().optional()
        .describe('Filtra acompanhamento relativo ao usuário do token.'),
    status: z.number().int().min(1).max(5).optional()
        .describe('1 Pré-venda, 2 Execução, 3 Pós-venda, 4 Stand-by, 5 Cancelado.'),
    idresponsavel: z.number().int().positive().optional(),
    criadoDe: isoDate.optional().describe('Data inicial de criação, inclusiva.'),
    criadoAte: isoDate.optional().describe('Data final de criação, inclusiva.'),
    interagidoDe: isoDate.optional()
        .describe('Última interação a partir desta data, inclusiva.'),
    interagidoAte: isoDate.optional()
        .describe('Última interação até esta data, inclusiva; útil para cards parados.'),
};
export const crmSearchInputShape = {
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    ...crmFilterShape,
};
export const crmCardIdInputShape = {
    view: z.enum(['full', 'state', 'operational']).default('full')
        .describe('state: revisão/data sem narrativa; operational: campos e tags; full: detalhe completo.'),
    knownEtag: z.string().max(100).regex(/^(W\/)?"[^"\r\n]+"$/).optional()
        .describe('ETag anterior, apenas com view=state; 304 retorna changed=false.'),
    id: z.number().int().positive().describe('ID numérico do card do CRM.'),
};
// --- Descoberta para criação ---
export const crmSearchEntitiesInputShape = {
    query: z.string().trim().min(1).optional()
        .describe('Busca parcial no nome do cliente/prospect; omitido traz os primeiros.'),
    tipo: z.enum(['cliente', 'prospect']).optional()
        .describe('Filtra por cliente ou prospect; omitido traz os dois.'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de resultados (padrão 25).'),
};
export const crmEmittersInputShape = {
    query: z.string().trim().min(1).optional().describe('Busca parcial no nome do emissor; omitido traz os primeiros.'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de resultados (padrão 25).'),
};
// --- Escrita ---
const returnMode = z.enum(['minimal', 'full']).default('minimal')
    .describe('minimal evita devolver narrativas; full preserva o detalhe completo anterior.');
const statusField = z.number().int().min(1).max(5)
    .describe('1 Pré-venda, 2 Execução, 3 Pós-venda, 4 Stand-by, 5 Cancelado.');
// Limite único da descrição/interação, alinhado ao backend (CrmcardMessages.DescricaoMaxLength).
// Contagem = .length (UTF-16 code units), o mesmo que o string.Length do .NET — recusa no mesmo ponto.
const DESCRICAO_MAX = 50_000;
// Vínculo a cliente OU prospect (exatamente um — validado na tool).
// Emissor/cliente/prospect/responsável são IDs do ERP.
export const crmCreateInputShape = {
    returnMode,
    idemissor: z.number().int().positive().describe('ID do emissor (obrigatório). Use crm_list_emitters.'),
    assunto: utf16Text(255).describe('Título do card (obrigatório, até 255 unidades UTF-16).'),
    descricao: utf16Text(DESCRICAO_MAX)
        .describe('Conteúdo da primeira interação (obrigatório, até 50000 unidades UTF-16).'),
    idcliente: z.number().int().positive().optional()
        .describe('ID do cliente (tipo cliente em crm_search_entities). Informe idcliente OU idprospect, nunca os dois.'),
    idprospect: z.number().int().positive().optional()
        .describe('ID do prospect (tipo prospect em crm_search_entities). Informe idcliente OU idprospect, nunca os dois.'),
    idresponsavel: z.number().int().positive().optional().describe('ID do responsável; use crm_list_assignees.'),
    tags: z.array(z.number().int().positive()).optional().describe('IDs de tags; use crm_list_tags.'),
    usuariosEmCopia: z.array(z.number().int().positive()).optional().describe('IDs de usuários acompanhadores.'),
    referenciaExterna: utf16Text(200).optional()
        .describe('Chave de idempotência/origem (até 200 unidades UTF-16). Repetir a chave devolve o card já criado, sem duplicar; use para evitar duplicatas em retry.'),
};
// Concorrência otimista (A3): informe a version lida em crm_get_card; se o card mudou no
// servidor desde então, a escrita falha com conflito (409). Omitido = sem checagem.
const expectedVersion = z.number().int().min(0).max(4_294_967_295).optional()
    .describe('Versão esperada do card (campo version de crm_get_card). Conflito se desatualizada.');
export const crmSetSubjectInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    assunto: utf16Text(255).describe('Novo título.'),
    expectedVersion,
};
export const crmSetStatusInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    status: statusField,
    expectedVersion,
};
export const crmSetAssigneeInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    idresponsavel: z.number().int().positive().nullable()
        .describe('ID do novo responsável, ou null para remover. Use crm_list_assignees.'),
    expectedVersion,
};
export const crmSetArchivedInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    arquivado: z.boolean().describe('true arquiva, false desarquiva.'),
    expectedVersion,
};
export const crmSetFollowingInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    acompanhar: z.boolean().describe('true passa a acompanhar, false deixa de acompanhar.'),
};
export const crmAddTagsInputShape = {
    returnMode,
    id: z.number().int().positive().describe('ID do card.'),
    tags: z.array(z.number().int().positive()).min(1).describe('IDs de tags a adicionar; use crm_list_tags.'),
};
export const crmRemoveTagInputShape = {
    returnMode,
    idCardTag: z.number().int().positive().describe('ID do vínculo card-tag (não é o id da tag).'),
};
// Edição de interação exige o id do card (defesa contra editar interação de outro card) e a
// versão esperada: concorrência otimista obrigatória no caminho de integração (P4). O agente lê
// o version da interação no crm_get_card e o reenvia; se desatualizado, a API responde 409.
export const crmUpdateInteractionInputShape = {
    returnMode,
    cardId: z.number().int().positive().describe('ID do card dono da interação.'),
    idInteracao: z.number().int().positive().describe('ID da interação a editar.'),
    descricao: utf16Text(DESCRICAO_MAX).describe('Novo conteúdo da interação (até 50000 unidades UTF-16).'),
    expectedVersion: z.number().int().min(0).max(4_294_967_295)
        .describe('Versão da interação (campo version em crm_get_card). Obrigatório; conflito 409 se desatualizada.'),
};
export const crmDeleteInteractionInputShape = {
    returnMode,
    cardId: z.number().int().positive().describe('ID do card dono da interação.'),
    idInteracao: z.number().int().positive().describe('ID da interação a excluir.'),
};
export const crmCheckInputShape = {
    items: z.array(z.object({
        id: z.number().int().positive(),
        revision: z.uuid().refine(value => value !== '00000000-0000-0000-0000-000000000000', 'Revisão vazia não é válida.').nullable().optional(),
    })).min(1).max(100)
        .refine(items => new Set(items.map(i => i.id)).size === items.length, 'IDs devem ser distintos.')
        .describe('Revisões conhecidas; omitida/null estabelece a primeira observação. Até 100 cards.'),
};
export const crmInteractionInputShape = {
    cardId: z.number().int().positive(),
    idInteracao: z.number().int().positive(),
    view: z.enum(['full', 'state']).default('full')
        .describe('state lê metadados sem narrativa. Descubra ID/version da raiz em crm_get_card com view=operational.'),
    includeContentHash: z.boolean().default(false)
        .describe('Apenas state: calcula SHA-256 do texto UTF-8 com quebras LF. Não determina qual base é mais recente.'),
    knownContentHash: z.string().regex(/^sha256:utf8-lf-v1:[0-9a-f]{64}$/).optional()
        .describe('Apenas state: hash anterior no mesmo formato; implica includeContentHash e retorna contentChanged.'),
};
export const crmBindReferenceInputShape = {
    id: z.number().int().positive(),
    referenciaExterna: utf16Text(200).describe('Origem estável conferida. Só preenche referência vazia, sem recriar ou transferir card.'),
    expectedVersion: z.number().int().min(0).max(4_294_967_295),
    idemissor: z.number().int().positive().describe('Emissor confirmado do card de destino.'),
    idcliente: z.number().int().positive().optional(),
    idprospect: z.number().int().positive().optional(),
};
