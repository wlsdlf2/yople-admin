import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Member = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  is_new_member: boolean
  memo: string | null
  created_at: string
}

const emptyForm = {
  name: '',
  phone: '',
  birth_date: '',
  is_new_member: true,
  memo: '',
}

export default function MemberList() {
  const [list, setList] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filterNew, setFilterNew] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('members')
      .select('id, name, phone, birth_date, is_new_member, memo, created_at')
      .order('birth_date', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
    if (err) {
      setError(err.message)
      setList([])
    } else {
      setList((data ?? []) as Member[])
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

  const openEdit = (m: Member) => {
    setEditingId(m.id)
    setAdding(false)
    setForm({
      name: m.name,
      phone: m.phone,
      birth_date: m.birth_date ?? '',
      is_new_member: m.is_new_member,
      memo: m.memo ?? '',
    })
  }

  const cancelForm = () => {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('이름과 전화번호는 필수입니다.')
      return
    }
    setError(null)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      birth_date: form.birth_date || null,
      is_new_member: form.is_new_member,
      memo: form.memo.trim() || null,
    }
    if (adding) {
      const { error: err } = await supabase.from('members').insert(payload)
      if (err) {
        setError(err.message)
        return
      }
      cancelForm()
      load()
    } else if (editingId) {
      const { error: err } = await supabase.from('members').update(payload).eq('id', editingId)
      if (err) {
        setError(err.message)
        return
      }
      cancelForm()
      load()
    }
  }

  const graduate = async (id: string, name: string) => {
    if (!confirm(`"${name}" 청년을 등반 처리할까요?\n새가족 탭에서 제외되고 전체 탭으로 이동합니다.`)) return
    const { error: err } = await supabase.from('members').update({ is_new_member: false }).eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    load()
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`"${name}" 청년을 명단에서 삭제할까요?`)) return
    const { error: err } = await supabase.from('members').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    if (editingId === id) cancelForm()
    load()
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">청년 명단</h2>
        {!adding && !editingId && (
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
          >
            청년 추가
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
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterNew}
            onChange={(e) => setFilterNew(e.target.checked)}
            className="rounded border-slate-300"
          />
          새가족만 보기
        </label>
        <span className="text-sm text-slate-400 ml-auto">
          {list.filter((m) => {
            const matchSearch = m.name.includes(search.trim())
            const matchNew = !filterNew || m.is_new_member
            return matchSearch && matchNew
          }).length}명
        </span>
      </div>

      {error && (
        <p className="text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}

      {(adding || editingId) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <h3 className="font-medium text-slate-800 mb-3">{adding ? '새 청년 등록' : '수정'}</h3>
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
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                placeholder="010-1234-5678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">생년월일</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_new_member"
                checked={form.is_new_member}
                onChange={(e) => setForm((f) => ({ ...f, is_new_member: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <label htmlFor="is_new_member" className="text-sm text-slate-700">새가족</label>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">비고</label>
            <input
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              placeholder="선택"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={save}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
            >
              저장
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-slate-600">등록된 청년이 없습니다. 「청년 추가」로 등록하세요.</p>
      ) : (
        <ul className="space-y-2">
          {list.filter((m) => {
            const matchSearch = m.name.includes(search.trim())
            const matchNew = !filterNew || m.is_new_member
            return matchSearch && matchNew
          }).map((m) => (
            <li
              key={m.id}
              className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{m.name}</span>
                {m.is_new_member && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    새가족
                  </span>
                )}
                <span className="text-slate-500 text-sm">{m.phone}</span>
                {m.birth_date && (
                  <span className="text-slate-400 text-sm">{m.birth_date}</span>
                )}
              </div>
              <div className="flex gap-2">
                {m.is_new_member && (
                  <button
                    type="button"
                    onClick={() => graduate(m.id, m.name)}
                    className="text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    등반
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="text-sm text-primary hover:text-primary-dark"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => remove(m.id, m.name)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
