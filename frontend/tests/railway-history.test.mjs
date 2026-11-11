import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackendClient } from '../src/api/backend/client.ts'
import { backendWorkspaceApi, readGuestToken } from '../src/api/backend/workspaceApi.ts'
import { readBackendHistory } from '../src/api/backend/history.ts'
import { createRailwayHistoryController } from '../src/api/backend/historyController.ts'

const createdAt = '2026-11-11T23:58:27+09:00'
const row = (id, changes) => ({
  chatId: id, type: 'DEBUGGING', questionPreview: '배열의 마지막 요소 ' + id,
  status: 'LOCKED', category: null, reflection: null, createdAt, ...changes,
})
const list = (...items) => Response.json({ items })
const emptyResponse = () => new Response(null, { status: 204 })
function setup(fetch) {
  let guest = 'old-guest'
  const calls = []
  const tokens = { read: () => guest, write: next => { guest = next }, clear: () => { guest = null } }
  const client = createBackendClient({
    baseUrl: 'https://railway-test.example/api', tokens, decodeSession: readGuestToken,
    fetch(url, init) {
      const path = new URL(url).pathname.replace(/^\/api/u, '')
      const owner = new Headers(init.headers).get('X-Guest-Token')
      calls.push([init.method, path, owner])
      assert.equal(init.credentials, 'omit')
      return fetch(init.method, path, owner, init)
    },
  })
  return { client, tokens, calls, history: createRailwayHistoryController(client) }
}
async function ready(history) {
  if (history.getSnapshot().status === 'ready') return
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('History refresh did not finish')) }, 1000)
    const off = history.subscribe(() => {
      if (history.getSnapshot().status !== 'loading') {
        clearTimeout(timer)
        off()
        resolve()
      }
    })
  })
  assert.equal(history.getSnapshot().status, 'ready')
}

test('Railway history validates status and ownership-safe fields, including empty lists', () => {
  assert.deepEqual(readBackendHistory({ items: [] }), [])
  const items = readBackendHistory({ items: [
    row(3), row(2, { status: 'UNLOCKED_SELF', category: 'COMPARED' }),
    row(1, { status: 'UNLOCKED_ASSISTED', category: 'BASIC' }),
  ] })
  assert.deepEqual(items.map(({ id, learningPath, progress }) => [id, learningPath, progress]), [
    ['3', null, 'LOCKED'], ['2', 'SELF', 'DONE'], ['1', 'BASIC', 'DONE'],
  ])
  for (const bad of [row(1, { category: 'COMPARED' }), row(1, { referenceAnswer: 'protected' }), row(0), row(1, { createdAt: '' })]) {
    assert.throws(() => readBackendHistory({ items: [bad] }))
  }
  assert.throws(() => readBackendHistory({ items: [row(1), row(1)] }))
})

test('opening or canceling confirmation sends no DELETE, and failure leaves the list and guest intact', async () => {
  const { history, tokens, calls } = setup(async method => method === 'GET'
    ? list(row(1))
    : Response.json({ code: 'DELETE_FAILED', requestId: 'req_fail' }, { status: 500 }))
  await history.refresh()
  const selection = history.select('1')
  assert.ok(selection)
  history.select()
  assert.equal(calls.filter(([method]) => method === 'DELETE').length, 0)
  assert.equal(history.select('999'), null)
  await assert.rejects(history.confirm(selection, () => assert.fail('failed deletion cannot reset workspace')), { code: 'DELETE_FAILED' })
  await assert.rejects(history.confirm(history.select(), () => assert.fail('failed deletion cannot reset session')), { code: 'DELETE_FAILED' })
  assert.deepEqual(history.getSnapshot().items.map(item => item.id), ['1'])
  assert.equal(tokens.read(), 'old-guest')
})

test('single deletion waits for 204, excludes late and stale list responses, and reloads authoritative history', async () => {
  let live = [row(2), row(1)]
  let hold = false
  let serveStaleAfterDelete = false
  let release, start
  const started = new Promise(resolve => { start = resolve })
  const { history, client, calls } = setup(async (method, path) => {
    if (method === 'DELETE') {
      assert.equal(path, '/chats/1')
      live = [row(2)]
      serveStaleAfterDelete = true
      return emptyResponse()
    }
    if (hold) {
      hold = false
      return new Promise(resolve => { release = resolve; start() })
    }
    if (serveStaleAfterDelete) {
      serveStaleAfterDelete = false
      return list(row(2), row(1))
    }
    return list(...live)
  })
  await history.refresh()
  hold = true
  const stale = history.refresh()
  await started
  const selection = history.select('1')
  let detached
  assert.equal(await history.confirm(selection, id => { detached = id }), true)
  assert.equal(detached, 1)
  release(list(row(2), row(1)))
  await stale
  await ready(history)
  assert.deepEqual(history.getSnapshot().items.map(item => item.id), ['2'])
  assert.deepEqual(calls.find(([method]) => method === 'DELETE'), ['DELETE', '/chats/1', 'old-guest'])
  const reloaded = createRailwayHistoryController(client)
  await reloaded.refresh()
  assert.deepEqual(reloaded.getSnapshot().items.map(item => item.id), ['2'])
})

test('whole deletion clears the old workspace before reissuing a guest and ignores delayed old details', async () => {
  let releaseDetail
  const { history, client, tokens, calls } = setup(async (method, path, guest) => {
    if (method === 'DELETE') { assert.equal(path, '/sessions/me'); return emptyResponse() }
    if (method === 'POST') {
      assert.equal(tokens.read(), null)
      return Response.json({ guestToken: 'fresh-guest', createdAt }, { status: 201 })
    }
    if (path === '/chats/1') return new Promise(resolve => { releaseDetail = resolve })
    return guest === 'old-guest' ? list(row(1)) : list()
  })
  await history.refresh()
  const selection = history.select()
  const oldDetail = backendWorkspaceApi(client, 'old-guest', new AbortController().signal).detail(1)
  let cleared = false
  await history.confirm(selection, id => {
    assert.equal(id, undefined)
    assert.equal(tokens.read(), 'old-guest')
    cleared = true
  })
  await ready(history)
  releaseDetail(Response.json({ chatId: 1 }))
  await assert.rejects(oldDetail, { code: 'GUEST_CHANGED' })
  assert.ok(cleared)
  assert.equal(tokens.read(), 'fresh-guest')
  assert.deepEqual(history.getSnapshot().items, [])
  await assert.rejects(history.confirm(selection, () => assert.fail('old selection cannot delete the new guest')))
  assert.deepEqual(calls.slice(-3), [
    ['DELETE', '/sessions/me', 'old-guest'], ['POST', '/sessions', null], ['GET', '/chats', 'fresh-guest'],
  ])
})

test('foreign, duplicate and non-204 deletions do not acknowledge success', async () => {
  let release
  const { history, tokens, calls } = setup(async method => {
    if (method === 'GET') return list(row(1))
    return new Promise(resolve => { release = resolve })
  })
  await history.refresh()
  const selection = history.select('1')
  const onDeleted = () => assert.fail('not a 204 response')
  const deletion = history.confirm(selection, onDeleted)
  assert.equal(await history.confirm(selection, onDeleted), false)
  release(Response.json({ deleted: true }, { status: 200 }))
  await assert.rejects(deletion)
  tokens.write('different-guest')
  await assert.rejects(history.confirm(selection, onDeleted))
  assert.equal(calls.filter(([method]) => method === 'DELETE').length, 1)
})
