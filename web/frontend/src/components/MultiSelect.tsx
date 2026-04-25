export type LabeledOption = { value: string | number; label: string }

type Props = {
  label: string
  options: (string | number)[] | LabeledOption[]
  value: (string | number)[]
  onChange: (v: (string | number)[]) => void
  className?: string
}

function optionValue(o: string | number | LabeledOption): string | number {
  return typeof o === 'object' ? o.value : o
}

function optionLabel(o: string | number | LabeledOption): string {
  return typeof o === 'object' ? o.label : String(o)
}

export function MultiSelect({ label, options, value, onChange, className }: Props) {
  const set = new Set(value.map(String))
  const toggle = (o: string | number | LabeledOption) => {
    const v = optionValue(o)
    const k = String(v)
    const next = new Set(value.map(String))
    if (next.has(k)) next.delete(k)
    else next.add(k)
    const ordered = options.map(optionValue).filter((x) => next.has(String(x)))
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
              const v = optionValue(o)
              const lbl = optionLabel(o)
              const active = set.has(String(v))
              return (
                <button
                  type="button"
                  key={String(v)}
                  title={lbl}
                  onClick={() => toggle(o)}
                  className={`max-w-[min(100%,220px)] truncate rounded-md px-2 py-0.5 text-left text-xs font-medium transition ${
                    active
                      ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {lbl}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
