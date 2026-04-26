import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const baseProse = 'text-stone-800 leading-relaxed'

const buildComponents = (opts: { compact?: boolean }): Components => {
  const sm = opts.compact
  return {
    h1: ({ children, ...p }) => (
      <h1
        className={`font-display font-semibold text-stone-900 ${sm ? 'mt-2 text-base' : 'mt-3 text-lg'}`}
        {...p}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...p }) => (
      <h2
        className={`font-display font-semibold text-stone-900 ${sm ? 'mt-2 text-sm' : 'mt-3 text-base'}`}
        {...p}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...p }) => (
      <h3 className={`mt-2 font-semibold text-stone-900 ${sm ? 'text-sm' : 'text-sm'}`} {...p}>
        {children}
      </h3>
    ),
    p: ({ children, ...p }) => (
      <p className={`mb-2 last:mb-0 ${baseProse} ${sm ? 'text-xs' : 'text-sm'}`} {...p}>
        {children}
      </p>
    ),
    ul: ({ children, ...p }) => (
      <ul className={`mb-2 list-disc space-y-0.5 pl-5 ${sm ? 'text-xs' : 'text-sm'}`} {...p}>
        {children}
      </ul>
    ),
    ol: ({ children, ...p }) => (
      <ol className={`mb-2 list-decimal space-y-0.5 pl-5 ${sm ? 'text-xs' : 'text-sm'}`} {...p}>
        {children}
      </ol>
    ),
    li: ({ children, ...p }) => (
      <li className="text-stone-800 marker:text-stone-500" {...p}>
        {children}
      </li>
    ),
    a: ({ children, href, ...p }) => (
      <a
        className="font-medium text-brand-800 underline decoration-brand-200 underline-offset-2 hover:text-brand-700"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...p}
      >
        {children}
      </a>
    ),
    strong: ({ children, ...p }) => (
      <strong className="font-semibold text-stone-900" {...p}>
        {children}
      </strong>
    ),
    em: ({ children, ...p }) => (
      <em className="italic text-stone-700" {...p}>
        {children}
      </em>
    ),
    blockquote: ({ children, ...p }) => (
      <blockquote
        className="mb-2 border-l-4 border-brand-200/80 bg-stone-50/80 py-1 pl-3 text-stone-700"
        {...p}
      >
        {children}
      </blockquote>
    ),
    hr: (p) => <hr className="my-3 border-stone-200" {...p} />,
    pre: ({ children, ...p }) => (
      <pre
        className={`mb-2 overflow-x-auto rounded-lg border border-stone-200/90 bg-stone-50 p-2.5 font-mono text-xs leading-relaxed text-stone-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${sm ? 'text-[10px]' : ''}`}
        {...p}
      >
        {children}
      </pre>
    ),
    code: (props) => {
      const { className, children, ...rest } = props
      const isBlock = Boolean(className?.match(/language-/) || className?.includes('hljs'))
      if (isBlock) {
        return (
          <code
            className={`${className ?? ''} block whitespace-pre bg-transparent text-stone-800`}
            {...rest}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800"
          {...rest}
        >
          {children}
        </code>
      )
    },
    table: ({ children, ...p }) => (
      <div className="my-2 w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-stone-200/90 bg-white shadow-sm">
        <table className="w-full min-w-[20rem] border-collapse text-left text-sm" {...p}>
          {children}
        </table>
      </div>
    ),
    thead: (p) => <thead className="bg-stone-100/90" {...p} />,
    tbody: (p) => <tbody className="divide-y divide-stone-100" {...p} />,
    tr: (p) => <tr className="hover:bg-stone-50/80" {...p} />,
    th: (p) => (
      <th
        className="whitespace-nowrap border-b border-stone-200 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600 first:pl-3 last:pr-3 sm:px-3"
        {...p}
      />
    ),
    td: (p) => (
      <td
        className="border-b border-stone-100 px-2.5 py-2 align-top text-stone-800 first:pl-3 last:pr-3 sm:px-3"
        {...p}
      />
    ),
  }
}

type Props = {
  children: string
  /** Slightly smaller typography (e.g. thinking panel) */
  compact?: boolean
  className?: string
}

export function ChatMarkdown({ children, compact, className }: Props) {
  if (!children.trim()) return null
  return (
    <div className={className ?? 'min-w-0 break-words'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents({ compact })}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
