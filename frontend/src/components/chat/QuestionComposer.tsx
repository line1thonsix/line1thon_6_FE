import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Textarea } from '../ui/Input'
import { Icon } from '../ui/Icon'
import { QuestionTypeSelect } from './QuestionTypeSelect'
import { CodeEditor } from './CodeEditor'
import { QUESTION_MAX_LENGTH } from '../../api/chatValidation'
import type { QuestionDraft } from '../../types/chat'

type Props = {
  draft: QuestionDraft; onChange: (value: QuestionDraft) => void; onSubmit: () => void;
  mode: 'editing' | 'creating' | 'error' | 'locked'; validation: string;
  thought: string; onThoughtChange: (value: string) => void;
}
export function QuestionComposer({ draft, onChange, onSubmit, mode, validation, thought, onThoughtChange }: Props) {
  const [codeOpen, setCodeOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const editing = mode === 'editing'
  const locked = mode === 'locked'
  const invalid = draft.question.length > QUESTION_MAX_LENGTH || draft.code.length > 6000
  return <div className={`relative flex shrink-0 flex-col items-center gap-3 px-6 pb-6 ${expanded && editing ? 'min-h-composer-base justify-end' : ''}`}>
    <Card className={`rounded-composer border-line-strong p-4 ${expanded && editing ? 'absolute bottom-composer-footer left-1/2 z-10 w-[calc(100%-48px)] max-w-composer-expanded -translate-x-1/2' : 'w-full max-w-content'}`}>
      <form onSubmit={event => { event.preventDefault(); if (editing) onSubmit() }} className="flex flex-col gap-3">
        <Textarea aria-label={locked ? '내 생각' : '질문'} aria-invalid={editing && (!!validation || invalid)} aria-describedby={validation ? 'question-validation' : undefined} placeholder={locked ? '생각을 30자 이상 남기면 AI 답변을 열어 볼 수 있어요. 막히면 힌트로 시작하세요.' : '막힌 질문이나 궁금한 점을 적어 보세요'}
          value={locked ? thought : editing ? draft.question : ''} disabled={!editing && !locked} maxLength={locked ? 2000 : undefined}
          onChange={event => locked ? onThoughtChange(event.target.value) : onChange({ ...draft, question: event.target.value })}
          onKeyDown={event => { if (editing && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit() } }}
          className={`${expanded && editing ? 'h-[38px]' : 'h-draft'} resize-none rounded-none border-0 px-0.5 py-1 disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2`} />
        {editing && codeOpen && <CodeEditor value={draft.code} expanded={expanded} onChange={code => onChange({ ...draft, code })} onToggle={() => setExpanded(v => !v)} />}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button disabled={!editing} variant="outline" className="gap-[5px] py-[5px] pr-2.5 pl-2 text-caption font-medium leading-4 disabled:text-muted" aria-expanded={editing && codeOpen} onClick={() => { setCodeOpen(v => !v); setExpanded(false) }}><Icon name={editing ? 'plus' : 'plusDisabled'} />{codeOpen && editing ? '코드 접기' : '코드 추가'}</Button>
            <QuestionTypeSelect value={draft.type} disabled={!editing} onChange={type => onChange({ ...draft, type })} />
          </div>
          <div className="flex items-center gap-3">
            {editing && draft.question.length > 0 && <span className={`text-caption ${draft.question.length > QUESTION_MAX_LENGTH ? 'text-danger' : 'text-muted'}`}>{draft.question.length.toLocaleString()} / 2,000</span>}
            {editing && codeOpen && <p className="text-caption text-muted">개인정보와 키는 지워 주세요</p>}
            {locked && <span className="text-caption text-muted">{thought.trim().length} / 30자</span>}
            <Button type={editing ? 'submit' : 'button'} variant="primary" aria-label={locked ? '내 생각 제출 (다음 단계)' : '질문 보내기'} title={locked ? '내 생각 제출은 다음 단계에서 연결합니다.' : undefined} disabled={!editing || !draft.question.trim() || invalid} className="size-send rounded-[10px]"><Icon name={editing && draft.question.trim() && !invalid ? 'sendActive' : 'send'} /></Button>
          </div>
        </div>
      </form>
      {editing && invalid && !validation && <p role="alert" className="mt-3 text-caption text-danger">{draft.question.length > QUESTION_MAX_LENGTH ? '질문은 2,000자까지 입력할 수 있어요.' : '코드는 6,000자까지 입력할 수 있어요.'}</p>}
      {validation && <p id="question-validation" role="alert" className="mt-3 text-caption text-danger">{validation}</p>}
    </Card>
    <p className="text-center text-caption text-muted">AI 답변은 정답이 아닌 참고 관점이에요. 중요한 내용은 직접 확인해 주세요.</p>
  </div>
}
