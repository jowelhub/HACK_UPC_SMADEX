/** Relative paths for fetch() — nginx / Vite proxy forwards `/api` to the backend. */
export const apiPaths = {
  performanceHierarchy: '/api/performance/hierarchy',
  performanceQuery: '/api/performance/query',
  performanceFilterOptions: '/api/performance/filter-options',
  creativeAsset: (creativeId: number) => `/api/creatives/${creativeId}/asset`,
} as const
