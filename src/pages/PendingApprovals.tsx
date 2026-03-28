import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type PendingUser = {
  id: string
  email: string
  name: string | null
  role: string
  approved: boolean
  created_at: string
}

export default function PendingApprovals() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [list, setList] = useState<PendingUser[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      const { data: me } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
        setForbidden(true)
        setLoading(false)
        return
      }
      const { data, error: err } = await supabase
        .from('users')
        .select('id, email, name, role, approved, created_at')
        .eq('approved', false)
        .order('created_at', { ascending: true })
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      setList((data ?? []) as PendingUser[])
      setLoading(false)
    }
    load()
  }, [navigate])

  const approve = async (id: string) => {
    setError(null)
    const { error: err } = await supabase.from('users').update({ approved: true }).eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setList((prev) => prev.filter((u) => u.id !== id))
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  if (forbidden) {
    return (
      <p className="text-slate-600">
        이 메뉴는 관리자(owner, admin)만 이용할 수 있습니다.
      </p>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">회원가입 요청 수락</h2>
      {error && (
        <p className="text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}
      {list.length === 0 ? (
        <p className="text-slate-600">대기 중인 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((u) => (
            <li
              key={u.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium text-slate-800">{u.email}</p>
                {u.name && <p className="text-sm text-slate-500">{u.name}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  요청일: {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => approve(u.id)}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark"
              >
                수락
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
