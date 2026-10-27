import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: Request) => Promise<Response>;

/** Serves /api/* locally with the same handlers Vercel runs as Edge Functions (in-memory rooms unless Upstash env vars are set). */
function localApi(): Plugin {
  const middleware = (load: () => Promise<Handler>) => async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // Sandboxed extensions (opaque origin) import modules from /extensions/: allow CORS like vercel.json does.
    if (req.url?.startsWith('/extensions/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return next();
    }
    if (!req.url?.startsWith('/api/')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request('http://localhost' + req.url, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([k, v]) => typeof v === 'string' && ['content-type', 'mcp-session-id', 'mcp-protocol-version', 'accept', 'authorization'].includes(k)) as [string, string][]),
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const r = await (await load())(request);
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await r.arrayBuffer()));
  };
  return {
    name: 'vellum-local-api',
    configureServer(server) {
      server.middlewares.use(middleware(async () => (await server.ssrLoadModule('/server/handlers.ts')).handle));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(async () => (await import('./server/handlers')).handle));
    },
  };
}

export default defineConfig({ plugins: [react(), localApi()] });
