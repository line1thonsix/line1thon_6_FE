import type { MouseEvent } from 'react'

export function showQuestionTitleTooltip(event: MouseEvent<HTMLElement>) {
  const title = event.currentTarget
  if (title.scrollWidth > title.clientWidth || title.scrollHeight > title.clientHeight) {
    title.title = title.textContent ?? ''
  }
}

export function clearQuestionTitleTooltip(event: MouseEvent<HTMLElement>) {
  event.currentTarget.removeAttribute('title')
}
