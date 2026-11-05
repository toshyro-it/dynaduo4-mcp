const DEFAULT_TIMEOUT_MS = 30_000;
// Parse puro: não lê process.env. Só src/index.ts passa o ambiente do processo.
export function loadConfig(env) {
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
        apiBaseUrl: rawUrl.replace(/\/$/, ''),
        apiToken,
        apiTimeoutMs: timeout,
    };
}
