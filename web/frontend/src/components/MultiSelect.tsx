import { useMemo, useState } from 'react'

export type LabeledOption = { value: string | number; label: string }

type Props = {
  label: string
  options: (string | number)[] | LabeledOption[]
  value: (string | number)[]
  onChange: (v: (string | number)[]) => void
  className?: string
  /** Search box filters visible options (label + value); selected items stay visible. */
  searchable?: boolean
  searchPlaceholder?: string
  /** Cap chip list height to about this many wrap-rows (scroll inside). */
  maxChipRows?: 3
}

function optionValue(o: string | number | LabeledOption): string | number {
  return typeof o === 'object' ? o.value : o
}

function optionLabel(o: string | number | LabeledOption): string {
  return typeof o === 'object' ? o.label : String(o)
}

function matchesQuery(o: string | number | LabeledOption, needle: string, selected: Set<string>): boolean {
  if (!needle) return true
  const v = optionValue(o)
  if (selected.has(String(v))) return true
  const lbl = optionLabel(o).toLowerCase()
  return lbl.includes(needle) || String(v).toLowerCase().includes(needle)
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className,
  searchable = false,
  searchPlaceholder = 'Search…',
  maxChipRows,
}: Props) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Set(value.map(String)), [value])

  const needle = query.trim().toLowerCase()
  const visibleOptions = useMemo(() => {
    if (!searchable || !needle) return options
    return options.filter((o) => matchesQuery(o, needle, selected))
  }, [options, needle, searchable, selected])

  const toggle = (o: string | number | LabeledOption) => {
    const v = optionValue(o)
    const k = String(v)
    const next = new Set(value.map(String))
    if (next.has(k)) next.delete(k)
    else next.add(k)
    const ordered = options.map(optionValue).filter((x) => next.has(String(x)))
    onChange(ordered)
  }

  /** Chips wrap like tags: width follows text up to row width, then label wraps inside the pill. */
  const chipWrapClass = 'flex flex-wrap content-start items-start gap-1.5'
  const chipClass =
    'max-w-full min-w-0 w-max rounded-md px-2 py-1.5 text-left text-xs font-medium transition whitespace-normal break-words text-balance'

  const scrollBoxClass =
    maxChipRows === 3
      ? 'max-h-[7.5rem] min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-slate-700 bg-ink-900 p-2 text-sm sm:max-h-[8rem]'
      : searchable
        ? 'max-h-40 min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-slate-700 bg-ink-900 p-2 text-sm sm:max-h-44'
        : 'max-h-32 min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-slate-700 bg-ink-900 p-2 text-sm sm:max-h-36'

  return (
    <div className={['min-h-0 min-w-0', className].filter(Boolean).join(' ')}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {searchable ? (
        <input
          type="search"
          className="input mb-2 w-full py-1.5 text-sm"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Filter ${label}`}
        />
      ) : null}
      <div className={scrollBoxClass}>
        {options.length === 0 ? (
          <p className="text-slate-500">No values</p>
        ) : visibleOptions.length === 0 ? (
          <p className="text-slate-500">No matches</p>
        ) : (
          <div className={chipWrapClass}>
            {visibleOptions.map((o) => {
              const v = optionValue(o)
              const lbl = optionLabel(o)
              const active = selected.has(String(v))
              return (
                <button
                  type="button"
                  key={String(v)}
                  title={lbl}
                  onClick={() => toggle(o)}
                  className={`${chipClass} ${
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
