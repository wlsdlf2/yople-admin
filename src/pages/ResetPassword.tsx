import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'ready' | 'expired'>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const urlError =
      searchParams.get('error') ||
      new URLSearchParams(window.location.hash.replace('#', '')).get('error')
    if (urlError) {
      setStatus('expired')
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('ready')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus('ready')
      }
    })

    const timer = setTimeout(() => {
      setStatus((prev) => prev === 'loading' ? 'expired' : prev)
    }, 3000)

    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) {
        setError(err.message)
        return
      }
      setDone(true)
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch {
      setError('오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">확인 중…</p>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">링크가 만료되었습니다</h1>
          <p className="text-sm text-slate-500">
            비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.
            <br />
            다시 요청해 주세요.
          </p>
          <a href="/forgot-password" className="block text-sm text-primary hover:text-primary-dark">
            비밀번호 찾기 다시 시도
          </a>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">비밀번호 변경 완료</h1>
          <p className="text-sm text-slate-500 bg-green-50 border border-green-200 rounded-lg py-3 px-4">
            비밀번호가 성공적으로 변경되었습니다.
            <br />
            잠시 후 로그인 화면으로 이동합니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">새 비밀번호 설정</h1>
        <p className="text-sm text-slate-500 text-center mb-6 mt-2">
          사용할 새 비밀번호를 입력해 주세요.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              새 비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="6자 이상 입력하세요"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
              새 비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력하세요"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="cursor-pointer w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  )
}
