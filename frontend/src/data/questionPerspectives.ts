import type { QuestionType } from '../types/chat.ts'
export const questionPerspectives: Record<QuestionType, readonly string[]> = {
  FREE: [],
  CONCEPT: ['정의', '적용 조건', '예시', '한계'],
  DEBUGGING: ['재현 조건', '원인 가설', '확인 방법', '수정의 영향'],
  PROBLEM_SOLVING: ['요구사항', '접근법', '예외', '검증 방법'],
  DESIGN: ['조건', '대안', '장단점', '선택 근거'],
}
