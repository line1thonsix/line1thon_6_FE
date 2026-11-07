let occurred = false
const listeners = new Set<() => void>()
export const redactionOccurred = () => occurred
export function subscribeRedaction(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function notifyRedaction() {
  if (occurred) return
  occurred = true
  // Legacy storage may be read during initialization; notify after render completes.
  queueMicrotask(() => listeners.forEach(listener => listener()))
}
