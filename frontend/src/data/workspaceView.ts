export type WorkspaceView = 'chat' | 'history' | 'guide'
export function workspaceView(params: URLSearchParams): WorkspaceView {
  const view = params.get('view')
  return view === 'history' || view === 'guide' ? view : 'chat'
}
export function workspaceViewParams(params: URLSearchParams, view: WorkspaceView): URLSearchParams {
  const next = new URLSearchParams(params)
  if (view === 'chat') next.delete('view')
  else next.set('view', view)
  return next
}
