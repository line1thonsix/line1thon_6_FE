# F-19 분석 중지: 요구사항·검증·연동 메모

## 직접 확인한 최신 기준

2026-11-10 [Notion 기능명세서](https://app.notion.com/p/41438b8166de801dbdc1e957d6f5704e)의 F-19와 [Figma PC 07 (123:830)](https://www.figma.com/design/a0ftKPjygZBABCAYHCTgU7/1호선톤-6팀?node-id=123-830)을 읽었다. docs의 구버전을 최신으로 가정하지 않았다.

- 분석 중 전송 버튼을 중지 버튼으로 바꾸고 입력은 비활성화한다.
- 중지 후 잠금으로 복귀한다. 제출본은 제거하고 생각을 수정 가능한 초안으로 복원한다. 질문·코드·유형은 바꾸지 않는다.
- 수정 후 제출은 새 분석 작업을 시작한다. 중지는 분석 재시도 3회에 포함하지 않는다.
- 완료가 먼저 확정되면 중지는 실패하고 현재 결과를 표시한다. 중지된 작업의 늦은 응답은 결과로 저장/공개하지 않는다.
- 기초 학습 경로도 중지 시 잠금으로 돌아간다.
- 이미 보낸 AI 요청의 비용은 중지 후에도 발생할 수 있다.
- 반복 중지에 대한 분석 시작 횟수 제한은 **미정**이다. 임의 숫자를 적용하지 않았다.

## 구현 범위

- 하단 기존 전송 자리의 36×36 초록 버튼/12×12 흰 사각형을 사용한다. 별도 고정 문구, 확인 창, 완료 배지는 추가하지 않았다. 접근성 이름은 `분석 중지`이다.
- SELF: 서버 역할 Mock이 PENDING 작업을 취소 표시하고 제출본을 제거한다. 기존 실패 횟수는 보존하며 중지한 현재 시도 번호를 재사용한다. 예: 1회 실패 → 2번째 작업 중지 → 재제출은 시도 2, 새 작업 ID이다.
- BASIC: 현재 구조의 비동기 결과 GET 동안 중지할 수 있다. 전환 ID를 작업 세대로 사용하여 전환을 폐기하고, 지연 GET/전환 ACK가 예전 결과를 공개하지 못하게 한다. 힌트 2 공개 이력과 작성 초안은 유지한다. 다시 기초 학습을 선택하면 새 전환 ID를 만든다.
- 제출 전 초안을 계속 보관하고 선택지 자동완성의 보호 정보도 복원한다. 서버 기준 제출본과 초안은 구분한다. 서버에도 SELF 중지 복구용 안전한 초안이 남으므로 브라우저 초안이 없어도 복구할 수 있다.
- 중지 요청은 멱등 요청 ID를 사용한다. 응답이 불확실한 동안 결과를 공개하지 않고, 새로고침/상태 다시 확인은 상세 조회로 현재 잠금/작업을 판정한다. 이미 끝난/교체된 작업에 대한 중지는 현재 대화를 덮어쓰지 않는다.
- 이전 작업 ID의 결과 저장/재시도/제출 ACK/상태 GET/기초 학습 결과는 가드를 통과해야 한다. 저장소를 다시 읽은 Mock 인스턴스에서 취소해도 예전 인스턴스의 늦은 결과 저장은 차단한다.
- 취소된 대화는 F-17에서 잠금 상태이며 F-16 후속 질문은 차단된다. 정상 완료한 기존 대화의 비교·의견·회고·후속 질문 경로는 유지한다.

## 실행과 수동 체크리스트

`frontend/`에서 `npm run dev:mock`으로 실행한다. 표시된 주소에서 아래 쿼리를 사용할 수 있다. 모두 개발용 Mock에서만 동작하고 실제 API/운영 모드에는 연결하지 않는다.

- `?analysis=slow`: 새 SELF 작업 약 30초 지연.
- `?analysis=pending`: SELF 대기 상태 유지, 기존 90초 타임아웃 규칙 적용.
- `?basicResult=slow`: 기초 학습 결과 약 5초 지연.
- `?analysis=pending&cancel=error-once`: 중지는 저장하되 첫 중지 ACK만 503. 재시도 또는 새로고침 복구 확인용.
- `cancel=slow`는 중지 ACK 약 5초 지연, `cancel=error`는 ACK 계속 실패. 서버가 이미 중지했을 수 있으므로 UI는 상세 재조회 전 성공을 단정하지 않는다.

직접 확인:

- [ ] 질문/코드를 입력 → 생각 작성 → 분석 중 하단 정지 버튼 위치·색·크기를 확인한다. 입력·코드·유형은 비활성인지 확인한다.
- [ ] 정지 클릭 → 중복 클릭 차단 → 잠금 복귀, 제출한 생각이 입력창으로 돌아오는지 확인한다. 자동완성 보호/선택 상태도 확인한다.
- [ ] 초안 수정 후 재제출 → 새 분석 진행 → 정상 완료 후 수정된 생각 기준 비교 결과인지 확인한다.
- [ ] 중지 후 새로고침 → 잠금과 초안 복구, 이전 질문/코드 유지, 분석 자동 재시작 없음.
- [ ] 분석 중 새로고침 → 같은 작업 조회 재개 → 중지 가능.
- [ ] 1회 실패 후 재시도 중지 → 재제출에서 시도 2 유지. 3회 실패 완료 상태를 중지로 우회할 수 없는지 확인한다.
- [ ] 힌트 1 → 2(막힌 지점 미선택 가능) → 기초 학습 로딩 중 정지 → 잠금·초안·힌트 이력 복구. SELF 제출과 새 BASIC 전환을 각각 확인한다.
- [ ] `cancel=error-once`에서 중지 응답 실패 → 결과 비공개 → 새로고침/상태 다시 확인/같은 중지 재요청으로 서버 상태 복구.
- [ ] 완료 직전에 중지를 클릭하여 완료가 먼저이면 현재 결과가 보이고, 중지가 먼저이면 잠금인 것을 확인한다.
- [ ] 여러 차례 제출·중지 반복, 이전 대화 재진입, 학습 기록 분류와 후속 질문 잠금 확인.
- [ ] 기존 완료 대화에서 의견·회고·후속 질문, 힌트 이전/다음 이동을 확인한다.

## 이번 검증 기록

브라우저 1440×900에서 SELF 중지 → 잠금·초안 복귀 → 새로고침 복구 → 수정 후 재제출 → 수정본 비교 결과를 확인했다. BASIC 힌트 1→2(막힌 지점 미선택) → 결과 생성 중지 → 잠금과 원래 초안/힌트 2 복구도 확인했다. `cancel=error-once`에서 결과 미노출과 새로고침 후 서버 기준 잠금 복구를 확인했다.

완료/중지 경합의 양쪽 순서, 늦은 결과/GET/ACK, 복구된 Mock 인스턴스와 예전 인스턴스의 경합, 중복·오래된 요청, 3회 제한, 반복 중지, BASIC 완료 우선, 공개 전 F-16 차단은 자동 테스트로 검증한다. 실제 AI 제공자/서버 작업 중단 및 다중 기기 동시성은 검증한 것이 아니다.

## Mock 계약과 실제 백엔드 차이 / 협의 항목

로컬 API 명세서와 두 엔드포인트 CSV에는 분석 중지 경로가 없다. 원본 docs는 변경하지 않았다.

- 임시 Mock: `POST /api/chats/{chatId}/analysis/cancel`, 본문 `{ learningPath: 'SELF' | 'BASIC', jobId, clientRequestId }`. BASIC의 jobId는 현재 전환 ID다. 응답은 chatId/경로/작업 ID와 상태만 담는다. 성공 200 CANCELLED, 경합·오래된 대상은 409 COMPLETED/STALE_JOB/NOT_PENDING이다. 실제 BE 계약으로 확정한 것이 아니다.
- 실제 BE에서 인증·소유권·DB 원자적 상태 변경, 취소와 완료의 단일 승자, 작업 세대 토큰, 늦은 콜백 폐기, 재시도/전환과의 동시성을 구현해야 한다. 브라우저 AbortController만으로 서버/모델 작업이 취소되지 않는다.
- 모델 제공자의 실제 취소 가능 여부와 이미 발생한 비용, 취소 기록·보존 기간, 사용자 제출본 삭제와 초안 복구 데이터의 저장 범위를 합의해야 한다.
- 반복 중지에 대한 분석 시작 횟수/비용 제한은 최신 명세가 미정이므로 BE와 숫자·시간창·적용 단위를 먼저 정해야 한다. Mock에는 임의 제한을 두지 않았다.
- BASIC은 현재 F-12 결과 GET이 생성/공개 단계를 모킹한다. 실제 서버가 분석 작업으로 처리한다면 작업 ID/진행 상태/완료·중지 경쟁 규칙을 같은 모델로 연결해야 한다.
- 현재 Mock 저장소는 같은 탭에서 서버를 흉내 낸 개발 도구다. 실제 DB 트랜잭션이나 외부 AI 취소를 제공하지 않는다. 클라이언트의 중지 확인 후 상세 조회 및 늦은 응답 무시를 실제 API 어댑터와 연결해야 한다.

자동 검증 결과: `npm run build`, `npm run lint`, `npm test` 통과. 전체 134개(기존 118개 + F-19 추가 16개), 실패 0, 린트 경고 0.

## 변경 파일 목록

- `frontend/F19_TEST_CHECKLIST.md`
- `frontend/README.md`
- `frontend/src/api/analysisCancellation.ts`
- `frontend/src/api/restoreChat.ts`
- `frontend/src/components/chat/AnalysisStatus.tsx`
- `frontend/src/components/chat/BasicLearningResult.tsx`
- `frontend/src/components/chat/QuestionComposer.tsx`
- `frontend/src/components/chat/ResultConversation.tsx`
- `frontend/src/components/chat/ThoughtFlow.tsx`
- `frontend/src/hooks/useAnalysis.ts`
- `frontend/src/hooks/useAnalysisCancellation.ts`
- `frontend/src/hooks/useBasicLearningResult.ts`
- `frontend/src/hooks/useQuestionFlow.ts`
- `frontend/src/hooks/useThoughtSubmission.ts`
- `frontend/src/mocks/analysisStore.ts`
- `frontend/src/mocks/handlers.ts`
- `frontend/src/mocks/persistence.ts`
- `frontend/src/pages/HomePage.tsx`
- `frontend/tests/analysis-cancellation.test.mjs`
- `frontend/tests/review-demo.test.mjs`
