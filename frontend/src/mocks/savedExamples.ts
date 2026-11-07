// Synthetic demo answers only. This module is exclusively imported by DEV-only MSW.
// Real saved answers must stay on the server and be fetched after the server unlocks.
import { exampleQuestions } from '../data/newChat.ts'
import type { LockedChat } from '../types/chat.ts'
import type { ComparisonResult } from '../types/comparison.ts'
const responses = [
  '배열의 마지막 인덱스는 length - 1이에요. 반복 조건이 i <= length이면 마지막 반복에서 배열 범위를 벗어나 undefined를 읽을 수 있어요. i < length인지 확인하고, 반복마다 인덱스와 배열 길이를 출력해 보세요.',
  '여러 데이터 변경이 함께 성공하거나 함께 취소되어야 할 때 트랜잭션을 고려해요. 예를 들어 송금의 출금과 입금이 따로 반영되면 일관성이 깨져요. 실패 시 롤백과 동시 실행의 격리 수준도 확인해 보세요.',
  '버튼 비활성화로 중복 클릭을 줄이고, 서버에서는 같은 결제 요청의 멱등성 키와 처리 상태를 확인해요. 화면 제어만으로는 재전송을 막을 수 없으므로 서버 중복 처리 방지가 함께 필요해요.',
]
export function isSavedExample(chat: LockedChat) {
  return chat.classification?.requestedType !== 'FREE' && !chat.code.trim() && exampleQuestions.some(example => example.question === chat.question && example.type === chat.type)
}
export function buildSavedExample(chat: LockedChat, thought: string, jobId: string, resultId: string): ComparisonResult {
  const index = exampleQuestions.findIndex(example => example.question === chat.question && example.type === chat.type)
  if (!isSavedExample(chat) || index < 0) throw new Error('Not a saved example')
  return { chatId: chat.id, jobId, resultId, status: 'DONE', learningPath: 'SELF', responseSource: 'SAVED_EXAMPLE',
    thought, referenceAnswer: responses[index], findings: [{ id: 'saved-check', category: 'UNDETERMINED',
      title: '저장된 참고 관점과 직접 비교해 보세요', question: '내 생각과 참고 관점이 각각 어떤 조건에서 성립하나요?',
      reason: '시연용 저장 응답이므로 내 생각을 실시간으로 분석한 판단은 제공하지 않아요.',
      verification: '작은 입력과 실패 조건을 바꿔 실행 결과를 확인해 보세요.' }] }
}
