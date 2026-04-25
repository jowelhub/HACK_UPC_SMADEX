import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { Sandbox } from '@e2b/code-interpreter';
import { DOMAIN_SYSTEM_PROMPT } from './prompt.js';
const app = new Hono();
app.use('/*', cors({ origin: '*' }));
app.get('/health', (c) => c.json({ status: 'ok' }));
function getBackendUrl() {
    return (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}
async function runSqlOnBackend(sql) {
    const url = `${getBackendUrl()}/api/agent/sql`;
    const headers = { 'Content-Type': 'application/json' };
    const token = process.env.AGENT_SQL_TOKEN?.trim();
    if (token)
        headers['X-Agent-Token'] = token;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
    const text = await res.text();
    if (!res.ok) {
        return { error: `HTTP ${res.status}: ${text || res.statusText}` };
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return { error: 'Invalid JSON from SQL API' };
    }
}
const buildTools = () => ({
    query_postgres: tool({
        description: 'Run a read-only SQL query (SELECT or WITH … SELECT) against the Smadex PostgreSQL database. ' +
            'Use explicit column lists, JOINs on campaign_id and creative_id, and filters. Max ~3000 rows; prefer aggregates.',
        inputSchema: z.object({
            sql: z
                .string()
                .describe('Single PostgreSQL SELECT query (no DML, no multiple statements).'),
        }),
        execute: async ({ sql }) => {
            return runSqlOnBackend(sql);
        },
    }),
    run_python_sandbox: tool({
        description: 'Execute Python 3 in an E2B cloud sandbox (numpy/pandas often preinstalled; network is not the project DB). ' +
            'Use for small numerical analysis, formatting, or quick stats on data you keep short in the script. ' +
            'To analyze query results, embed a small list/dict in the code or re-query with SQL for aggregates.',
        inputSchema: z.object({
            code: z.string().describe('Python code to run in the sandbox. Prefer print() for output.'),
        }),
        execute: async ({ code }) => {
            if (!process.env.E2B_API_KEY?.trim()) {
                return { error: 'E2B_API_KEY is not set; Python sandbox is unavailable.' };
            }
            let box = null;
            try {
                box = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
                const ex = await box.runCode(code);
                return {
                    text: ex.text ?? null,
                    stdout: ex.logs?.stdout?.join('') ?? '',
                    stderr: ex.logs?.stderr?.join('') ?? '',
                    error: ex.error
                        ? { name: ex.error.name, value: ex.error.value }
                        : null,
                };
            }
            catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
            finally {
                if (box)
                    await box.kill();
            }
        },
    }),
});
app.post('/api/agent/chat', async (c) => {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
        return c.json({ error: 'Set GOOGLE_GENERATIVE_AI_API_KEY to enable the analytics agent (Google AI / Gemini API).' }, 503);
    }
    const body = await c.req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages) || !messages.length) {
        return c.json({ error: 'Missing messages' }, 400);
    }
    const tools = buildTools();
    const modelId = (process.env.CHAT_MODEL || 'gemma-4-26b-a4b-it').trim();
    const gKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
    const gai = createGoogleGenerativeAI({ apiKey: gKey });
    const result = streamText({
        model: gai(modelId),
        system: DOMAIN_SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages.map((m) => {
            const { id, ...rest } = m;
            return rest;
        }), { tools }),
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(20),
    });
    return result.toUIMessageStreamResponse();
});
const port = Number(process.env.PORT || 3001);
console.info(`[ai-agent] model=${(process.env.CHAT_MODEL || 'gemma-4-26b-a4b-it').trim()} port=${port}`);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
//# sourceMappingURL=index.js.map