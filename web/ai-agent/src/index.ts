import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenAI } from '@google/genai'
import { createCopilotReadable, type ClientChatMessage } from './agentLoop.js'
import { DOMAIN_SYSTEM_PROMPT } from './prompt.js'

const app = new Hono()
app.use('/*', cors({ origin: '*' }))

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/api/agent/chat', async (c) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!apiKey) {
    return c.json({ error: 'Set GOOGLE_GENERATIVE_AI_API_KEY' }, 503)
  }
  const body = await c.req.json<{
    messages: ClientChatMessage[]
  }>()
  if (!body?.messages || !Array.isArray(body.messages)) {
    return c.json({ error: 'Expected { messages: { role, text }[] }' }, 400)
  }

  const model = (process.env.CHAT_MODEL || 'gemma-4-31b-it').trim()
  const client = new GoogleGenAI({ apiKey })
  const stream = createCopilotReadable(client, {
    model,
    systemInstruction: DOMAIN_SYSTEM_PROMPT,
    messages: body.messages,
  })

  return c.newResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})

const port = Number(process.env.PORT || 3001)
const ce = process.env.ENABLE_CODE_EXECUTION?.trim().toLowerCase() ?? ''
const codeOn = !['0', 'false', 'no', 'off'].includes(ce)
console.info(
  `[ai-agent] @google/genai model=${(process.env.CHAT_MODEL || 'gemma-4-31b-it').trim()} ` +
    `port=${port} codeExecution=${codeOn ? 'on' : 'off'}`,
)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
