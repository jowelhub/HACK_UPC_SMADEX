import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { explorerUi } from '../lib/explorerUi'

type Props = {
  to: string
  children: ReactNode
}

export function BackNavLink({ to, children }: Props) {
  return (
    <Link to={to} className={explorerUi.backLink}>
      {children}
    </Link>
  )
}
