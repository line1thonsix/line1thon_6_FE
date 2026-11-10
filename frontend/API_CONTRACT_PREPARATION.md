# 실제 API 연결 준비 — 2026-11-10

## 확인한 근거와 범위

아래 세 문서의 본문을 브라우저에서 직접 읽었다. 기존 F-19 분석을 재사용하고, API 공통 규칙·상태 전이·검증 및 질문 생성의 실제 상세 DTO에 집중했다. docs 파일을 최신 문서로 가정하지 않았다.

- [최신 API 명세](https://app.notion.com/p/API-41438b8166de80eabd2dedac7c85de17)
- [질문 생성 상세 DTO](https://app.notion.com/p/76138b8166de8293adb301e4da646c53)
- [잠금 상태 머신](https://app.notion.com/p/41438b8166de80049173f675bb07812a)
- [기능명세서](https://app.notion.com/p/41438b8166de801dbdc1e957d6f5704e)

질문 생성의 구현 상태는 문서상 Done이다. 실제 서버 URL·배포 상태·응답은 확인되지 않았다. 다른 API의 전체 DTO를 이번 작업에서 확인한 것으로 간주하지 않는다.

## 차이와 처리

| 항목 | 최신 계약 | 기존 Mock / 이번 처리 |
| --- | --- | --- |
| 인증 | `/api/sessions`, localStorage 토큰, `X-Guest-Token`, 쿠키 미사용, 401 INVALID_TOKEN 재발급 | Mock은 탭 저장소로 격리. 실제용 client/token store만 별도 추가, 자동 로그인·화면 연결 없음 |
| 질문 생성 | 숫자 chatId, 201 PREPARING 비동기 영수증. 같은 UUID는 200. choices는 상세 조회로 수령 | Mock은 UUID id와 준비 완료 choices를 한 번에 반환. 변경하지 않고 실제 POST 어댑터/영수증 타입 분리 |
| 질문 준비 | prepareStatus PREPARING/DONE/FAILED, 상세 GET 2초 폴링, FAILED에서 prepare/retry | 실제용 폴링 대상 판정과 경로 준비. 상세/재시도 DTO 및 UI 폴링 어댑터는 실제 응답 확인 후 연결 |
| 잠금 | LOCKED / UNLOCKED_SELF / UNLOCKED_ASSISTED. HINT·unlockType 없음 | 기존 LockedChat은 잠금 화면용 VM이며 실제 상태 DTO로 재사용하지 않음. 서버 상태를 정규화·검증하는 별도 모델 추가 |
| 분석 | mode COMPARE/BASIC, analysisStatus PENDING/DONE/FAILED. DONE과 채팅 해제를 서버 트랜잭션에서 함께 처리 | Mock의 SELF 분석 및 BASIC 결과 GET 구조 유지. 실제용 상태 조합/해제 검증으로 POST나 타임아웃만으로 공개하지 않도록 준비 |
| 힌트/BASIC | 상태 머신·기능명세서는 힌트 2만 필수, 막힌 지점 선택사항 | Mock 유지. API 표 basic-mode의 '힌트 1 + 막힌 지점 필수/즉시 해제' 설명은 다른 본문·호출 흐름과 충돌하여 협의 필요 |
| F-07 | 전체 생각(선택지 포함) trim 후 30~2,000, 공백 제외 서로 다른 문자 8개 | 현재 직접 작성분 최소/다양성 검증은 유지. 실제 API 전용 whole-text validator를 추가. UI 정책 변경은 하지 않음 |
| 질문/코드 | trim 후 JS/Java UTF-16 length, 질문 1~2,000 / 코드 최대 6,000; type 네 가지, FREE 없음 | 실제 요청 검증에 반영. 과거 Mock FREE 분류/복구와 UI 검증은 보존 |
| 기록 | category COMPARED/BASIC/null(공개 전), 최대 50개, 질문 40자 미리보기, ISO-8601 +09:00 | Mock learningPath/progress, 전체 질문, 밀리초 날짜와 구분. category 어휘만 분리하고 검증되지 않은 기록 DTO/날짜 변환 필드는 만들지 않음 |
| 사용량 | API 문서는 429 제한 MVP 제외, 기능명세서는 제한 요구 | 기존 Mock 시연/테스트 제한 유지. 실제 서버 제한은 적용 여부 협의 |
| 결과 조회 | 실제 명세는 `/analysis`에서 상태·결과 조회; 상세에는 답변/비교 없음 | Mock의 별도 `/result`, `/basic-learning/result`와 구분. 분석 DTO를 Mock resultId/jobId 구조로 임의 확정하지 않음 |

## 추가한 코드

`src/api/backend/`는 기존 화면·API 함수·MSW에서 가져오지 않는 별도 연결 준비 모듈이다. 실제 API 모드로 자동 전환하는 스위치나 Mock 실패 시 서버 호출 fallback은 없다.

- `contracts.ts`: 확인한 상태 어휘·숫자 ID·네 가지 질문 유형·예시 ID·질문 POST DTO·확인된 핵심 경로. 취소/후속/삭제/회고/의견 호출은 추가하지 않았다.
- `lockState.ts`: 문서의 9가지 조합 검증, 2초 폴링 대상 판정, 해제 상태의 재잠금/다른 경로 전환 거부, 공개 전 결과 디코딩 차단. **정규화 모델이며 상세/분석 wire DTO가 아니다.** 실제 DTO 어댑터에서 analysisStatus를 analysis.status로 명시 매핑해야 한다.
- `validation.ts`: 실제 서버의 전체 생각 검증과 trim 기준 요청 검증, 확인한 질문 POST 응답 allowlist. 새 201은 PREPARING만 허용하며 기준 답변/분석 결과가 들어오면 거부한다.
- `client.ts`: 명시적으로 구성한 baseUrl, 주입한 fetch/토큰 저장소/세션 디코더 사용. 세션 발급 단일화, JSON/X-Guest-Token/credentials omit, typed error(code/message/requestId), AbortSignal, 비밀정보 마스킹·알림. 401 재발급 후 기존 mutation을 자동 재전송하지 않는다. 오래된 401이 새 토큰을 지우지 않도록 검사한다.
- `chats.ts`: 검증된 질문 생성만 실제 POST로 준비한다. clientRequestId를 유지하고 확인된 요청 필드만 전송한다. PREPARING 영수증을 LockedChat으로 바꾸거나 choices를 가정하지 않는다.

세션 응답 필드(`token`, `guestToken`, `accessToken` 등)를 추정하지 않았다. `decodeSession`은 필수 주입 항목이며 실제 세션 DTO를 확인한 뒤 구현해야 한다. 실제 URL과 토큰 저장소도 호출하는 쪽에서 명시적으로 제공한다. 현재 앱에서는 이 client를 생성하지 않는다.

잠금 보안의 책임은 서버다. 브라우저에서 답변 필드를 버리거나 상태를 검사하는 것은 방어 보강일 뿐, 이미 전송된 비공개 답변을 보호하지 못한다. 서버는 LOCKED 동안 모든 응답에서 답변/분석 본문을 제외해야 한다. 현재 별도 모듈의 가드 테스트를 통과했다고 실제 서버 보안이 검증된 것은 아니다.

## 실제 API 제공 후 연결 순서와 협의 항목

1. 배포 base URL, CORS(`X-Guest-Token`/JSON), 세션 발급의 실제 DTO/상태 코드·토큰 수명·저장 정책 확인. 세션 decoder를 구현하고 토큰 재발급 시 이전 소유자의 대화/캐시를 어떻게 정리할지 결정한다. 404는 없거나 다른 소유자 모두 CHAT_NOT_FOUND이며 자동 재시도로 감추지 않는다.
2. 상세 GET, prepare/retry, thoughts, hints, basic-mode, analysis/retry, analysis, history의 실제 요청·응답 샘플과 구현 상태를 받는다. 문서에 경로가 있어도 구현·전체 필드를 확인하지 않은 어댑터는 연결하지 않는다.
3. 실제 상세 DTO → 정규화 잠금 모델/기존 화면 VM 매핑을 작성한다. PREPARING 상세 폴링 → DONE에서 칩 표시 → PENDING 분석 폴링 → 채팅 해제와 DONE 확인 후 결과 표시를 연결한다. 기존 Mock VM/UUID/밀리초 날짜를 서버 DTO로 캐스팅하지 않는다.
4. `/analysis`의 LOCKED 403 설명과 PENDING 상태 폴링의 공존 방식(상태 메타데이터는 200인지), analysisStatus 필드 위치·작업 ID·재시도 횟수·결과 스키마를 확인한다. 임의로 mock jobId/resultId를 실서버 필드로 채택하지 않는다.
5. BASIC 전환 조건/공개 시점에 대한 API 표 충돌을 해소한다. 상태 머신상 BASIC도 DONE까지 LOCKED이고 힌트 2가 필수다. 현재 Mock의 힌트/전환/중지 동작은 유지했다.
6. F-07 전체 글자 수/다양성 규칙과 현재 직접 작성분 규칙 중 실제 UI에 적용할 정책을 확정한다. 이번에는 양쪽 검증을 분리했으며 화면 문구·자동완성 보호는 변경하지 않았다.
7. F-17 category와 내부 경로/완료 상태를 분리하여 매핑하고, ISO +09:00·숫자 ID·미리보기/회고와 실제 목록 envelope를 확인한다. 질문 POST 중복 200이 이미 해제된 대화일 때의 응답 status도 실제 샘플로 확인한다.
8. F-19 중지와 F-16 후속 질문은 최신 API 표에 전체 계약이 없으므로 기존 Mock 유지. 삭제는 DELETE 경로가 문서에 있지만 UI/DTO/실제 동작 검증 없이 추가하지 않았다. F-14/F-15는 기존 프론트엔드 시연 동작 유지, 서버 저장으로 전환하지 않았다.
9. 사용량 제한 MVP 포함 여부, 시간/길이 처리, 재시도 멱등성·토큰 재발급 후 mutation 재시도 정책을 팀과 합의한다. 실제 서버 잠금 누출·소유권·완료/중지 동시성 통합 테스트가 필요하다.

## 수동 테스트 체크리스트

기존 화면 코드는 수정하지 않았다. 기존 P0/P1/P2 자동 회귀 테스트를 실행했으며, 이번 작업에서 브라우저 클릭 검증을 다시 수행한 것으로 표시하지 않는다.

- [ ] `npm run dev:mock`으로 새 질문 → 잠금 → 생각 제출 → 분석 → 비교 결과 확인. 실제 서버나 sessions 요청이 새로 발생하지 않는지 확인.
- [ ] 힌트 1→2/이전 이동, 막힌 지점 미선택 BASIC 전환, F-19 중지→초안 복원→새로고침→수정 재제출 확인.
- [ ] F-16 실패·재시도·5회 제한, F-17 이전 대화/학습 기록 복원, 회고·의견의 시연 저장 확인.
- [ ] 실제 서버 제공 후에만 세션 decoder/baseUrl을 명시 구성. 첫 세션 발급 1회, X-Guest-Token 포함·쿠키 미사용·401 재발급·POST 자동 재전송 없음 확인.
- [ ] 실제 POST /chats의 201 PREPARING와 중복 200 확인. choices/답변이 없는 생성 응답을 잠금 화면 데이터로 잘못 사용하지 않는지 확인.
- [ ] 상세 PREPARING 폴링/prepare 실패 재시도, 분석 PENDING/FAILED 잠금, DONE+정확한 UNLOCKED 경로에서만 결과 표시 확인.
- [ ] 브라우저 네트워크 응답 자체에 잠긴 답변/분석이 없는지, 다른 소유자와 없는 대화가 모두 404인지 BE와 확인.

## 변경 파일

- `src/api/backend/contracts.ts`
- `src/api/backend/lockState.ts`
- `src/api/backend/validation.ts`
- `src/api/backend/client.ts`
- `src/api/backend/chats.ts`
- `tests/backend-contracts.test.mjs`
- `API_CONTRACT_PREPARATION.md`
- `README.md`

## 자동 검증 결과

`npm run build`, `npm run lint`, `npm test` 통과. 전체 145개(기존 134 + 추가 11), 실패 0, 린트 경고 0. 실제 서버 통합 테스트는 미실행이며 준비 모듈은 현재 앱에 연결되지 않았다.
