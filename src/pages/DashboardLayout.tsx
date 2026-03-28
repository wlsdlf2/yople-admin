import { useEffect, useState } from 'react'
import { useNavigate, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../assets/yople_logo.jpg'
import { Navbar } from '../components/Navbar'

export default function DashboardLayout() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'staff' | null>(null)

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('id, role, approved')
        .eq('id', session.user.id)
        .maybeSingle()
      if (userError || !userRow) {
        setNotAllowed(true)
        setLoading(false)
        return
      }
      if (userRow.role === 'staff' && !userRow.approved) {
        setPendingApproval(true)
        setLoading(false)
        return
      }
      setUserRole(userRow.role as 'owner' | 'admin' | 'staff')
      setLoading(false)
    }
    check()
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">확인 중…</p>
      </div>
    )
  }

  if (notAllowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-slate-700 text-center mb-4">
          이 계정은 등록된 관리자가 아닙니다.
          <br />
          서비스 관리자에게 등록을 요청하세요.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-primary hover:text-primary-dark"
        >
          로그아웃
        </button>
      </div>
    )
  }

  if (pendingApproval) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-slate-700 text-center mb-4">
          승인 대기 중입니다.
          <br />
          목사님의 수락 후 대시보드를 이용할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-primary hover:text-primary-dark"
        >
          로그아웃
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navbar userRole={userRole} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-slate-200 flex-shrink-0 overflow-hidden bg-slate-50 flex items-center justify-center p-0.5">
              <img src={logo} alt="젊은백성" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-lg font-semibold text-slate-800">젊은백성 출결관리</h1>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-primary hover:text-primary-dark"
          >
            로그아웃
          </button>
        </header>
        <main className="p-4 sm:p-6 flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
