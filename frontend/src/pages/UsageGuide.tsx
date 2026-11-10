import type { ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'

function Step({ number, title, description, children }: { number: number; title: string; description: string; children: ReactNode }) {
  return <Card className="flex min-w-0 flex-col gap-2 px-4 py-3.5">
    <h3 className="flex items-center gap-1.5 text-body font-medium"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] text-guide-number">{number}</span>{title}</h3>
    <p className="text-caption text-secondary">{description}</p>
    {children}
  </Card>
}
const miniature = 'min-w-0 rounded-[10px] bg-sidebar px-3 py-2'
const chip = 'rounded-control border border-line px-2 py-0.5 text-micro text-secondary'

// Figma's static illustrations. These never submit a question or display chat data.
export function UsageGuide() {
  return <section aria-label="이용 안내" className="min-h-0 flex-1 overflow-y-auto px-5 pt-7 pb-4 md:px-6">
    <div className="mx-auto flex w-full max-w-content flex-col gap-[22px]">
      <h2 className="text-[20px] leading-7 font-semibold">내 생각을 먼저 남기면, AI 답변이 열려요.</h2>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Step number={1} title="질문을 보내요" description="궁금한 개념이나 짧은 코드를 보내요.">
          <div className={miniature}><div className="flex flex-col gap-3.5 rounded-xl border border-line bg-page px-3 pt-3 pb-2.5">
            <p className="text-caption">목록을 불러오는데 users가 undefined라고 나와요</p>
            <div className="overflow-x-auto rounded-lg bg-sidebar px-2.5 py-1.5"><code className="block whitespace-nowrap font-code text-micro leading-[14px] text-secondary">const [users, setUsers] = useState();</code></div>
            <div className="flex items-center gap-1.5"><span className={chip}>+ 코드 추가</span><span className={chip}>질문 유형 디버깅</span><span className="ml-auto flex size-[22px] shrink-0 items-center justify-center rounded-control bg-brand"><Icon name="guideSend" /></span></div>
          </div></div>
        </Step>
        <Step number={2} title="접근을 고르거나 내 생각을 써요" description="접근을 고르거나, 내 생각을 공백 포함 30자 이상 써요.">
          <div className={`${miniature} flex flex-col gap-1.5`}>
            <div className="flex self-start gap-0.5 rounded-full bg-page p-[3px] text-caption"><span className="rounded-full border border-brand bg-brand-soft px-2.5 py-1 text-brand-deep">살펴볼 지점</span><span className="px-2.5 py-1 text-secondary">힌트</span></div>
            <div className="flex flex-wrap gap-1.5 text-micro"><span className="rounded-full bg-brand-subtle px-2.5 py-1">첫 렌더링 때 users 값</span><span className="rounded-full bg-brand-subtle px-2.5 py-1">데이터가 도착하는 시점</span></div>
            <div className="flex items-center gap-2 rounded-full border border-line bg-page px-3.5 py-1.5 text-micro text-muted"><span>고른 방향이나 내 생각을 이어서 써요</span><span className="ml-auto shrink-0">0 / 30자</span></div>
          </div>
        </Step>
        <Step number={3} title="막히면 힌트를 봐요" description="막히면 힌트를 보고 기초 학습으로 이어가요.">
          <div className={`${miniature} px-3.5`}><div className="flex flex-col gap-1.5 rounded-panel bg-ai-surface px-1 pt-1 pb-0.5">
            <p className="text-micro text-muted">힌트 1 / 2</p><p className="text-caption">users가 데이터를 받아 오기 전에는 어떤 값일지 떠올려 보세요.</p>
            <div className="h-px bg-guide-divider" /><div className="flex items-center gap-2"><p className="flex-1 text-micro text-secondary">잘 모르겠다면 기초 학습으로 이어가요</p><span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-guide-next-line bg-guide-next-bg"><Icon name="guideNext" /></span></div>
          </div></div>
        </Step>
        <Step number={4} title="내 생각과 AI를 비교해요" description="내 생각과 AI 참고 관점을 나란히 보여 줘요.">
          <div className={`${miniature} flex flex-col gap-1.5`}>
            <div className="flex flex-wrap gap-1.5 text-caption font-medium">{[['공통', 'border-common-line text-common-fg'], ['오류', 'border-conflict-line text-conflict-fg'], ['보완', 'border-complement-line text-complement-fg'], ['고유', 'border-unique-line text-unique-fg'], ['판단 보류', 'border-hold-line text-hold-fg']].map(([label, style]) => <span key={label} className={`rounded-full border px-2.5 py-0.5 leading-4 ${style}`}>{label}</span>)}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-me-surface px-2.5 py-2"><p className="text-micro text-muted">내 생각</p><p className="mt-0.5 text-caption">첫 렌더링 때 users 값부터 볼게요.</p></div>
              <div className="rounded-lg bg-ai-surface px-2.5 py-2"><p className="text-micro text-muted">AI</p><p className="mt-0.5 text-caption">처음에는 users가 undefined예요.</p></div>
            </div>
          </div>
        </Step>
      </div>
      <section className="flex flex-col gap-2 pt-1" aria-label="알아두세요">
        <h3 className="flex items-center gap-1.5 text-body font-medium"><Icon name="guideAlert" />알아두세요</h3>
        {([['guideInfo', 'AI 답변은 정답이 아닌 참고 관점이에요. 중요한 내용은 직접 확인해 주세요.'], ['guideShield', '코드를 붙여 넣을 때는 개인정보와 키를 지워 주세요.'], ['guideStorage', '게스트로 쓰는 동안 기록은 이 브라우저에 자동 저장돼요.']] as const).map(([icon, text]) => <p key={icon} className="flex items-center gap-2 rounded-xl bg-guide-notice py-[9px] pr-4 pl-3.5 text-caption text-secondary"><Icon name={icon} />{text}</p>)}
      </section>
    </div>
  </section>
}
