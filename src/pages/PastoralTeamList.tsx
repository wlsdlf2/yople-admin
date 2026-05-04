import { useEffect, useState } from 'react'
import { useOutletContext, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

type PastoralMember = {
  id: string
  name: string
  phone: string
  role: string | null
  birth_date: string | null
  created_at: string
}

const emptyForm = {
  name: '',
  phone: '',
  role: '',
  birth_date: '',
}

export default function PastoralTeamList() {
  const { userRole } = useOutletContext<{ userRole: 'admin' | 'owner' | 'manager' | 'staff' | null }>()
  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'manager'
  const [list, setList] = useState<PastoralMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('pastoral_team')
      .select('id, name, phone, role, birth_date, created_at')
      .order('created_at', { ascending: true })
    if (err) {
      setError(err.message)
      setList([])
    } else {
      setList((data ?? []) as PastoralMember[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openAdd = () => {
    setAdding(true)
    setEditingId(null)
    setForm(emptyForm)
  }

  const openEdit = (m: PastoralMember) => {
    setEditingId(m.id)
    setAdding(false)
    setForm({
      name: m.name,
      phone: m.phone,
      role: m.role ?? '',
      birth_date: m.birth_date ?? '',
    })
  }

  const cancelForm = () => {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.role || !form.birth_date) {
      setError('모든 항목을 입력해주세요.')
      return
    }
    setError(null)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      role: form.role.trim() || null,
      birth_date: form.birth_date || null,
    }
    if (adding) {
      const { error: err } = await supabase.from('pastoral_team').insert(payload)
      if (err) {
        setError(err.code === '23505' ? '이미 등록된 전화번호입니다.' : err.message)
        return
      }
      cancelForm()
      load()
    } else if (editingId) {
      const { error: err } = await supabase.from('pastoral_team').update(payload).eq('id', editingId)
      if (err) {
        setError(err.code === '23505' ? '이미 등록된 전화번호입니다.' : err.message)
        return
      }
      cancelForm()
      load()
    }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`"${name}"을(를) 목회팀 명단에서 삭제할까요?`)) return
    const { error: err } = await supabase.from('pastoral_team').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    if (editingId === id) cancelForm()
    load()
  }

  if (userRole === 'staff') {
    return <Navigate to="/dashboard/attendance" replace />
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">목회팀 명단</h2>
        {canEdit && !adding && !editingId && (
          <button
            type="button"
            onClick={openAdd}
            className="cursor-pointer px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
          >
            추가
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름으로 검색"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 w-48"
        />
        <span className="text-sm text-slate-400 ml-auto">
          {list.filter((m) => m.name.includes(search.trim())).length}명
        </span>
      </div>

      {error && (
        <p className="text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}

      {canEdit && (adding || editingId) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <h3 className="font-medium text-slate-800 mb-3">{adding ? '목회팀 등록' : '수정'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이름 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">전화번호 *</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                placeholder="010-1234-5678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">직책 *</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              >
                <option value="">선택 안 함</option>
                <option value="담당 목사">담당 목사</option>
                <option value="전도사">전도사</option>
                <option value="팀장">팀장</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">생년월일 *</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={save}
              className="cursor-pointer px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
            >
              저장
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="cursor-pointer px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-slate-600">
          {canEdit ? '등록된 목회팀 멤버가 없습니다. 「추가」로 등록하세요.' : '등록된 목회팀 멤버가 없습니다.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list
            .filter((m) => m.name.includes(search.trim()))
            .map((m) => (
              <li
                key={m.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{m.name}</span>
                  {m.role && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      {m.role}
                    </span>
                  )}
                  <span className="text-slate-500 text-sm">{m.phone}</span>
                  {m.birth_date && (
                    <span className="text-slate-400 text-sm">{m.birth_date}</span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="cursor-pointer text-sm text-primary hover:text-primary-dark"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m.id, m.name)}
                      className="cursor-pointer text-sm text-red-600 hover:text-red-700"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
