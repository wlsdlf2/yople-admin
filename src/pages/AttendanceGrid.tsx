import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Member = {
  id: string
  name: string
  birth_date: string | null
  is_new_member: boolean
}

/** 해당 월의 주일(일요일) 날짜들 YYYY-MM-DD */
function getSundaysInMonth(year: number, month: number): string[] {
  const dates: string[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    if (d.getDay() === 0) {
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))
    }
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function formatDateCol(dateStr: string) {
  const d = new Date(dateStr + 'Z')
  return d.getMonth() + 1 + '/' + d.getDate()
}

/** birth_date에서 또래(출생년도 2자리) */
function getCohort(birth_date: string | null): string {
  if (!birth_date) return '-'
  const y = new Date(birth_date).getFullYear() % 100
  return String(y).padStart(2, '0')
}

export default function AttendanceGrid() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [members, setMembers] = useState<Member[]>([])
  const [attendedSet, setAttendedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = getSundaysInMonth(year, month)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      try {
        const { data: memberData, error: errM } = await supabase
          .from('members')
          .select('id, name, birth_date, is_new_member')
          .order('birth_date', { ascending: true, nullsFirst: false })
          .order('name')

        if (errM) {
          setError(errM.message)
          setLoading(false)
          return
        }

        const { data: attData, error: errA } = await supabase
          .from('attendances')
          .select('member_id, date')
          .gte('date', start)
          .lte('date', end)

        if (errA) {
          setError(errA.message)
          setLoading(false)
          return
        }

        const set = new Set<string>()
        for (const a of attData ?? []) {
          set.add(`${a.member_id}_${a.date}`)
        }
        setMembers((memberData ?? []) as Member[])
        setAttendedSet(set)
      } catch {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [year, month])

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

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
        className="inline-block text-sm text-slate-500 hover:text-primary mb-4"
      >
        ← 주일별 출석 현황
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">출석부 (그리드)</h2>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {[year - 2, year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-slate-600 text-sm mb-4">
        엑셀 출석부처럼 해당 월의 주일(일요일)별 출석 여부를 표시합니다.
      </p>

      {dates.length === 0 ? (
        <p className="text-slate-600">이 달에는 주일이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left p-2 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[4rem]">
                  또래
                </th>
                <th className="text-left p-2 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[5rem] z-10">
                  이름
                </th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="p-2 text-center border-b border-slate-200 min-w-[2.5rem] font-medium text-slate-700"
                  >
                    <Link
                      to={`/dashboard/attendance/${d}`}
                      className="block text-primary hover:text-primary-dark hover:underline"
                    >
                      {formatDateCol(d)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-2 text-slate-500 sticky left-0 bg-white border-r border-slate-100">
                    {getCohort(m.birth_date)}
                  </td>
                  <td className="p-2 font-medium text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                    {m.is_new_member && (
                      <span className="text-amber-600 text-xs mr-1">N</span>
                    )}
                    {m.name}
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="p-1 text-center">
                      {attendedSet.has(`${m.id}_${d}`) ? (
                        <span className="text-primary font-medium">O</span>
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
      )}
    </div>
  )
}
