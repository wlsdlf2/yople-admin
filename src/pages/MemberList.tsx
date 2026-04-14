import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadMemberTemplate, parseMemberFile } from '../lib/memberBulk'


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

function formatBirthday(birth_date: string): string {
  const d = new Date(birth_date + 'T00:00:00')
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

type Member = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  gender: '남' | '여' | null
  is_new_member: boolean
  memo: string | null
  created_at: string
}

const emptyForm = {
  name: '',
  phone: '',
  birth_date: '',
  gender: '' as '남' | '여' | '',
  is_new_member: true,
  memo: '',
}

export default function MemberList() {
  const { userRole } = useOutletContext<{ userRole: 'admin' | 'owner' | 'manager' | 'staff' | null }>()
  const canEdit = userRole !== 'staff'
  const [list, setList] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filterNew, setFilterNew] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: number; fail: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('members')
      .select('id, name, phone, birth_date, gender, is_new_member, memo, created_at')
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
      gender: m.gender ?? '',
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
      gender: form.gender || null,
      is_new_member: form.is_new_member,
      memo: form.memo.trim() || null,
    }
    if (adding) {
      const { error: err } = await supabase.from('members').insert(payload)
      if (err) {
        setError(err.code === '23505' ? '이미 등록된 전화번호입니다.' : err.message)
        return
      }
      cancelForm()
      load()
    } else if (editingId) {
      const { error: err } = await supabase.from('members').update(payload).eq('id', editingId)
      if (err) {
        setError(err.code === '23505' ? '이미 등록된 전화번호입니다.' : err.message)
        return
      }
      cancelForm()
      load()
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (ext !== '.xlsx' && ext !== '.xls') {
      setError('엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.')
      e.target.value = ''
      return
    }
    setUploading(true)
    setUploadResult(null)
    setError(null)
    try {
      const { rows, errors: parseErrors } = await parseMemberFile(file)
      const errors = [...parseErrors]

      // 파일 내 중복 전화번호 사전 체크
      const seenPhones = new Set<string>()
      const uniqueRows: typeof rows = []
      for (const row of rows) {
        if (seenPhones.has(row.phone)) {
          errors.push(`파일 내 중복 전화번호: ${row.name}(${row.phone})`)
        } else {
          seenPhones.add(row.phone)
          uniqueRows.push(row)
        }
      }

      let success = 0
      let fail = 0
      for (const row of uniqueRows) {
        const payload = {
          name: row.name.trim(),
          phone: row.phone.trim(),
          birth_date: row.birth_date || null,
          gender: row.gender || null,
          is_new_member: Boolean(row.is_new_member),
          memo: row.memo?.trim() || null,
        }
        const { error: err } = await supabase.from('members').insert(payload)
        if (err) {
          fail += 1
          if (err.code === '23505') errors.push(`전화번호 중복: ${row.name}(${row.phone})`)
          else errors.push(`${row.name}: ${err.message}`)
        } else {
          success += 1
        }
      }
      setUploadResult({ success, fail, errors })
      if (success > 0) load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 처리 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const [confirmGraduateId, setConfirmGraduateId] = useState<string | null>(null)

  const graduate = async (id: string) => {
    const { error: err } = await supabase.from('members').update({ is_new_member: false }).eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    setConfirmGraduateId(null)
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

  const today = new Date()
  const thisSunday = new Date(today)
  thisSunday.setDate(today.getDate() - today.getDay())
  const thisSaturday = new Date(thisSunday)
  thisSaturday.setDate(thisSunday.getDate() + 6)
  const nextSunday = new Date(thisSunday)
  nextSunday.setDate(thisSunday.getDate() + 7)
  const nextSaturday = new Date(nextSunday)
  nextSaturday.setDate(nextSunday.getDate() + 6)

  function inWeek(birth_date: string, start: Date, end: Date): boolean {
    const birth = new Date(birth_date + 'T00:00:00')
    const bMonth = birth.getMonth()
    const bDay = birth.getDate()
    const current = new Date(start)
    while (current <= end) {
      if (current.getMonth() === bMonth && current.getDate() === bDay) return true
      current.setDate(current.getDate() + 1)
    }
    return false
  }

  const thisWeekBirthdays = list
    .filter((m) => m.birth_date && inWeek(m.birth_date, thisSunday, thisSaturday))
    .sort((a, b) => new Date(a.birth_date! + 'T00:00:00').getDate() - new Date(b.birth_date! + 'T00:00:00').getDate())
  const nextWeekBirthdays = list
    .filter((m) => m.birth_date && inWeek(m.birth_date, nextSunday, nextSaturday))
    .sort((a, b) => new Date(a.birth_date! + 'T00:00:00').getDate() - new Date(b.birth_date! + 'T00:00:00').getDate())

  return (
    <div>
      <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-800 mb-2">
            이번 주 생일 ({thisWeekBirthdays.length}명)
          </h3>
          {thisWeekBirthdays.length === 0 ? (
            <p className="text-sm text-amber-700/60">이번 주 생일자가 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {thisWeekBirthdays.map((m) => (
                <li key={m.id} className="rounded-lg bg-white border border-amber-200 px-3 py-1.5 text-sm text-slate-700">
                  {m.name} · {formatBirthday(m.birth_date!)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-700 mb-2">
            다음 주 생일 ({nextWeekBirthdays.length}명)
          </h3>
          {nextWeekBirthdays.length === 0 ? (
            <p className="text-sm text-amber-700/60">다음 주 생일자가 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {nextWeekBirthdays.map((m) => (
                <li key={m.id} className="rounded-lg bg-white border border-amber-100 px-3 py-1.5 text-sm text-slate-600">
                  {m.name} · {formatBirthday(m.birth_date!)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">청년 명단</h2>
        {canEdit && !adding && !editingId && (
          <button
            type="button"
            onClick={openAdd}
            className="cursor-pointer px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
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

      {canEdit && (adding || editingId) && (
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
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">성별</label>
              <div className="flex gap-3 mt-1">
                {(['남', '여'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={form.gender === g}
                      onChange={() => setForm((f) => ({ ...f, gender: g }))}
                      className="border-slate-300"
                    />
                    {g}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value=""
                    checked={form.gender === ''}
                    onChange={() => setForm((f) => ({ ...f, gender: '' }))}
                    className="border-slate-300"
                  />
                  미입력
                </label>
              </div>
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

          {adding && (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-600 select-none">
                엑셀 파일로 일괄 등록
              </summary>
              <div className="px-4 pb-4 pt-2">
                <p className="text-slate-500 text-xs mb-3">
                  엑셀 양식(이름, 전화번호, 생년월일, 새가족, 비고)으로 작성한 파일을 업로드하면 명단이 일괄 등록됩니다.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={downloadMemberTemplate}
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    양식 다운로드
                  </button>
                  <label className="rounded-lg border border-primary bg-primary text-white px-3 py-1.5 text-sm cursor-pointer hover:bg-primary-dark">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="sr-only"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                    {uploading ? '처리 중…' : '파일 선택'}
                  </label>
                </div>
                {uploadResult && (
                  <div className="mt-2">
                    <p className="text-sm text-slate-700">
                      등록: {uploadResult.success}건, 실패: {uploadResult.fail}건
                    </p>
                    {uploadResult.errors.length > 0 && (
                      <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                        {uploadResult.errors.slice(0, 5).map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                        {uploadResult.errors.length > 5 && (
                          <li>외 {uploadResult.errors.length - 5}건</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-slate-600">
          {canEdit ? '등록된 청년이 없습니다. 「청년 추가」로 등록하세요.' : '등록된 청년이 없습니다.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.filter((m) => {
            const matchSearch = m.name.includes(search.trim())
            const matchNew = !filterNew || m.is_new_member
            return matchSearch && matchNew
          }).map((m) => (
            <li
              key={m.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="relative p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2">
                <Link
                  to={`/dashboard/members/${m.id}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={m.name}
                />
                <div className="relative flex flex-wrap items-center gap-2 pointer-events-none">
                  <span className="font-medium text-slate-800">{m.name}</span>
                  {m.gender && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.gender === '남' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                      {m.gender}
                    </span>
                  )}
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
                {canEdit && (
                  <div className="relative z-10 flex gap-2">
                    {m.is_new_member && confirmGraduateId !== m.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmGraduateId(m.id)}
                        className="cursor-pointer text-sm text-emerald-600 hover:text-emerald-700"
                      >
                        등반
                      </button>
                    )}
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
              </div>
              {canEdit && confirmGraduateId === m.id && (
                <div className="px-4 pb-3 pt-0 border-t border-slate-100 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{m.name}</span> 청년을 등반 처리할까요?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => graduate(m.id)}
                      className="cursor-pointer px-3 py-1 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmGraduateId(null)}
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
      )}
    </div>
  )
}
