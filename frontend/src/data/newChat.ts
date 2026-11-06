import type { QuestionType } from '../types/chat'

// 화면용 콘텐츠이며 실제 API 계약과 분리합니다.
export const exampleQuestions: { label: string; question: string; type: QuestionType }[] = [
  { label: '디버깅', type: 'DEBUGGING', question: '반복문의 마지막 값이 왜 undefined일까요?' },
  { label: '개념 이해', type: 'CONCEPT', question: '트랜잭션은 언제 필요할까요?' },
  { label: '문제 해결 접근', type: 'PROBLEM_SOLVING', question: '결제 버튼을 두 번 누르면 어떻게 막죠?' },
]
