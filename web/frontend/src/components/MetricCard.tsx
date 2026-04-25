type Props = {
  label: string
  value: string
  hint?: string
}

export function MetricCard({ label, value, hint }: Props) {
  return (
    <div className="rounded border border-stone-200 bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-0.5 font-display text-xl font-semibold tabular-nums tracking-tight text-brand">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-stone-500">{hint}</div> : null}
    </div>
  )
}
