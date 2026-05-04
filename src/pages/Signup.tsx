import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Step = 'email' | 'sent' | 'profile' | 'done' | 'already_registered'

export default function Signup() {
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('email_verified') !== '1') return

    const resolveSession = async (userId: string, userEmail: string) => {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
      if (existing) {
        await supabase.auth.signOut()
        setStep('already_registered')
      } else {
        setEmail(userEmail)
        setStep('profile')
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) resolveSession(session.user.id, session.user.email ?? '')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) resolveSession(session.user.id, session.user.email ?? '')
    })

    return () => subscription.unsubscribe()
  }, [searchParams])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${import.meta.env.VITE_APP_URL ?? window.location.origin}/signup?email_verified=1`,
        },
      })
      if (err) {
        setError(err.message)
        return
      }
      setStep('sent')
    } catch {
      setError('오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
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
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setError('세션이 만료되었습니다. 처음부터 다시 시도해 주세요.')
        return
      }

      const { error: insertError } = await supabase.from('users').insert({
        id: session.user.id,
        email: session.user.email,
        name: name.trim() || null,
        role: 'staff',
        approved: false,
      })

      if (insertError && insertError.code !== '23505') {
        setError(insertError.message)
        return
      }

      await supabase.auth.signOut()
      setStep('done')
    } catch {
      setError('오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'already_registered') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">이미 가입된 이메일입니다</h1>
          <p className="text-sm text-slate-500">
            해당 이메일로 이미 가입된 계정이 있습니다.
            <br />
            로그인하거나 비밀번호 찾기를 이용해 주세요.
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/login" className="block text-sm text-primary hover:text-primary-dark">
              로그인하기
            </Link>
            <Link to="/forgot-password" className="block text-sm text-slate-400 hover:text-slate-600">
              비밀번호 찾기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">가입 신청 완료</h1>
          <p className="text-slate-600 text-sm">
            관리자 승인 후 대시보드를 이용할 수 있습니다.
            <br />
            승인 요청을 담당자에게 전달해 주세요.
          </p>
          <Link to="/login" className="block text-sm text-primary hover:text-primary-dark">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-6">회원가입</h1>

        {(step === 'email' || step === 'sent') && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                이메일
              </label>
              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (step === 'sent') setStep('email') }}
                  required
                  autoComplete="email"
                  disabled={step === 'sent'}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer px-3 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                >
                  {loading ? '전송 중…' : step === 'sent' ? '재발송' : '인증 메일 발송'}
                </button>
              </div>
            </div>
            {step === 'sent' && (
              <p className="text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded-lg py-2 px-3">
                인증 메일을 발송했습니다. 메일의 링크를 클릭하면 다음 단계로 진행됩니다.
              </p>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>
            )}
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg py-2 px-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>이메일 인증 완료 · {email}</span>
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                이름
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
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
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호 확인
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
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
              {loading ? '처리 중…' : '회원가입 완료'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="cursor-pointer text-primary hover:text-primary-dark">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
