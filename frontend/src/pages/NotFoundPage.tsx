import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">페이지를 찾을 수 없습니다.</h1>
      <Link className="text-blue-700 underline" to="/">처음으로 돌아가기</Link>
    </main>
  )
}
