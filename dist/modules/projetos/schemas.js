import { z } from 'zod';
import { isoDate } from '../../shared/validation.js';
export const projetoFilterShape = {
    ativo: z.boolean()
        .optional()
        .describe('true para projetos ativos, false para inativos; omitido traz ambos.'),
    busca: z.string().trim().min(1).optional()
        .describe('Busca parcial na descrição do projeto ou na razão social do cliente.'),
    iniciadoDe: isoDate.optional()
        .describe('Data de início a partir desta data, inclusiva. Para "projetos dos últimos N dias", use a data de N dias atrás.'),
    iniciadoAte: isoDate.optional()
        .describe('Data de início até esta data, inclusiva.'),
    terminoDe: isoDate.optional()
        .describe('Data de término a partir desta data, inclusiva. Projeto em andamento (sem término) fica de fora.'),
    terminoAte: isoDate.optional()
        .describe('Data de término até esta data, inclusiva. Projeto em andamento (sem término) fica de fora.'),
};
export const projetoSearchInputShape = {
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    ...projetoFilterShape,
};
export const projetoIdInputShape = {
    id: z.number().int().positive().describe('ID numérico do projeto.'),
};
export const projetoContratoFilterShape = {
    busca: z.string().trim().min(1).optional()
        .describe('Busca parcial no nome do cliente ou no título do contrato.'),
    ativo: z.boolean().optional()
        .describe('true só ativos, false só inativos; omitido traz ambos.'),
};
// --- Escrita ---
// Campos escalares do projeto. Nomes iguais aos da API (o ERP ignora caixa no binding).
const projetoWriteShape = {
    descricao: z.string().trim().min(1).max(255).describe('Descrição do projeto (obrigatória, até 255 caracteres).'),
    datainicio: isoDate.describe('Data de início, AAAA-MM-DD (obrigatória).'),
    datatermino: isoDate.nullable().optional().describe('Data de término, AAAA-MM-DD; null/omitido = em andamento.'),
    limitehoras: z.number().positive().nullable().optional().describe('Limite de horas do projeto.'),
    idcontratocliente: z.number().int().positive()
        .describe('ID do contrato-cliente ao qual o projeto pertence (obrigatório). Use projeto_list_contratos para descobrir o id.'),
    prefixochamados: z.string().trim().min(1).nullable().optional().describe('Prefixo dos chamados do projeto.'),
    jiraproject: z.number().int().positive().nullable().optional().describe('ID do projeto no Jira.'),
    slaobrigatorio: z.boolean().nullable().optional().describe('Se o SLA é obrigatório.'),
    bitbucketrepository: z.string().trim().min(1).nullable().optional().describe('Repositório Bitbucket associado.'),
    tipoprojeto: z.number().int().nullable().optional().describe('Código do tipo de projeto.'),
    relacaoapontamentos: z.number().int().nullable().optional().describe('Código da relação de apontamentos.'),
    observacao: z.string().trim().min(1).nullable().optional().describe('Observação livre.'),
};
export const projetoCreateInputShape = projetoWriteShape;
// Na edição, id é obrigatório e os demais campos são opcionais (só o que mudar).
// Equipe e slacks são preservados pela tool (read-modify-write), não entram aqui.
export const projetoUpdateInputShape = {
    id: z.number().int().positive().describe('ID do projeto a editar.'),
    descricao: projetoWriteShape.descricao.optional(),
    datainicio: projetoWriteShape.datainicio.optional(),
    datatermino: projetoWriteShape.datatermino,
    limitehoras: projetoWriteShape.limitehoras,
    idcontratocliente: projetoWriteShape.idcontratocliente.optional(),
    prefixochamados: projetoWriteShape.prefixochamados,
    jiraproject: projetoWriteShape.jiraproject,
    slaobrigatorio: projetoWriteShape.slaobrigatorio,
    bitbucketrepository: projetoWriteShape.bitbucketrepository,
    tipoprojeto: projetoWriteShape.tipoprojeto,
    relacaoapontamentos: projetoWriteShape.relacaoapontamentos,
    observacao: projetoWriteShape.observacao,
};
