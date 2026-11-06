import type { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLDivElement> & { surface?: 'page' | 'subtle' }
export function Card({ surface = 'page', className = '', ...props }: CardProps) {
  return <div className={`rounded-panel border border-line ${surface === 'subtle' ? 'bg-brand-subtle' : 'bg-page'} ${className}`} {...props} />
}
