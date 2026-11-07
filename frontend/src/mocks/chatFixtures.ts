import type { QuestionType } from '../types/chat.ts'

type Preparation = { choices: [string, string, string]; exampleSentence: string }
// No answer, analysis result, or unopened hint is present in fixtures.
const preparations: Record<QuestionType, Preparation> = {
  FREE: {
    choices: ['현재 알고 있는 조건', '먼저 확인할 부분', '확인할 방법'],
    exampleSentence: '지금 알고 있는 조건부터 정리하고, 어떤 상황에서 문제가 생기는지 작은 예시로 확인해 볼래요.',
  },
  DEBUGGING: {
    choices: ['첫 실행 때의 값', '데이터가 도착하는 시점', '입력과 실행 조건'],
    exampleSentence: '처음 실행할 때 값이 무엇인지 console.log로 찍어 보고, 값이 바뀌는 시점도 확인해 볼래요.',
  },
  CONCEPT: {
    choices: ['개념의 의미', '필요한 상황과 조건', '작은 예시로 확인'],
    exampleSentence: '이 개념이 필요한 조건을 먼저 정리하고, 적용한 경우와 적용하지 않은 경우를 작은 예시로 비교해 볼래요.',
  },
  PROBLEM_SOLVING: {
    choices: ['해결하려는 요구사항', '나눠 볼 수 있는 단계', '예외 상황과 검증'],
    exampleSentence: '우선 해결하려는 조건을 나눠 보고, 같은 동작이 반복되는 상황에서 어떤 일이 생기는지 확인해 볼래요.',
  },
  DESIGN: {
    choices: ['선택에 영향을 주는 조건', '비교할 대안', '장단점과 선택 근거'],
    exampleSentence: '우선 선택에 영향을 주는 조건을 정리하고, 가능한 대안의 장단점을 같은 조건 아래에서 비교해 볼래요.',
  },
}
export function getPreparation(type: QuestionType, question: string): Preparation {
  if (type === 'DEBUGGING' && /users/i.test(question)) return {
    choices: ['첫 렌더링 때 users 값', '데이터가 도착하는 시점', 'useState 초기값'],
    exampleSentence: 'users를 처음 렌더링할 때 값이 무엇인지 console.log로 찍어서 확인해 볼래요.',
  }
  return preparations[type]
}
