import * as XLSX from 'xlsx'
import { getSundaysInYear, getCohort } from './dateUtils'

const TEMPLATE_HEADERS = ['날짜', '이름', '또래'] as const
const TEMPLATE_SHEET_NAME = '출석이력'

export type AttendanceRow = {
  date: string
  name: string
  cohort: string
}

export type YearlyGridEntry = {
  name: string
  dates: string[]  // attended dates (YYYY-MM-DD)
}

/** 날짜 값을 YYYY-MM-DD로 정규화 (엑셀 시리얼 또는 문자열) */
function normalizeDate(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'number' && v > 0) {
    const d = new Date((v - 25569) * 86400 * 1000)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** 출석 이력 일괄 업로드용 엑셀 양식 다운로드 */
export function downloadAttendanceTemplate(): void {
  const wsData: string[][] = [
    [...TEMPLATE_HEADERS],
    ['2025-01-05', '홍길동', '99'],
    ['2025-01-12', '김영희', '00'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME)
  XLSX.writeFile(wb, '출석이력_일괄업로드_양식.xlsx')
}

/**
 * 새가족 시트 생성.
 * 구조: 1행 헤더 → 새가족 멤버 행 → (빈 행 1) → (빈 행 2) → 방문자 행
 * 반환값에 방문자 행의 Excel 행 번호(1-based)도 포함.
 */
function buildNewMemberSheet(
  members: { id: string; name: string; birth_date: string | null }[],
  sundays: string[],
  attendanceSet: Set<string>,
  visitorCountByDate: Map<string, number>
): { ws: XLSX.WorkSheet; visitorRow: number } {
  const headerRow = ['또래', '이름', ...sundays]
  const wsData: (string | number)[][] = [headerRow]
  for (const m of members) {
    wsData.push([
      getCohort(m.birth_date),
      m.name,
      ...sundays.map((d) => (attendanceSet.has(`${m.id}_${d}`) ? 'O' : '')),
    ])
  }
  // 빈 행 2개 (마지막 멤버 행으로부터 2행 밑 = 인덱스 N+2)
  wsData.push([]) // 빈 행 1
  wsData.push([]) // 빈 행 2
  // 방문자 행
  const visitorDataRow: (string | number)[] = [
    '',
    '방문자',
    ...sundays.map((d) => visitorCountByDate.get(d) ?? 0),
  ]
  wsData.push(visitorDataRow)

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  for (let i = 0; i < sundays.length; i++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: 2 + i })
    if (ws[cellAddr]) ws[cellAddr].t = 's'
  }
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, ...sundays.map(() => ({ wch: 11 }))]

  // 방문자 행: wsData index = 1(header) + members.length + 2(빈행) = members.length + 3
  // Excel 1-based row = members.length + 4
  const visitorRow = members.length + 4

  return { ws, visitorRow }
}

/**
 * 전체 시트 생성.
 * 2행: 날짜별 총 출석수 = 전체 멤버(O) + 새가족 멤버(O) + 새가족 시트 방문자 수
 */
function buildMainSheet(
  members: { id: string; name: string; birth_date: string | null }[],
  sundays: string[],
  attendanceSet: Set<string>
): XLSX.WorkSheet {
  const headerRow = ['또래', '이름', ...sundays]
  const totalRow = ['', '총 출석', ...sundays.map(() => '')]
  const wsData: string[][] = [headerRow, totalRow]
  for (const m of members) {
    wsData.push([
      getCohort(m.birth_date),
      m.name,
      ...sundays.map((d) => (attendanceSet.has(`${m.id}_${d}`) ? 'O' : '')),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  for (let i = 0; i < sundays.length; i++) {
    const col = XLSX.utils.encode_col(2 + i)
    if (ws[`${col}1`]) ws[`${col}1`].t = 's'
    // INDEX/MATCH로 새가족 시트의 "방문자" 행을 동적 참조 → 새가족 추가 시에도 수식 유효
    ws[`${col}2`] = {
      t: 'n',
      f: `COUNTIF(${col}3:${col}9999,"O")+COUNTIF(새가족!${col}2:${col}9999,"O")+INDEX(새가족!${col}:${col},MATCH("방문자",새가족!B:B,0))`,
    }
  }
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, ...sundays.map(() => ({ wch: 11 }))]
  return ws
}

/** 연간 출석 현황 그리드 엑셀 다운로드 (시트1: 전체, 시트2: 새가족) */
export function downloadYearlyAttendanceGrid(
  year: number,
  members: { id: string; name: string; birth_date: string | null; is_new_member: boolean }[],
  attendanceSet: Set<string>,
  visitorCountByDate: Map<string, number>
): void {
  const sundays = getSundaysInYear(year)
  const regular = members.filter((m) => !m.is_new_member)
  const newMembers = members.filter((m) => m.is_new_member)
  const today = new Date()
  today.setDate(today.getDate() - today.getDay())
  const dateStr =
    today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0')
  const { ws: newMemberSheet } = buildNewMemberSheet(
    newMembers, sundays, attendanceSet, visitorCountByDate
  )
  const mainSheet = buildMainSheet(regular, sundays, attendanceSet)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, mainSheet, '전체')
  XLSX.utils.book_append_sheet(wb, newMemberSheet, '새가족')
  XLSX.writeFile(wb, `출석현황_${year}년_${dateStr}.xlsx`)
}

/** 연간 출석 현황 그리드 엑셀 파싱 */
export function parseYearlyAttendanceGrid(
  file: File
): Promise<{ entries: YearlyGridEntry[]; allDates: string[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          resolve({ entries: [], allDates: [], errors: ['파일을 읽을 수 없습니다.'] })
          return
        }
        const wb = XLSX.read(data, { type: 'array' })
        const firstSheet = wb.SheetNames[0]
        if (!firstSheet) {
          resolve({ entries: [], allDates: [], errors: ['시트가 없습니다.'] })
          return
        }
        const ws = wb.Sheets[firstSheet]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        const errors: string[] = []
        const allDates: string[] = []
        const entries: YearlyGridEntry[] = []

        if (raw.length === 0) {
          resolve({ entries, allDates, errors: ['데이터가 없습니다.'] })
          return
        }

        // 헤더 행에서 날짜 추출 (col 2 이후)
        const headerRow = raw[0] as unknown[]
        for (let i = 2; i < headerRow.length; i++) {
          const d = normalizeDate(headerRow[i])
          if (d) {
            allDates.push(d)
          } else {
            errors.push(`헤더 열 ${XLSX.utils.encode_col(i)}: 날짜 형식이 잘못되었습니다. (건너뜀)`)
          }
        }

        if (allDates.length === 0) {
          resolve({ entries, allDates, errors })
          return
        }

        // 이름 중복 감지
        const nameCount = new Map<string, number[]>()
        for (let rowIdx = 1; rowIdx < raw.length; rowIdx++) {
          const row = raw[rowIdx] as unknown[]
          const name = String(row[1] ?? '').trim()
          if (!name) continue
          const existing = nameCount.get(name) ?? []
          existing.push(rowIdx + 1)
          nameCount.set(name, existing)
        }
        const duplicateNames = new Set<string>()
        for (const [name, rows] of nameCount) {
          if (rows.length > 1) {
            errors.push(`중복된 이름: '${name}' (${rows.join(', ')}행) — 동기화 제외됨`)
            duplicateNames.add(name)
          }
        }

        // 데이터 행 파싱
        for (let rowIdx = 1; rowIdx < raw.length; rowIdx++) {
          const row = raw[rowIdx] as unknown[]
          const name = String(row[1] ?? '').trim()
          if (!name || duplicateNames.has(name)) continue
          const attendedDates: string[] = []
          for (let colIdx = 0; colIdx < allDates.length; colIdx++) {
            if (String(row[2 + colIdx] ?? '').trim().toUpperCase() === 'O') {
              attendedDates.push(allDates[colIdx])
            }
          }
          entries.push({ name, dates: attendedDates })
        }

        resolve({ entries, allDates, errors })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 업로드된 엑셀에서 출석 이력 파싱.
 * 첫 시트, 컬럼: 날짜(YYYY-MM-DD 또는 엑셀 날짜), 이름
 */
export function parseAttendanceFile(
  file: File
): Promise<{ rows: AttendanceRow[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          resolve({ rows: [], errors: ['파일을 읽을 수 없습니다.'] })
          return
        }
        const wb = XLSX.read(data, { type: 'array' })
        const firstSheet = wb.SheetNames[0]
        if (!firstSheet) {
          resolve({ rows: [], errors: ['시트가 없습니다.'] })
          return
        }
        const ws = wb.Sheets[firstSheet]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const errors: string[] = []
        const rows: AttendanceRow[] = []

        for (let i = 0; i < json.length; i++) {
          const raw = json[i]
          const rowNo = i + 2
          const dateVal = raw['날짜'] ?? raw['날짜 '] ?? ''
          const date = normalizeDate(dateVal)
          const name = String(raw['이름'] ?? raw['이름 '] ?? '').trim()
          const cohort = String(raw['또래'] ?? raw['또래 '] ?? '').trim().padStart(2, '0').slice(-2)
          if (!date && !name) continue
          if (!date) {
            errors.push(`${rowNo}행: 날짜가 비어 있거나 형식이 잘못되었습니다. (YYYY-MM-DD)`)
            continue
          }
          if (!name) {
            errors.push(`${rowNo}행: 이름이 비어 있습니다.`)
            continue
          }
          rows.push({ date, name, cohort })
        }

        resolve({ rows, errors })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}
