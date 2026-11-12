import { validateThought } from '../thoughtValidation.ts'
import { backendQuestionTypes, exampleIds } from './contracts.ts'
import type { BackendCreateChatRequest, BackendCreatedChat } from './contracts.ts'
import { assertNoResultContent } from './lockState.ts'

// Frontend submission rules. The Railway request still carries the full text.
export function validateBackendThought(text: string, manual: string): boolean {
  return validateThought(text, manual) === null
}
export function validateBackendCreateChat(v: BackendCreateChatRequest): void {
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(v.clientRequestId) || !backendQuestionTypes.includes(v.type) ||
    typeof v.question !== 'string' || v.question.trim().length < 1 || v.question.trim().length > 2000 ||
    (v.code !== null && (typeof v.code !== 'string' || v.code.trim().length > 6000)) ||
    (v.exampleId !== null && !exampleIds.includes(v.exampleId))) throw new Error('Invalid backend question')
}
export function readBackendCreatedChat(raw: unknown, httpStatus: number): BackendCreatedChat {
  assertNoResultContent(raw)
  const v = raw as Record<string, unknown> | null
  if (![200, 201].includes(httpStatus) || !v || typeof v !== 'object' || !Number.isSafeInteger(v.chatId) || Number(v.chatId) <= 0 || v.status !== 'LOCKED' ||
    !backendQuestionTypes.includes(v.type as BackendCreatedChat['type']) || !['PREPARING', 'DONE', 'FAILED'].includes(String(v.prepareStatus)) ||
    (httpStatus === 201 && v.prepareStatus !== 'PREPARING') || typeof v.secretMasked !== 'boolean' || typeof v.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+09:00$/u.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt))) throw new Error('Invalid backend create response')
  return { chatId: Number(v.chatId), status: 'LOCKED', type: v.type as BackendCreatedChat['type'], prepareStatus: v.prepareStatus as BackendCreatedChat['prepareStatus'], secretMasked: v.secretMasked, createdAt: v.createdAt }
}
