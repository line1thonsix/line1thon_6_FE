import type { LockedChat } from '../types/chat.ts'
import type { HintLevel } from '../types/hints.ts'

// Synthetic guidance only, generated inside the DEV-only Mock boundary.
// Never use the hidden reference answer as blurred/decorative content.
export function openedHints(chat: LockedChat, level: HintLevel) {
  const users = /users/i.test(chat.question + chat.code)
  const texts = users ? [
    'users가 데이터를 받아 오기 전에는 어떤 값일지 떠올려 보세요.',
    'users.map을 부르는 줄 바로 앞에서 users 값을 찍어 보세요.',
  ] : [
    '질문에서 알고 있는 조건과 아직 확인하지 못한 조건을 나누어 보세요.',
    '가장 작은 예시 하나에서 예상한 값과 실제 값을 단계별로 기록해 보세요.',
  ]
  return texts.slice(0, level).map((text, index) => ({ level: (index + 1) as 1 | 2, text }))
}
