// Ambientes aceitos para a base do CRM. Lista fechada: o servidor não infere ambiente
// a partir da URL, então um valor ausente ou desconhecido impede a subida.
export const DYNADUO_ENVIRONMENTS = ['v3-prod', 'v4-homolog', 'v4-prod'];
const DEFAULT_TIMEOUT_MS = 30_000;
const ENVIRONMENT_FILES = '.env (homologação) ou .env.prod (produção)';
const ACCEPTED = DYNADUO_ENVIRONMENTS.join(', ');
// Parse puro: não lê process.env. Só src/index.ts passa o ambiente do processo.
export function loadConfig(env) {
    const rawEnvironment = env.DYNADUO_ENV?.trim();
    if (!rawEnvironment) {
        throw new Error(`DYNADUO_ENV não declarado. Defina o ambiente da base em ${ENVIRONMENT_FILES} ` +
            `e reinicie o servidor. Valores aceitos: ${ACCEPTED}.`);
    }
    if (!DYNADUO_ENVIRONMENTS.includes(rawEnvironment)) {
        throw new Error(`DYNADUO_ENV inválido: "${rawEnvironment}". Corrija ${ENVIRONMENT_FILES}; ` +
            `valores aceitos: ${ACCEPTED}.`);
    }
    const environment = rawEnvironment;
    const rawUrl = env.DYNADUO_API_URL?.trim();
    const apiToken = env.DYNADUO_API_TOKEN?.trim();
    if (!rawUrl) {
        throw new Error('DYNADUO_API_URL não configurada.');
    }
    if (!apiToken) {
        throw new Error('DYNADUO_API_TOKEN não configurado.');
    }
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('DYNADUO_API_URL deve usar http ou https.');
    }
    const timeout = Number(env.DYNADUO_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    if (!Number.isInteger(timeout) || timeout <= 0) {
        throw new Error('DYNADUO_API_TIMEOUT_MS deve ser um inteiro positivo.');
    }
    return {
        environment,
        apiBaseUrl: rawUrl.replace(/\/$/, ''),
        apiToken,
        apiTimeoutMs: timeout,
        apiRetryMaxAttempts: boundedInteger(env, 'DYNADUO_API_RETRY_MAX_ATTEMPTS', 3, 1, 5),
        apiRetryMaxDelayMs: boundedInteger(env, 'DYNADUO_API_RETRY_MAX_DELAY_MS', 5000, 500, 60_000),
    };
}
function boundedInteger(env, key, fallback, min, max) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`${key} deve ser um inteiro entre ${min} e ${max}.`);
    return value;
}
