import {
  type Content,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GoogleGenAI,
  type Part,
  createPartFromFunctionResponse,
  createUserContent,
  createModelContent,
  Type,
  FunctionCallingConfigMode,
  ThinkingLevel,
  FinishReason,
} from '@google/genai'
import { COMPACT_DB_SCHEMA } from './schemaText.js'

function concatTextFromParts(
  parts: Part[] | undefined,
  mode: 'main' | 'thought',
): string {
  if (!parts?.length) return ''
  let s = ''
  for (const p of parts) {
    if (typeof p.text !== 'string' || p.text.length === 0) continue
    if (mode === 'thought' ? p.thought !== true : p.thought === true) continue
    s += p.text
  }
  return s
}

/**
 * Per-chunk streaming can mix functionCall / other parts with text. Relying on
 * `chunk.text` is incomplete when those parts exist; we derive text from
 * `Content.parts` and only emit the suffix that extends the last snapshot.
 */
function nextDelta(
  currentFull: string,
  previous: string,
): { delta: string; next: string } {
  if (!currentFull) return { delta: '', next: previous }
  if (currentFull.length >= previous.length && currentFull.startsWith(previous)) {
    return { delta: currentFull.slice(previous.length), next: currentFull }
  }
  // Rare: reset or regressed snapshot — re-emit the whole string as one chunk.
  return { delta: currentFull, next: currentFull }
}

export type ClientChatMessage = { role: 'user' | 'model' | 'assistant'; text: string }

const MAX_TOOL_ROUNDS = 8

function toContents(messages: ClientChatMessage[]): Content[] {
  return messages
    .filter((m) => m.text?.trim())
    .map((m) => {
      const role = m.role === 'assistant' ? 'model' : m.role
      if (role === 'user') return createUserContent(m.text.trim())
      return createModelContent(m.text.trim())
    })
}

function getBackendUrl() {
  return (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
}

async function runSqlOnBackend(sql: string) {
  const url = `${getBackendUrl()}/api/agent/sql`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.AGENT_SQL_TOKEN?.trim()
  if (token) headers['X-Agent-Token'] = token
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) })
  const raw = await res.text()
  if (!res.ok) {
    return { error: { message: raw || res.statusText, status: res.status } }
  }
  try {
    return { output: JSON.parse(raw) as Record<string, unknown> }
  } catch {
    return { error: { message: 'Invalid JSON from SQL API' } }
  }
}

async function executeToolCall(call: FunctionCall): Promise<Record<string, unknown>> {
  const name = call.name ?? ''
  const args = call.args ?? {}
  if (name === 'getDatabaseSchema') {
    return { output: { schema: COMPACT_DB_SCHEMA } }
  }
  if (name === 'runSQL') {
    const query = String((args as { query?: string }).query ?? '')
    if (!query.trim()) {
      return { error: { message: 'Missing query argument' } }
    }
    return runSqlOnBackend(query)
  }
  return { error: { message: `Unknown tool: ${name}` } }
}

/** Set ENABLE_CODE_EXECUTION=false to disable Google code execution (avoids 404s on some Gemma + tool combos). */
function isCodeExecutionEnabled() {
  const v = process.env.ENABLE_CODE_EXECUTION?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return true
}

function buildToolDeclarations(
  withCodeExecution: boolean,
): NonNullable<GenerateContentConfig['tools']> {
  const functionBlock = {
    functionDeclarations: [
      {
        name: 'getDatabaseSchema',
        description:
          'Return a concise description of Smadex Postgres tables, columns, and how to join them for analytics. Use when you are unsure of column names or relationships.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            hint: { type: Type.STRING, description: 'Optional, ignored' },
          },
        },
      },
      {
        name: 'runSQL',
        description:
          'Execute a single read-only SQL query (SELECT or WITH…SELECT) against the Smadex database. ' +
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
  }
  const out = withCodeExecution
    ? ([{ codeExecution: {} as Record<string, never> }, functionBlock] as const)
    : [functionBlock]
  return out as unknown as NonNullable<GenerateContentConfig['tools']>
}

export function createCopilotReadable(
  client: GoogleGenAI,
  options: {
    model: string
    systemInstruction: string
    messages: ClientChatMessage[]
  },
) {
  const { model, systemInstruction, messages } = options
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

      const useCodeExec = isCodeExecutionEnabled()
      const baseConfig: GenerateContentConfig = {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 8192,
        tools: buildToolDeclarations(useCodeExec),
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
          // Required when mixing codeExecution with function declarations; omit for SQL-only.
          ...(useCodeExec ? { includeServerSideToolInvocations: true } : {}),
        },
        automaticFunctionCalling: { disable: true },
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true },
      }

      let contents: Content[] = toContents(messages)
      if (!contents.length) {
        fail('No messages')
        return
      }

      try {
        for (let step = 0; step < MAX_TOOL_ROUNDS; step += 1) {
        let lastEmittedMain = ''
        let lastEmittedThought = ''
        let lastExecutableJson = ''
        const stream = await client.models.generateContentStream({
          model,
          contents,
          config: baseConfig,
        })

        let lastChunk: GenerateContentResponse | undefined

        for await (const chunk of stream) {
          lastChunk = chunk
          const parts = chunk.candidates?.[0]?.content?.parts ?? []
          const main = concatTextFromParts(parts, 'main')
          const { delta: dMain, next: nMain } = nextDelta(main, lastEmittedMain)
          if (dMain) {
            send({ type: 'text', content: dMain })
            lastEmittedMain = nMain
          }
          const th = concatTextFromParts(parts, 'thought')
          const { delta: dTh, next: nTh } = nextDelta(th, lastEmittedThought)
          if (dTh) {
            send({ type: 'thought', content: dTh })
            lastEmittedThought = nTh
          }
          for (const p of parts) {
            if (p.executableCode) {
              const j = JSON.stringify(p.executableCode)
              if (j !== lastExecutableJson) {
                lastExecutableJson = j
                send({ type: 'executableCode', code: p.executableCode })
              }
            }
            if (p.codeExecutionResult) {
              send({ type: 'codeExecutionResult', result: p.codeExecutionResult })
            }
            const idata = p.inlineData
            if (idata && typeof idata.mimeType === 'string' && idata.mimeType.startsWith('image/') && idata.data) {
              send({ type: 'image', mimeType: idata.mimeType, data: String(idata.data) })
            }
          }
        }

        if (!lastChunk) {
          send({ type: 'error', message: 'Empty model response' })
          break
        }

        const fr = lastChunk.candidates?.[0]?.finishReason
        if (fr === FinishReason.MAX_TOKENS) {
          send({
            type: 'text',
            content:
              '\n\n[Stopped: model output limit. Ask for a shorter answer or a table-only summary.]',
          })
        }

        const calls = lastChunk.functionCalls
        if (!calls?.length) {
          break
        }

        if (step >= MAX_TOOL_ROUNDS - 1) {
          send({ type: 'error', message: 'Tool round limit reached' })
          break
        }

        const c0 = lastChunk.candidates?.[0]
        const modelContent = c0?.content
        if (!modelContent?.parts?.length) {
          send({ type: 'error', message: 'Model returned function calls without content' })
          break
        }

        contents = [...contents, modelContent]
        const responseParts: Part[] = await Promise.all(
          calls.map(async (fc, i) => {
            const result = await executeToolCall(fc)
            const id = fc.id?.trim() || `call-${i}`
            const nm = fc.name || 'runSQL'
            if ('error' in result && result.error) {
              return createPartFromFunctionResponse(id, nm, { error: result.error } as Record<string, unknown>)
            }
            if ('output' in result) {
              return createPartFromFunctionResponse(id, nm, { output: result.output } as Record<string, unknown>)
            }
            return createPartFromFunctionResponse(id, nm, { output: result } as Record<string, unknown>)
          }),
        )
        contents = [...contents, createUserContent(responseParts)]
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
        const lower = raw.toLowerCase()
        let message = raw
        if (lower.includes('not_found') || (lower.includes('404') && lower.includes('not found'))) {
          message = `${raw}

Hint: “NOT_FOUND” is often the Google API (model or code-execution not available in this key/region) or a bad model id. For a stable copilot, use \`CHAT_MODEL=gemini-2.0-flash\` or set \`ENABLE_CODE_EXECUTION=false\` in env (runSQL + schema only, no Python sandbox).`
        }
        fail(message)
      }
    },
  })
}
