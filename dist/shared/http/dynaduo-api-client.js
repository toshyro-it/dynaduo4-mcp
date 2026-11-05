export const requiredCrmCapabilities = [
    'incremental-state', 'minimal-writes', 'nested-interactions',
    'updated-at-utc', 'creation-initial-interaction',
];
export class CrmCompatibilityError extends Error {
    constructor(required) {
        super('API CRM incompatível ou ainda não publicada. Requer contrato 1 com UTC e metadados da interação inicial.' +
            (required?.length ? ` Capacidades adicionais: ${required.join(', ')}.` : '') +
            ' Operação não enviada; atualize a API antes de repetir.');
        this.name = 'CrmCompatibilityError';
    }
}
export class DynaDuoApiError extends Error {
    status;
    traceId;
    errors;
    retryAfter;
    constructor(status, message, traceId, 
    // Erros de validação por campo (ProblemDetails.errors) e Retry-After (segundos), quando houver.
    errors, retryAfter) {
        super(message);
        this.status = status;
        this.traceId = traceId;
        this.errors = errors;
        this.retryAfter = retryAfter;
        this.name = 'DynaDuoApiError';
    }
}
export class DynaDuoApiClient {
    baseUrl;
    token;
    timeoutMs;
    request;
    crmCompatibleUntil = 0;
    crmCompatibilityCheck;
    crmCapabilities = [];
    // One authenticated read per client per minute, coalesced for concurrent mutations.
    // Capabilities are compatibility metadata, never a substitute for write authorization.
    async ensureCrmCompatibility(additional = []) {
        if (Date.now() < this.crmCompatibleUntil) {
            if (!additional.every(c => this.crmCapabilities.includes(c)))
                throw new CrmCompatibilityError(additional);
            return;
        }
        if (!this.crmCompatibilityCheck) {
            this.crmCompatibilityCheck = (async () => {
                let data;
                try {
                    data = await this.get('crm/capabilities');
                }
                catch (err) {
                    if (err instanceof SyntaxError || (err instanceof DynaDuoApiError && err.status === 404))
                        throw new CrmCompatibilityError();
                    throw err;
                }
                const contract = data;
                if (!contract || contract.contractVersion !== 1 || !Array.isArray(contract.capabilities) ||
                    !contract.capabilities.every(c => typeof c === 'string') ||
                    !requiredCrmCapabilities.every(c => contract.capabilities.includes(c)))
                    throw new CrmCompatibilityError();
                this.crmCapabilities = contract.capabilities;
                this.crmCompatibleUntil = Date.now() + 60_000;
            })().finally(() => { this.crmCompatibilityCheck = undefined; });
        }
        await this.crmCompatibilityCheck;
        if (!additional.every(c => this.crmCapabilities.includes(c)))
            throw new CrmCompatibilityError(additional);
    }
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.token = options.token;
        this.timeoutMs = options.timeoutMs;
        this.request = options.fetch ?? globalThis.fetch;
    }
    async get(path, query = {}) {
        const response = await this.getConditional(path, query);
        return response.data;
    }
    async getConditional(path, query = {}, etag) {
        const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);
        for (const [name, value] of Object.entries(query)) {
            if (value === undefined)
                continue;
            if (Array.isArray(value)) {
                for (const item of value)
                    url.searchParams.append(name, String(item));
            }
            else {
                url.searchParams.set(name, String(value));
            }
        }
        const response = await this.request(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'X-Api-Key': this.token,
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const responseEtag = response.headers.get('ETag') ?? undefined;
        if (response.status === 304 && etag !== undefined)
            return { status: 304, etag: responseEtag ?? etag, notModified: true };
        if (!response.ok)
            throw await this.toError(response);
        return { status: response.status, etag: responseEtag, data: await response.json(), notModified: false };
    }
    async post(path, body) {
        return (await this.postWithResponse(path, body)).data;
    }
    async postWithResponse(path, body) {
        return await this.sendResponse('POST', path, body);
    }
    async put(path, body) {
        return await this.send('PUT', path, body);
    }
    async patch(path, body) {
        return await this.send('PATCH', path, body);
    }
    // DELETE pode responder 204 (sem corpo) ou 200 com o recurso atualizado — T default void.
    async delete(path) {
        return await this.send('DELETE', path);
    }
    async send(method, path, body) {
        return (await this.sendResponse(method, path, body)).data;
    }
    async sendResponse(method, path, body) {
        const resource = path.replace(/^\//, '').split('?')[0];
        if ((resource === 'crm' || resource.startsWith('crm/')) &&
            !(method === 'POST' && resource === 'crm/changes/check'))
            await this.ensureCrmCompatibility();
        const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);
        const response = await this.request(url, {
            method,
            headers: {
                Accept: 'application/json',
                'X-Api-Key': this.token,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            throw await this.toError(response);
        }
        // 204 (DELETE) e corpos vazios não têm JSON para parsear.
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return { status: response.status, data: undefined };
        }
        return { status: response.status, data: await response.json() };
    }
    async toError(response) {
        let message = `DynaDuo4 respondeu HTTP ${response.status}.`;
        let traceId;
        let errors;
        // ponytail: só o 429 precisa de texto próprio — vem sem corpo JSON do rate limiter;
        // os demais status o ERP já explica no {error} abaixo.
        if (response.status === 429) {
            message = 'Limite de 60 req/min por IP (compartilhado entre tokens) atingido. Aguarde antes de repetir.';
        }
        // Retry-After do rate limiter / 503, em segundos.
        const retryAfterRaw = response.headers.get('Retry-After');
        const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : undefined;
        try {
            const body = await response.json();
            if (typeof body.error === 'string')
                message = body.error;
            else if (typeof body.title === 'string')
                message = body.title;
            if (typeof body.traceId === 'string')
                traceId = body.traceId;
            // ProblemDetails de validação: { errors: { campo: [mensagens] } }.
            if (body.errors && typeof body.errors === 'object')
                errors = body.errors;
        }
        catch {
            // Corpo vazio ou não JSON: mantém a mensagem baseada no status.
        }
        return new DynaDuoApiError(response.status, message, traceId, errors, retryAfter);
    }
}
