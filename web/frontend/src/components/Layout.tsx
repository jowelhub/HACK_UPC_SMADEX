import { Link, Outlet, useLocation } from 'react-router-dom'

const nav = [
  { to: '/performance', label: 'Performance' },
  { to: '/fatigue', label: 'Fatigue' },
  { to: '/recommendations', label: 'Recommendations' },
]

export function Layout() {
  const loc = useLocation()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight text-stone-900">
            Smadex <span className="font-medium text-brand">Creative Lab</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm font-medium">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-full px-3.5 py-2 transition ${
                  loc.pathname === n.to
                    ? 'bg-brand-50 text-brand shadow-sm ring-1 ring-brand/15'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-brand'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main
        className={
          loc.pathname === '/performance'
            ? 'flex min-h-0 w-full flex-1 flex-col px-0 py-0'
            : 'mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6'
        }
      >
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 py-5 text-center text-xs text-stone-500">
        Synthetic dataset · v1 baseline · local API <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">/api</code>
      </footer>
    </div>
  )
}
