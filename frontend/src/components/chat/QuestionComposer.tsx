import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Textarea } from '../ui/Input'
import { Icon } from '../ui/Icon'

type QuestionComposerProps = { value: string; onChange: (value: string) => void }
export function QuestionComposer({ value, onChange }: QuestionComposerProps) {
  const [notice, setNotice] = useState('')
  function previewSubmission() {
    if (value.trim()) setNotice('질문을 입력했어요. 전송 기능은 다음 단계에서 연결할 예정이에요.')
  }
  return <div className="flex shrink-0 flex-col items-center gap-3 px-6 pb-6">
    <Card className="w-full max-w-content rounded-composer border-line-strong p-4">
      <form onSubmit={event => { event.preventDefault(); previewSubmission() }} className="flex flex-col gap-3">
        <Textarea aria-label="질문" placeholder="막힌 질문이나 궁금한 점을 적어 보세요" value={value} onChange={event => { onChange(event.target.value); setNotice('') }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); previewSubmission() }
        }} className="h-draft resize-none rounded-none border-0 px-0.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-[5px] py-[5px] pr-2.5 pl-2 text-caption font-medium leading-4" onClick={() => setNotice('코드 추가는 다음 단계에서 제공할 예정이에요.')}><Icon name="plus" />코드 추가</Button>
            <Button variant="soft" className="gap-[5px] py-[5px] pr-1.5 pl-2 text-caption" onClick={() => setNotice('질문 유형 선택은 다음 단계에서 제공할 예정이에요.')}><span>질문 유형</span><span className="font-medium">자유롭게</span><Icon name="chevron" /></Button>
          </div>
          <div className="flex items-center gap-3"><p className="text-caption text-muted">개인정보와 키는 지워 주세요</p><Button type="submit" variant="primary" aria-label="질문 보내기" disabled={!value.trim()} className="size-send rounded-[10px]"><Icon name="send" /></Button></div>
        </div>
      </form>
      {notice && <p role="status" className="mt-3 text-caption text-secondary">{notice}</p>}
    </Card>
    <p className="text-center text-caption text-muted">AI 답변은 정답이 아닌 참고 관점이에요. 중요한 내용은 직접 확인해 주세요.</p>
  </div>
}
