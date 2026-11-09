import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'
import { Icon } from '../ui/Icon'
import { createDemoNotes, noteConfig, noteKinds, validateDemoNote } from '../../storage/postResultDemo'
import type { DemoNotesState, NoteKind } from '../../storage/postResultDemo'

type Props = { state: DemoNotesState; allowFeedback?: boolean; onOpen: (kind: NoteKind) => void; onChange: (text: string) => void; onSubmit: () => void }
export function PostResultNotesView({ state, allowFeedback = true, onOpen, onChange, onSubmit }: Props) {
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const errorId = useId()
  const active = state.active && (allowFeedback || state.active === 'reflection') ? state.active : null
  const text = active ? state.drafts[active] : ''
  const valid = active && !validateDemoNote(active, text)
  const last = state.order.at(-1)
  const savedKey = last ? `${last}:${state.saved[last]}` : ''
  useEffect(() => { if (active) input.current?.focus() }, [active])
  useEffect(() => { if (savedKey) end.current?.scrollIntoView({ block: 'nearest' }) }, [savedKey])
  return <section aria-label="배운 점과 의견 시연" className="flex flex-col gap-3.5">
    <div className="flex flex-wrap items-center gap-1.5">
      {noteKinds.filter(kind => allowFeedback || kind === 'reflection').map(kind => <Button key={kind} variant="plain" aria-pressed={active === kind} className={`gap-1 rounded-full border px-3 py-1.5 text-caption ${active === kind ? 'border-demo-sky-line bg-demo-sky-soft pl-2.5 text-demo-sky-ink' : 'border-line bg-page text-secondary'}`} onClick={() => { if (!composing.current) onOpen(kind) }}>
        {active === kind && <Icon name="demoCheck" />}{noteConfig[kind].label}
      </Button>)}
      <span className="ml-auto text-micro text-muted">시연용 · 이 탭에만 저장돼요</span>
    </div>
    {active && <form aria-label={`${noteConfig[active].field} 작성`} onSubmit={event => { event.preventDefault(); if (!composing.current) onSubmit() }} className="flex items-center gap-2.5 rounded-full border border-demo-sky-line bg-demo-sky-soft py-1.5 pr-1.5 pl-5">
      <Textarea ref={input} appearance="inline" rows={1} aria-label={noteConfig[active].field} aria-invalid={!!state.error} aria-describedby={state.error ? errorId : undefined} value={text} placeholder={noteConfig[active].placeholder}
        className="field-sizing-content max-h-32 min-h-[22px] min-w-0 flex-1 resize-none border-0 p-0 placeholder:text-demo-placeholder focus-visible:outline-2 focus-visible:outline-demo-sky-ink"
        onChange={event => onChange(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); onSubmit() } }} />
      <Button variant="plain" type="submit" aria-label={noteConfig[active].submit} disabled={!valid} className="size-8 shrink-0 rounded-full bg-demo-sky-btn p-0 disabled:bg-demo-disabled"><Icon name={valid ? 'demoSend' : 'demoSendDisabled'} /></Button>
    </form>}
    {state.error && <p id={errorId} role="alert" className="text-caption text-danger">{state.error}</p>}
    {state.order.filter(kind => allowFeedback || kind === 'reflection').map(kind => <div key={kind} className="flex flex-col gap-3.5" aria-label={kind === 'reflection' ? '저장한 배운 점' : '전송한 의견'}>
      <div className="flex justify-end"><p className="w-question-bubble max-w-full whitespace-pre-wrap rounded-composer bg-sidebar px-4 py-3 text-body break-words">{state.saved[kind]}</p></div>
      <div role="status" className="flex flex-col gap-1.5"><p className="text-caption font-medium text-secondary">Deveil</p><p className="text-body-lg">{noteConfig[kind].complete}</p></div>
    </div>)}
    <div ref={end} />
  </section>
}
export function PostResultNotes({ chatId, allowFeedback = true }: { chatId: string; allowFeedback?: boolean }) {
  const [controller] = useState(() => createDemoNotes(chatId, allowFeedback))
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  return <PostResultNotesView state={state} allowFeedback={allowFeedback} onOpen={controller.open} onChange={controller.change} onSubmit={controller.submit} />
}
