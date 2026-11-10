import { useEffect, useId, useRef } from 'react'
import { Button } from '../ui/Button'

export type DeleteTarget = { kind: 'all' } | { kind: 'chat'; chatId: string }
type Props = { target: DeleteTarget; busy: boolean; error: boolean; onCancel: () => void; onConfirm: () => void }
export function DeleteConfirmation({ target, busy, error, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId(), description = useId()
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); if (opener?.isConnected) opener.focus(); else document.querySelector<HTMLButtonElement>('button[aria-label="사이드바 펼치기"]')?.focus() }
  }, [])
  return <dialog ref={dialog} aria-labelledby={title} aria-describedby={description} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }} className="delete-confirmation m-auto w-[400px] max-w-[calc(100vw-32px)] rounded-[20px] bg-page px-7 pt-7 pb-6 text-ink shadow-delete-dialog">
    <h2 id={title} className="text-[18px] leading-[22px] font-medium">{target.kind === 'all' ? '모든 데이터를 삭제할까요?' : '이 대화를 삭제할까요?'}</h2>
    <p id={description} className="mt-2 min-h-5 text-body leading-[21px] text-secondary md:h-5">{target.kind === 'all' ? '질문, 코드, 생각, 비교 결과가 모두 지워져요. 지운 뒤에는 되돌릴 수 없어요.' : '이 대화의 질문, 코드, 생각, 비교 결과가 함께 지워져요. 지운 뒤에는 되돌릴 수 없어요.'}</p>
    {error && <p role="alert" className="mt-5 text-body text-guest-delete-fg">다시 시도해 주세요</p>}
    <div className="mt-2 flex justify-end gap-2 pt-4">
      <Button autoFocus disabled={busy} variant="plain" className="rounded-full border border-line bg-page px-[18px] py-[9px] text-body leading-[17px] font-medium text-secondary" onClick={onCancel}>취소</Button>
      <Button disabled={busy} variant="plain" className="rounded-full border border-delete-line bg-guest-delete-bg px-[18px] py-[9px] text-body leading-[17px] font-medium text-guest-delete-fg" onClick={onConfirm}>삭제</Button>
    </div>
  </dialog>
}
