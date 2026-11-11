import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { makeRailwayClient } from '../api/backend/runtime'
import { GUEST_TOKEN_KEY } from '../api/backend/client'
import { createRailwayHistoryController } from '../api/backend/historyController'
import type { RailwayDeleteSelection } from '../api/backend/historyController'
import type { BackendClient } from '../api/backend/client'
import type { BackendChatDetail } from '../api/backend/workspaceApi'
import { editThoughtDraft, readThoughtDraft, toggleChoice } from '../api/thoughtDraft'
import type { ThoughtDraft } from '../api/thoughtDraft'
import { LockedAnswer } from '../components/chat/LockedAnswer'
import { QuestionBubble } from '../components/chat/QuestionBubble'
import { QuestionComposer } from '../components/chat/QuestionComposer'
import { Welcome } from '../components/chat/Welcome'
import { LearningHistory } from '../components/history/LearningHistory'
import { DeleteConfirmation } from '../components/layout/DeleteConfirmation'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { exampleQuestions } from '../data/newChat'
import { workspaceView, workspaceViewParams } from '../data/workspaceView'
import type { WorkspaceView } from '../data/workspaceView'
import { useRailwayWorkspace } from '../hooks/useRailwayWorkspace'
import { redactionOccurred, subscribeRedaction } from '../security/redactionNotice'
import { storageUnavailable, subscribeStorage } from '../storage/session'
import { UsageGuide } from './UsageGuide'

type Workspace = ReturnType<typeof useRailwayWorkspace>
const exampleIds = ['EXAMPLE_DEBUGGING', 'EXAMPLE_CONCEPT', 'EXAMPLE_PROBLEM_SOLVING'] as const

function ReadyChat({ chat, flow }: { chat: BackendChatDetail; flow: Workspace }) {
  const preparation = { choices: chat.choices as [string, string, string], exampleSentence: '' }
  const [initial] = useState(() => readThoughtDraft(flow.saved.thought, preparation))
  const latest = useRef(initial)
  const [draft, setDraft] = useState(initial)
  const [tab, setTab] = useState<'choices' | 'hints'>(() => chat.hintLevel ? 'hints' : 'choices')
  const [viewed, setViewed] = useState<1 | 2>(() => chat.hintLevel === 2 ? 2 : 1)
  const currentHint = chat.hints.find(hint => hint.level === viewed) ?? chat.hints.at(-1)
  const blocked = !!flow.busy || flow.needsSync || !!chat.thought
  const canWrite = chat.status === 'LOCKED' && !chat.analysis && !blocked

  function update(next: ThoughtDraft) {
    if (!canWrite) return
    latest.current = next
    setDraft(next)
    flow.updateThought(next)
  }
  const hints = {
    tab, busy: !!flow.busy, currentHint, error: '', retry: flow.retry,
    state: { chatId: String(chat.chatId), level: chat.hintLevel, stuckPoint: null },
    select: (next: 'choices' | 'hints') => {
      setTab(next)
      if (next === 'hints' && !chat.hintLevel && canWrite) flow.openHint(1)
    },
    openFirst: () => { if (canWrite) flow.openHint(1) },
    openSecond: () => {
      setViewed(2)
      if (chat.hintLevel === 1 && canWrite) flow.openHint(2)
    },
    viewFirst: () => setViewed(1),
  }

  const analysisMessage = chat.status !== 'LOCKED'
    ? '분석이 완료됐어요. 결과 조회는 아직 지원되지 않아요.'
    : chat.analysis?.status === 'FAILED'
      ? '분석에 실패했어요. 제출한 생각은 저장됐어요.'
      : chat.analysis?.status === 'PENDING' ? '두 관점을 연결하고 있어요…' : null

  return <>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mx-auto flex w-full max-w-content flex-col gap-5">
        <QuestionBubble draft={chat} />
        {chat.thought && <div className="flex justify-end"><section aria-label="제출한 내 생각" className="w-question-bubble max-w-full rounded-composer bg-sidebar px-4 py-2.5"><p className="whitespace-pre-wrap text-body-lg break-words">{chat.thought}</p></section></div>}
        {analysisMessage ? <p role="status" className="text-body-lg text-secondary">{analysisMessage}</p> : <LockedAnswer hintsOnly chat={chat} hints={hints} selectedChoice={draft.choiceIndex} onChoice={index => {
          if (!canWrite) return
          update(toggleChoice(latest.current, preparation, index))
          requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="내 생각"]')?.focus())
        }} />}
        <RequestError flow={flow} />
      </div>
    </div>
    {chat.status === 'LOCKED' && <QuestionComposer draft={chat} mode="locked" validation="" onChange={() => {}} onSubmit={() => {}}
      thought={draft.text} getThoughtDraft={() => latest.current} onThoughtRestore={update}
      onThoughtChange={(value, edit) => update(editThoughtDraft(latest.current, value, edit))}
      thoughtBlocked={blocked} thoughtPhase={chat.analysis ? 'pending' : flow.busy === 'thought' ? 'submitting' : 'writing'}
      thoughtActionLabel={chat.analysis?.status === 'FAILED' ? '분석 실패' : '분석 대기 중'}
      onThoughtSubmit={() => { if (canWrite) flow.submitThought(latest.current) }} />}
  </>
}

function RequestError({ flow }: { flow: Workspace }) {
  if (!flow.error) return null
  return <div role="alert" className="text-body text-danger">
    <p>{flow.error}</p>
    {flow.requestId && <p className="text-caption">요청 ID {flow.requestId}</p>}
    {!flow.detached && (flow.needsSync || flow.saved.request || flow.saved.chatId && !flow.detail) &&
      <Button disabled={!!flow.busy} className="mt-2 gap-1.5 text-body text-danger" onClick={flow.retry}>다시 확인하기<Icon name="retry" /></Button>}
  </div>
}

function RailwayWorkspace({ client }: { client: BackendClient }) {
  const flow = useRailwayWorkspace(client)
  const [historyController] = useState(() => createRailwayHistoryController(client))
  const history = useSyncExternalStore(historyController.subscribe, historyController.getSnapshot)
  const [deletion, setDeletion] = useState<RailwayDeleteSelection | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletionError, setDeletionError] = useState(false)
  const deletionActive = useRef(false)
  const wasRedacted = useSyncExternalStore(subscribeRedaction, redactionOccurred, () => false)
  const cannotSave = useSyncExternalStore(subscribeStorage, storageUnavailable, () => false)
  const [params, setParams] = useSearchParams()
  const view = workspaceView(params)
  const show = (next: WorkspaceView) => setParams(previous => workspaceViewParams(previous, next))
  const chat = flow.detail
  const historyActive = view === 'history'
  useEffect(() => {
    const changeGuest = () => {
      historyController.invalidate()
      void historyController.refresh()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === GUEST_TOKEN_KEY || event.key === null)) changeGuest()
    }
    const unsubscribe = client.subscribeGuestInvalidation(() => {
      historyController.invalidate('게스트 세션이 만료됐어요. 학습 기록을 다시 불러와 주세요.')
    })
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
      historyController.stop()
    }
  }, [client, historyController])
  useEffect(() => {
    void historyController.refresh()
  }, [historyController, historyActive, flow.saved.chatId, chat?.status])

  function openChat(id: string) {
    const selection = historyController.select(id)
    if (selection?.chatId === undefined) return
    flow.openChat(selection.chatId, selection.guest)
    show('chat')
  }
  function askDeletion(id?: string) {
    const selection = historyController.select(id)
    if (!selection) return
    setDeletionError(false)
    setDeletion(selection)
  }
  async function confirmDeletion() {
    if (!deletion || deletionActive.current) return
    deletionActive.current = true
    setDeleting(true)
    setDeletionError(false)
    try {
      if (await historyController.confirm(deletion, flow.removeDeleted)) setDeletion(null)
    } catch {
      setDeletionError(true)
    } finally {
      deletionActive.current = false
      setDeleting(false)
    }
  }

  const editing = !flow.detached && !flow.saved.chatId && !flow.busy
  return <><AppShell title={view === 'guide' ? '이용 안내' : view === 'history' ? '학습 기록' : chat?.question ?? '새 채팅'}
    guideActive={view === 'guide'} historyActive={historyActive} recent={history.items}
    currentChatId={chat ? String(chat.chatId) : undefined} onOpenChat={openChat}
    historyError={!historyActive && history.status === 'error' ? history.error : undefined}
    onHistoryRetry={() => void historyController.refresh()} onDeleteAll={() => askDeletion()} onGuide={() => show('guide')} onHistory={() => show('history')}
    onNewChat={() => { flow.reset(); show('chat') }}>
    <main className="flex min-h-0 flex-1 flex-col">
      {wasRedacted && <p role="status" className="px-6 py-1 text-caption text-brand-deep">알려진 비밀정보를 저장·전송 데이터에서 [REDACTED]로 가렸어요. 작성 중인 원문은 입력칸에 남을 수 있어요.</p>}
      {cannotSave && <p role="alert" className="px-6 py-1 text-caption text-danger">브라우저 임시 저장을 사용할 수 없어 새로고침 시 복구되지 않을 수 있어요.</p>}
      {view === 'guide' ? <UsageGuide /> : historyActive ? <LearningHistory items={history.items} status={history.status} error={history.error}
          onRetry={() => void historyController.refresh()} onOpen={openChat} onDelete={askDeletion} />
        : chat?.prepareStatus === 'DONE' ? <ReadyChat key={chat.chatId} chat={chat} flow={flow} />
        : <>
          {editing && <Welcome onSelect={question => {
            const index = exampleQuestions.findIndex(item => item.question === question)
            if (index >= 0) flow.submit({ question, code: '', type: exampleQuestions[index].type }, exampleIds[index])
          }} />}
          {!editing && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4"><div className="mx-auto flex w-full max-w-content flex-col gap-5">
            {(chat || flow.busy === 'create') && <QuestionBubble draft={chat ?? flow.saved.draft} />}
            {!flow.error && !flow.detached && (chat?.prepareStatus === 'PREPARING' || flow.busy) && <p role="status" className="text-body-lg text-muted">{flow.saved.chatId && !chat ? '대화 상태를 확인하고 있어요…' : '질문을 읽고 있어요…'}</p>}
            {chat?.prepareStatus === 'FAILED' && !flow.busy && !flow.needsSync && <Button className="self-start gap-1.5 text-body text-danger" onClick={flow.retry}>다시 시도해 주세요<Icon name="retry" /></Button>}
            <RequestError flow={flow} />
          </div></div>}
          {editing ? <>
            <div className="mx-auto w-full max-w-content px-6"><RequestError flow={flow} /></div>
            <QuestionComposer draft={flow.saved.draft} mode="editing" validation="" onChange={flow.updateDraft} onSubmit={() => flow.submit(flow.saved.draft)} thought="" onThoughtChange={() => {}} />
          </> : !flow.detached && <QuestionComposer draft={chat ?? flow.saved.draft} mode="creating" validation="" onChange={() => {}} onSubmit={() => {}} thought="" onThoughtChange={() => {}} />}
        </>}
    </main>
  </AppShell>
  {deletion && <DeleteConfirmation
    target={deletion.chatId === undefined ? { kind: 'all' } : { kind: 'chat', chatId: String(deletion.chatId) }}
    busy={deleting} error={deletionError} onCancel={() => setDeletion(null)} onConfirm={() => void confirmDeletion()} />}
  </>
}

export function RailwayHomePage({ baseUrl }: { baseUrl?: string }) {
  const [client] = useState(() => {
    if (!baseUrl) return null
    try { return makeRailwayClient(baseUrl) } catch { return null }
  })
  return client ? <RailwayWorkspace client={client} /> : <AppShell title="새 채팅" onNewChat={() => {}}>
    <main className="m-auto p-6 text-body text-secondary">API 주소를 설정한 뒤 다시 열어 주세요.</main>
  </AppShell>
}
