import test from 'node:test'
import assert from 'node:assert/strict'
import { backendAnalysisApi, canRetryAnalysis, canStartBasic, pollBackendAnalysis, readAnalysisProgress, readAnalysisResult } from '../src/api/backend/analysis.ts'
import { readChatDetail } from '../src/api/backend/workspaceApi.ts'
import { createBackendClient } from '../src/api/backend/client.ts'

const thought = '배열 길이와 인덱스의 범위를 비교하고 반복문 조건을 확인해 볼게요.'
const job = { jobId: 7, mode: 'COMPARE', status: 'PENDING', retryCount: 0, remainingRetries: 2 }
const wire = extra => ({
  jobId: 7, mode: 'COMPARE', analysisStatus: 'PENDING', retryCount: 0, remainingRetries: 2,
  referenceAnswer: null, findings: null, basicExplanation: null, ...extra,
})
const compareDone = wire({
  analysisStatus: 'DONE', myThought: thought, referenceAnswer: 'AI의 참고 관점',
  findings: [
    { id: 1, category: 'COMMON', title: '범위 확인', detail: '인덱스 경계', userQuote: '인덱스의 범위', aiPerspective: '마지막 인덱스는 길이보다 하나 작아요.', followUpQuestion: '마지막 인덱스를 출력해 보세요.' },
    { id: 2, category: 'COMMON', title: '잘못된 인용', detail: '설명', userQuote: '사용자가 작성하지 않은 문장', aiPerspective: '참고 관점' },
    { id: 3, category: 'COMPLEMENT', title: '보완', detail: '배열이 비어 있는 경우', userQuote: null, aiPerspective: '빈 배열도 확인해 보세요.' },
  ],
})
function detail(extra = {}) {
  return readChatDetail({
    chatId: 12, type: 'DEBUGGING', question: '마지막 인덱스는 무엇인가요?', code: null, secretMasked: false,
    status: 'LOCKED', prepareStatus: 'DONE', choices: ['인덱스', '길이', '반복 조건'], hintLevel: 0,
    hints: [], hasNextHint: true, basicModeAvailable: false, thought, analysis: job, ...extra,
  }, 12)
}
const unlocked = () => detail({ status: 'UNLOCKED_SELF', analysis: { ...job, status: 'DONE' } })
const signal = () => new AbortController().signal

test('COMPARE polls progress and releases verified wire findings only after chat detail unlocks', async () => {
  const calls = []
  const replies = [wire(), compareDone]
  const synced = await pollBackendAnalysis({
    detail: detail(), signal: signal(),
    get: async () => replies.shift(),
    refreshDetail: async () => { calls.push('unlock'); return unlocked() },
    wait: async () => { calls.push('poll interval') },
    onProgress: status => {
      calls.push(status.status)
      assert.equal('referenceAnswer' in status, false)
    },
  })
  assert.deepEqual(calls, ['PENDING', 'poll interval', 'DONE', 'unlock'])
  assert.equal(synced.detail.status, 'UNLOCKED_SELF')
  assert.equal(synced.result.referenceAnswer, 'AI의 참고 관점')
  assert.deepEqual(synced.result.findings.map(f => f.id), ['1', '3'])
  assert.equal(synced.result.findings[0].aiPerspective, '마지막 인덱스는 길이보다 하나 작아요.')
  assert.equal(synced.result.findings[0].verification, '마지막 인덱스를 출력해 보세요.')
})

test('protected payloads, wrong jobs, and DONE with a still locked chat never expose a result', async () => {
  assert.throws(() => readAnalysisProgress(wire({ referenceAnswer: '잠긴 데이터' }), job), /Protected/)
  assert.throws(() => readAnalysisProgress(wire({ jobId: 99 }), job), /Unexpected/)
  assert.throws(() => readAnalysisResult(compareDone, detail()), /not been released/)
  await assert.rejects(pollBackendAnalysis({
    detail: detail(), signal: signal(), get: async () => compareDone, refreshDetail: async () => detail(),
    wait: async () => assert.fail(), onProgress: state => assert.equal('findings' in state, false),
  }), /not been released/)
})

test('a restored failed job keeps its error code and retry budget, including exhaustion', async () => {
  const restored = detail({ analysis: { ...job, status: 'FAILED', retryCount: 2, remainingRetries: 0 } })
  let seen
  const synced = await pollBackendAnalysis({
    detail: restored, signal: signal(),
    get: async () => wire({ analysisStatus: 'FAILED', errorCode: 'AI_GENERATION_FAILED', retryCount: 2, remainingRetries: 0 }),
    refreshDetail: async () => assert.fail(), wait: async () => assert.fail(), onProgress: state => { seen = state },
  })
  assert.equal(synced.result, null)
  assert.equal(seen.errorCode, 'AI_GENERATION_FAILED')
  assert.equal(canRetryAnalysis(seen), false)
  assert.equal(canRetryAnalysis({ ...seen, retryCount: 1, remainingRetries: 1 }), true)
})

test('BASIC requires two opened hints and the server flag; restored BASIC result maps summary and steps', async () => {
  const hints = [{ level: 1, text: '첫 힌트' }, { level: 2, text: '두 번째 힌트' }]
  const eligible = detail({ thought: null, analysis: null, hintLevel: 2, hints, basicModeAvailable: true })
  assert.ok(canStartBasic(eligible))
  assert.equal(canStartBasic({ ...eligible, hintLevel: 1 }), false)
  assert.equal(canStartBasic({ ...eligible, basicModeAvailable: false }), false)
  assert.equal(canStartBasic({ ...eligible, analysis: job }), false)
  const restored = { ...eligible, status: 'UNLOCKED_ASSISTED', analysis: { ...job, mode: 'BASIC', status: 'DONE' } }
  const synced = await pollBackendAnalysis({
    detail: restored, signal: signal(),
    get: async () => wire({
      mode: 'BASIC', analysisStatus: 'DONE', isDemo: true,
      basicExplanation: { summary: '배열 인덱스의 기초', exampleCode: 'arr[0]', observe: '첫 요소를 출력해 보세요.', change: '인덱스를 바꿔 보세요.' },
    }),
    refreshDetail: async () => assert.fail(), wait: async () => assert.fail(), onProgress: () => {},
  })
  assert.equal(synced.result.mode, 'BASIC')
  assert.equal(synced.result.exampleCode, 'arr[0]')
  assert.deepEqual(synced.result.steps.map(s => s.text), ['첫 요소를 출력해 보세요.', '인덱스를 바꿔 보세요.'])
  assert.equal(synced.result.responseSource, 'SAVED_EXAMPLE')
})

test('Railway mutation methods validate receipts and preserve server 404/409/400 error codes', async () => {
  const replies = [
    ['POST', '/analysis/retry', 202, { jobId: 7, analysisStatus: 'PENDING', retryCount: 1, remainingRetries: 1 }],
    ['POST', '/basic-mode', 202, { jobId: 8, mode: 'BASIC', analysisStatus: 'PENDING', status: 'LOCKED' }],
    ['POST', '/analysis/retry', 409, { code: 'RETRY_LIMIT_EXCEEDED', requestId: 'limit' }],
    ['POST', '/analysis/retry', 409, { code: 'NOT_RETRYABLE', requestId: 'busy' }],
    ['POST', '/basic-mode', 400, { code: 'BASIC_MODE_NOT_ALLOWED', requestId: 'hint' }],
    ['GET', '/analysis', 404, { code: 'ANALYSIS_NOT_FOUND', requestId: 'missing' }],
  ]
  const client = createBackendClient({
    baseUrl: 'https://example.test/api', tokens: { read: () => 'test-owner', write() {}, clear() {} }, decodeSession: () => assert.fail(),
    fetch: async (url, options) => {
      const [method, suffix, status, body] = replies.shift()
      assert.equal(options.method, method)
      assert.equal(url, 'https://example.test/api/chats/12' + suffix)
      assert.equal(options.body, undefined)
      assert.equal(new Headers(options.headers).get('X-Guest-Token'), 'test-owner')
      return Response.json(body, { status })
    },
  })
  const api = backendAnalysisApi(client, 'test-owner', signal())
  const failed = { ...job, status: 'FAILED' }
  assert.equal(await api.retry(12, failed), 7)
  assert.equal(await api.startBasic(12), 8)
  await assert.rejects(api.retry(12, failed), { code: 'RETRY_LIMIT_EXCEEDED' })
  await assert.rejects(api.retry(12, failed), { code: 'NOT_RETRYABLE' })
  await assert.rejects(api.startBasic(12), { code: 'BASIC_MODE_NOT_ALLOWED' })
  await assert.rejects(api.get(12), { code: 'ANALYSIS_NOT_FOUND' })
  assert.equal(replies.length, 0)
})

test('a late completed analysis cannot publish after switching or deleting a conversation', async () => {
  const controller = new AbortController()
  let finish
  const pending = pollBackendAnalysis({
    detail: unlocked(), signal: controller.signal,
    get: () => new Promise(resolve => { finish = resolve }),
    refreshDetail: async () => assert.fail(), wait: async () => assert.fail(),
    onProgress: () => assert.fail('stale response reached UI'),
  })
  controller.abort()
  finish(compareDone)
  await assert.rejects(pending, { name: 'AbortError' })
})
