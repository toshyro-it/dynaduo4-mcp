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
// Cache curto: identidade é diagnóstico, não autorização; não deve custar um HTTP por leitura.
const CONTRACT_INFO_TTL_MS = 60_000;
export class DynaDuoApiError extends Error {
    status;
    traceId;
    errors;
    retryAfter;
    code;
    constructor(status, message, traceId, 
    // Erros de validação por campo (ProblemDetails.errors) e Retry-After (segundos), quando houver.
    errors, retryAfter, code) {
        super(message);
        this.status = status;
        this.traceId = traceId;
        this.errors = errors;
        this.retryAfter = retryAfter;
        this.code = code;
        this.name = 'DynaDuoApiError';
    }
}
export class DynaDuoApiClient {
    baseUrl;
    token;
    timeoutMs;
    retryMaxAttempts;
    retryMaxDelayMs;
    request;
    crmCompatibleUntil = 0;
    crmCompatibilityCheck;
    crmCapabilities = [];
    crmContractInfoCache;
    // Identidade do contrato (contractVersion + capabilities) para crm_server_info.
    // Cache curto e independente: NÃO marca compatibilidade e NÃO autoriza escrita —
    // o gate continua sendo ensureCrmCompatibility, que revalida as capacidades exigidas.
    async getCrmContractInfo(signal) {
        if (this.crmContractInfoCache && Date.now() < this.crmContractInfoCache.until)
            return this.crmContractInfoCache.value;
        const data = await this.get('crm/capabilities', {}, signal);
        const capabilities = data && Array.isArray(data.capabilities) &&
            data.capabilities.every(c => typeof c === 'string') ? data.capabilities : null;
        const contractVersion = data && typeof data.contractVersion === 'number' ? data.contractVersion : null;
        const value = { contractVersion, capabilities, fetchedAt: new Date().toISOString() };
        this.crmContractInfoCache = { value, until: Date.now() + CONTRACT_INFO_TTL_MS };
        return value;
    }
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
        this.retryMaxAttempts = options.retryMaxAttempts ?? 3;
        this.retryMaxDelayMs = options.retryMaxDelayMs ?? 5000;
        if (!Number.isInteger(this.retryMaxAttempts) || this.retryMaxAttempts < 1 || this.retryMaxAttempts > 5)
            throw new Error('retryMaxAttempts deve ser um inteiro entre 1 e 5.');
        if (!Number.isInteger(this.retryMaxDelayMs) || this.retryMaxDelayMs < 500 || this.retryMaxDelayMs > 60_000)
            throw new Error('retryMaxDelayMs deve ser um inteiro entre 500 e 60000.');
        this.request = options.fetch ?? globalThis.fetch;
    }
    async get(path, query = {}, signal) {
        const response = await this.getConditional(path, query, undefined, signal);
        return response.data;
    }
    async getConditional(path, query = {}, etag, signal) {
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
        const response = await this.readRequest(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'X-Api-Key': this.token,
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
            signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
        });
        const responseEtag = response.headers.get('ETag') ?? undefined;
        if (response.status === 304 && etag !== undefined)
            return { status: 304, etag: responseEtag ?? etag, notModified: true };
        if (!response.ok)
            throw await this.toError(response);
        return { status: response.status, etag: responseEtag, data: await response.json(), notModified: false };
    }
    async post(path, body, signal) {
        return (await this.postWithResponse(path, body, signal)).data;
    }
    async postWithResponse(path, body, signal, query) {
        return await this.sendResponse('POST', path, body, signal, query);
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
    async sendResponse(method, path, body, signal, query) {
        const resource = path.replace(/^\//, '').split('?')[0];
        if ((resource === 'crm' || resource.startsWith('crm/')) &&
            !(method === 'POST' && resource === 'crm/changes/check'))
            await this.ensureCrmCompatibility();
        const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);
        for (const [name, value] of Object.entries(query ?? {})) {
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
        const request = method === 'POST' && resource === 'crm/changes/check'
            ? this.readRequest.bind(this) : this.request;
        const response = await request(url, {
            method,
            headers: {
                Accept: 'application/json',
                'X-Api-Key': this.token,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
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
    // Somente leituras passam aqui. Nunca inferir segurança pelo verbo POST.
    async readRequest(url, init) {
        const deadline = Date.now() + this.timeoutMs;
        for (let attempt = 1;; attempt++) {
            init.signal?.throwIfAborted();
            const response = await this.request(url, init);
            if (![429, 502, 503, 504].includes(response.status) || attempt >= this.retryMaxAttempts)
                return response;
            const retryAfterMs = (this.retryAfter(response) ?? 0) * 1000;
            const delayMs = Math.max(Math.min(500 * 2 ** (attempt - 1), this.retryMaxDelayMs), retryAfterMs);
            // Não encurtar a orientação do servidor nem renovar o orçamento por tentativa.
            if (delayMs > this.retryMaxDelayMs || delayMs >= deadline - Date.now())
                return response;
            await response.body?.cancel();
            await new Promise((resolve, reject) => {
                const signal = init.signal;
                const abort = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', abort);
                    reject(signal?.reason);
                };
                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', abort);
                    resolve();
                }, delayMs);
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted)
                    abort();
            });
        }
    }
    retryAfter(response) {
        const raw = response.headers.get('Retry-After')?.trim();
        if (!raw)
            return undefined;
        if (/^\d+$/.test(raw)) {
            const seconds = Number(raw);
            return Number.isFinite(seconds) ? seconds : undefined;
        }
        // HTTP-date, não os números/datas locais permissivos aceitos por Date.parse.
        if (!/^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(raw))
            return undefined;
        const date = Date.parse(raw);
        return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
    }
    async toError(response) {
        let message = `DynaDuo4 respondeu HTTP ${response.status}.`;
        let code;
        let traceId;
        let errors;
        // ponytail: só o 429 precisa de texto próprio — vem sem corpo JSON do rate limiter;
        // os demais status o ERP já explica no {error} abaixo.
        if (response.status === 429) {
            message = 'Limite de 60 req/min por IP (compartilhado entre tokens) atingido. Aguarde antes de repetir.';
        }
        // Retry-After do rate limiter / 503, em segundos.
        const retryAfter = this.retryAfter(response);
        try {
            const body = await response.json();
            if (typeof body.error === 'string')
                message = body.error;
            else if (typeof body.title === 'string')
                message = body.title;
            if (typeof body.traceId === 'string')
                traceId = body.traceId;
            // Código de autorização é do ERP, não inferido de mensagem/perfil.
            if (response.status === 403 && typeof body.code === 'string' && body.code.trim())
                code = body.code;
            // ProblemDetails de validação: { errors: { campo: [mensagens] } }.
            if (body.errors && typeof body.errors === 'object')
                errors = body.errors;
        }
        catch {
            // Corpo vazio ou não JSON: mantém a mensagem baseada no status.
        }
        return new DynaDuoApiError(response.status, message, traceId, errors, retryAfter, code);
    }
}
