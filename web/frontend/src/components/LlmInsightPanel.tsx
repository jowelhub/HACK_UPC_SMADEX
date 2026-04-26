import { useEffect, useState } from 'react'

import type { PerformanceInsightMode } from '../lib/performanceInsightContext'
import { explorerUi } from '../lib/explorerUi'

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

/** Strips legacy SSE suffix and model echoes (handles split chunks via final pass). */
function sanitizeInsightDisplay(text: string): string {
  return text.replace(/\s*\[Output truncated\.\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trimEnd()
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

type Props = {
  context: string | null
  performanceError: string | null
  /** Extra classes on the panel (e.g. `mt-0 flex-1` when laid out beside PCA). */
  panelClassName?: string
  /** Selects a shorter system prompt + token budget on the ai-agent (no tools). */
  insightMode?: PerformanceInsightMode
}

export function LlmInsightPanel({ context, performanceError, panelClassName, insightMode }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canRun = Boolean(context?.trim()) && !performanceError

  useEffect(() => {
    if (!canRun || !context) {
      setText('')
      setError(null)
      setBusy(false)
      return
    }

    const ac = new AbortController()
    setText('')
    setError(null)
    setBusy(true)

    void (async () => {
      let res: Response
      try {
        res = await fetch('/api/agent/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context, insightMode: insightMode ?? undefined }),
          signal: ac.signal,
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError(String(e))
        setBusy(false)
        return
      }

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText)
        setError(t || res.statusText)
        setBusy(false)
        return
      }
      if (!res.body) {
        setError('No response body')
        setBusy(false)
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let acc = ''

      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const { events, rest } = parseSseDataLines(buf)
          buf = rest
          for (const ev of events) {
            if (ev.type === 'text') acc += ev.content
            else if (ev.type === 'error') setError(ev.message)
          }
          setText(sanitizeInsightDisplay(acc))
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError(String(e))
      } finally {
        setText(sanitizeInsightDisplay(acc))
        setBusy(false)
      }
    })()

    return () => ac.abort()
  }, [canRun, context, performanceError, insightMode])

  if (performanceError) {
    return null
  }

  if (!context) {
    return null
  }

  return (
    <div className={`surface-panel border-stone-200/80 ${panelClassName ?? 'mt-5'}`}>
      <h2 className={explorerUi.performanceLabel}>LLM insight</h2>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
          {text || (busy ? 'Generating insight…' : '')}
        </p>
      )}
    </div>
  )
}
