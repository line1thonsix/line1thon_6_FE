import type { InputHTMLAttributes, TextareaHTMLAttributes, Ref } from 'react'

const base = 'w-full rounded-control border border-line-strong bg-page px-3 py-2 text-body-lg placeholder:text-muted focus:border-brand focus:outline-none'
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...props} />
}
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={`${base} ${className}`} {...props} />
}
