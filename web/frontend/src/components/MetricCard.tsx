type Props = {
  label: string
  value: string
  hint?: string
}

export function MetricCard({ label, value, hint }: Props) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight text-brand">{value}</div>
      {hint ? <div className="mt-1 text-xs text-stone-500">{hint}</div> : null}
    </div>
  )
}
