import {
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GoogleGenAI,
  type Part,
  createUserContent,
} from '@google/genai'

function concatTextFromParts(parts: Part[] | undefined, mode: 'main' | 'thought'): string {
  if (!parts?.length) return ''
  let s = ''
  for (const p of parts) {
    if (typeof p.text !== 'string' || p.text.length === 0) continue
    if (mode === 'thought' ? p.thought !== true : p.thought === true) continue
    s += p.text
  }
  return s
}

/** Removes legacy client suffix and occasional model echoes of the same phrase. */
function stripInsightArtifacts(s: string): string {
  return s.replace(/\s*\[Output truncated\.\]\s*/gi, ' ')
}

function nextDelta(
  currentFull: string,
  previous: string,
): { delta: string; next: string } {
  if (!currentFull) return { delta: '', next: previous }
  if (currentFull.length >= previous.length && currentFull.startsWith(previous)) {
    return { delta: currentFull.slice(previous.length), next: currentFull }
  }
  return { delta: currentFull, next: currentFull }
}

export const PERFORMANCE_INSIGHT_SYSTEM = `You are a performance marketing expert providing strategic analysis for a single creative.
The user message contains delivery metrics, daily trends, and risk model signals (SHAP factors and hazard scores).

STRICT DIRECTIVES:
1. Provide a clear, authoritative action bias: Scale, Hold, Refresh, or Pause.
2. Explain the "why" using the provided risk drivers (e.g., "Hazard levels have spiked 2x vs peak").
3. Reference specific KPIs (ROAS, CPA, CTR) to ground your advice.
4. Aim for 4-6 sentences of professional, high-density analysis.
5. Do not use markdown headings or bullet points; use a single, powerful paragraph.
6. Never mention "Output truncated" or meta-commentary.`

/** Fast path: all facts are in the user message — no tools, short answer. */
export const CAMPAIGN_CREATIVES_INSIGHT_SYSTEM = `You help a performance marketer with fast, practical insight. The user message already contains every number you need.

Rules:
• Write ONE tight paragraph (3–5 sentences). Plain language only — no markdown headings, bullets, SQL, or APIs.
• If the scope includes multiple creatives, focus on comparison: who is stronger/weaker on delivery metrics, how seeded status aligns (or not), and any PCA proximity/spread hints when present.
• If the scope is a single creative, combine delivery metrics, daily series, Creative Explainability, and Post-Launch Copilot blocks when present.
• For a single creative, do more than restate KPIs: give a clear action bias such as scale, hold, refresh, or pause, and explain why.
• Treat very low health scores, high hazard recommendations, sharp drops vs peak, or sub-50% survival runway as strong risk evidence.
• Mention 1-2 concrete drivers from SHAP or hazard inputs when available, but do not invent causal claims beyond the provided numbers.
• Use the QUICK CONTRASTS and spend_rank lines — do not invent IDs or metrics.
• If PCA is missing, still compare delivery + seeded labels only.
• Never write the phrase "Output truncated" or similar notes about token limits — end on substance only.`

export type InsightRequestMode = 'default' | 'campaign_creatives'

export function createInsightReadable(
  client: GoogleGenAI,
  options: { model: string; context: string; mode?: InsightRequestMode },
) {
  const { model, context, mode = 'default' } = options
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      const fail = (message: string) => {
        send({ type: 'error', message })
        send({ type: 'done' })
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      const trimmed = context?.trim()
      if (!trimmed) {
        fail('Missing context')
        return
      }

      const fast = mode === 'campaign_creatives'
      const config: GenerateContentConfig = {
        systemInstruction: fast ? CAMPAIGN_CREATIVES_INSIGHT_SYSTEM : PERFORMANCE_INSIGHT_SYSTEM,
        temperature: fast ? 0.35 : 0.65,
        /** Fast mode keeps latency low; default mode keeps a generous cap. */
        maxOutputTokens: fast ? 384 : 4096,
      }

      try {
        const stream = await client.models.generateContentStream({
          model,
          contents: [createUserContent(trimmed)],
          config,
        })

        let lastEmittedMain = ''
        let lastEmittedThought = ''
        let lastChunk: GenerateContentResponse | undefined

        for await (const chunk of stream) {
          lastChunk = chunk
          const parts = chunk.candidates?.[0]?.content?.parts ?? []
          const main = concatTextFromParts(parts, 'main') || (typeof chunk.text === 'string' ? chunk.text : '')
          const { delta: dMain, next: nMain } = nextDelta(main, lastEmittedMain)
          if (dMain) {
            const cleaned = stripInsightArtifacts(dMain)
            if (cleaned) send({ type: 'text', content: cleaned })
            lastEmittedMain = nMain
          }
          const th = concatTextFromParts(parts, 'thought')
          const { delta: dTh, next: nTh } = nextDelta(th, lastEmittedThought)
          if (dTh) {
            send({ type: 'thought', content: dTh })
            lastEmittedThought = nTh
          }
        }

        if (!lastChunk) {
          fail('Empty model response')
          return
        }

        if (!lastEmittedMain) {
          const fallback = stripInsightArtifacts(typeof lastChunk.text === 'string' ? lastChunk.text : '').trim()
          if (fallback) send({ type: 'text', content: fallback })
        }

        send({ type: 'done' })
        controller.close()
      } catch (e) {
        const raw =
          e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
            ? (e as { message: string }).message
            : e instanceof Error
              ? e.message
              : String(e)
        fail(raw)
      }
    },
  })
}
