import type { LockedChat } from '../types/chat.ts'
import type { BasicLearningTransition } from '../types/learning.ts'
import type { BasicLearningResult } from '../types/basicLearningResult.ts'

// Synthetic DEV fixtures only. No actual AI or private server answers are bundled.
export function buildBasicLearningFixture(chat: LockedChat, transition: BasicLearningTransition, resultId: string): BasicLearningResult {
  let referenceAnswer: string, concept: string, exampleCode: string, observe: string, change: string
  if (/users/i.test(chat.question + chat.code)) {
    referenceAnswer = '처음 렌더링될 때는 fetch 결과가 오기 전이라 users가 undefined예요. 그 상태에서 users.map을 호출해서 오류가 나요. useState([])처럼 초기값을 주면 빈 목록부터 그려요.'
    concept = '목록을 불러오기 전에는 users에 값이 아직 없어요. 값이 없는 상태(undefined)와 빈 목록([])이 다르다는 것부터 같이 확인해 봐요.'
    exampleCode = 'const [users, setUsers] = useState(); // 처음 값: undefined\nconsole.log(users); // 처음에는 무엇이 찍힐까요?'
    observe = '처음 렌더링에서 users 값을 찍어 보세요.'
    change = 'useState([])로 바꾸면 처음 값이 어떻게 달라질까요?'
  } else if (/반복문|마지막 값|인덱스/u.test(chat.question)) {
    referenceAnswer = '배열의 인덱스는 0부터 시작해요. 길이가 3인 배열의 마지막 인덱스는 2이고, 인덱스 3의 값은 undefined예요. 반복 조건이 배열 길이를 포함하는지 확인해 보세요.'
    concept = '배열 길이는 항목의 개수이고, 인덱스는 위치를 가리켜요. 마지막 위치는 길이보다 1 작다는 차이부터 살펴봐요.'
    exampleCode = 'const values = [10, 20, 30];\nconsole.log(values.length, values[2], values[3]);'
    observe = '배열 길이와 마지막 두 인덱스의 값을 각각 확인해 보세요.'
    change = '반복 조건을 i <= values.length에서 i < values.length로 바꾸어 비교해 보세요.'
  } else if (/트랜잭션/u.test(chat.question)) {
    referenceAnswer = '여러 변경이 함께 성공하거나 함께 취소되어야 할 때 트랜잭션을 사용해요. 출금만 저장되고 입금이 실패하면 데이터가 어긋나므로 송금의 두 변경을 한 단위로 묶을 수 있어요.'
    concept = '원자성은 묶인 작업이 모두 반영되거나 모두 취소되는 성질이에요. 실패 시 일부 변경만 남는 상황을 먼저 구분해 봐요.'
    exampleCode = 'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nROLLBACK; -- 실패 상황을 가정한 취소 예시'
    observe = '두 변경 사이에 실패하면 어떤 값이 남을지 예상해 보세요.'
    change = '테스트 데이터에서 ROLLBACK과 COMMIT을 나누어 반영 결과를 비교해 보세요.'
  } else if (/결제|두 번|중복/u.test(chat.question)) {
    referenceAnswer = '화면에서 버튼을 비활성화하면 중복 클릭을 줄일 수 있어요. 재전송까지 막으려면 서버가 같은 요청 키를 확인하고 이미 처리한 결과를 재사용해야 해요.'
    concept = '멱등성은 같은 요청을 여러 번 보내도 효과가 한 번 처리한 것과 같도록 만드는 성질이에요. 클릭 방지와 서버 중복 처리 방지는 역할이 달라요.'
    exampleCode = '// 서버 처리 흐름을 보여 주는 의사 코드\nif (processed.has(requestKey)) return processed.get(requestKey);\n// 실제 결제에서는 원자적 저장과 동시 요청 제어도 필요해요.'
    observe = '같은 키로 두 번 요청했을 때 처리 횟수와 응답을 기록해 보세요.'
    change = '다른 키를 사용한 요청과 같은 키의 재전송을 구분해 테스트해 보세요.'
  } else {
    referenceAnswer = '질문을 입력, 처리, 결과로 나누어 생각해 보세요. 가장 작은 입력에서 기대한 결과와 실제 동작을 비교하면 다음에 확인할 조건을 찾을 수 있어요.'
    concept = '입력은 시작하는 값, 처리는 값을 바꾸는 과정, 출력은 그 결과예요. 각 단계를 따로 관찰하면 문제가 생기는 경계를 좁힐 수 있어요.'
    exampleCode = 'const input = 1;\nconst output = input + 1;\nconsole.log({ input, output });'
    observe = '작은 입력 하나에서 예상한 결과를 먼저 적어 보세요.'
    change = '입력 조건 하나를 바꾸어 예상과 실제 결과를 다시 비교해 보세요.'
  }
  return { chatId: chat.id, transitionId: transition.transitionId, resultId, learningPath: 'BASIC', status: 'DONE', excludeFromGrowth: true,
    referenceAnswer, concept, exampleCode, steps: [{ title: '먼저 관찰해요', text: observe }, { title: '그다음 바꿔요', text: change }] }
}
