import type { BasicLearningResult } from '../types/basicLearningResult.ts'

function text(v: unknown): v is string { return typeof v === 'string' && !!v.trim() }
// Atomic allowlist: do not retain findings, grading, HTML, or other route's payload.
export function readBasicLearningResult(value: unknown, chatId: string, transitionId: string): BasicLearningResult {
  if (!value || typeof value !== 'object') throw new Error('기초 학습 결과를 확인할 수 없어요.')
  const v = value as Record<string, unknown>
  if (v.chatId !== chatId || v.transitionId !== transitionId || !text(v.resultId) ||
    v.learningPath !== 'BASIC' || v.status !== 'DONE' || v.excludeFromGrowth !== true ||
    !text(v.referenceAnswer) || !text(v.concept) || !text(v.exampleCode) || !Array.isArray(v.steps) || v.steps.length !== 2) {
    throw new Error('기초 학습 결과가 올바르지 않아요. 다시 불러와 주세요.')
  }
  const steps = v.steps.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('시작 방법을 확인할 수 없어요.')
    const step = raw as Record<string, unknown>
    if (!text(step.title) || !text(step.text)) throw new Error('시작 방법을 확인할 수 없어요.')
    return { title: step.title, text: step.text }
  }) as BasicLearningResult['steps']
  return { chatId, transitionId, resultId: v.resultId, learningPath: 'BASIC', status: 'DONE', excludeFromGrowth: true,
    referenceAnswer: v.referenceAnswer, concept: v.concept, exampleCode: v.exampleCode, steps }
}
