import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCohort, getSundaysInYear } from '../lib/dateUtils'

type Member = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  gender: '남' | '여' | null
  is_new_member: boolean
  memo: string | null
}

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const [member, setMember] = useState<Member | null>(null)
  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [attendedSet, setAttendedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [graduating, setGraduating] = useState(false)
  const [confirmGraduate, setConfirmGraduate] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [reverting, setReverting] = useState(false)

  useEffect(() => {
    if (!id) return
    const fetchMember = async () => {
      const { data, error: err } = await supabase
        .from('members')
        .select('id, name, phone, birth_date, gender, is_new_member, memo')
        .eq('id', id)
        .single()
      if (err || !data) {
        setError('청년 정보를 불러오지 못했습니다.')
        setLoading(false)
        return
      }
      setMember(data as Member)

      const { data: allAtt } = await supabase
        .from('attendances')
        .select('date')
        .eq('member_id', id)
      if (allAtt && allAtt.length > 0) {
        const years = new Set<number>()
        for (const row of allAtt as { date: string }[]) {
          years.add(new Date(row.date + 'Z').getFullYear())
        }
        const sorted = [currentYear, ...Array.from(years).filter((y) => y !== currentYear).sort((a, b) => b - a)]
        setAvailableYears(sorted)
      }

      setLoading(false)
    }
    fetchMember()
  }, [id, currentYear])

  useEffect(() => {
    if (!id) return
    const fetchAttendance = async () => {
      const { data } = await supabase
        .from('attendances')
        .select('date')
        .eq('member_id', id)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
      const s = new Set<string>()
      for (const row of (data ?? []) as { date: string }[]) {
        s.add(row.date)
      }
      setAttendedSet(s)
    }
    fetchAttendance()
  }, [id, year])

  const handleRevertToNew = async () => {
    if (!id) return
    setReverting(true)
    const { error: err } = await supabase
      .from('members')
      .update({ is_new_member: true })
      .eq('id', id)
    if (err) {
      setError(err.message)
      setReverting(false)
      setConfirmRevert(false)
      return
    }
    setMember((m) => m ? { ...m, is_new_member: true } : m)
    setReverting(false)
    setConfirmRevert(false)
  }

  const handleGraduate = async () => {
    if (!id) return
    setGraduating(true)
    const { error: err } = await supabase
      .from('members')
      .update({ is_new_member: false })
      .eq('id', id)
    if (err) {
      setError(err.message)
      setGraduating(false)
      setConfirmGraduate(false)
      return
    }
    setMember((m) => m ? { ...m, is_new_member: false } : m)
    setGraduating(false)
    setConfirmGraduate(false)
  }

  if (loading) return <p className="text-slate-500">불러오는 중…</p>
  if (error || !member) return <p className="text-red-600 bg-red-50 rounded-lg p-3">{error ?? '청년을 찾을 수 없습니다.'}</p>

  const sundays = getSundaysInYear(year)
  const pastSundays = sundays.filter((d) => d <= new Date().toISOString().slice(0, 10))
  const attendedCount = pastSundays.filter((d) => attendedSet.has(d)).length
  const rate = pastSundays.length > 0 ? Math.round((attendedCount / pastSundays.length) * 100) : 0

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="cursor-pointer text-sm text-primary hover:text-primary-dark mb-4 inline-flex items-center gap-1"
      >
        ← 뒤로가기
      </button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-800">{member.name}</h2>
            {member.is_new_member && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">새가족</span>
            )}
            {member.gender && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${member.gender === '남' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                {member.gender}
              </span>
            )}
            <span className="text-sm text-slate-500">{getCohort(member.birth_date)}년생</span>
          </div>
          {member.is_new_member && !confirmGraduate && (
            <button
              type="button"
              onClick={() => setConfirmGraduate(true)}
              className="cursor-pointer text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              등반 처리
            </button>
          )}
          {!member.is_new_member && !confirmRevert && (
            <button
              type="button"
              onClick={() => setConfirmRevert(true)}
              className="cursor-pointer text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              새가족 처리
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500">{member.phone}</p>
        {member.memo && <p className="text-sm text-slate-400 mt-1">{member.memo}</p>}

        {confirmRevert && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-sm text-slate-700 mb-2">
              새가족으로 되돌릴까요? 출석 기록은 그대로 유지됩니다.
            </p>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRevertToNew}
                disabled={reverting}
                className="cursor-pointer px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {reverting ? '처리 중…' : '확인'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRevert(false)}
                disabled={reverting}
                className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        )}
        {confirmGraduate && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-sm text-slate-700 mb-2">
              새가족에서 전체 청년으로 전환할까요? 출석 기록은 그대로 유지됩니다.
            </p>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGraduate}
                disabled={graduating}
                className="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {graduating ? '처리 중…' : '확인'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmGraduate(false)}
                disabled={graduating}
                className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">
            {attendedCount} / {pastSundays.length}주 출석
            <span className="ml-2 text-primary font-semibold">{rate}%</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">연도</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {sundays.map((d) => {
                const [, m, day] = d.split('-')
                return (
                  <th key={d} className="p-2 text-center min-w-[2.5rem] font-medium text-slate-600">
                    {Number(m)}/{Number(day)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {sundays.map((d) => {
                const isFuture = d > new Date().toISOString().slice(0, 10)
                return (
                  <td key={d} className="p-1 text-center">
                    {isFuture ? (
                      <span className="text-slate-200">·</span>
                    ) : attendedSet.has(d) ? (
                      <span className="text-primary font-medium">O</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
