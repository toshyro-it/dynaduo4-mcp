import { z } from 'zod';
// Peças de outputSchema reutilizáveis. Objetos "loose" (aceitam campos extras): declaram os
// campos estáveis que os clientes consomem sem congelar o DTO do ERP — campos novos não quebram.
// O SDK só valida saídas de sucesso (isError pula a validação), então os erros do M3 passam.
export const resumoItem = z.looseObject({
    valor: z.number().int().nullable().optional(),
    rotulo: z.string(),
    total: z.number().int(),
});
export const pagedData = z.looseObject({
    items: z.array(z.unknown()),
    totalCount: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
    hasPrevious: z.boolean(),
});
// Entidade com id (card, projeto, contrato): id garantido, resto livre.
export const entityRef = z.looseObject({ id: z.number().int() });
export const objectList = z.array(z.looseObject({}));
// Erro estruturado (M3). O cliente MCP valida structuredContent contra o outputSchema inclusive
// em resultados de erro, então o schema descreve a união: sucesso traz `data`, falha traz `error`.
export const errorShape = z.looseObject({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    status: z.number().int().optional(),
    traceId: z.string().optional(),
    errors: z.record(z.string(), z.unknown()).optional(),
    retryAfter: z.number().optional(),
});
// Monta o outputSchema de uma ferramenta: { data?, error? }. data presente no sucesso, error na falha.
export function out(dataType) {
    return { data: dataType.optional(), error: errorShape.optional() };
}
