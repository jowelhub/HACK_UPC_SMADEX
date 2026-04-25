import { Link } from 'react-router-dom'

const cards = [
  { to: '/performance', title: 'Performance' },
  { to: '/fatigue', title: 'Fatigue' },
  { to: '/recommendations', title: 'Recommendations' },
  { to: '/copilot', title: 'Analytics copilot' },
]

export function Dashboard() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Overview</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.to}>
            <Link
              to={c.to}
              className="block rounded border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50"
            >
              {c.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
