import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCohort } from '../lib/dateUtils'

// 2026년 7월 특별새벽기도회 기간 (다음 행사 때는 이 배열만 바꾸면 됨)
const DAWN_PRAYER_DATES = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17']

type Member = {
  id: string
  name: string
  birth_date: string | null
}

type PastoralMember = {
  id: string
  name: string
  role: string | null
}

function formatDateCol(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const weekday = d.toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'UTC' })
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${weekday})`
}

export default function DawnPrayerAttendance() {
  const [members, setMembers] = useState<Member[]>([])
  const [pastoralTeam, setPastoralTeam] = useState<PastoralMember[]>([])
  const [attendedSet, setAttendedSet] = useState<Set<string>>(new Set())
  const [pastoralAttendedSet, setPastoralAttendedSet] = useState<Set<string>>(new Set())
  const [visitorCountByDate, setVisitorCountByDate] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [memRes, attRes, pastoralRes, pastoralAttRes, visRes] = await Promise.all([
          supabase.from('members').select('id, name, birth_date').order('birth_date', { ascending: true, nullsFirst: false }).order('name'),
          supabase.from('attendances').select('member_id, date').in('date', DAWN_PRAYER_DATES),
          supabase.from('pastoral_team').select('id, name, role').order('created_at'),
          supabase.from('pastoral_attendances').select('member_id, date').in('date', DAWN_PRAYER_DATES),
          supabase.from('visitors').select('date, count').in('date', DAWN_PRAYER_DATES),
        ])

        if (memRes.error) throw new Error(memRes.error.message)
        if (attRes.error) throw new Error(attRes.error.message)
        if (pastoralRes.error) throw new Error(pastoralRes.error.message)
        if (pastoralAttRes.error) throw new Error(pastoralAttRes.error.message)
        if (visRes.error) throw new Error(visRes.error.message)

        const attended = new Set<string>()
        for (const a of (attRes.data ?? []) as { member_id: string; date: string }[]) {
          attended.add(`${a.member_id}_${a.date}`)
        }
        const pastoralAttended = new Set<string>()
        for (const a of (pastoralAttRes.data ?? []) as { member_id: string; date: string }[]) {
          pastoralAttended.add(`${a.member_id}_${a.date}`)
        }
        const visitorCount = new Map<string, number>()
        for (const v of (visRes.data ?? []) as { date: string; count: number }[]) {
          visitorCount.set(v.date, v.count)
        }

        setMembers((memRes.data ?? []) as Member[])
        setAttendedSet(attended)
        setPastoralTeam((pastoralRes.data ?? []) as PastoralMember[])
        setPastoralAttendedSet(pastoralAttended)
        setVisitorCountByDate(visitorCount)
      } catch (err) {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const attendedMembers = useMemo(
    () => members.filter((m) => DAWN_PRAYER_DATES.some((d) => attendedSet.has(`${m.id}_${d}`))),
    [members, attendedSet]
  )

  const totalByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of DAWN_PRAYER_DATES) {
      const mc = members.filter((m) => attendedSet.has(`${m.id}_${d}`)).length
      const pc = pastoralTeam.filter((pm) => pastoralAttendedSet.has(`${pm.id}_${d}`)).length
      map.set(d, mc + pc + (visitorCountByDate.get(d) ?? 0))
    }
    return map
  }, [members, attendedSet, pastoralTeam, pastoralAttendedSet, visitorCountByDate])

  if (loading) return <p className="text-slate-500">불러오는 중…</p>

  if (error) {
    return <p className="text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-800">특별새벽기도회 출석 현황</h2>
        <p className="text-sm text-slate-500">2026.7.13(월) ~ 7.17(금)</p>
      </div>

      <div className="mb-6 overflow-x-auto">
        <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left p-2 min-w-[6rem]">날짜</th>
              {DAWN_PRAYER_DATES.map((d) => (
                <th key={d} className="p-2 text-center min-w-[4rem] font-medium text-slate-700">
                  <Link to={`/dashboard/attendance/${d}`} className="block text-primary hover:text-primary-dark hover:underline">
                    {formatDateCol(d)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="p-2 font-medium text-slate-600">전체 출석 인원</td>
              {DAWN_PRAYER_DATES.map((d) => (
                <td key={d} className="p-2 text-center font-semibold text-slate-800">
                  {totalByDate.get(d) ?? 0}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-2 text-slate-500">방문자</td>
              {DAWN_PRAYER_DATES.map((d) => (
                <td key={d} className="p-2 text-center text-slate-600">
                  {visitorCountByDate.get(d) ?? 0}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-base font-semibold text-slate-700 mb-3">청년 출석 ({attendedMembers.length}명 참여)</h3>
      {attendedMembers.length === 0 ? (
        <p className="py-8 text-center text-slate-400 text-sm">아직 출석한 청년이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto mb-6">
          <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left p-2 min-w-[3rem]">또래</th>
                <th className="text-left p-2 min-w-[5rem]">이름</th>
                {DAWN_PRAYER_DATES.map((d) => (
                  <th key={d} className="p-2 text-center min-w-[3.5rem] font-medium text-slate-700">
                    {formatDateCol(d)}
                  </th>
                ))}
                <th className="p-2 text-center min-w-[3rem] font-medium text-slate-700">참석</th>
              </tr>
            </thead>
            <tbody>
              {attendedMembers.map((m) => {
                const count = DAWN_PRAYER_DATES.filter((d) => attendedSet.has(`${m.id}_${d}`)).length
                return (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-2 text-slate-500">{getCohort(m.birth_date)}</td>
                    <td className="p-2 font-medium text-slate-800">
                      <Link to={`/dashboard/members/${m.id}`} className="hover:text-primary">{m.name}</Link>
                    </td>
                    {DAWN_PRAYER_DATES.map((d) => (
                      <td key={d} className="p-1 text-center">
                        {attendedSet.has(`${m.id}_${d}`) ? (
                          <span className="text-emerald-600 font-medium">O</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    ))}
                    <td className="p-1 text-center font-semibold text-slate-700">{count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pastoralTeam.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-slate-700 mb-3">목회팀 출석</h3>
          <div className="overflow-x-auto">
            <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-2 min-w-[5rem]">직책</th>
                  <th className="text-left p-2 min-w-[5rem]">이름</th>
                  {DAWN_PRAYER_DATES.map((d) => (
                    <th key={d} className="p-2 text-center min-w-[3.5rem] font-medium text-slate-700">
                      {formatDateCol(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastoralTeam.map((pm) => (
                  <tr key={pm.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-2 text-slate-500 text-xs">{pm.role ?? ''}</td>
                    <td className="p-2 font-medium text-slate-800">{pm.name}</td>
                    {DAWN_PRAYER_DATES.map((d) => (
                      <td key={d} className="p-1 text-center">
                        {pastoralAttendedSet.has(`${pm.id}_${d}`) ? (
                          <span className="text-emerald-600 font-medium">O</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
