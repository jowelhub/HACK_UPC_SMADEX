type Props = {
  label: string
  options: (string | number)[]
  value: (string | number)[]
  onChange: (v: (string | number)[]) => void
  className?: string
}

export function MultiSelect({ label, options, value, onChange, className }: Props) {
  const set = new Set(value.map(String))
  const toggle = (o: string | number) => {
    const k = String(o)
    const next = new Set(value.map(String))
    if (next.has(k)) next.delete(k)
    else next.add(k)
    const ordered = options.filter((x) => next.has(String(x)))
    onChange(ordered)
  }

  return (
    <div className={className}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-ink-900 p-2 text-sm sm:max-h-44">
        {options.length === 0 ? (
          <p className="text-slate-500">No values</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
              const active = set.has(String(o))
              return (
                <button
                  type="button"
                  key={String(o)}
                  onClick={() => toggle(o)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                    active
                      ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {String(o)}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
