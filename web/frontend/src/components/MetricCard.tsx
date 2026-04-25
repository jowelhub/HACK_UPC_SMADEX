type Props = {
  label: string
  value: string
  hint?: string
  /** Tighter padding and typography for dense grids (e.g. Performance sidebar of metrics). */
  compact?: boolean
}

export function MetricCard({ label, value, hint, compact }: Props) {
  return (
    <div
      className={`min-w-0 rounded border border-stone-200 bg-white ${compact ? 'px-2 py-1.5 sm:px-2.5 sm:py-2' : 'px-3 py-2'}`}
    >
      <div
        className={`font-medium uppercase tracking-wide text-stone-500 ${compact ? 'text-[9px] leading-tight sm:text-[10px]' : 'text-[10px]'}`}
      >
        {label}
      </div>
      <div
        className={`mt-0.5 font-display font-semibold tabular-nums tracking-tight text-brand ${compact ? 'text-base leading-snug sm:text-lg' : 'text-xl'}`}
      >
        {value}
      </div>
      {hint ? (
        <div className={`mt-0.5 leading-snug text-stone-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{hint}</div>
      ) : null}
    </div>
  )
}
