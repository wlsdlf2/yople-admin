import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

type Role = 'admin' | 'owner' | 'manager' | 'staff'
type User = { id: string; email: string; name: string | null; role: Role }

const roleLabels: Record<Role, string> = { admin: '관리자', owner: '담당 목사', manager: '전도사', staff: '스태프' }

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<Role>('manager')

  // 잠금 화면 설정
  const [lockEnabled, setLockEnabled] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [currentPasswordVerified, setCurrentPasswordVerified] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  // 사용자 관리
  const [users, setUsers] = useState<User[]>([])
  const [userError, setUserError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'owner' && userRow.role !== 'manager')) {
        setNotAllowed(true)
        setLoading(false)
        return
      }

      setCurrentUserId(session.user.id)
      setCurrentUserRole(userRow.role as Role)

      const role = userRow.role as Role
      const usersQuery = supabase.from('users').select('id, email, name, role').eq('approved', true).order('created_at', { ascending: true })
      const filteredUsersQuery = role === 'admin'
        ? usersQuery
        : usersQuery.in('role', ['owner', 'manager', 'staff'])

      const [settingsRes, usersRes] = await Promise.all([
        supabase.from('app_settings').select('key, value').in('key', ['lock_enabled', 'lock_password_hash']),
        filteredUsersQuery,
      ])

      if (settingsRes.data) {
        const lockEnabledRow = settingsRes.data.find(s => s.key === 'lock_enabled')
        const lockPasswordRow = settingsRes.data.find(s => s.key === 'lock_password_hash')
        setLockEnabled(lockEnabledRow?.value === 'true')
        setHasPassword(!!lockPasswordRow?.value)
      }

      if (usersRes.data) {
        setUsers(usersRes.data as User[])
      }

      setLoading(false)
    }
    init()
  }, [])

  const handleLockToggle = async () => {
    const next = !lockEnabled
    setLockEnabled(next)
    if (!next) {
      setCurrentPassword('')
      setCurrentPasswordVerified(false)
      setNewPassword('')
      setConfirmPassword('')
      setVerifyError('')
      setPasswordError('')
      setPasswordSuccess('')
    }
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'lock_enabled', value: next ? 'true' : 'false', updated_at: new Date().toISOString() })
    if (error) {
      setLockEnabled(!next)
      alert('설정 저장에 실패했습니다. Supabase app_settings 테이블을 확인해주세요.')
    }
    setSaving(false)
  }

  const handleVerifyCurrentPassword = async () => {
    setVerifyError('')
    if (!currentPassword) return
    const hash = await sha256(currentPassword)
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'lock_password_hash').maybeSingle()
    if (data?.value === hash) {
      setCurrentPasswordVerified(true)
    } else {
      setVerifyError('현재 비밀번호가 올바르지 않습니다.')
    }
  }

  const handleSavePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword.length < 4) { setPasswordError('비밀번호는 4자 이상이어야 합니다.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('비밀번호 확인이 일치하지 않습니다.'); return }
    setSaving(true)
    const hash = await sha256(newPassword)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'lock_password_hash', value: hash, updated_at: new Date().toISOString() })
    if (error) {
      setPasswordError('비밀번호 저장에 실패했습니다.')
    } else {
      setPasswordSuccess('비밀번호가 저장되었습니다.')
      setHasPassword(true)
      setCurrentPassword('')
      setCurrentPasswordVerified(false)
      setNewPassword('')
      setConfirmPassword('')
    }
    setSaving(false)
  }

  const canManage = (target: User) => {
    if (target.id === currentUserId) return false
    if (currentUserRole === 'admin') return true
    if (currentUserRole === 'owner') return target.role !== 'admin'
    return false
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUserError('')
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
    if (error) {
      setUserError('역할 변경에 실패했습니다.')
      return
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
  }

  const handleDeleteUser = async (userId: string) => {
    setUserError('')
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) {
      setUserError('삭제에 실패했습니다.')
      return
    }
    setUsers(prev => prev.filter(u => u.id !== userId))
    setConfirmDeleteId(null)
  }

  if (loading) return <p className="text-slate-500">불러오는 중…</p>

  if (notAllowed) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-slate-600">접근 권한이 없습니다.</p>
      </div>
    )
  }

  const roleOptions: Role[] = currentUserRole === 'admin'
    ? ['admin', 'owner', 'manager', 'staff']
    : ['owner', 'manager', 'staff']

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-800">설정</h2>

      {/* 잠금 화면 설정 */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">잠금 화면 사용</p>
            <p className="text-xs text-slate-500 mt-0.5">키패드 화면 접속 전 잠금 화면을 표시합니다</p>
          </div>
          <button
            type="button"
            onClick={handleLockToggle}
            disabled={saving}
            aria-checked={lockEnabled}
            role="switch"
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer ${
              lockEnabled ? 'bg-primary' : 'bg-slate-200'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lockEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {lockEnabled && (
          <div className="p-5 space-y-5">
            <div>
              <p className="text-sm font-medium text-slate-800">비밀번호 설정</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasPassword ? '현재 비밀번호를 확인한 후 새 비밀번호로 변경할 수 있습니다' : '잠금 화면에서 사용할 비밀번호를 설정하세요'}
              </p>
            </div>

            {hasPassword && !currentPasswordVerified && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">현재 비밀번호</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value.replace(/\D/g, '')); setVerifyError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyCurrentPassword()}
                    placeholder="현재 비밀번호 입력 (숫자)"
                    className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {verifyError && <p className="text-xs text-red-500 mt-1.5">{verifyError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleVerifyCurrentPassword}
                  disabled={!currentPassword}
                  className="cursor-pointer px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            )}

            {(!hasPassword || currentPasswordVerified) && (
              <div className="space-y-3">
                {currentPasswordVerified && <p className="text-xs text-green-600 font-medium">현재 비밀번호가 확인되었습니다</p>}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">새 비밀번호</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value.replace(/\D/g, '')); setPasswordError(''); setPasswordSuccess('') }}
                    placeholder="숫자 4자리 이상"
                    className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">비밀번호 확인</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value.replace(/\D/g, '')); setPasswordError(''); setPasswordSuccess('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSavePassword()}
                    placeholder="숫자 비밀번호 재입력"
                    className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs text-green-600">{passwordSuccess}</p>}
                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={saving || !newPassword || !confirmPassword}
                  className="cursor-pointer px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  비밀번호 저장
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 사용자 관리 (admin, owner 전용) */}
      {(currentUserRole === 'admin' || currentUserRole === 'owner') && <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-5 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-800">사용자 관리</p>
          <p className="text-xs text-slate-500 mt-0.5">등록된 관리자 목록을 확인하고 역할을 변경하거나 삭제할 수 있습니다</p>
        </div>

        {userError && <p className="mx-5 mt-4 text-xs text-red-500">{userError}</p>}

        <ul className="divide-y divide-slate-100">
          {users.map(u => (
            <li key={u.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{u.name ?? u.email}</span>
                    {u.id === currentUserId && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">나</span>
                    )}
                  </div>
                  {u.name && <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                    disabled={!canManage(u)}
                    className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {roleOptions.map(r => (
                      <option key={r} value={r}>{roleLabels[r]}</option>
                    ))}
                  </select>

                  {canManage(u) && confirmDeleteId !== u.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="cursor-pointer text-sm text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>

              {confirmDeleteId === u.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{u.name ?? u.email}</span> 계정을 삭제할까요?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id)}
                      className="cursor-pointer px-3 py-1 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="cursor-pointer px-3 py-1 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>}
    </div>
  )
}
