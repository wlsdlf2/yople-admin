import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AttendanceRow = {
  id: string
  date: string
  created_at: string
  member_id?: string
  members?: { name: string } | null
  member?: { name: string } | null
}

type MemberOption = { id: string; name: string; birth_date?: string | null }

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + 'Z')
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function getCohort(birth_date: string | null | undefined): string {
  if (!birth_date) return '?'
  return birth_date.substring(2, 4) // "1999-01-01" → "99"
}

export default function AttendanceDetail() {
  const { date } = useParams<{ date: string }>()
  const [loading, setLoading] = useState(true)
  const [attendances, setAttendances] = useState<AttendanceRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [visitorCount, setVisitorCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [nameInput, setNameInput] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTime, setEditTime] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setError(null)
    try {
      const [attRes, visRes, memRes] = await Promise.all([
        supabase
          .from('attendances')
          .select('id, date, created_at, member_id, members(name)')
          .eq('date', date)
          .order('created_at', { ascending: true }),
        supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('date', date),
        supabase.from('members').select('id, name, birth_date').order('birth_date', { ascending: true }).order('name', { ascending: true }),
      ])
      if (attRes.error) {
        setError(attRes.error.message)
        setLoading(false)
        return
      }
      if (visRes.error) {
        setError(visRes.error.message)
        setLoading(false)
        return
      }
      if (memRes.error) {
        setError(memRes.error.message)
        setLoading(false)
        return
      }
      setAttendances((attRes.data ?? []) as unknown as AttendanceRow[])
      setVisitorCount(visRes.count ?? 0)
      setMembers((memRes.data ?? []) as MemberOption[])
    } catch {
      setError('데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  const attendedMemberIds = new Set(attendances.map((a) => a.member_id).filter(Boolean))
  const absentMembers = members.filter((m) => !attendedMemberIds.has(m.id))

  const trimmed = nameInput.trim()
  const nameMatches = trimmed ? absentMembers.filter((m) => m.name.includes(trimmed)) : []

  // 결석 목록에서 동명이인 여부 확인
  const absentNameCount = absentMembers.reduce<Record<string, number>>((acc, m) => {
    acc[m.name] = (acc[m.name] ?? 0) + 1
    return acc
  }, {})

  const handleAddById = async (memberId: string) => {
    if (!date || !memberId) return
    setAddLoading(true)
    setAddError(null)
    try {
      const { error: insertErr } = await supabase.from('attendances').insert({
        member_id: memberId,
        date,
      })
      if (insertErr) {
        if (insertErr.code === '23505') setAddError('이미 이 날 출석 처리된 청년입니다.')
        else setAddError(insertErr.message)
        setAddLoading(false)
        return
      }
      setNameInput('')
      setRefreshTrigger((t) => t + 1)
      nameInputRef.current?.focus()
    } catch {
      setAddError('추가에 실패했습니다.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && nameMatches.length === 1) {
      handleAddById(nameMatches[0].id)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 출석 기록을 삭제할까요?')) return
    setDeletingId(id)
    try {
      const { error: delErr } = await supabase.from('attendances').delete().eq('id', id)
      if (delErr) setError(delErr.message)
      else setRefreshTrigger((t) => t + 1)
    } finally {
      setDeletingId(null)
    }
  }

  const startEdit = (a: AttendanceRow) => {
    const d = new Date(a.created_at)
    const h = d.getHours()
    const m = d.getMinutes()
    setEditTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    setEditingId(a.id)
  }

  const handleUpdateTime = async () => {
    if (!editingId || !date || !editTime.trim()) return
    const [h, m] = editTime.trim().split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return
    }
    const newCreatedAt = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`)
    try {
      const { error: upErr } = await supabase
        .from('attendances')
        .update({ created_at: newCreatedAt.toISOString() })
        .eq('id', editingId)
      if (upErr) setError(upErr.message)
      else {
        setEditingId(null)
        setRefreshTrigger((t) => t + 1)
      }
    } finally {}
  }

  if (!date) {
    return (
      <p className="text-slate-600">
        <Link to="/dashboard/attendance" className="text-primary hover:text-primary-dark">
          주일별 출석 현황
        </Link>
        으로 돌아가기
      </p>
    )
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  if (error) {
    return (
      <div>
        <p className="text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
        <Link to="/dashboard/attendance" className="text-primary hover:text-primary-dark text-sm">
          ← 주일별 출석 현황
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/dashboard/attendance"
        className="cursor-pointer inline-block text-sm text-slate-500 hover:text-primary mb-4"
      >
        ← 주일별 출석 현황
      </Link>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">
        {formatDateFull(date)}
      </h2>
      <p className="text-slate-500 text-sm mb-6">
        출석 {attendances.length}명 · 결석 {absentMembers.length}명 · 방문자 {visitorCount}명
      </p>

      <section className="mb-6">
        <h3 className="text-sm font-medium text-slate-600 mb-2">출석 청년 ({attendances.length}명)</h3>

        {/* 이름 검색 출석 추가 */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value); setAddError(null) }}
              onKeyDown={handleNameKeyDown}
              placeholder="이름 입력 후 Enter"
              disabled={addLoading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
            />
            {addLoading && <span className="text-xs text-slate-400">추가 중…</span>}
          </div>

          {trimmed && (
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-white overflow-hidden w-64">
              {nameMatches.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">검색 결과가 없습니다</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {nameMatches.map((m) => {
                    const hasDuplicate = (absentNameCount[m.name] ?? 0) > 1
                    return (
                      <li key={m.id} className="flex items-center justify-between px-3 py-2 gap-2">
                        <span className="text-sm text-slate-700">
                          {m.name}
                          {hasDuplicate && (
                            <span className="ml-1 text-xs text-slate-400">({getCohort(m.birth_date)}년생)</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddById(m.id)}
                          disabled={addLoading}
                          className="cursor-pointer text-xs text-primary hover:text-primary-dark disabled:opacity-50 flex-shrink-0"
                        >
                          추가
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
        </div>

        {attendances.length === 0 ? (
          <p className="text-slate-500 text-sm">출석한 청년이 없습니다.</p>
        ) : (
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {attendances.map((a) => (
              <li
                key={a.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                {a.member_id ? (
                  <Link
                    to={`/dashboard/members/${a.member_id}`}
                    className="cursor-pointer font-medium text-slate-800 hover:text-primary"
                  >
                    {a.members?.name ?? a.member?.name ?? '(이름 없음)'}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800">
                    {a.members?.name ?? a.member?.name ?? '(이름 없음)'}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {editingId === a.id ? (
                    <>
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleUpdateTime}
                        className="cursor-pointer text-sm text-primary hover:text-primary-dark"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="cursor-pointer text-sm text-slate-500 hover:text-slate-700"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-slate-400">
                        {formatTime(a.created_at)} 체크인
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="cursor-pointer text-xs text-slate-500 hover:text-primary"
                      >
                        수정
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="cursor-pointer text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {deletingId === a.id ? '삭제 중…' : '삭제'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h3 className="text-sm font-medium text-slate-600 mb-2">결석 청년 ({absentMembers.length}명)</h3>
        {absentMembers.length === 0 ? (
          <p className="text-slate-500 text-sm">결석한 청년이 없습니다.</p>
        ) : (
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {absentMembers.map((m) => (
              <li key={m.id} className="px-4 py-2 flex items-center justify-between gap-2">
                <Link
                  to={`/dashboard/members/${m.id}`}
                  className="cursor-pointer text-slate-700 hover:text-primary"
                >
                  {m.name}
                  {(absentNameCount[m.name] ?? 0) > 1 && (
                    <span className="ml-1 text-xs text-slate-400">({getCohort(m.birth_date)}년생)</span>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => handleAddById(m.id)}
                  disabled={addLoading}
                  className="cursor-pointer text-xs text-primary hover:text-primary-dark disabled:opacity-50"
                >
                  출석 추가
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {visitorCount > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-600 mb-2">방문자 ({visitorCount}명)</h3>
          <p className="text-slate-500 text-sm">
            해당 주일에 방문자로 등록된 분이 {visitorCount}명 있습니다.
          </p>
        </section>
      )}
    </div>
  )
}
