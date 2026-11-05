import { z } from 'zod';
import { result, safe, validationError } from '../../shared/mcp.js';
import { entityRef, out } from '../../shared/outputs.js';
import { crmAddTagsInputShape, crmBindReferenceInputShape, crmCreateInputShape, crmDeleteInteractionInputShape, crmRemoveTagInputShape, crmSetArchivedInputShape, crmSetAssigneeInputShape, crmSetFollowingInputShape, crmSetStatusInputShape, crmSetSubjectInputShape, crmUpdateInteractionInputShape, } from './schemas.js';
const writePath = (path, mode = 'minimal') => `${path}?returnMode=${mode}`;
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const cardOutput = out(entityRef);
const creationOutput = out(entityRef.extend({
    initialInteraction: z.object({
        id: z.number().int().positive(),
        version: z.number().int().min(0).max(4_294_967_295),
        updatedAt: z.iso.datetime().nullable(),
    }).optional(),
}));
export function registerCrmWriteTools(server, api) {
    server.registerTool('crm_bind_external_reference', {
        title: 'Vincular origem a card existente',
        description: 'Preenche referenciaExterna vazia sem recriar o card. Exige versão e emissor/cliente OU prospect conferidos. Não transfere nem substitui referências. Repetição da mesma origem é idempotente, conflitos retornam 409 e não são repetidos automaticamente. API registra auditoria.',
        inputSchema: crmBindReferenceInputShape, outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, ...body }) => {
        if ((body.idcliente !== undefined) === (body.idprospect !== undefined))
            return validationError('Informe exatamente um entre idcliente e idprospect, conforme o card de destino.');
        await api.ensureCrmCompatibility(['bind-external-reference']);
        const data = await api.patch(`crm/${id}/referencia-externa`, body);
        return result(data, `Origem conferida e vinculada ao card ${id}.`);
    }));
    server.registerTool('crm_create_card', {
        title: 'Criar card do CRM',
        description: 'Cria uma oportunidade (card). Vincule a um cliente OU a um prospect (exatamente um). A ' +
            'descrição vira a primeira interação; initialInteraction retorna ID, versão e data sem texto. Informe referenciaExterna para criação idempotente ' +
            '(repetir a mesma chave devolve o card já criado). Requer token com permissão de escrita.',
        inputSchema: crmCreateInputShape,
        outputSchema: creationOutput,
        annotations: writeAnnotations,
    }, safe(async (input) => {
        const temCliente = input.idcliente !== undefined;
        const temProspect = input.idprospect !== undefined;
        if (temCliente === temProspect) {
            return validationError('Informe exatamente um entre idcliente e idprospect.');
        }
        const { returnMode, ...body } = input;
        const { status, data } = await api.postWithResponse(writePath('crm', returnMode), body);
        const created = status === 201;
        return result({ ...data, created, existing: !created }, created ? `Card criado: ${data.id}.` : `Card existente: ${data.id}; nenhuma alteração realizada.`);
    }));
    server.registerTool('crm_set_subject', {
        title: 'Alterar título do card',
        description: 'Altera o assunto (título) do card. Requer token com permissão de escrita.',
        inputSchema: crmSetSubjectInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, assunto, expectedVersion, returnMode }) => {
        const data = await api.patch(writePath(`crm/${id}/assunto`, returnMode), { assunto, expectedVersion });
        return result(data, `Título do card ${id} atualizado.`);
    }));
    server.registerTool('crm_set_status', {
        title: 'Alterar status do card',
        description: 'Altera o status (1 Pré-venda … 5 Cancelado). Requer token com permissão de escrita.',
        inputSchema: crmSetStatusInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, status, expectedVersion, returnMode }) => {
        const data = await api.patch(writePath(`crm/${id}/status`, returnMode), { status, expectedVersion });
        return result(data, `Status do card ${id} alterado para ${status}.`);
    }));
    server.registerTool('crm_set_assignee', {
        title: 'Alterar responsável do card',
        description: 'Define ou remove (null) o responsável. Requer token com permissão de escrita.',
        inputSchema: crmSetAssigneeInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, idresponsavel, expectedVersion, returnMode }) => {
        const data = await api.patch(writePath(`crm/${id}/responsavel`, returnMode), { idresponsavel, expectedVersion });
        return result(data, `Responsável do card ${id} atualizado.`);
    }));
    server.registerTool('crm_set_archived', {
        title: 'Arquivar/desarquivar card',
        description: 'Arquiva (true) ou desarquiva (false) o card. Requer token com permissão de escrita.',
        inputSchema: crmSetArchivedInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, arquivado, expectedVersion, returnMode }) => {
        const data = await api.patch(writePath(`crm/${id}/arquivar`, returnMode), { arquivado, expectedVersion });
        return result(data, `Card ${id} ${arquivado ? 'arquivado' : 'desarquivado'}.`);
    }));
    server.registerTool('crm_set_following', {
        title: 'Acompanhar/desacompanhar card',
        description: 'Passa a acompanhar (true) ou deixa de acompanhar (false). Requer token com permissão de escrita.',
        inputSchema: crmSetFollowingInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, acompanhar, returnMode }) => {
        const data = await api.post(writePath(`crm/${id}/acompanhar`, returnMode), { acompanhar });
        return result(data, `Acompanhamento do card ${id}: ${acompanhar}.`);
    }));
    server.registerTool('crm_add_tags', {
        title: 'Adicionar tags ao card',
        description: 'Adiciona tags ao card. Use crm_list_tags para os IDs. Requer token com permissão de escrita.',
        inputSchema: crmAddTagsInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ id, tags, returnMode }) => {
        const data = await api.post(writePath(`crm/${id}/tags`, returnMode), { tags });
        return result(data, `${tags.length} tag(s) adicionada(s) ao card ${id}.`);
    }));
    server.registerTool('crm_remove_tag', {
        title: 'Remover tag do card',
        description: 'Remove um vínculo card-tag pelo idCardTag (não é o id da tag; vem do detalhe do card). ' +
            'Requer token com permissão de escrita.',
        inputSchema: crmRemoveTagInputShape,
        outputSchema: cardOutput,
        annotations: destructive,
    }, safe(async ({ idCardTag, returnMode }) => {
        const data = await api.delete(writePath(`crm/tags/${idCardTag}`, returnMode));
        return result(data, `Vínculo card-tag ${idCardTag} removido.`);
    }));
    server.registerTool('crm_update_interaction', {
        title: 'Editar interação do card',
        description: 'Edita uma interação em um único HTTP; a API valida o vínculo com o card, a permissão e ' +
            'expectedVersion (version da interação em crm_get_interaction ou crm_get_card operational): retorno mínimo inclui contentHash do texto salvo. Em conflito (409), releia o estado e ' +
            'reaplique com a nova versão. Requer token com permissão de escrita.',
        inputSchema: crmUpdateInteractionInputShape,
        outputSchema: cardOutput,
        annotations: writeAnnotations,
    }, safe(async ({ cardId, idInteracao, descricao, expectedVersion, returnMode }) => {
        const data = await api.put(writePath(`crm/${cardId}/interacoes/${idInteracao}`, returnMode), { descricao, expectedVersion });
        return result(data, `Interação ${idInteracao} do card ${cardId} atualizada.`);
    }));
    server.registerTool('crm_delete_interaction', {
        title: 'Excluir interação do card',
        description: 'Exclui uma interação. Confere que ela pertence ao card informado. Ação irreversível. ' +
            'Requer token com permissão de escrita.',
        inputSchema: crmDeleteInteractionInputShape,
        outputSchema: cardOutput,
        annotations: destructive,
    }, safe(async ({ cardId, idInteracao, returnMode }) => {
        const data = await api.delete(writePath(`crm/${cardId}/interacoes/${idInteracao}`, returnMode));
        return result(data, `Interação ${idInteracao} do card ${cardId} excluída.`);
    }));
    server.registerTool('crm_delete_card', {
        title: 'Excluir card do CRM',
        description: 'Exclui um card permanentemente. Ação irreversível. Requer token com permissão de escrita.',
        inputSchema: { id: crmSetSubjectInputShape.id },
        outputSchema: out(entityRef),
        annotations: destructive,
    }, safe(async ({ id }) => {
        await api.delete(`crm/${id}`);
        return result({ id }, `Card ${id} excluído.`);
    }));
}
