import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadAttendanceTemplate, parseAttendanceFile, downloadYearlyAttendanceGrid, parseYearlyAttendanceGrid } from '../lib/attendanceBulk'
import { getCohort, getSundaysInYear } from '../lib/dateUtils'

type Member = {
  id: string
  name: string
  birth_date: string | null
  is_new_member: boolean
}

type UploadResult = { inserted: number; skipped: number; notFound: number; parseErrors: string[]; duplicateErrors: string[] }

type PendingSync = {
  toInsert: { member_id: string; date: string }[]
  toDelete: string[]
  notFound: string[]
  parseErrors: string[]
}

function formatDateCol(dateStr: string) {
  const d = new Date(dateStr + 'Z')
  return (d.getMonth() + 1) + '/' + d.getDate()
}

export default function AttendanceGrid() {
  const now = new Date()
  const currentYear = now.getFullYear()

  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [members, setMembers] = useState<Member[]>([])
  const [attendedSet, setAttendedSet] = useState<Set<string>>(new Set())
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set())
  const [visitorCountByDate, setVisitorCountByDate] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [tab, setTab] = useState<'all' | 'new'>('all')

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 연간 출석부 다운로드/동기화 상태
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [gridUploadStatus, setGridUploadStatus] = useState<
    'idle' | 'parsing' | 'confirming' | 'syncing' | 'done' | 'error'
  >('idle')
  const [gridUploadError, setGridUploadError] = useState<string | null>(null)
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null)
  const [syncResult, setSyncResult] = useState<{
    inserted: number; deleted: number; notFound: number
  } | null>(null)
  const gridFileInputRef = useRef<HTMLInputElement>(null)

  // 과거 연도 목록 조회 (최초 1회)
  useEffect(() => {
    const fetchYears = async () => {
      const { data } = await supabase
        .from('attendances')
        .select('date')
      if (data) {
        const years = new Set<number>()
        for (const row of data as { date: string }[]) {
          const y = new Date(row.date + 'Z').getFullYear()
          if (y < currentYear) years.add(y)
        }
        const sorted = [currentYear, ...Array.from(years).sort((a, b) => b - a)]
        setAvailableYears(sorted)
      }
    }
    fetchYears()
  }, [currentYear])

  // 선택된 연도의 출석 데이터 조회
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      const start = `${year}-01-01`
      const end = `${year}-12-31`

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

        const attended = new Set<string>()
        const withData = new Set<string>()
        for (const a of attData ?? []) {
          attended.add(`${a.member_id}_${a.date}`)
          withData.add(a.date)
        }
        const { data: visitorData, error: errV } = await supabase
          .from('visitors')
          .select('date')
          .gte('date', start)
          .lte('date', end)

        if (errV) {
          setError(errV.message)
          setLoading(false)
          return
        }

        const visitorCount = new Map<string, number>()
        for (const v of visitorData ?? []) {
          const vv = v as { date: string }
          visitorCount.set(vv.date, (visitorCount.get(vv.date) ?? 0) + 1)
        }

        setMembers((memberData ?? []) as Member[])
        setAttendedSet(attended)
        setDatesWithData(withData)
        setVisitorCountByDate(visitorCount)
      } catch {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [year, refreshTrigger])

  const dates = getSundaysInYear(year)

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
      const { data: membersData } = await supabase.from('members').select('id, name, birth_date')
      const nameAndCohortToId = new Map<string, string>()
      const nameToId = new Map<string, string>()
      const duplicateNames = new Set<string>() // 동명이인 이름 집합
      for (const m of membersData ?? []) {
        const mm = m as { id: string; name: string; birth_date: string | null }
        const name = mm.name?.trim()
        if (!name) continue
        if (nameToId.has(name)) {
          duplicateNames.add(name)
        } else {
          nameToId.set(name, mm.id)
        }
        if (mm.birth_date) {
          const cohort = String(new Date(mm.birth_date).getFullYear() % 100).padStart(2, '0')
          const key = `${name}_${cohort}`
          if (!nameAndCohortToId.has(key)) nameAndCohortToId.set(key, mm.id)
        }
      }
      let inserted = 0
      let skipped = 0
      let notFound = 0
      const duplicateErrors: string[] = []
      for (const row of rows) {
        // 또래 없이 동명이인인 경우 → 등록 불가
        if (!row.cohort && duplicateNames.has(row.name)) {
          duplicateErrors.push(`${row.date} ${row.name}: 동명이인이 있어 또래 없이는 등록할 수 없습니다.`)
          continue
        }
        const key = `${row.name}_${row.cohort}`
        const memberId = (row.cohort ? nameAndCohortToId.get(key) : undefined) ?? nameToId.get(row.name)
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
      setUploadResult({ inserted, skipped, notFound, parseErrors, duplicateErrors })
      setUploadStatus('done')
      setUploadMessage(
        `반영: ${inserted}건, 이미 있음 제외: ${skipped}건, 명단에 없음: ${notFound}건${duplicateErrors.length ? `, 동명이인 미등록: ${duplicateErrors.length}건` : ''}${parseErrors.length ? `, 파싱 경고 ${parseErrors.length}건` : ''}`
      )
      setRefreshTrigger((t) => t + 1)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadStatus('error')
      setUploadMessage(err instanceof Error ? err.message : '업로드 처리 중 오류가 났습니다.')
    }
  }

  const handleDownloadYear = async () => {
    setDownloadLoading(true)
    setDownloadError(null)
    try {
      const [{ data: memberData, error: errM }, { data: attData, error: errA }, { data: visitorData, error: errV }] =
        await Promise.all([
          supabase
            .from('members')
            .select('id, name, birth_date, is_new_member')
            .order('birth_date', { ascending: true, nullsFirst: false })
            .order('name'),
          supabase
            .from('attendances')
            .select('member_id, date')
            .gte('date', `${year}-01-01`)
            .lte('date', `${year}-12-31`)
            .limit(100000),
          supabase
            .from('visitors')
            .select('date')
            .gte('date', `${year}-01-01`)
            .lte('date', `${year}-12-31`)
            .limit(100000),
        ])
      if (errM) throw new Error(errM.message)
      if (errA) throw new Error(errA.message)
      if (errV) throw new Error(errV.message)
      const set = new Set<string>()
      for (const a of attData ?? []) set.add(`${a.member_id}_${a.date}`)
      const visitorCountByDate = new Map<string, number>()
      for (const v of visitorData ?? []) {
        const rec = v as { date: string }
        visitorCountByDate.set(rec.date, (visitorCountByDate.get(rec.date) ?? 0) + 1)
      }
      downloadYearlyAttendanceGrid(
        year,
        (memberData ?? []) as { id: string; name: string; birth_date: string | null; is_new_member: boolean }[],
        set,
        visitorCountByDate
      )
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : '다운로드 실패')
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleGridUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      setGridUploadStatus('error')
      setGridUploadError('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.')
      if (gridFileInputRef.current) gridFileInputRef.current.value = ''
      return
    }
    setGridUploadStatus('parsing')
    setGridUploadError(null)
    setPendingSync(null)
    setSyncResult(null)
    try {
      const { entries, allDates, errors: parseErrors } = await parseYearlyAttendanceGrid(file)
      if (gridFileInputRef.current) gridFileInputRef.current.value = ''
      if (allDates.length === 0) {
        setGridUploadStatus('error')
        setGridUploadError('날짜 컬럼을 찾을 수 없습니다. 연간 출석부 파일인지 확인해 주세요.')
        return
      }
      const start = allDates[0]
      const end = allDates[allDates.length - 1]
      const [{ data: memberData, error: errM }, { data: existingAtt, error: errA }] =
        await Promise.all([
          supabase.from('members').select('id, name'),
          supabase
            .from('attendances')
            .select('id, member_id, date')
            .gte('date', start)
            .lte('date', end)
            .limit(100000),
        ])
      if (errM) throw new Error(errM.message)
      if (errA) throw new Error(errA.message)
      const nameToId = new Map<string, string>()
      for (const m of memberData ?? []) {
        const rec = m as { id: string; name: string }
        if (rec.name?.trim()) nameToId.set(rec.name.trim(), rec.id)
      }
      const existingMap = new Map<string, string>()
      for (const a of existingAtt ?? []) {
        const rec = a as { id: string; member_id: string; date: string }
        existingMap.set(`${rec.member_id}_${rec.date}`, rec.id)
      }
      const desiredSet = new Set<string>()
      const notFound: string[] = []
      for (const entry of entries) {
        const memberId = nameToId.get(entry.name)
        if (!memberId) { notFound.push(entry.name); continue }
        for (const date of entry.dates) desiredSet.add(`${memberId}_${date}`)
      }
      const toInsert: { member_id: string; date: string }[] = []
      for (const key of desiredSet) {
        if (!existingMap.has(key)) {
          const sep = key.lastIndexOf('_')
          toInsert.push({ member_id: key.slice(0, sep), date: key.slice(sep + 1) })
        }
      }
      const toDelete: string[] = []
      for (const [key, id] of existingMap) {
        if (!desiredSet.has(key)) toDelete.push(id)
      }
      setPendingSync({ toInsert, toDelete, notFound, parseErrors })
      setGridUploadStatus('confirming')
    } catch (err) {
      setGridUploadStatus('error')
      setGridUploadError(err instanceof Error ? err.message : '파일 처리 중 오류가 발생했습니다.')
    }
  }

  const handleConfirmSync = async () => {
    if (!pendingSync) return
    setGridUploadStatus('syncing')
    try {
      const { toInsert, toDelete } = pendingSync
      let inserted = 0
      let deleted = 0
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500)
        const { error } = await supabase.from('attendances').insert(chunk)
        if (error) throw new Error(`삽입 오류: ${error.message}`)
        inserted += chunk.length
      }
      for (let i = 0; i < toDelete.length; i += 500) {
        const chunk = toDelete.slice(i, i + 500)
        const { error } = await supabase.from('attendances').delete().in('id', chunk)
        if (error) throw new Error(`삭제 오류: ${error.message}`)
        deleted += chunk.length
      }
      setSyncResult({ inserted, deleted, notFound: pendingSync.notFound.length })
      setPendingSync(null)
      setGridUploadStatus('done')
      setRefreshTrigger((t) => t + 1)
    } catch (err) {
      setGridUploadStatus('error')
      setGridUploadError(err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.')
    }
  }

  const handleCancelSync = () => {
    setPendingSync(null)
    setGridUploadStatus('idle')
    setGridUploadError(null)
  }

  if (loading) {
    return <p className="text-slate-500">불러오는 중…</p>
  }

  if (error) {
    return <p className="text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-slate-800">주일별 출석 현황</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">연도</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleDownloadYear}
            disabled={downloadLoading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadLoading ? '다운로드 중…' : `${year}년 출석부 다운로드`}
          </button>
        </div>
      </div>
      {downloadError && (
        <p className="text-red-600 text-sm mb-3">{downloadError}</p>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(['all', 'new'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'all' ? '전체' : '새가족'}
          </button>
        ))}
      </div>

      <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 select-none">
          출석 이력 일괄 업로드
        </summary>
        <div className="px-4 pb-4">
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
          {uploadResult && uploadResult.duplicateErrors.length > 0 && (
            <div className="mt-1">
              <p className="text-xs font-medium text-red-600 mb-0.5">동명이인 미등록 — 또래를 추가해 주세요</p>
              <ul className="text-xs text-red-600 list-disc list-inside">
                {uploadResult.duplicateErrors.slice(0, 5).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
                {uploadResult.duplicateErrors.length > 5 && (
                  <li>외 {uploadResult.duplicateErrors.length - 5}건</li>
                )}
              </ul>
            </div>
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
        </div>
      </details>

      {dates.length === 0 ? (
        <p className="text-slate-600">이 해에는 주일이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left p-2 sticky left-0 z-20 bg-slate-50 border-r border-slate-200 min-w-[3rem]">
                  또래
                </th>
                <th className="text-left p-2 sticky left-12 z-20 bg-slate-50 border-r border-slate-200 min-w-[5rem]">
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
              {tab === 'all' && (
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <td className="p-2 sticky left-0 z-10 bg-slate-50/80 border-r border-slate-200" />
                  <td className="p-2 text-xs font-semibold text-slate-500 sticky left-12 z-10 bg-slate-50/80 border-r border-slate-200 whitespace-nowrap">
                    총 출석
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="p-1 text-center">
                      {datesWithData.has(d) ? (
                        <span className="text-xs font-semibold text-slate-600">
                          {members.filter((m) => attendedSet.has(`${m.id}_${d}`)).length
                            + (visitorCountByDate.get(d) ?? 0)}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              )}
              {members.filter((m) => tab === 'all' ? !m.is_new_member : m.is_new_member).map((m) => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-2 text-slate-500 sticky left-0 z-10 bg-white border-r border-slate-100">
                    {getCohort(m.birth_date)}
                  </td>
                  <td className="p-2 font-medium text-slate-800 sticky left-12 z-10 bg-white border-r border-slate-100 whitespace-nowrap">
                    <Link
                      to={`/dashboard/members/${m.id}`}
                      className="block hover:text-primary"
                    >
                      {m.is_new_member && (
                        <span className="text-amber-600 text-xs mr-1">N</span>
                      )}
                      {m.name}
                    </Link>
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="p-1 text-center">
                      {!datesWithData.has(d) ? (
                        <span className="text-slate-200">·</span>
                      ) : attendedSet.has(`${m.id}_${d}`) ? (
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

      {/* 새가족 탭: 방문자 출석 수 그리드 */}
      {tab === 'new' && dates.length > 0 && (
        <div className="mt-6">
          <h3 className="text-base font-semibold text-slate-700 mb-3">방문자 출석 수</h3>
          <div className="overflow-x-auto">
            <table className="border-collapse bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-2 sticky left-0 z-20 bg-slate-50 border-r border-slate-200 min-w-[8rem] whitespace-nowrap">
                    날짜
                  </th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      className="p-2 text-center min-w-[2.5rem] font-medium text-slate-700"
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
                <tr>
                  <td className="p-2 font-medium text-slate-700 sticky left-0 bg-white border-r border-slate-200 whitespace-nowrap">
                    방문자 수
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="p-1 text-center">
                      {visitorCountByDate.has(d) ? (
                        <span className="text-sm font-semibold text-slate-600">
                          {visitorCountByDate.get(d)}
                        </span>
                      ) : datesWithData.has(d) ? (
                        <span className="text-slate-300">0</span>
                      ) : (
                        <span className="text-slate-200">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* 연간 출석부 동기화 섹션 */}
      <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 select-none">
          연간 출석부 동기화
        </summary>
        <div className="px-4 pb-4">
          <p className="text-slate-600 text-sm mb-3">
            위에서 다운로드한 연간 출석부를 수정한 뒤 업로드하면 O/빈칸 기준으로 출석 기록이 동기화됩니다.
            <span className="text-amber-700 font-medium"> 기존 기록 삭제도 포함됩니다.</span>
          </p>
          {gridUploadStatus === 'confirming' && pendingSync ? (
            <div className="space-y-3">
              <div className="bg-white rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <span className="mr-4">추가: <strong>{pendingSync.toInsert.length}건</strong></span>
                <span className="mr-4">삭제: <strong>{pendingSync.toDelete.length}건</strong></span>
                <span>명단에 없음: <strong>{pendingSync.notFound.length}명</strong></span>
                {pendingSync.notFound.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    명단 없음: {pendingSync.notFound.slice(0, 5).join(', ')}{pendingSync.notFound.length > 5 ? ` 외 ${pendingSync.notFound.length - 5}명` : ''}
                  </p>
                )}
              </div>
              {pendingSync.parseErrors.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc list-inside">
                  {pendingSync.parseErrors.slice(0, 5).map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                  {pendingSync.parseErrors.length > 5 && <li>외 {pendingSync.parseErrors.length - 5}건</li>}
                </ul>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelSync}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSync}
                  className="rounded-lg border border-red-600 bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700"
                >
                  확인 및 동기화
                </button>
              </div>
            </div>
          ) : gridUploadStatus === 'syncing' ? (
            <p className="text-sm text-slate-600">동기화 중…</p>
          ) : gridUploadStatus === 'done' && syncResult ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                반영 완료: 추가 <strong>{syncResult.inserted}건</strong>,
                삭제 <strong>{syncResult.deleted}건</strong>,
                명단에 없음 <strong>{syncResult.notFound}명</strong>
              </p>
              <label className="rounded-lg border border-primary bg-primary text-white px-3 py-1.5 text-sm cursor-pointer hover:bg-primary-dark inline-block">
                <input
                  ref={gridFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={handleGridUploadChange}
                />
                다시 업로드
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <label className={`rounded-lg border px-3 py-1.5 text-sm cursor-pointer inline-block ${gridUploadStatus === 'parsing' ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-primary bg-primary text-white hover:bg-primary-dark'}`}>
                <input
                  ref={gridFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={handleGridUploadChange}
                  disabled={gridUploadStatus === 'parsing'}
                />
                {gridUploadStatus === 'parsing' ? '파싱 중…' : '파일 선택'}
              </label>
              {gridUploadStatus === 'error' && gridUploadError && (
                <p className="text-sm text-red-600">{gridUploadError}</p>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
