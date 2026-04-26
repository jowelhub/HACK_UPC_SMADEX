import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
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

const EXAMPLE_PROMPTS = [
  {
    label: 'Top creatives by CTR',
    query: 'Top 10 creatives by CTR in the last 30 days',
  },
  {
    label: 'Spend by campaign',
    query: 'Show total spend in USD by campaign for the last 14 days, highest first',
  },
] as const

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

const SCROLL_PIN_THRESHOLD_PX = 80

/** Matches `explorerUi.performanceLabel` — one system for thread role hints. */
const roleLabelClass = 'mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500'

const composerShellClass =
  'flex w-full items-stretch gap-2 rounded-2xl border border-stone-200/90 bg-white py-1.5 pl-3 pr-1.5 shadow-sm transition focus-within:border-brand-200/80 focus-within:ring-2 focus-within:ring-brand/15 sm:pl-4 sm:pr-2'

const composerTextareaClass =
  'min-h-[2.75rem] max-h-40 min-w-0 flex-1 resize-y border-0 bg-transparent py-2 text-sm leading-snug text-stone-900 outline-none placeholder:text-stone-400 focus:border-0 focus:ring-0 sm:text-[15px] sm:leading-normal'

const sendButtonClass =
  'btn-primary shrink-0 self-center rounded-xl px-5 py-2 text-sm font-medium shadow-sm'

function CopilotSubtitle({ align }: { align: 'left' | 'center' }) {
  return (
    <p
      className={`text-xs leading-relaxed text-stone-500 sm:text-sm ${align === 'center' ? 'text-center' : ''}`}
    >
      <span className="text-stone-600">Powered by Google @google/genai</span>
      <span className="text-stone-500"> (Gemma 4). Function calling: </span>
      <code className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.7rem] text-stone-700 sm:text-xs">runSQL</code>
      <span className="text-stone-400"> + </span>
      <code className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.7rem] text-stone-700 sm:text-xs">getDatabaseSchema</code>
    </p>
  )
}

export function ChatPage() {
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)

  const bottom = useRef<HTMLDivElement | null>(null)
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const dockedInputRef = useRef<HTMLTextAreaElement | null>(null)
  const wasComposerDockedRef = useRef(false)

  /** Dock composer only once a turn has started (send or example), not while drafting. */
  const composerDocked = rows.length > 0 || pending != null || busy

  const updatePinnedFromScroll = useCallback(() => {
    const el = scrollElRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setPinnedToBottom(dist < SCROLL_PIN_THRESHOLD_PX)
  }, [])

  useLayoutEffect(() => {
    if (!composerDocked || !pinnedToBottom) return
    bottom.current?.scrollIntoView({ block: 'end', behavior: busy ? 'auto' : 'smooth' })
  }, [rows, pending, busy, pinnedToBottom, composerDocked])

  useLayoutEffect(() => {
    if (composerDocked && !wasComposerDockedRef.current) {
      dockedInputRef.current?.focus()
    }
    wasComposerDockedRef.current = composerDocked
  }, [composerDocked])

  const sendMessage = useCallback(
    async (raw: string) => {
      const t = raw.trim()
      if (!t || busy) return
      setInput('')
      setError(null)
      setPinnedToBottom(true)
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
    },
    [busy, rows],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (busy || !input.trim()) return
      e.currentTarget.form?.requestSubmit()
    }
  }

  const dockedComposer = (
    <textarea
      ref={dockedInputRef}
      className={composerTextareaClass}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={onComposerKeyDown}
      placeholder="Ask anything…"
      disabled={busy}
      rows={2}
      aria-label="Message"
    />
  )

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-3xl flex-col">
      {!composerDocked ? (
        <header className="shrink-0 pb-3 text-center">
          <CopilotSubtitle align="center" />
        </header>
      ) : null}

      {error ? (
        <div className="mt-2 shrink-0 rounded-lg border border-rose-200/80 bg-rose-50/90 px-3 py-2.5 text-sm text-rose-900">
          {error}
          <button type="button" className="btn-secondary ml-2 align-middle" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {composerDocked ? (
          <>
            <div className="min-h-0 min-w-0 flex-1">
              <div
                ref={scrollElRef}
                onScroll={updatePinnedFromScroll}
                className="h-full min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pt-2 pl-0 sm:pt-3"
                role="log"
                aria-live="polite"
              >
                <div className="space-y-5 pb-3 pl-0 pr-3 pt-1 sm:space-y-6 sm:pb-4 sm:pr-4">
                  {rows.map((m) => (
                    <div key={m.id} className="min-w-0">
                      {m.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[min(100%,85%)] min-w-0">
                            <div className={`${roleLabelClass} pl-1 text-right`}>You</div>
                            <div className="rounded-2xl rounded-tr-md border border-brand-200/30 bg-gradient-to-b from-brand-50 to-brand-50/80 px-4 py-2.5 text-sm text-stone-800 shadow-sm sm:px-4 sm:py-3">
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 pl-0 sm:pl-0.5">
                          <div className={roleLabelClass}>Assistant</div>
                          {m.thought ? (
                            <details className="mb-2 rounded-xl border border-stone-200/60 bg-stone-50/80 open:bg-stone-50/90">
                              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-stone-600 sm:py-2.5">
                                Thinking....
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
                      <div className={roleLabelClass}>Assistant</div>
                      <details className="mb-2 rounded-xl border border-stone-200/60 bg-stone-50/80 open:bg-stone-50/90">
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-stone-600 sm:py-2.5">
                          Thinking....
                        </summary>
                        <div className="border-t border-stone-200/50 px-3 py-2.5 sm:px-3.5">
                          {pending.thought ? (
                            <ChatMarkdown compact>{pending.thought}</ChatMarkdown>
                          ) : (
                            <p className="text-xs leading-relaxed text-stone-600">
                              {busy
                                ? 'Waiting for reasoning tokens from the model…'
                                : 'No separate reasoning stream for this reply.'}
                            </p>
                          )}
                        </div>
                      </details>
                      {pending.text ? (
                        <div className="min-w-0 text-stone-800">
                          <ChatMarkdown>{pending.text}</ChatMarkdown>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div ref={bottom} className="h-1 shrink-0" />
                </div>
              </div>
            </div>

            <form
              onSubmit={onSubmit}
              className="shrink-0 border-t border-stone-200/50 bg-canvas/95 pt-3 pb-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] sm:pt-4 sm:pb-3"
            >
              <div className={composerShellClass}>
                {dockedComposer}
                <button type="submit" className={sendButtonClass} disabled={busy || !input.trim()}>
                  {busy ? '…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col items-center px-3 pt-4 sm:pt-8">
              <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 pb-6">
                <h2 className="text-center font-display text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                  Where should we begin?
                </h2>
                <form onSubmit={onSubmit} className="w-full max-w-2xl">
                  <div className={composerShellClass}>
                    <textarea
                      className={composerTextareaClass}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder="Ask anything…"
                      disabled={busy}
                      rows={1}
                      aria-label="Message"
                    />
                    <button type="submit" className={sendButtonClass} disabled={busy || !input.trim()}>
                      {busy ? '…' : 'Send'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pb-8 pt-2 sm:gap-3 sm:pb-10">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.query}
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:border-brand/40 hover:bg-brand-50/70 hover:text-brand disabled:opacity-50 sm:px-5"
                  onClick={() => void sendMessage(ex.query)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
