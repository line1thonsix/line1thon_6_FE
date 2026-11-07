export async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') return

  const { worker } = await import('./browser')
  await worker.start({ quiet: true, onUnhandledFrame: 'bypass' })
}
