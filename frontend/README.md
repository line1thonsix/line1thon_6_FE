# Deveil frontend

React + TypeScript + Vite + Tailwind CSS 기반의 PC UI입니다.
질문 입력 → 생성 로딩·오류 → 답변 잠금까지 MSW로 동작합니다. 실제 백엔드·AI는 연결하지 않았습니다.

## 실행

```sh
npm install
npm run dev:mock
```

Vite가 출력하는 주소로 접속합니다. 기본 포트는 5173입니다.
`npm run dev`는 UI만 실행하며, Mock 모드가 아니면 질문 전송을 안내 메시지로 차단합니다.
프로덕션 빌드에서도 Mock API를 호출하거나 Worker를 시작하지 않습니다.

```sh
npm run build     # TypeScript 검사 + 프로덕션 빌드
npm run lint
npm test          # 검증 경계값·잠금 데이터·중복 생성·오류 재시도 테스트
npm run preview
```

## Mock 시나리오

Mock 서버에서 다음 URL 매개변수를 사용합니다. 실제 서비스 요청 계약에는 포함되지 않습니다.

- `/`: 약 1.2초 후 질문 생성 성공, LOCKED 상태
- `/?mock=error-once`: 첫 요청 실패, 같은 요청 재시도 시 성공
- `/?mock=error`: 계속 실패
- `/?mock=slow`: 약 5초 후 성공 (로딩·새 채팅 중 요청 취소 검증)

MSW는 개발 모드의 `VITE_ENABLE_MOCKS=true`일 때만 동적 로드합니다.
`.env.mock`이 이를 활성화합니다. 또는 `.env.example`을 `.env.local`로 복사해 설정할 수 있습니다.
데이터와 중복 방지 기록은 메모리에만 있으며, 새로고침 후 영구 복구는 이번 범위에 포함되지 않습니다.

## 현재 범위

- 질문 유형 5개, 질문 1~2,000자·선택 코드 최대 6,000자
- Enter 전송, Shift+Enter 줄바꿈, IME 조합 중 전송 방지
- 예시 질문 카드는 해당 유형으로 즉시 전송 (작성 중 코드 대신 예시 자체를 전송)
- 코드 접기·펼치기와 확대, 코드 미실행
- 전송 후 질문·코드·유형 변경 금지, 중복 전송 즉시 차단
- 오류 시 질문·코드 보존, 동일한 Mock 요청 ID로 재시도
- 새 채팅 시 진행 중 요청 취소, 늦은 응답 무시
- 잠금 화면의 선택지 3개·예시 문장을 내 생각 초안에 삽입
- 내 생각 제출, 힌트, 잠금 해제, 분석·결과, 영구 기록은 미구현

잠금 배경은 장식용 선입니다. 기준 답변·분석 결과·미공개 힌트는 Mock fixture와 응답에 없습니다.
응답을 UI 상태로 옮길 때도 공개 가능한 필드만 새 객체에 복사합니다.
코드·유형 선택과 내 생각 제출 버튼은 전송 후 적절히 비활성화합니다.

## 구조와 임시 계약

- `src/components/ui`: Button, Card, Input, Textarea, Icon
- `src/components/layout`: AppShell, Sidebar, Header
- `src/components/chat`: 입력창, 코드 에디터, 유형 선택, 질문 말풍선, 잠금 카드
- `src/hooks/useQuestionFlow.ts`: 입력·로딩·오류·잠금 상태와 요청 수명 관리
- `src/styles/tokens.css`: 디자인 토큰 (PC 1440×900 기준)
- `src/types/chat.ts`: 프론트 화면 모델
- `src/api/mockChatContract.ts`: 개발 전용 임시 경로·요청 타입
- `src/api/chats.ts`: Mock 전용 HTTP 어댑터
- `src/api/lockedChat.ts`: 잠금 응답 허용 필드 투영
- `src/mocks`: 질문 생성·잠금 상세 조회 핸들러와 답을 포함하지 않는 fixture
- `tests/question-flow.test.mjs`: Node 내장 테스트와 MSW 통합 검증

`POST /api/chats`와 `GET /api/chats/:chatId`의 응답 구조·clientRequestId는 이번 UI용 임시 Mock 계약입니다.
실제 서버의 인증(쿠키/헤더), DTO, 중복 방지 규약, 생성 상태 조회와 오류 계약은 확정하지 않았습니다.
실제 연동 때 HTTP 어댑터와 Mock 계약을 교체해야 합니다. 이번 Mock의 접근 제어는 실제 서버 보안 검증을 대신하지 않습니다.

게스트 자동 저장 문구는 Figma 문구이며 이번 단계에는 영구 저장 기능이 없습니다.
폰트는 SF Pro 우선, 없으면 OS 대체 글꼴을 사용하며 모바일 디자인은 이번 범위가 아닙니다.
BrowserRouter 배포 시 정적 호스트에 SPA fallback 설정이 필요합니다.
`VITE_` 환경 변수에는 비밀키를 넣지 마세요. `../docs`는 변경하지 않습니다.
