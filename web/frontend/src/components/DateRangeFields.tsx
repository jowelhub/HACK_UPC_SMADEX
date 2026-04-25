import { clampIsoDate } from '../lib/performanceFormat'

type DateRange = { min?: string; max?: string }

type Props = {
  dateRange: DateRange | undefined
  dates: { from: string; to: string }
  onChange: (next: { from: string; to: string }) => void
  className?: string
}

export function DateRangeFields({ dateRange, dates, onChange, className }: Props) {
  return (
    <div
      className={
        className ??
        'grid w-full max-w-md grid-cols-2 gap-2 rounded border border-stone-200 bg-white p-3 sm:w-auto'
      }
    >
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase text-stone-500">From</span>
        <input
          type="date"
          className="input w-full text-xs"
          min={dateRange?.min}
          max={dates.to && dateRange?.max ? clampIsoDate(dates.to, dateRange.min, dateRange.max) : dateRange?.max}
          value={dates.from}
          onChange={(e) => {
            const raw = e.target.value
            if (!dateRange?.min || !dateRange?.max) return
            const from = raw ? clampIsoDate(raw, dateRange.min, dateRange.max) : dateRange.min
            let to = dates.to || dateRange.max
            to = clampIsoDate(to, dateRange.min, dateRange.max)
            if (from > to) onChange({ from, to: from })
            else onChange({ from, to })
          }}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase text-stone-500">To</span>
        <input
          type="date"
          className="input w-full text-xs"
          min={
            dates.from && dateRange?.min ? clampIsoDate(dates.from, dateRange.min, dateRange.max) : dateRange?.min
          }
          max={dateRange?.max}
          value={dates.to}
          onChange={(e) => {
            const raw = e.target.value
            if (!dateRange?.min || !dateRange?.max) return
            const to = raw ? clampIsoDate(raw, dateRange.min, dateRange.max) : dateRange.max
            let from = dates.from || dateRange.min
            from = clampIsoDate(from, dateRange.min, dateRange.max)
            if (to < from) onChange({ from: to, to })
            else onChange({ from, to })
          }}
        />
      </label>
    </div>
  )
}
