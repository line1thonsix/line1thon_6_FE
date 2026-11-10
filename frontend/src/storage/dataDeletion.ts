import { readSession, writeSession, workspaceKey, thoughtKey } from './session.ts'
import { demoNotesKey } from './postResultDemo.ts'

const prefixes = ['deveil:thought-draft:v1:', 'deveil:demo:post-result:v1:', 'deveil:mock:follow-up-draft:v1:', 'deveil:mock:analysis-cancel:v1:', 'deveil:mock:basic-request:v1:', 'deveil:mock:hint-tab:v1:', 'deveil:mock:hint-view:v1:']
export function clearDeletedMockDrafts(chatId?: string): boolean {
  const workspace = readSession(workspaceKey(true)) as { chatId?: string } | null
  const resetWorkspace = !chatId || workspace?.chatId === chatId
  if (chatId) {
    for (const key of [thoughtKey(chatId), demoNotesKey(chatId), ...prefixes.slice(2).map(prefix => prefix + chatId)]) writeSession(key, null)
  } else {
    // Only known Deveil Mock/editor keys. Never sessionStorage.clear(), API
    // workspaces, unrelated apps, or content-free Mock usage records.
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i))
    for (const key of keys) if (key && prefixes.some(prefix => key.startsWith(prefix))) writeSession(key, null)
  }
  if (resetWorkspace) writeSession(workspaceKey(true), null)
  return resetWorkspace
}
