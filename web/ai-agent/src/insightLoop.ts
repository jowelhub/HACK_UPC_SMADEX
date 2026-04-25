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

export const PERFORMANCE_INSIGHT_SYSTEM = `You are a marketing analytics assistant for in-app advertising dashboards (Smadex-style reporting).
The user message contains aggregated KPIs for one scope: an advertiser, a campaign, or a single creative, plus optional breakdown or daily-series hints.

When the message includes a "CREATIVES IN THIS CAMPAIGN" and/or "PCA" block: those lines are data-backed. Use the per-creative status lines and the printed PC1/PC2 coordinates (and the "Closest pair" line if present) to reason about the *spread* of creatives in standardized numeric feature space—not about pixel similarity of images.
  • If two or more creatives sit very close in PC1–PC2, they may be partially redundant in messaging or targeting levers; consolidating tests or rotating winners can be reasonable to mention as a *hypothesis*, not a certainty.
  • If points are widely dispersed, call that out as diverse creative coverage or room to test more angles; you may add a light curiosity or follow-up idea grounded only in the numbers given.
  • If PCA is unavailable or sparse, say so briefly and lean on KPIs and creative status lines only.

Otherwise (no PCA block): focus on KPIs and time series as before.

Write ONE short paragraph (about 4–7 sentences) of insight in plain, natural language for a marketer or account manager.
Reference the numbers when useful (spend, impressions, CTR, CPA, ROAS, CVR, viewability, scale, PCA distances) but do not invent metrics or coordinates that are not in the message.
Do not output SQL, code, or markdown headings. Prefer continuous prose over bullet lists.
If you see clear risks (e.g. CPA high relative to scale, ROAS below 1, very low CTR) or strengths, say so briefly and practically.
Never write "Output truncated" or meta-notes about response limits — finish on actionable substance only.`

/** Fast path: all facts are in the user message — no tools, short answer. */
export const CAMPAIGN_CREATIVES_INSIGHT_SYSTEM = `You help a performance marketer compare creatives inside ONE campaign. The user message already contains every number you need: per-creative delivery (spend, CTR, CPA, ROAS, conversions), seeded fatigue/status labels, PCA coordinates, closest-pair distance, and quick contrasts.

Rules:
• Write ONE tight paragraph (3–5 sentences). Plain language only — no markdown headings, bullets, SQL, or APIs.
• Focus ONLY on comparing the creatives: who is stronger or weaker on delivery metrics in the window, who is fatigued vs stable and whether that lines up with delivery, which IDs are unusually close in PCA space (possible redundancy) vs well spread (diversity), and the most interesting contrast between two creatives if obvious.
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
        /** Generous cap avoids MAX_TOKENS mid-sentence; Docker rebuild picks this up. */
        maxOutputTokens: 4096,
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
          const main = concatTextFromParts(parts, 'main')
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
