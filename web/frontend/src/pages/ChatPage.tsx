import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatMarkdown } from '../components/ChatMarkdown'

type Row = {
  id: string
  role: 'user' | 'model'
  text: string
  thought?: string
}

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

function id() {
  return crypto.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseSseDataLines(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const block of parts) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      try {
        events.push(JSON.parse(json) as StreamEvent)
      } catch {
        /* skip */
      }
    }
  }
  return { events, rest }
}

export function ChatPage() {
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rows, pending, busy])

  const send = useCallback(async () => {
    const t = input.trim()
    if (!t || busy) return
    setInput('')
    setError(null)
    const u: Row = { id: id(), role: 'user', text: t }
    const nextRows: Row[] = [...rows, u]
    setRows(nextRows)
    setBusy(true)

    const pid = id()
    let accText = ''
    let accThought = ''
    const applyPending = () => {
      setPending({
        id: pid,
        role: 'model',
        text: accText,
        thought: accThought,
      })
    }
    setPending({ id: pid, role: 'model', text: '', thought: '' })

    const apiMessages = nextRows.map((m) => ({
      role: m.role,
      text: m.text,
    }))

    let res: Response
    try {
      res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })
    } catch (e) {
      setError(String(e))
      setPending(null)
      setBusy(false)
      return
    }
    if (!res.ok) {
      setError(await res.text().catch(() => res.statusText))
      setPending(null)
      setBusy(false)
      return
    }
    if (!res.body) {
      setError('No response body')
      setPending(null)
      setBusy(false)
      return
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''

    const applyEvent = (ev: StreamEvent) => {
      if (ev.type === 'text') {
        accText += ev.content
      } else if (ev.type === 'thought') {
        accThought += ev.content
      } else if (ev.type === 'error') {
        setError(ev.message)
      }
    }

    const processEvents = (events: StreamEvent[]) => {
      for (const ev of events) {
        applyEvent(ev)
      }
      applyPending()
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const { events, rest } = parseSseDataLines(buf)
        buf = rest
        processEvents(events)
      }
      if (buf.trim()) {
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue
          const j = line.slice(5).trim()
          if (!j) continue
          try {
            applyEvent(JSON.parse(j) as StreamEvent)
          } catch {
            /* ignore */
          }
        }
        applyPending()
      }
    } finally {
      if (accText || accThought) {
        setRows((r) => [
          ...r,
          {
            id: pid,
            role: 'model',
            text: accText,
            thought: accThought || undefined,
          },
        ])
      }
      setPending(null)
      setBusy(false)
    }
  }, [busy, input, rows])

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-4 sm:h-[calc(100vh-6rem)]">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Analytics copilot</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Powered by <strong>Google @google/genai</strong> (Gemma 4). Tools: <code className="text-xs">runSQL</code> +{' '}
          <code className="text-xs">getDatabaseSchema</code> only (read-only SQL on your Postgres). Set{' '}
          <code className="rounded bg-stone-100 px-1">GOOGLE_GENERATIVE_AI_API_KEY</code> in <code className="rounded bg-stone-100 px-1">web/.env</code> for
          Docker.
        </p>
      </div>

      {error ? (
        <div className="surface-panel border-rose-200 bg-rose-50 text-sm text-rose-900">
          {error}
          <button type="button" className="btn-secondary ml-2" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-stone-200 bg-stone-50/60 p-3 sm:p-4">
        {rows.length === 0 && !pending ? (
          <p className="text-sm text-stone-500">Try: “Top 10 creatives by CTR in the last 30 days”</p>
        ) : null}
        <ul className="space-y-3">
          {rows.map((m) => (
            <li
              key={m.id}
              className={
                m.role === 'user'
                  ? 'ml-auto min-w-0 max-w-[min(100%,40rem)] rounded-md border border-brand-100 bg-brand-50/40 p-3 shadow-sm'
                  : 'mr-auto min-w-0 max-w-[min(100%,48rem)] rounded-md border border-stone-200/80 bg-white p-3 shadow-sm'
              }
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              {m.thought && m.text ? (
                <details className="mt-1 rounded border border-stone-200 bg-stone-50/90 text-stone-600 open:bg-stone-50">
                  <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">Thinking</summary>
                  <div className="border-t border-stone-200/80 px-2 py-2">
                    <ChatMarkdown compact>{m.thought}</ChatMarkdown>
                  </div>
                </details>
              ) : null}
              {m.text || m.thought ? (
                <div className="mt-2 min-w-0 max-w-full">
                  <ChatMarkdown>{m.text || m.thought || ''}</ChatMarkdown>
                </div>
              ) : null}
            </li>
          ))}
          {pending ? (
            <li className="mr-auto min-w-0 max-w-[min(100%,48rem)] rounded-md border border-dashed border-stone-300 bg-white/90 p-3">
              <div className="text-[11px] font-semibold uppercase text-stone-400">Assistant</div>
              {pending.thought && pending.text ? (
                <details open className="mt-1 rounded border border-amber-100/80 bg-amber-50/50 text-amber-950">
                  <summary className="cursor-pointer px-2 py-1 text-xs">Thinking</summary>
                  <div className="border-t border-amber-100/80 px-2 py-2">
                    <ChatMarkdown compact>{pending.thought}</ChatMarkdown>
                  </div>
                </details>
              ) : null}
              {pending.text || pending.thought ? (
                <div className="mt-2 min-w-0 max-w-full">
                  <ChatMarkdown>{pending.text || pending.thought || ''}</ChatMarkdown>
                </div>
              ) : null}
              {busy && !pending.text && !pending.thought ? <p className="text-sm text-stone-500">…</p> : null}
            </li>
          ) : null}
        </ul>
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="shrink-0 space-y-2"
      >
        <textarea
          className="input w-full min-h-[88px] resize-y"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the Smadex data…"
          disabled={busy}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
