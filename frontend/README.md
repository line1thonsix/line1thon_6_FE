# Deveil frontend

개발 환경과 PC 새 채팅 화면(48:831)의 첫 UI를 구성했습니다. 서비스 API는 연결하지 않았습니다.

## 실행

```sh
npm install
npm run dev
```

Vite가 출력하는 로컬 주소로 접속합니다. 기본 포트는 5173입니다.

```sh
npm run dev:mock  # 개발 환경에서 MSW 활성화
npm run build     # TypeScript 검사 + 프로덕션 빌드
npm run lint
npm run preview   # 빌드 결과 미리보기
```

MSW는 기본적으로 비활성화되어 있습니다. `dev:mock`은 `.env.mock`을 읽습니다.
또는 `.env.example`을 `.env.local`로 복사하고 `VITE_ENABLE_MOCKS=true`로 설정합니다.
MSW 핸들러는 비어 있으며 미등록 요청은 그대로 통과합니다. Worker 시작을 기다린 뒤 React를 렌더링합니다.
프로덕션 실행에서는 MSW를 시작하지 않습니다.

## 구조

- `src/components`: 공통 UI, 레이아웃, 새 채팅 컴포넌트
- `src/pages`: 새 채팅 화면과 404 화면
- `src/api`: TanStack Query 클라이언트, 추후 API 호출 계층
- `src/mocks`: MSW 초기화와 빈 핸들러 목록
- `src/hooks`: 공통 훅 (준비 폴더)
- `src/types`: 공통 타입 (준비 폴더)
- `src/styles`: Tailwind 진입점과 기본 스타일
- `public/mockServiceWorker.js`: MSW CLI로 생성한 Worker

React Router는 BrowserRouter를 사용합니다. 배포 시에는 정적 호스트에서 SPA 경로를 index.html로 연결하는 설정이 필요합니다.
TanStack Query의 자동 재시도는 비활성화했습니다. 향후 조회 재시도와 서버 분석 재시도는 별도로 설계합니다.

## 미확정 API 계약

세션 쿠키/헤더, 요청·응답 DTO, 상태 전이, 잠금 해제 시점, 중복 방지 방식, 힌트 저장,
삭제·중지 엔드포인트는 확정하지 않았습니다. 서비스 API 호출, 인증 저장, 프록시 대상,
Mock 응답 데이터 및 폴링은 아직 추가하지 않았습니다. `../docs`의 기존 명세는 변경하지 않았습니다.

브라우저에 전달되는 VITE_ 환경 변수에는 비밀키를 넣지 마세요.

## 첫 UI 구성

- `src/styles/tokens.css`: 색상, 글꼴, 간격, 모서리, 사이드바·상단바·본문 폭 토큰
- `src/components/layout`: AppShell, Sidebar, Header
- `src/components/ui`: Button, Card, Input, Textarea, Icon
- `src/components/chat`: Welcome, QuestionComposer
- `src/data/newChat.ts`: 화면용 예시 질문. 서버 DTO와 분리
- `src/assets/icons`: Figma에서 내려받은 원본 SVG 8개

PC 1440×900을 기준으로 구현했습니다. 모바일 화면은 이번 범위에 포함하지 않습니다.
본문 폰트는 SF Pro를 우선하며 설치되어 있지 않으면 OS 기본 글꼴을 사용합니다.
예시 카드는 질문을 입력창에 채우며 전송하지 않습니다. 입력과 사이드바 접기·펼치기,
새 채팅 초기화는 로컬 상태로 동작합니다. 코드 추가, 유형 선택, 기록, 데이터 관리는
다음 단계 안내를 표시하며 실제 저장이나 API 호출은 하지 않습니다.
게스트 저장 문구는 Figma 디자인 문구이며 이번 단계에는 영구 저장 기능이 없습니다.
