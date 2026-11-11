import { createBackendClient, guestTokenStore } from './client'
import { readGuestToken } from './workspaceApi'

export function makeRailwayClient(baseUrl: string) {
  return createBackendClient({
    baseUrl,
    tokens: guestTokenStore(localStorage),
    decodeSession: readGuestToken,
  })
}
