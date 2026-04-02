import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)

  // 잠금 화면 설정
  const [lockEnabled, setLockEnabled] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  // UI 상태
  const [currentPassword, setCurrentPassword] = useState('')
  const [currentPasswordVerified, setCurrentPasswordVerified] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!userRow || (userRow.role !== 'owner' && userRow.role !== 'admin')) {
        setNotAllowed(true)
        setLoading(false)
        return
      }

      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['lock_enabled', 'lock_password_hash'])

      if (settings) {
        const lockEnabledRow = settings.find(s => s.key === 'lock_enabled')
        const lockPasswordRow = settings.find(s => s.key === 'lock_password_hash')
        setLockEnabled(lockEnabledRow?.value === 'true')
        setHasPassword(!!lockPasswordRow?.value)
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
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'lock_password_hash')
      .maybeSingle()

    if (data?.value === hash) {
      setCurrentPasswordVerified(true)
    } else {
      setVerifyError('현재 비밀번호가 올바르지 않습니다.')
    }
  }

  const handleSavePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 4) {
      setPasswordError('비밀번호는 4자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

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

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  if (notAllowed) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-slate-600">접근 권한이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-800">설정</h2>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* 잠금 화면 사용 토글 */}
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
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                lockEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 잠금 화면 상세 설정 (토글 ON일 때만 표시) */}
        {lockEnabled && (
          <div className="p-5 space-y-5">
            <div>
              <p className="text-sm font-medium text-slate-800">비밀번호 설정</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasPassword
                  ? '현재 비밀번호를 확인한 후 새 비밀번호로 변경할 수 있습니다'
                  : '잠금 화면에서 사용할 비밀번호를 설정하세요'}
              </p>
            </div>

            {/* 현재 비밀번호 확인 (이미 설정된 경우) */}
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
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            )}

            {/* 새 비밀번호 입력 폼 */}
            {(!hasPassword || currentPasswordVerified) && (
              <div className="space-y-3">
                {currentPasswordVerified && (
                  <p className="text-xs text-green-600 font-medium">현재 비밀번호가 확인되었습니다</p>
                )}
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
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  비밀번호 저장
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
