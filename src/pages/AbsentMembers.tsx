import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCohort } from '../lib/dateUtils'

type AbsentMember = {
  id: string
  name: string
  birth_date: string | null
  is_new_member: boolean
  lastDate: string | null
}

export default function AbsentMembers() {
  const [weeks, setWeeks] = useState(3)
  const [includeNew, setIncludeNew] = useState(false)
  const [absentList, setAbsentList] = useState<AbsentMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentDates, setRecentDates] = useState<string[]>([])

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      setError(null)
      try {
        // 1. 전체 출석 날짜 조회 → 중복 제거 → 최신 N개
        const { data: allDates, error: errD } = await supabase
          .from('attendances')
          .select('date')
          .order('date', { ascending: false })
        if (errD) throw new Error(errD.message)

        const uniqueDates = [...new Set((allDates ?? []).map((r: { date: string }) => r.date))]
        const recent = uniqueDates.slice(0, weeks)
        setRecentDates(recent)

        if (recent.length === 0) {
          setAbsentList([])
          setLoading(false)
          return
        }

        // 2. 전체 회원
        const { data: members, error: errM } = await supabase
          .from('members')
          .select('id, name, birth_date, is_new_member')
          .order('birth_date', { ascending: true, nullsFirst: false })
          .order('name')
        if (errM) throw new Error(errM.message)

        // 3. 최근 N주 출석 기록
        const { data: recentAtt, error: errA } = await supabase
          .from('attendances')
          .select('member_id')
          .in('date', recent)
        if (errA) throw new Error(errA.message)

        const attendedIds = new Set((recentAtt ?? []).map((r: { member_id: string }) => r.member_id))

        // 4. 결석자 필터
        const absentMembers = (members ?? []).filter(
          (m: { id: string; is_new_member: boolean }) =>
            !attendedIds.has(m.id) && (includeNew || !m.is_new_member)
        )

        if (absentMembers.length === 0) {
          setAbsentList([])
          setLoading(false)
          return
        }

        // 5. 결석자의 마지막 출석일
        const absentIds = absentMembers.map((m: { id: string }) => m.id)
        const { data: lastAttData } = await supabase
          .from('attendances')
          .select('member_id, date')
          .in('member_id', absentIds)
          .order('date', { ascending: false })

        const lastDateMap = new Map<string, string>()
        for (const row of (lastAttData ?? []) as { member_id: string; date: string }[]) {
          if (!lastDateMap.has(row.member_id)) {
            lastDateMap.set(row.member_id, row.date)
          }
        }

        setAbsentList(
          absentMembers.map((m: { id: string; name: string; birth_date: string | null; is_new_member: boolean }) => ({
            ...m,
            lastDate: lastDateMap.get(m.id) ?? null,
          }))
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [weeks, includeNew])

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">결석자 조회</h2>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">기준 주수</span>
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}주</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeNew}
            onChange={(e) => setIncludeNew(e.target.checked)}
            className="rounded border-slate-300"
          />
          새가족 포함
        </label>
      </div>

      {error && <p className="text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-500">불러오는 중…</p>
      ) : recentDates.length === 0 ? (
        <p className="text-slate-600">출석 데이터가 없습니다.</p>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-3">
            최근 {weeks}주 기준 ({recentDates[recentDates.length - 1]} ~ {recentDates[0]}) &nbsp;·&nbsp;
            <span className="font-medium text-slate-700">{absentList.length}명 결석</span>
          </p>

          {absentList.length === 0 ? (
            <p className="text-slate-600">최근 {weeks}주 동안 결석자가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-600">또래</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">이름</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">마지막 출석일</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600">결석</th>
                  </tr>
                </thead>
                <tbody>
                  {absentList.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-500">{getCohort(m.birth_date)}</td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/dashboard/members/${m.id}`}
                          className="font-medium text-slate-800 hover:text-primary"
                        >
                          {m.name}
                        </Link>
                        {m.is_new_member && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">새가족</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {m.lastDate ?? <span className="text-slate-400">출석 기록 없음</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{weeks}주 이상</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
