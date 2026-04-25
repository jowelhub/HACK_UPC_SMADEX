import { useEffect, useState } from 'react'

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

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
}

export function LlmInsightPanel({ context, performanceError }: Props) {
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
          body: JSON.stringify({ context }),
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
          setText(acc)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError(String(e))
      } finally {
        setBusy(false)
      }
    })()

    return () => ac.abort()
  }, [canRun, context, performanceError])

  if (performanceError) {
    return null
  }

  if (!context) {
    return null
  }

  return (
    <div className="surface-panel mt-5 border-stone-200/80">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">LLM insight</h3>
        <p className="text-[0.65rem] text-stone-400 sm:text-xs">
          Gemma 4 via <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.65rem]">/api/agent/insight</code>
          {' '}
          (same stack as the SQL copilot)
        </p>
      </div>
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
