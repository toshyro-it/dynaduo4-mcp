import { CrmCompatibilityError, DynaDuoApiError } from './http/dynaduo-api-client.js';
export function result(data, text) {
    return {
        content: [{ type: 'text', text }],
        structuredContent: { data },
    };
}
// Erro de validação local (antes do HTTP): não tem status, mas segue o mesmo formato.
export function validationError(message) {
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
        structuredContent: { error: { code: 'validation_error', message, retryable: false } },
    };
}
// Converte qualquer falha em um resultado de erro estruturado para o cliente MCP.
export function toErrorResult(err) {
    if (err instanceof CrmCompatibilityError)
        return {
            isError: true,
            content: [{ type: 'text', text: err.message }],
            structuredContent: { error: { code: 'incompatible_api', message: err.message, retryable: false } },
        };
    if (err instanceof DynaDuoApiError) {
        const retryable = err.status === 429 || err.status >= 500;
        // 409 = conflito de concorrência (A3): reler a versão atual antes de regravar, não repetir cego.
        const code = err.status === 409 ? 'conflict' : 'api_error';
        return {
            isError: true,
            content: [{ type: 'text', text: err.message }],
            structuredContent: {
                error: {
                    code,
                    status: err.status,
                    message: err.message,
                    retryable,
                    ...(err.traceId ? { traceId: err.traceId } : {}),
                    ...(err.errors ? { errors: err.errors } : {}),
                    ...(err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : {}),
                },
            },
        };
    }
    const name = err?.name;
    const code = name === 'TimeoutError' ? 'timeout' : 'network_error';
    const message = err instanceof Error ? err.message : String(err);
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
        structuredContent: { error: { code, message, retryable: code === 'timeout' } },
    };
}
// Envolve um handler de ferramenta para que falhas virem resultado de erro estruturado
// (com traceId/status/campos inválidos) em vez de só texto.
export function safe(handler) {
    return (async (...args) => {
        try {
            return await handler(...args);
        }
        catch (err) {
            return toErrorResult(err);
        }
    });
}
