import { Link, Outlet, useLocation } from 'react-router-dom'
import { pathCopilot, pathHome } from '../lib/routes'

const secondaryNav = [{ to: pathCopilot(), label: 'NL → SQL' }] as const

export function Layout() {
  const loc = useLocation()
  const isCopilot = loc.pathname === pathCopilot()
  const isHome = loc.pathname === pathHome()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-stone-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link to={pathHome()} className="font-display text-lg font-semibold tracking-tight text-stone-900">
            Smadex <span className="font-medium text-brand">Creative Lab</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm font-medium">
            {!isHome ? (
              <Link
                to={pathHome()}
                className="rounded-md px-3 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-brand"
              >
                Advertisers
              </Link>
            ) : null}
            {secondaryNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  loc.pathname === n.to
                    ? 'bg-brand-50 font-medium text-brand'
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
          isCopilot
            ? 'mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col items-center overflow-hidden px-4 pb-5 pt-6 sm:px-6 sm:pb-8 sm:pt-8'
            : 'mx-auto w-full max-w-7xl min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
