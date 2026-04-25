/** Shared Tailwind class strings for advertiser / campaign / creative explorer. */

export const explorerUi = {
  backLink: 'mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline',
  pageWrap: 'space-y-6 pb-10',
  headerRow: 'flex flex-wrap items-start justify-between gap-4',
  title: 'font-display text-2xl font-semibold tracking-tight text-stone-900',
  subtitle: 'mt-1 text-sm text-stone-500',
  sectionTitle: 'mb-3 font-display text-lg font-semibold text-stone-900',
  performanceLabel: 'mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500',
  campaignNavButton:
    'rounded-lg border border-stone-200 bg-white px-4 py-3 text-left text-sm font-medium text-stone-800 shadow-sm transition hover:border-brand hover:bg-brand-50/50 hover:text-brand',
  creativeTile:
    'group flex min-w-0 flex-col rounded-lg border border-stone-200 bg-white p-2.5 text-center shadow-sm transition hover:border-brand hover:shadow-md sm:p-3',
  /** Full width of grid cell; height follows image (no forced square). */
  creativeTileImageWrap:
    'relative w-full min-h-0 overflow-hidden rounded-md bg-stone-50',
  creativeTileLabel: 'mt-2 line-clamp-3 text-xs font-medium leading-snug text-stone-800 group-hover:text-brand',
  mutedMessage: 'text-sm text-stone-500',
  errorMessage: 'text-sm text-red-600',
  notFoundWrap: 'space-y-4',
  notFoundBody: 'text-stone-600',
} as const
