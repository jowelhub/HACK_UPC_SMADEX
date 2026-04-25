import { createPartFromFunctionResponse, createUserContent, createModelContent, Type, FunctionCallingConfigMode, ThinkingLevel, FinishReason, } from '@google/genai';
import { COMPACT_DB_SCHEMA } from './schemaText.js';
function concatTextFromParts(parts, mode) {
    if (!parts?.length)
        return '';
    let s = '';
    for (const p of parts) {
        if (typeof p.text !== 'string' || p.text.length === 0)
            continue;
        if (mode === 'thought' ? p.thought !== true : p.thought === true)
            continue;
        s += p.text;
    }
    return s;
}
/**
 * Per-chunk streaming can mix functionCall / other parts with text. Relying on
 * `chunk.text` is incomplete when those parts exist; we derive text from
 * `Content.parts` and only emit the suffix that extends the last snapshot.
 */
function nextDelta(currentFull, previous) {
    if (!currentFull)
        return { delta: '', next: previous };
    if (currentFull.length >= previous.length && currentFull.startsWith(previous)) {
        return { delta: currentFull.slice(previous.length), next: currentFull };
    }
    // Rare: reset or regressed snapshot — re-emit the whole string as one chunk.
    return { delta: currentFull, next: currentFull };
}
const MAX_TOOL_ROUNDS = 8;
function toContents(messages) {
    return messages
        .filter((m) => m.text?.trim())
        .map((m) => {
        const role = m.role === 'assistant' ? 'model' : m.role;
        if (role === 'user')
            return createUserContent(m.text.trim());
        return createModelContent(m.text.trim());
    });
}
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
    const raw = await res.text();
    if (!res.ok) {
        return { error: { message: raw || res.statusText, status: res.status } };
    }
    try {
        return { output: JSON.parse(raw) };
    }
    catch {
        return { error: { message: 'Invalid JSON from SQL API' } };
    }
}
async function executeToolCall(call) {
    const name = call.name ?? '';
    const args = call.args ?? {};
    if (name === 'getDatabaseSchema') {
        return { output: { schema: COMPACT_DB_SCHEMA } };
    }
    if (name === 'runSQL') {
        const query = String(args.query ?? '');
        if (!query.trim()) {
            return { error: { message: 'Missing query argument' } };
        }
        return runSqlOnBackend(query);
    }
    return { error: { message: `Unknown tool: ${name}` } };
}
const toolDeclarations = [
    {
        functionDeclarations: [
            {
                name: 'getDatabaseSchema',
                description: 'Return a concise description of Smadex Postgres tables, columns, and how to join them for analytics. Use when you are unsure of column names or relationships.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        hint: { type: Type.STRING, description: 'Optional, ignored' },
                    },
                },
            },
            {
                name: 'runSQL',
                description: 'Execute a single read-only SQL query (SELECT or WITH…SELECT) against the Smadex database. ' +
                    'Respects row limits; use aggregates, WHERE, and LIMIT. Never request DML.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        query: { type: Type.STRING, description: 'PostgreSQL SELECT (one statement).' },
                    },
                    required: ['query'],
                },
            },
        ],
    },
];
export function createCopilotReadable(client, options) {
    const { model, systemInstruction, messages } = options;
    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            const send = (obj) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            };
            const fail = (message) => {
                send({ type: 'error', message });
                send({ type: 'done' });
                try {
                    controller.close();
                }
                catch {
                    /* already closed */
                }
            };
            const thinkingLevel = model.toLowerCase().includes('gemma')
                ? ThinkingLevel.MINIMAL
                : ThinkingLevel.HIGH;
            const baseConfig = {
                systemInstruction,
                temperature: 0.7,
                maxOutputTokens: 8192,
                tools: toolDeclarations,
                toolConfig: {
                    functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
                },
                automaticFunctionCalling: { disable: true },
                thinkingConfig: { thinkingLevel, includeThoughts: true },
            };
            let contents = toContents(messages);
            if (!contents.length) {
                fail('No messages');
                return;
            }
            try {
                for (let step = 0; step < MAX_TOOL_ROUNDS; step += 1) {
                    let lastEmittedMain = '';
                    let lastEmittedThought = '';
                    const stream = await client.models.generateContentStream({
                        model,
                        contents,
                        config: baseConfig,
                    });
                    let lastChunk;
                    // Streaming: the final chunk may be text-only and drop functionCall parts. Keep the
                    // last candidate snapshot that still had tool calls.
                    let lastChunkWithTools;
                    for await (const chunk of stream) {
                        lastChunk = chunk;
                        if (chunk.functionCalls?.length) {
                            lastChunkWithTools = chunk;
                        }
                        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
                        const main = concatTextFromParts(parts, 'main');
                        const { delta: dMain, next: nMain } = nextDelta(main, lastEmittedMain);
                        if (dMain) {
                            send({ type: 'text', content: dMain });
                            lastEmittedMain = nMain;
                        }
                        const th = concatTextFromParts(parts, 'thought');
                        const { delta: dTh, next: nTh } = nextDelta(th, lastEmittedThought);
                        if (dTh) {
                            send({ type: 'thought', content: dTh });
                            lastEmittedThought = nTh;
                        }
                    }
                    if (!lastChunk) {
                        send({ type: 'error', message: 'Empty model response' });
                        break;
                    }
                    const fr = lastChunk.candidates?.[0]?.finishReason;
                    if (fr === FinishReason.MAX_TOKENS) {
                        send({
                            type: 'text',
                            content: '\n\n[Stopped: model output limit. Ask for a shorter answer or a table-only summary.]',
                        });
                    }
                    const toolSnapshot = lastChunkWithTools ?? lastChunk;
                    const calls = toolSnapshot?.functionCalls;
                    if (!calls?.length) {
                        break;
                    }
                    if (step >= MAX_TOOL_ROUNDS - 1) {
                        send({ type: 'error', message: 'Tool round limit reached' });
                        break;
                    }
                    const cLast = lastChunk.candidates?.[0]?.content;
                    const cTool = lastChunkWithTools?.candidates?.[0]?.content;
                    const hasFn = (c) => Boolean(c?.parts?.some((p) => p.functionCall));
                    // Prefer a snapshot that still has functionCall parts; the final stream chunk is often text-only.
                    const modelContent = hasFn(cLast) ? cLast : cTool;
                    if (!modelContent?.parts?.length) {
                        send({ type: 'error', message: 'Model returned function calls without content' });
                        break;
                    }
                    contents = [...contents, modelContent];
                    const responseParts = await Promise.all(calls.map(async (fc, i) => {
                        const result = await executeToolCall(fc);
                        const id = fc.id?.trim() || `call-${i}`;
                        const nm = fc.name || 'runSQL';
                        if ('error' in result && result.error) {
                            return createPartFromFunctionResponse(id, nm, { error: result.error });
                        }
                        if ('output' in result) {
                            return createPartFromFunctionResponse(id, nm, { output: result.output });
                        }
                        return createPartFromFunctionResponse(id, nm, { output: result });
                    }));
                    contents = [...contents, createUserContent(responseParts)];
                }
                send({ type: 'done' });
                controller.close();
            }
            catch (e) {
                const raw = e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
                    ? e.message
                    : e instanceof Error
                        ? e.message
                        : String(e);
                const lower = raw.toLowerCase();
                let message = raw;
                if (lower.includes('not_found') || (lower.includes('404') && lower.includes('not found'))) {
                    message = `${raw}

Hint: “NOT_FOUND” often means the model id is not available for this API key/region. Check \`CHAT_MODEL\` (e.g. \`gemma-4-31b-it\`) in Google AI Studio.`;
                }
                fail(message);
            }
        },
    });
}
//# sourceMappingURL=agentLoop.js.map