import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
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

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (busy || !input.trim()) return
      e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-3xl flex-col">
      <header className="shrink-0 border-b border-stone-200/50 pb-4 sm:pb-5">
        <h1 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
          Natural language to SQL copilot
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-500 sm:text-sm sm:leading-normal">
          Powered by <span className="text-stone-600">Google @google/genai</span> (Gemma 4). Function calling:{' '}
          <code className="rounded-md bg-stone-100/90 px-1.5 py-0.5 font-mono text-[0.7rem] text-stone-700 sm:text-xs">
            runSQL
          </code>
          <span className="text-stone-400"> + </span>
          <code className="rounded-md bg-stone-100/90 px-1.5 py-0.5 font-mono text-[0.7rem] text-stone-700 sm:text-xs">
            getDatabaseSchema
          </code>
        </p>
      </header>

      {error ? (
        <div className="mt-3 shrink-0 rounded-lg border border-rose-200/80 bg-rose-50/90 px-3 py-2.5 text-sm text-rose-900">
          {error}
          <button type="button" className="btn-secondary ml-2 align-middle" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Thread: only this region scrolls */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          className="h-full min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pt-2 pl-0 sm:pt-3"
          role="log"
          aria-live="polite"
        >
          <div className="space-y-5 pb-3 pl-0 pr-3 pt-1 sm:space-y-6 sm:pb-4 sm:pr-4">
            {rows.length === 0 && !pending ? (
              <p className="rounded-2xl bg-stone-100/60 px-4 py-3 text-sm text-stone-500 sm:px-5">
                <span className="text-stone-400">Try:</span> “Top 10 creatives by CTR in the last 30 days”
              </p>
            ) : null}
            {rows.map((m) => (
              <div key={m.id} className="min-w-0">
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[min(100%,85%)] min-w-0">
                      <div className="mb-1.5 pl-1 text-right text-[10px] font-medium uppercase tracking-wider text-stone-400">
                        You
                      </div>
                      <div className="rounded-2xl rounded-tr-md border border-brand-200/30 bg-gradient-to-b from-brand-50 to-brand-50/80 px-4 py-2.5 text-sm text-stone-800 shadow-sm sm:px-4 sm:py-3">
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 pl-0 sm:pl-0.5">
                    <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">Assistant</div>
                    {m.thought ? (
                      <details
                        className="mb-2 rounded-xl border border-stone-200/60 bg-stone-50/80 open:bg-stone-50/90"
                        open={!m.text}
                      >
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-stone-600 sm:py-2.5">
                          Thinking
                        </summary>
                        <div className="border-t border-stone-200/50 px-3 py-2.5 sm:px-3.5">
                          <ChatMarkdown compact>{m.thought}</ChatMarkdown>
                        </div>
                      </details>
                    ) : null}
                    {m.text ? (
                      <div className="min-w-0 break-words text-stone-800">
                        <ChatMarkdown>{m.text}</ChatMarkdown>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {pending ? (
              <div className="min-w-0 pl-0.5 sm:pl-0.5">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">Assistant</div>
                {pending.thought ? (
                  <details open className="mb-2 rounded-xl border border-amber-200/40 bg-amber-50/30">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-amber-900/80">
                      Thinking
                    </summary>
                    <div className="border-t border-amber-200/20 px-3 py-2.5">
                      <ChatMarkdown compact>{pending.thought}</ChatMarkdown>
                    </div>
                  </details>
                ) : null}
                {pending.text ? (
                  <div className="min-w-0 text-stone-800">
                    <ChatMarkdown>{pending.text}</ChatMarkdown>
                  </div>
                ) : null}
                {busy && !pending.text && !pending.thought ? (
                  <p className="text-sm text-stone-500">…</p>
                ) : null}
              </div>
            ) : null}
            <div ref={bottom} className="h-1 shrink-0" />
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="shrink-0 border-t border-stone-200/50 bg-canvas/95 pt-4 pb-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] sm:pt-5 sm:pb-3"
      >
        <div className="rounded-2xl border border-stone-200/60 bg-white p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-3">
          <div className="grid w-full min-w-0 grid-cols-1 items-end gap-2.5 sm:grid-cols-[1fr_auto] sm:gap-3">
            <textarea
              className="input min-h-[2.75rem] w-full min-w-0 max-h-40 resize-y rounded-xl border-stone-200/90 bg-stone-50/50 px-3.5 py-1.5 text-sm leading-normal focus:border-brand-200/80 focus:bg-white focus:ring-2 focus:ring-brand/15"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message the copilot…"
              disabled={busy}
              rows={2}
            />
            <div className="flex justify-end sm:pt-0.5">
              <button
                type="submit"
                className="btn-primary min-w-[5.25rem] rounded-xl px-5 py-2.5 shadow-sm"
                disabled={busy || !input.trim()}
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>
          <p className="mt-2.5 pr-0.5 text-right text-[10px] text-stone-400 sm:text-[11px]">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </form>
    </div>
  )
}
