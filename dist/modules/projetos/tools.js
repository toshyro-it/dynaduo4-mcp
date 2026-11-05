import { z } from 'zod';
import { result, safe, validationError } from '../../shared/mcp.js';
import { entityRef, objectList, out, pagedData, resumoItem } from '../../shared/outputs.js';
import { firstInvertedRange } from '../../shared/validation.js';
import { projetoContratoFilterShape, projetoFilterShape, projetoIdInputShape, projetoSearchInputShape, } from './schemas.js';
function filters(input) {
    return {
        ativo: input.ativo,
        busca: input.busca,
        iniciadoDe: input.iniciadoDe,
        iniciadoAte: input.iniciadoAte,
        terminoDe: input.terminoDe,
        terminoAte: input.terminoAte,
    };
}
const projetoSummaryOutput = out(z.looseObject({
    total: z.number().int(),
    porSituacao: z.array(resumoItem),
    porAno: z.array(resumoItem),
    porCliente: z.array(resumoItem),
}));
// Rejeita intervalos de data invertidos antes do HTTP. Retorna o erro, ou null se ok.
function rangeError(input) {
    const label = firstInvertedRange([
        ['iniciadoDe/iniciadoAte', input.iniciadoDe, input.iniciadoAte],
        ['terminoDe/terminoAte', input.terminoDe, input.terminoAte],
    ]);
    return label ? validationError(`Intervalo invertido em ${label}: a data inicial é posterior à final.`) : null;
}
export function registerProjetoTools(server, api) {
    server.registerTool('projeto_search_projects', {
        title: 'Pesquisar projetos',
        description: 'Lista projetos com paginação e filtros (ativo, busca por descrição/cliente, data de ' +
            'início e de término). Use os filtros de data para recortes históricos, ex.: iniciadoDe ' +
            'para "projetos dos últimos N dias". Se hasNext for true, existem mais projetos ainda não ' +
            'retornados. Para responder perguntas de quantidade, use projeto_get_summary.',
        inputSchema: projetoSearchInputShape,
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
        const data = await api.get('projetos/paged', {
            page: input.page,
            pageSize: input.pageSize,
            ...filters(input),
        });
        return result(data, `Foram retornados ${data.items.length} de ${data.totalCount} projetos. ` +
            `Página ${data.page} de ${data.totalPages}; hasNext=${data.hasNext}.`);
    }));
    server.registerTool('projeto_get_summary', {
        title: 'Obter contagens de projetos',
        description: 'Responde perguntas de quantidade sem paginar projetos. Aceita os mesmos filtros de ' +
            'projeto_search_projects e devolve total e agrupamentos por situação (em andamento x ' +
            'encerrado), ano de início e cliente.',
        inputSchema: projetoFilterShape,
        outputSchema: projetoSummaryOutput,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const invalid = rangeError(input);
        if (invalid)
            return invalid;
        const data = await api.get('projetos/resumo', filters(input));
        return result(data, `O recorte contém ${data.total} projetos.`);
    }));
    server.registerTool('projeto_get_project', {
        title: 'Obter projeto completo',
        description: 'Obtém um projeto completo, incluindo cliente, contrato, equipe, anexos e integrações. ' +
            'Projeto fora do tenant do token responde como inexistente.',
        inputSchema: projetoIdInputShape,
        outputSchema: out(entityRef),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async ({ id }) => {
        const data = await api.get(`projetos/${id}`);
        const descricao = typeof data.descricao === 'string' ? data.descricao : 'sem descrição';
        return result(data, `Projeto ${id}: ${descricao}.`);
    }));
    server.registerTool('projeto_list_contratos', {
        title: 'Listar contratos-cliente',
        description: 'Lista os contratos-cliente (idcontratocliente, cliente, contrato) para preencher o campo ' +
            'idcontratocliente ao criar um projeto com projeto_create_project. Filtre por busca (nome ' +
            'do cliente ou título do contrato) e por ativo.',
        inputSchema: projetoContratoFilterShape,
        outputSchema: out(objectList),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async (input) => {
        const data = await api.get('projetos/contratos-cliente', {
            busca: input.busca,
            ativo: input.ativo,
        });
        return result(data, `Foram encontrados ${data.length} contratos-cliente.`);
    }));
    server.registerTool('projeto_list_clientes', {
        title: 'Listar clientes com projetos',
        description: 'Lista os clientes que têm projetos, com o nome e a contagem de projetos de cada um. ' +
            'Use o nome retornado no filtro busca de projeto_search_projects ou projeto_get_summary.',
        inputSchema: {},
        outputSchema: out(z.array(resumoItem)),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, safe(async () => {
        const data = await api.get('projetos/resumo', {});
        return result(data.porCliente, `Foram encontrados ${data.porCliente.length} clientes com projetos.`);
    }));
}
