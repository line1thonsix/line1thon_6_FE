import type { BackendClient } from './client.ts'
import { backendPaths, backendQuestionTypes } from './contracts.ts'
import type { BackendQuestionType } from './contracts.ts'
import { assertNoResultContent, readBackendLockState } from './lockState.ts'
import type { BackendLockState } from './lockState.ts'

import { readDetailJob } from './analysis.ts'
import type { BackendAnalysisJob } from './analysis.ts'

type Hint = { level: 1 | 2; text: string }
export type BackendChatDetail = BackendLockState & {
  chatId: number
  type: BackendQuestionType
  question: string
  code: string
  secretMasked: boolean
  choices: string[]
  hints: Hint[]
  hasNextHint: boolean
  thought: string | null
  analysis: BackendAnalysisJob | null
  basicModeAvailable?: boolean
}

function record(raw: unknown): Record<string, unknown> {
  assertNoResultContent(raw)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid backend response')
  return raw as Record<string, unknown>
}

const positiveId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

export function readGuestToken(raw: unknown): string {
  const value = record(raw)
  if (!nonempty(value.guestToken) || !nonempty(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error('Invalid backend session response')
  }
  return value.guestToken
}

export function readChatDetail(raw: unknown, chatId: number): BackendChatDetail {
  const value = record(raw)
  const state = readBackendLockState(value)
  if (value.chatId !== chatId || !backendQuestionTypes.includes(value.type as BackendQuestionType) ||
      !nonempty(value.question) || (value.code !== null && typeof value.code !== 'string') ||
      typeof value.secretMasked !== 'boolean' || typeof value.hasNextHint !== 'boolean' ||
      (value.thought !== null && !nonempty(value.thought))) throw new Error('Invalid backend chat detail')
  const choices = value.choices
  if (state.prepareStatus === 'DONE'
    ? !Array.isArray(choices) || choices.length !== 3 || !choices.every(nonempty) || new Set(choices).size !== 3
    : choices !== null) throw new Error('Invalid backend choices')
  if (!Array.isArray(value.hints) || value.hints.length !== state.hintLevel) throw new Error('Invalid backend hints')
  const hints = value.hints.map((rawHint, index): Hint => {
    const hint = record(rawHint)
    if (hint.level !== index + 1 || !nonempty(hint.text)) throw new Error('Unexpected hint disclosure')
    return { level: hint.level as 1 | 2, text: hint.text }
  })
  return {
    ...state, chatId, type: value.type as BackendQuestionType, question: value.question,
    code: value.code ?? '', secretMasked: value.secretMasked, choices: (choices ?? []) as string[],
    hints, hasNextHint: value.hasNextHint, thought: value.thought,
    analysis: readDetailJob(value.analysis), basicModeAvailable: value.basicModeAvailable === true,
  }
}

export function readHintReceipt(raw: unknown, expected: 1 | 2) {
  const value = record(raw)
  if (value.hintLevel !== expected || !nonempty(value.hint) || value.hasNextHint !== (expected < 2)) {
    throw new Error('Invalid backend hint response')
  }
  return { level: expected, text: value.hint, hasNextHint: value.hasNextHint }
}

export function readThoughtReceipt(raw: unknown, status: number) {
  const value = record(raw)
  if (![200, 202].includes(status) || !positiveId(value.jobId) || value.mode !== 'COMPARE' ||
      value.status !== 'LOCKED' || value.analysisStatus !== 'PENDING') throw new Error('Invalid backend thought response')
  return Number(value.jobId)
}

export function backendWorkspaceApi(client: BackendClient, guest: string, signal: AbortSignal) {
  const options = { guest, signal }
  return {
    detail: (chatId: number) => client.request(backendPaths.chat(chatId), {
      ...options, method: 'GET', decode: raw => readChatDetail(raw, chatId),
    }),
    retryPrepare: (chatId: number) => client.request(backendPaths.prepareRetry(chatId), {
      ...options, method: 'POST', decode: (raw, status) => {
        assertNoResultContent(raw)
        if (status !== 202) throw new Error('Invalid prepare retry response')
      },
    }),
    hint: (chatId: number, level: 1 | 2) => client.request(backendPaths.hints(chatId), {
      ...options, method: 'POST', decode: raw => readHintReceipt(raw, level),
    }),
    submitThought: (chatId: number, body: { content: string; selectedChoice: number | null }) =>
      client.request(backendPaths.thoughts(chatId), { ...options, method: 'POST', body, decode: readThoughtReceipt }),
  }
}
