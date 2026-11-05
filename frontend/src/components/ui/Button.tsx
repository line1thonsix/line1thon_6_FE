import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'outline' | 'soft' | 'primary'
}
const variants = {
  ghost: 'bg-transparent text-secondary hover:bg-brand-subtle',
  outline: 'border border-line bg-page text-secondary hover:border-brand',
  soft: 'bg-brand-subtle text-brand-deep hover:bg-brand-soft',
  primary: 'bg-brand text-white hover:bg-brand-deep disabled:bg-line',
}
export function Button({ variant = 'ghost', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-control transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`} {...props} />
}
