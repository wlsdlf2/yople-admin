import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadAttendanceTemplate, parseAttendanceFile } from '../lib/attendanceBulk'

type VisitorRow = {
  id: string
  date: string
  created_at: string
}

type DateSummary = {
  date: string
  members: string[]
  memberCount: number
  visitorCount: number
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'Z')
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
}

type UploadResult = { inserted: number; skipped: number; notFound: number; parseErrors: string[] }

export default function AttendanceList() {
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState<DateSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: attendances, error: errA } = await supabase
          .from('attendances')
          .select(`
            id,
            date,
            created_at,
            members(name)
          `)
          .order('date', { ascending: false })

        if (errA) {
          setError(errA.message)
          setLoading(false)
          return
        }

        const { data: visitors, error: errV } = await supabase
          .from('visitors')
          .select('id, date, created_at')
          .order('date', { ascending: false })

        if (errV) {
          setError(errV.message)
          setLoading(false)
          return
        }

        const byDate = new Map<string, DateSummary>()

        const attList = (attendances ?? []) as unknown as Array<{
          id: string
          date: string
          created_at: string
          members?: { name: string } | null
          member?: { name: string } | null
        }>
        for (const a of attList) {
          const name = a.members?.name ?? a.member?.name ?? '(이름 없음)'
          if (!byDate.has(a.date)) {
            byDate.set(a.date, { date: a.date, members: [], memberCount: 0, visitorCount: 0 })
          }
          const s = byDate.get(a.date)!
          if (!s.members.includes(name)) s.members.push(name)
          s.memberCount = s.members.length
        }

        for (const v of visitors ?? []) {
          const row = v as VisitorRow
          if (!byDate.has(row.date)) {
            byDate.set(row.date, { date: row.date, members: [], memberCount: 0, visitorCount: 0 })
          }
          byDate.get(row.date)!.visitorCount += 1
        }

        setSummaries(Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date)))
      } catch {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [refreshTrigger])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      setUploadStatus('error')
      setUploadMessage('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.')
      return
    }
    setUploadStatus('parsing')
    setUploadMessage('')
    setUploadResult(null)
    try {
      const { rows, errors: parseErrors } = await parseAttendanceFile(file)
      if (rows.length === 0 && parseErrors.length === 0) {
        setUploadStatus('error')
        setUploadMessage('유효한 출석 행이 없습니다. 양식을 확인해 주세요.')
        return
      }
      setUploadStatus('uploading')
      const { data: members } = await supabase.from('members').select('id, name')
      const nameToId = new Map<string, string>()
      for (const m of members ?? []) {
        const name = (m as { id: string; name: string }).name?.trim()
        if (name && !nameToId.has(name)) nameToId.set(name, (m as { id: string }).id)
      }
      let inserted = 0
      let skipped = 0
      let notFound = 0
      for (const row of rows) {
        const memberId = nameToId.get(row.name)
        if (!memberId) {
          notFound += 1
          continue
        }
        const { error: insertErr } = await supabase.from('attendances').insert({
          member_id: memberId,
          date: row.date,
        })
        if (insertErr) {
          if (insertErr.code === '23505') skipped += 1
          else notFound += 1
        } else {
          inserted += 1
        }
      }
      setUploadResult({ inserted, skipped, notFound, parseErrors })
      setUploadStatus('done')
      setUploadMessage(
        `반영: ${inserted}건, 이미 있음 제외: ${skipped}건, 명단에 없음: ${notFound}건${parseErrors.length ? `, 파싱 경고 ${parseErrors.length}건` : ''}`
      )
      setRefreshTrigger((t) => t + 1)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadStatus('error')
      setUploadMessage(err instanceof Error ? err.message : '업로드 처리 중 오류가 났습니다.')
    }
  }

  const summariesByYear = summaries.filter((s) => new Date(s.date + 'Z').getFullYear() === selectedYear)
  const years = Array.from(
    new Set(summaries.map((s) => new Date(s.date + 'Z').getFullYear()))
  ).sort((a, b) => b - a)
  if (!years.includes(selectedYear)) {
    years.unshift(selectedYear)
    years.sort((a, b) => b - a)
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  if (error) {
    return (
      <p className="text-red-600 bg-red-50 rounded-lg p-3">
        {error}
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">주일별 출석 현황</h2>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/attendance/grid"
            className="text-sm text-primary hover:text-primary-dark font-medium"
          >
            출석부(그리드) 보기
          </Link>
          <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">연도</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          </div>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-4">
        주일을 클릭하면 해당 주일의 출석 상세를 볼 수 있습니다.
      </p>

      <section className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">출석 이력 일괄 업로드</h3>
        <p className="text-slate-600 text-sm mb-3">
          엑셀 양식(날짜, 이름)으로 작성한 파일을 업로드하면 출석 이력이 반영됩니다. 이름은 청년 명단과 정확히 일치해야 합니다.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={downloadAttendanceTemplate}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
              disabled={uploadStatus === 'parsing' || uploadStatus === 'uploading'}
            />
            {uploadStatus === 'parsing' || uploadStatus === 'uploading' ? '처리 중…' : '파일 선택'}
          </label>
        </div>
        {uploadMessage && (
          <p
            className={`mt-2 text-sm ${
              uploadStatus === 'error' ? 'text-red-600' : uploadStatus === 'done' ? 'text-slate-700' : 'text-slate-600'
            }`}
          >
            {uploadMessage}
          </p>
        )}
        {uploadResult && uploadResult.parseErrors.length > 0 && (
          <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
            {uploadResult.parseErrors.slice(0, 5).map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
            {uploadResult.parseErrors.length > 5 && (
              <li>외 {uploadResult.parseErrors.length - 5}건</li>
            )}
          </ul>
        )}
      </section>

      {summariesByYear.length === 0 ? (
        <p className="text-slate-600">
          {selectedYear}년 출석 기록이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {summariesByYear.map((s) => (
            <li key={s.date}>
              <Link
                to={`/dashboard/attendance/${s.date}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-primary/40 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {formatDateShort(s.date)}
                  </span>
                  <span className="text-sm text-slate-500">
                    청년 <strong className="text-slate-700">{s.memberCount}</strong>명
                    {' · '}
                    방문자 <strong className="text-slate-700">{s.visitorCount}</strong>명
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
