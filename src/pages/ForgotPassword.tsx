import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) {
        setError(err.message)
        return
      }
      setSent(true)
    } catch {
      setError('오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">비밀번호 찾기</h1>
        {sent ? (
          <div className="text-center space-y-4 mt-6">
            <p className="text-sm text-slate-600 bg-green-50 border border-green-200 rounded-lg py-3 px-4">
              입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.
              <br />
              이메일을 확인해 주세요.
              <br /><br />
              <span className="text-slate-400">링크는 발송 후 1시간 이내에 사용해 주세요.</span>
            </p>
            <Link to="/login" className="block text-sm text-primary hover:text-primary-dark">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 text-center mb-6 mt-2">
              가입하신 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="가입한 이메일을 입력하세요"
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
                {loading ? '전송 중…' : '재설정 링크 보내기'}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              <Link to="/login" className="cursor-pointer text-primary hover:text-primary-dark">
                로그인으로 돌아가기
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
