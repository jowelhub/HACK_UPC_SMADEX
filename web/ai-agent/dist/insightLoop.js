import { createUserContent, FinishReason, } from '@google/genai';
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
function nextDelta(currentFull, previous) {
    if (!currentFull)
        return { delta: '', next: previous };
    if (currentFull.length >= previous.length && currentFull.startsWith(previous)) {
        return { delta: currentFull.slice(previous.length), next: currentFull };
    }
    return { delta: currentFull, next: currentFull };
}
export const PERFORMANCE_INSIGHT_SYSTEM = `You are a marketing analytics assistant for in-app advertising dashboards (Smadex-style reporting).
The user message contains aggregated KPIs for one scope: an advertiser, a campaign, or a single creative, plus optional breakdown or daily-series hints.

Write ONE short paragraph (about 3–6 sentences) of insight in plain, natural language for a marketer or account manager.
Reference the numbers when useful (spend, impressions, CTR, CPA, ROAS, CVR, viewability, scale) but do not invent metrics that are not in the message.
Do not output SQL, code, or markdown headings. Prefer continuous prose over bullet lists.
If you see clear risks (e.g. CPA high relative to scale, ROAS below 1, very low CTR) or strengths, say so briefly and practically.`;
export function createInsightReadable(client, options) {
    const { model, context } = options;
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
            const trimmed = context?.trim();
            if (!trimmed) {
                fail('Missing context');
                return;
            }
            const config = {
                systemInstruction: PERFORMANCE_INSIGHT_SYSTEM,
                temperature: 0.65,
                maxOutputTokens: 1024,
            };
            try {
                const stream = await client.models.generateContentStream({
                    model,
                    contents: [createUserContent(trimmed)],
                    config,
                });
                let lastEmittedMain = '';
                let lastEmittedThought = '';
                let lastChunk;
                for await (const chunk of stream) {
                    lastChunk = chunk;
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
                    fail('Empty model response');
                    return;
                }
                const fr = lastChunk.candidates?.[0]?.finishReason;
                if (fr === FinishReason.MAX_TOKENS) {
                    send({ type: 'text', content: ' [Output truncated.]' });
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
                fail(raw);
            }
        },
    });
}
//# sourceMappingURL=insightLoop.js.map