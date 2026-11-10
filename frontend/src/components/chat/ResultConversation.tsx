import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LockedChat } from '../../types/chat'
import { useFollowUps } from '../../hooks/useFollowUps'
import { FollowUpMessages } from './FollowUpConversation'
import { QuestionComposer } from './QuestionComposer'

export function ResultConversation({ chat, ready, children }: { chat: LockedChat; ready: boolean; children: ReactNode }) {
  const followUp = useFollowUps(chat.id, ready)
  const scroll = useRef<HTMLDivElement>(null)
  const { items, phase } = followUp.state
  useEffect(() => {
    if (items.length || phase === 'sending') scroll.current?.scrollTo({ top: scroll.current.scrollHeight })
  }, [items.length, phase])
  return <>
    <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-4"><div className="mx-auto flex w-full max-w-content flex-col gap-5">
      {children}
      {ready && <FollowUpMessages flow={followUp} />}
    </div></div>
    <QuestionComposer draft={chat} mode="completed" followUp={ready ? followUp : undefined} validation="" onChange={() => {}} onSubmit={() => {}} thought="" onThoughtChange={() => {}} />
  </>
}
