import type { LockedChat } from '../types/chat.ts'
import type { ComparisonResult, Finding } from '../types/comparison.ts'

export type ComparisonScenario = 'standard' | 'all-categories' | 'sparse' | 'invalid-quote' | 'all-invalid' | 'empty' | 'fetch-error'
export function buildComparisonFixture(chat: LockedChat, thought: string, jobId: string, resultId: string, scenario: ComparisonScenario): ComparisonResult {
  const sentences = thought.split(/(?<=[.!?。])\s+|\n+/u).filter(text => text.trim())
  const quote = sentences[0] ?? thought
  const uniqueQuote = sentences.find(text => text.includes('console.log')) ?? sentences[sentences.length - 1] ?? quote
  const conflictQuote = sentences.find(text => /항상|비어 있을|undefined는 빈 배열/u.test(text)) ?? quote
  const debugging = /users/i.test(chat.question + chat.code)
  const referenceAnswer = debugging
    ? '처음 렌더링될 때는 fetch 결과가 오기 전이라 users가 undefined일 수 있어요. 그 상태에서 users.map을 호출하면 오류가 나요. useState([])처럼 초기값을 주거나 데이터가 준비되었는지 확인할 수 있어요. 실제 응답이 배열인지도 확인해 보세요.'
    : '질문의 조건을 먼저 나누고, 현재 값과 실행 순서를 관찰해 보세요. 작은 예시에서 기대한 동작과 실제 동작을 비교하면 원인이나 선택 근거를 구체적으로 확인할 수 있어요. 적용 조건과 예외를 함께 검증하는 관점도 참고해 보세요.'
  const common: Finding = { id: 'common', category: 'COMMON', title: '내 접근과 맞닿는 부분', userQuote: quote,
    aiPerspective: debugging ? '처음 렌더링 때의 값을 확인하는 관점이에요.' : '조건을 나누고 관찰 가능한 값부터 확인하는 관점이에요.',
    reason: '입력한 생각에서 확인하려는 지점을 출발점으로 삼았어요. 작은 단위로 관찰하는 접근과 맞닿아 있어요.',
    verification: debugging ? '첫 렌더링에서 users 값이 무엇인지 직접 찍어 확인해 보세요.' : '현재 조건과 기대한 결과를 나란히 적고 작은 예시로 확인해 보세요.',
    ...(debugging ? { verificationCode: 'console.log(users); // 첫 렌더링에서 값 확인' } : {}) }
  const complement: Finding = { id: 'complement', category: 'COMPLEMENT', title: '한 가지 더 확인할 조건',
    aiPerspective: debugging ? 'users가 빈 배열일 때와 undefined일 때는 달라요. 초기값과 응답 형식을 함께 확인해 보세요.' : '같은 접근이 다른 입력이나 예외 조건에서도 동작하는지 확인해 볼 수 있어요.',
    reason: '추가 조건을 확인하면 생각을 적용할 수 있는 범위를 더 구체적으로 알 수 있어요.',
    conditions: debugging ? '데이터가 오기 전에 목록을 렌더링하거나 API 응답 형식이 달라지는 경우에 필요한 조건이에요.' : '입력의 형태나 실행 순서가 달라질 수 있는 상황에서 확인해 보세요.',
    verification: debugging ? 'useState()와 useState([])로 각각 바꿔 처음 화면을 비교해 보세요.' : '정상 입력과 경계 입력의 결과를 나눠서 확인해 보세요.',
    ...(debugging ? { verificationCode: 'const [users, setUsers] = useState([]);' } : {}) }
  const unique: Finding = { id: 'unique', category: 'UNIQUE', title: '나만의 아이디어도 확인해요', userQuote: uniqueQuote,
    reason: '직접 관찰하거나 비교해 보려는 시도는 질문에서 확인 가능한 근거를 더해요. 다른 접근이 반드시 더 낫다는 뜻은 아니에요.',
    verification: '값이나 조건이 바뀌기 전과 후의 결과를 각각 기록해 비교해 보세요.' }
  const conflict: Finding = { id: 'conflict', category: 'CONFLICT', title: '충돌하는 주장은 검증해요', userQuote: conflictQuote,
    aiPerspective: debugging ? 'undefined와 빈 배열은 서로 다른 값이에요.' : '한 조건에서의 결과만으로 모든 경우를 단정하기는 어려워요.',
    reason: '표현이 가리키는 값과 실제 실행 조건을 나눠 확인하면 해석 차이를 줄일 수 있어요.',
    conflictEvidence: debugging ? 'undefined에서 map을 호출하면 오류가 나지만 빈 배열의 map은 빈 배열을 반환해요.' : '입력이나 실행 순서가 달라지면 같은 결과가 보장되지 않을 수 있어요.',
    verification: debugging ? '렌더링 직전의 값을 찍고, 빈 배열인 경우와 undefined인 경우를 따로 비교해 보세요.' : '결과가 달라질 수 있는 조건을 하나 바꿔 같은 주장이 성립하는지 확인해 보세요.' }
  const hold: Finding = { id: 'hold', category: 'UNDETERMINED', title: '조건이 더 필요해요',
    question: debugging ? 'fetch가 성공했는지, 응답이 배열 모양인지도 같은가요?' : '어떤 입력과 실행 순서에서 같은 상황이 나타나나요?',
    reason: '현재 정보만으로는 여러 해석이 가능해서 결론을 내리지 않았어요. 실행 조건이나 관찰한 값이 더 필요해요.',
    verification: '입력과 실제 결과를 기록하고, 조건을 바꿔 같은 현상이 나타나는지 확인해 보세요.' }
  let findings: Finding[] = [common, complement]
  if (scenario === 'all-categories' || /console\.log|직접|비교|예시/u.test(thought)) findings.push(unique)
  if (scenario === 'all-categories' || /항상|비어 있을|undefined는 빈 배열/u.test(thought)) findings.push(conflict)
  findings.push(hold)
  if (scenario === 'sparse') findings = [common]
  if (scenario === 'invalid-quote') findings.push({ ...common, id: 'invalid-quote', userQuote: '원문에 존재하지 않는 조작된 인용입니다.' })
  if (scenario === 'all-invalid') findings = [{ ...common, userQuote: '원문에 존재하지 않는 조작된 인용입니다.' }]
  if (scenario === 'empty') findings = []
  return { chatId: chat.id, jobId, resultId, status: 'DONE', learningPath: 'SELF', thought, referenceAnswer, findings }
}
