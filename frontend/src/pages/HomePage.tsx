import { DeleteConfirmation } from '../components/layout/DeleteConfirmation'
import type { DeleteTarget } from '../components/layout/DeleteConfirmation'
import { deleteMockData } from '../api/dataDeletion'
import { clearDeletedMockDrafts } from '../storage/dataDeletion'
import { useSearchParams } from 'react-router'
import { UsageGuide } from './UsageGuide'
import { workspaceView, workspaceViewParams } from '../data/workspaceView'
import type { WorkspaceView } from '../data/workspaceView'
import { useConversationHistory } from '../hooks/useConversationHistory'
import { shouldRefreshHistory } from '../data/history'
import { LearningHistory } from '../components/history/LearningHistory'
import { redactionOccurred, subscribeRedaction } from '../security/redactionNotice'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { storageUnavailable, subscribeStorage } from '../storage/session'
import { AppShell } from '../components/layout/AppShell'
import { Welcome } from '../components/chat/Welcome'
import { QuestionComposer } from '../components/chat/QuestionComposer'
import { QuestionBubble } from '../components/chat/QuestionBubble'
import { ThoughtFlow } from '../components/chat/ThoughtFlow'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { useQuestionFlow } from '../hooks/useQuestionFlow'
import { defaultQuestionType } from '../data/questionTypes'
import { exampleQuestions } from '../data/newChat'

export function HomePage() {
  const { draft, flow, validation, submit, reset, openChat, updateDraft, retry } = useQuestionFlow()
  const wasRedacted = useSyncExternalStore(subscribeRedaction, redactionOccurred, () => false)
  const cannotSave = useSyncExternalStore(subscribeStorage, storageUnavailable, () => false)
  const [deletion, setDeletion] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletionError, setDeletionError] = useState(false)
  const deletionActive = useRef(false)
  const mockDeletion = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true'
  const [revision, setRevision] = useState(0)
  const history = useConversationHistory()
  const refreshHistory = history.refresh
  const [params, setParams] = useSearchParams()
  const view = workspaceView(params)
  const historyActive = view === 'history'
  const guideActive = view === 'guide'
  const secondaryActive = historyActive || guideActive
  const currentChatId = flow.stage === 'locked' ? flow.chat.id : undefined
  const wasHistory = useRef(secondaryActive)
  const historyNavigation = useRef({ historyActive, stage: flow.stage, chatId: currentChatId })
  function askDeletion(target: DeleteTarget) { setDeletionError(false); setDeletion(target) }
  async function confirmDeletion() {
    if (!deletion || deletionActive.current) return
    deletionActive.current = true; setDeleting(true); setDeletionError(false)
    const id = deletion.kind === 'chat' ? deletion.chatId : undefined
    try {
      await deleteMockData(id)
      const resetWorkspace = clearDeletedMockDrafts(id)
      if (resetWorkspace || id === currentChatId) { wasHistory.current = false; reset(); setRevision(v => v + 1) }
      history.removeDeleted(id)
      setDeletion(null)
    } catch { setDeletionError(true) }
    finally { deletionActive.current = false; setDeleting(false) }
  }
  useEffect(() => {
    const current = { historyActive, stage: flow.stage, chatId: currentChatId }
    const refresh = shouldRefreshHistory(historyNavigation.current, current)
    historyNavigation.current = current
    // The hook loads once on mount. A background chat restore must not silently
    // retry a failed history request while the history page is already open.
    if (refresh) refreshHistory()
  }, [historyActive, flow.stage, currentChatId, refreshHistory])
  useEffect(() => {
    if (wasHistory.current && !secondaryActive && currentChatId) openChat(currentChatId)
    wasHistory.current = secondaryActive
  }, [secondaryActive, currentChatId, openChat])
  function showView(next: WorkspaceView) { setParams(previous => workspaceViewParams(previous, next)) }
  function selectChat(id: string) { wasHistory.current = false; openChat(id); showView('chat'); setRevision(v => v + 1) }
  return <><AppShell onDeleteAll={mockDeletion ? () => askDeletion({ kind: 'all' }) : undefined} title={guideActive ? '이용 안내' : historyActive ? '학습 기록' : flow.stage === 'editing' ? '새 채팅' : draft.question} currentQuestion={flow.stage === 'editing' ? undefined : draft.question}
    recent={history.items} historyActive={historyActive} guideActive={guideActive} onGuide={() => showView('guide')} currentChatId={currentChatId} historyError={!secondaryActive && history.status === 'error' ? history.error : undefined}
    onHistory={() => showView('history')} onOpenChat={selectChat} onHistoryRetry={history.refresh}
    onNewChat={() => { wasHistory.current = false; reset(); showView('chat'); setRevision(v => v + 1) }}>
    <main className="flex min-h-0 flex-1 flex-col">
      {wasRedacted && <p role="status" className="px-6 py-1 text-caption text-brand-deep">알려진 비밀정보를 저장·전송 데이터에서 [REDACTED]로 가렸어요. 작성 중인 원문은 입력칸에 남을 수 있어요.</p>}
      {cannotSave && <p role="alert" className="px-6 py-1 text-caption text-danger">브라우저 임시 저장을 사용할 수 없어 새로고침 시 복구되지 않을 수 있어요.</p>}
      {!guideActive && import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true' && <p className="px-6 py-1 text-caption text-muted">MSW Mock · 실제 AI 미연결{new URLSearchParams(location.search).get('demo') === 'true' ? ' · 저장 예시 시연 모드' : ''}</p>}
      {guideActive ? <UsageGuide /> : historyActive ? <LearningHistory items={history.items} status={history.status} error={history.error} onRetry={history.refresh} onOpen={selectChat} onDelete={mockDeletion ? id => askDeletion({ kind: 'chat', chatId: id }) : undefined} /> : flow.stage === 'restoring' || flow.stage === 'restore-error' ? <div className="m-auto p-6">{flow.stage === 'restoring' ? <p role="status">저장된 대화 상태를 확인하고 있어요…</p> : <div role="alert"><p>{flow.message}</p><Button onClick={retry}>다시 불러오기</Button></div>}</div> : flow.stage === 'locked' ? <ThoughtFlow key={flow.chat.id} chat={flow.chat} restoredReceipt={flow.receipt} restoredBasic={flow.basicLearning} cancellationDraft={flow.cancellationDraft} onReconcile={() => openChat(flow.chat.id)} /> : <>
        {flow.stage === 'editing' ? <Welcome onSelect={question => {
          const example = exampleQuestions.find(item => item.question === question)
          submit({ question, code: '', type: example?.type ?? defaultQuestionType })
        }} /> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" aria-busy={flow.stage === 'creating'}>
          <div className="mx-auto flex w-full max-w-content flex-col gap-5">
            <QuestionBubble key={revision} draft={draft} />
            {flow.stage === 'creating' && <div role="status"><p className="text-caption text-secondary">StackOverGrow</p><p className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">질문을 읽고 있어요…</p></div>}
            {flow.stage === 'error' && <div role="alert"><p className="text-caption text-secondary">StackOverGrow</p><p className="mt-2 text-body text-secondary">{flow.message}</p><Button className="mt-2 gap-1.5 text-body text-danger" onClick={retry}>다시 시도해 주세요<Icon name="retry" /></Button></div>}
          </div>
        </div>}
        <QuestionComposer key={revision} draft={draft} mode={flow.stage} validation={validation} onChange={updateDraft} onSubmit={() => submit()} thought="" onThoughtChange={() => {}} />
      </>}
    </main>
  </AppShell>{deletion && <DeleteConfirmation target={deletion} busy={deleting} error={deletionError} onCancel={() => setDeletion(null)} onConfirm={() => { void confirmDeletion() }} />}</>
}
