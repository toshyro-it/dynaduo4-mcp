import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
async function main() {
    const config = loadConfig(process.env);
    const server = createServer(config);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Falha ao iniciar dynaduo4-mcp: ${message}\n`);
    process.exitCode = 1;
});
