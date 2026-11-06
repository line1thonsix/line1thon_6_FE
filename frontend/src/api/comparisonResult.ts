import { findingCategories } from '../types/comparison.ts'
import type { ComparisonResult, Finding, FindingFilter, FindingCategory } from '../types/comparison.ts'

export class ComparisonValidationError extends Error {
  readonly kind: 'empty' | 'invalid'
  constructor(kind: 'empty' | 'invalid') { super(kind === 'empty' ? '비교할 항목이 없어요. 내 생각은 그대로 있어요.' : '비교 결과를 확인할 수 없어요. 내 생각은 그대로 있어요.'); this.kind = kind }
}
function text(value: unknown): value is string { return typeof value === 'string' && !!value.trim() }

// Strict substring match: no paraphrases, case folding, or whitespace normalization.
export function readComparisonResult(value: unknown, originalThought: string): ComparisonResult {
  if (!value || typeof value !== 'object') throw new ComparisonValidationError('invalid')
  const v = value as Record<string, unknown>
  if (v.status !== 'DONE' || v.learningPath !== 'SELF' || !text(v.chatId) || !text(v.jobId) || !text(v.resultId) ||
    v.thought !== originalThought || !text(v.referenceAnswer) || !Array.isArray(v.findings)) throw new ComparisonValidationError('invalid')
  const findings: Finding[] = []
  const ids = new Set<string>()
  for (const raw of v.findings) {
    if (!raw || typeof raw !== 'object') continue
    const f = raw as Record<string, unknown>
    if (!findingCategories.includes(f.category as FindingCategory) || !text(f.id) || ids.has(f.id) || !text(f.title) || !text(f.reason) || !text(f.verification)) continue
    const requiresQuote = ['COMMON', 'UNIQUE', 'CONFLICT'].includes(f.category as string)
    if ((requiresQuote || f.userQuote !== undefined) && (!text(f.userQuote) || !originalThought.includes(f.userQuote))) continue
    const base = { id: f.id, title: f.title, reason: f.reason, verification: f.verification,
      ...(text(f.verificationCode) ? { verificationCode: f.verificationCode } : {}) }
    let finding: Finding
    switch (f.category) {
      case 'COMMON':
        if (!text(f.aiPerspective)) continue
        finding = { ...base, category: 'COMMON', userQuote: f.userQuote as string, aiPerspective: f.aiPerspective }; break
      case 'COMPLEMENT':
        if (!text(f.aiPerspective) || !text(f.conditions)) continue
        finding = { ...base, category: 'COMPLEMENT', aiPerspective: f.aiPerspective, conditions: f.conditions,
          ...(text(f.userQuote) ? { userQuote: f.userQuote } : {}) }; break
      case 'UNIQUE':
        finding = { ...base, category: 'UNIQUE', userQuote: f.userQuote as string }; break
      case 'CONFLICT':
        if (!text(f.aiPerspective) || !text(f.conflictEvidence)) continue
        finding = { ...base, category: 'CONFLICT', userQuote: f.userQuote as string, aiPerspective: f.aiPerspective, conflictEvidence: f.conflictEvidence }; break
      case 'UNDETERMINED':
        if (!text(f.question)) continue
        finding = { ...base, category: 'UNDETERMINED', question: f.question,
          ...(text(f.userQuote) ? { userQuote: f.userQuote } : {}) }; break
      default: continue
    }
    ids.add(f.id)
    findings.push(finding)
  }
  if (!findings.length) throw new ComparisonValidationError('empty')
  return { chatId: v.chatId, jobId: v.jobId, resultId: v.resultId, status: 'DONE', learningPath: 'SELF',
    thought: originalThought, referenceAnswer: v.referenceAnswer, findings }
}
export function findingCounts(findings: Finding[]): Record<FindingFilter, number> {
  return { ALL: findings.length, ...Object.fromEntries(findingCategories.map(category => [category, findings.filter(f => f.category === category).length])) } as Record<FindingFilter, number>
}
export function filterFindings(findings: Finding[], filter: FindingFilter): Finding[] {
  return filter === 'ALL' ? findings : findings.filter(finding => finding.category === filter)
}
