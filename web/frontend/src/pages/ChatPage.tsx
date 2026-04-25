import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'

type SqlQueryOutput = {
  row_count?: number
  error?: string
  columns?: string[]
  rows?: unknown[]
}

function parseSqlOutput(output: unknown): { kind: 'rows'; n: number } | { kind: 'error'; message: string } {
  if (!output || typeof output !== 'object') {
    return { kind: 'rows', n: 0 }
  }
  const o = output as SqlQueryOutput
  if (o.error) {
    return { kind: 'error', message: String(o.error) }
  }
  if (typeof o.row_count === 'number') {
    return { kind: 'rows', n: o.row_count }
  }
  if (Array.isArray(o.rows)) {
    return { kind: 'rows', n: o.rows.length }
  }
  return { kind: 'rows', n: 0 }
}

/** Hidden UI plumbing (step boundaries, etc.) */
function isBlankPartType(type: string): boolean {
  return type === 'step-start'
}

function renderPart(
  part: UIMessage['parts'][number],
  role: UIMessage['role'],
): ReactNode {
  if (isBlankPartType(part.type)) {
    return null
  }

  if (part.type === 'text') {
    return <p className="whitespace-pre-wrap text-stone-800 leading-relaxed">{part.text}</p>
  }

  if (part.type === 'reasoning' && (role === 'assistant' || role === 'user')) {
    return (
      <details className="mb-2 rounded border border-stone-200/90 bg-stone-50/90 text-stone-600 open:bg-stone-50">
        <summary className="cursor-pointer list-none px-2.5 py-2 text-xs font-medium text-stone-500 marker:content-none [&::-webkit-details-marker]:hidden">
          Thinking
        </summary>
        <p className="border-t border-stone-200/80 px-2.5 py-2 text-xs leading-relaxed text-stone-600 whitespace-pre-wrap">
          {part.text}
        </p>
      </details>
    )
  }

  if (part.type === 'dynamic-tool') {
    if (part.toolName === 'query_postgres') {
      if (part.state === 'input-streaming' || part.state === 'input-available') {
        return <p className="text-xs text-stone-500">Querying the database…</p>
      }
      if (part.state === 'output-available' && part.output !== undefined) {
        const p = parseSqlOutput(part.output)
        if (p.kind === 'error') {
          return <p className="text-sm text-rose-700">Couldn’t run query: {p.message}</p>
        }
        return <p className="text-xs text-stone-500">Looked up data ({p.n} rows).</p>
      }
      if (part.state === 'output-error' && part.errorText) {
        return <p className="text-sm text-rose-700">{part.errorText}</p>
      }
    }
    return null
  }

  if (part.type.startsWith('tool-')) {
    const name = part.type.replace(/^tool-/, '')
    if (name === 'query_postgres') {
      const p = part as {
        state?: string
        output?: unknown
        errorText?: string
      }
      if (p.state === 'input-streaming' || p.state === 'input-available') {
        return <p className="text-xs text-stone-500">Querying the database…</p>
      }
      if (p.state === 'output-available' && p.output !== undefined) {
        const out = parseSqlOutput(p.output)
        if (out.kind === 'error') {
          return <p className="text-sm text-rose-700">Couldn’t run query: {out.message}</p>
        }
        return <p className="text-xs text-stone-500">Looked up data ({out.n} rows).</p>
      }
      if (p.state === 'output-error' && p.errorText) {
        return <p className="text-sm text-rose-700">{p.errorText}</p>
      }
    }
    return null
  }

  if (part.type === 'file' || part.type === 'source-url' || part.type === 'source-document' || part.type.startsWith('data-')) {
    return null
  }

  return null
}

export function ChatPage() {
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement | null>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent/chat',
      }),
    [],
  )

  const { messages, sendMessage, status, error, stop, clearError } = useChat({ transport })

  const busy = status === 'submitted' || status === 'streaming'

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const t = text.trim()
      if (!t || busy) return
      setText('')
      clearError()
      await sendMessage({ text: t })
    },
    [text, busy, sendMessage, clearError],
  )

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-4 sm:h-[calc(100vh-6rem)]">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Analytics copilot</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Ask about performance, fatigue, and creatives in plain language. The copilot uses read-only SQL on the
          Smadex PostgreSQL data (set <code className="rounded bg-stone-100 px-1">GOOGLE_GENERATIVE_AI_API_KEY</code>{' '}
          in <code className="rounded bg-stone-100 px-1">web/.env</code> for Docker).
        </p>
      </div>

      {error ? (
        <div className="surface-panel border-rose-200 bg-rose-50 text-sm text-rose-900">
          {String(error?.message || error)}
          <button type="button" className="btn-secondary ml-2 mt-1" onClick={() => clearError()}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-stone-200 bg-stone-50/60 p-3 sm:p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-stone-500">
            Try: “Top 10 creatives by CTR in the last 30 days” or “Which country has the worst ROAS for campaign
            20001?”
          </p>
        ) : null}
        <ul className="space-y-3">
          {messages.map((m) => {
            const isUser = m.role === 'user'
            return (
              <li
                key={m.id}
                className={
                  isUser
                    ? 'ml-auto max-w-[min(100%,40rem)] rounded-md border border-brand-100 bg-brand-50/40 p-3 shadow-sm'
                    : 'mr-auto max-w-[min(100%,48rem)] rounded-md border border-stone-200/80 bg-white p-3 shadow-sm'
                }
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {isUser ? 'You' : m.role}
                </div>
                <div className="mt-2 space-y-2">
                  {m.parts.map((part, i) => {
                    const el = renderPart(part, m.role)
                    return el ? <div key={i}>{el}</div> : null
                  })}
                </div>
              </li>
            )
          })}
        </ul>
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="shrink-0 space-y-2">
        <textarea
          className="input w-full min-h-[88px] resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything about the Smadex dataset in Postgres…"
          disabled={busy}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>
            {busy ? 'Running…' : 'Send'}
          </button>
          {busy ? (
            <button type="button" className="btn-secondary" onClick={() => void stop()}>
              Stop
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
