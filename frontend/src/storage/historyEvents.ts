// Same-tab notification only; contains no chat content and makes no network request.
const listeners = new Set<() => void>()
export function announceHistoryChange() { listeners.forEach(listener => listener()) }
export function subscribeHistoryChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
