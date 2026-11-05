import type { RequestHandler } from 'msw'

// API 계약 확정 후 핸들러를 추가합니다. 현재는 모든 요청을 통과시킵니다.
export const handlers: RequestHandler[] = []
