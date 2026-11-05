import { result, safe } from '../../shared/mcp.js';
import { entityRef, out } from '../../shared/outputs.js';
import { projetoCreateInputShape, projetoIdInputShape, projetoUpdateInputShape, } from './schemas.js';
// undefined = não informado (mantém o atual); qualquer outro valor (inclusive null) sobrescreve.
function overlay(novo, atual) {
    return novo !== undefined ? novo : atual;
}
// Monta o corpo do PUT a partir do projeto atual + os campos informados. O PUT substitui tudo,
// então reenviamos equipe e slacks como estão (anexos ficam de fora, gerenciados à parte no ERP).
export function buildUpdateBody(atual, campos) {
    return {
        descricao: overlay(campos.descricao, atual.descricao),
        datainicio: overlay(campos.datainicio, atual.datainicio),
        datatermino: overlay(campos.datatermino, atual.datatermino),
        limitehoras: overlay(campos.limitehoras, atual.limitehoras),
        idcontratocliente: overlay(campos.idcontratocliente, atual.idcontratocliente),
        prefixochamados: overlay(campos.prefixochamados, atual.prefixochamados),
        jiraproject: overlay(campos.jiraproject, atual.jiraproject),
        slaobrigatorio: overlay(campos.slaobrigatorio, atual.slaobrigatorio),
        bitbucketrepository: overlay(campos.bitbucketrepository, atual.bitbucketrepository),
        tipoprojeto: overlay(campos.tipoprojeto, atual.tipoprojeto),
        relacaoapontamentos: overlay(campos.relacaoapontamentos, atual.relacaoapontamentos),
        observacao: overlay(campos.observacao, atual.observacao),
        anexos: [],
        equipes: atual.equipes.map((e) => ({
            gestor: e.gestor,
            responsavelpreferivel: e.responsavelpreferivel,
            idusuario: e.idusuario,
        })),
        slacks: atual.slacks.map((s) => ({
            url: s.url,
            canal: s.canal,
            icone: s.icone,
            configuracao: s.configuracao,
            enviaurgentes: s.enviaurgentes,
        })),
    };
}
const writeAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
};
export function registerProjetoWriteTools(server, api) {
    server.registerTool('projeto_create_project', {
        title: 'Criar projeto',
        description: 'Cria um projeto. Requer descrição, data de início e idcontratocliente. Equipe e integrações ' +
            'de Slack começam vazias (gerenciadas na tela do ERP). Requer token de API com permissão de escrita.',
        inputSchema: projetoCreateInputShape,
        outputSchema: out(entityRef),
        annotations: { ...writeAnnotations, destructiveHint: false },
    }, safe(async (input) => {
        const data = await api.post('projetos', {
            ...input,
            anexos: [],
            equipes: [],
            slacks: [],
        });
        return result(data, `Projeto criado: ${data.id} — ${data.descricao}.`);
    }));
    server.registerTool('projeto_update_project', {
        title: 'Editar projeto',
        description: 'Edita um projeto existente. Informe apenas os campos a alterar; os demais, além da equipe e dos ' +
            'Slacks, são preservados. Requer token de API com permissão de escrita.',
        inputSchema: projetoUpdateInputShape,
        outputSchema: out(entityRef),
        annotations: writeAnnotations,
    }, safe(async (input) => {
        const { id, ...campos } = input;
        const atual = await api.get(`projetos/${id}`);
        const body = buildUpdateBody(atual, campos);
        const data = await api.put(`projetos/${id}`, body);
        return result(data, `Projeto ${id} atualizado: ${data.descricao}.`);
    }));
    server.registerTool('projeto_delete_project', {
        title: 'Excluir projeto',
        description: 'Exclui um projeto permanentemente pelo id. Ação irreversível. Requer token de API com permissão de escrita.',
        inputSchema: projetoIdInputShape,
        outputSchema: out(entityRef),
        annotations: writeAnnotations,
    }, safe(async ({ id }) => {
        await api.delete(`projetos/${id}`);
        return result({ id }, `Projeto ${id} excluído.`);
    }));
}
