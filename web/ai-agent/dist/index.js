import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GoogleGenAI } from '@google/genai';
import { createCopilotReadable } from './agentLoop.js';
import { createInsightReadable } from './insightLoop.js';
import { DOMAIN_SYSTEM_PROMPT } from './prompt.js';
const app = new Hono();
app.use('/*', cors({ origin: '*' }));
app.get('/health', (c) => c.json({ status: 'ok' }));
app.post('/api/agent/chat', async (c) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) {
        return c.json({ error: 'Set GOOGLE_GENERATIVE_AI_API_KEY' }, 503);
    }
    const body = await c.req.json();
    if (!body?.messages || !Array.isArray(body.messages)) {
        return c.json({ error: 'Expected { messages: { role, text }[] }' }, 400);
    }
    const model = (process.env.CHAT_MODEL || 'gemma-4-31b-it').trim();
    const client = new GoogleGenAI({ apiKey });
    const stream = createCopilotReadable(client, {
        model,
        systemInstruction: DOMAIN_SYSTEM_PROMPT,
        messages: body.messages,
    });
    return c.newResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
});
app.post('/api/agent/insight', async (c) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) {
        return c.json({ error: 'Set GOOGLE_GENERATIVE_AI_API_KEY' }, 503);
    }
    const body = await c.req.json();
    const context = typeof body?.context === 'string' ? body.context : '';
    if (!context.trim()) {
        return c.json({ error: 'Expected { context: string }' }, 400);
    }
    const mode = body?.insightMode === 'campaign_creatives' ? 'campaign_creatives' : 'default';
    const model = (process.env.CHAT_MODEL || 'gemma-4-31b-it').trim();
    const client = new GoogleGenAI({ apiKey });
    const stream = createInsightReadable(client, { model, context: context.trim(), mode });
    return c.newResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
});
const port = Number(process.env.PORT || 3001);
console.info(`[ai-agent] @google/genai model=${(process.env.CHAT_MODEL || 'gemma-4-31b-it').trim()} port=${port} (chat + insight; runSQL + getDatabaseSchema)`);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
//# sourceMappingURL=index.js.map