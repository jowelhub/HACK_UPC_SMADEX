import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import { DOMAIN_SYSTEM_PROMPT } from './prompt.js'

const app = new Hono()

app.use('/*', cors({ origin: '*' }))

app.get('/health', (c) => c.json({ status: 'ok' }))


function getBackendUrl() {
  return (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
}

async function runSqlOnBackend(sql: string) {
  const url = `${getBackendUrl()}/api/agent/sql`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.AGENT_SQL_TOKEN?.trim()
  if (token) headers['X-Agent-Token'] = token
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) })
  const text = await res.text()
  if (!res.ok) {
    return { error: `HTTP ${res.status}: ${text || res.statusText}` } as const
  }
  try {
    return JSON.parse(text) as { columns: string[]; row_count: number; rows: Record<string, unknown>[] }
  } catch {
    return { error: 'Invalid JSON from SQL API' } as const
  }
}

const buildTools = () => ({
  query_postgres: tool({
    description:
      'Run a read-only SQL query (SELECT or WITH … SELECT) against the Smadex PostgreSQL database. ' +
      'Use explicit column lists, JOINs on campaign_id and creative_id, and filters. Max ~3000 rows; prefer aggregates.',
    inputSchema: z.object({
      sql: z
        .string()
        .describe('Single PostgreSQL SELECT query (no DML, no multiple statements).'),
    }),
    execute: async ({ sql }) => {
      return runSqlOnBackend(sql)
    },
  }),
})

app.post('/api/agent/chat', async (c) => {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    return c.json(
      { error: 'Set GOOGLE_GENERATIVE_AI_API_KEY to enable the analytics agent (Google AI / Gemini API).' },
      503,
    )
  }
  const body = await c.req.json<{
    messages: UIMessage[]
    id?: string
  }>()
  const messages = body?.messages
  if (!Array.isArray(messages) || !messages.length) {
    return c.json({ error: 'Missing messages' }, 400)
  }
  const tools = buildTools()
  const modelId = (process.env.CHAT_MODEL || 'gemma-4-26b-a4b-it').trim()
  const gKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? ''
  const gai = createGoogleGenerativeAI({ apiKey: gKey })
  const result = streamText({
    model: gai(modelId),
    system: DOMAIN_SYSTEM_PROMPT,
    messages: await convertToModelMessages(
      messages.map((m) => {
        const { id, ...rest } = m
        return rest
      }) as UIMessage[],
      { tools },
    ),
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(20),
  })
  return result.toUIMessageStreamResponse()
})

const port = Number(process.env.PORT || 3001)
console.info(`[ai-agent] model=${(process.env.CHAT_MODEL || 'gemma-4-26b-a4b-it').trim()} port=${port}`)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
