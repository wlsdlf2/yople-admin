import * as XLSX from 'xlsx-js-style'
import { getSundaysInYear, getCohort } from './dateUtils'

export const DISTRICTS = ['결혼', '해외', '군입대', '장결자'] as const
export type District = typeof DISTRICTS[number]

const DISTRICT_COLORS: Record<string, string> = {
  // '일반교구': 'FFBF00',
  // '젊은백성': '00B0F0',
  '결혼':     'FFCCFF',
  '해외':     '92CDDC',
  '군입대':   'CCFFCC',
  '장결자':   'DDDDDD',
}

export type AttendanceGridEntry = {
  name: string
  cohort: string
  items: { date: string; grade: 'A' | 'B' | 'C' }[]
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

/** 출석 이력 입력용 양식 다운로드 (전체 시트 레이아웃, 출석 데이터 비어 있음) */
export function downloadAttendanceGridTemplate(
  year: number,
  members: { id: string; name: string; birth_date: string | null; is_new_member: boolean; district: string | null }[],
  sundays: string[]
): void {
  const regular = members.filter(m => !m.is_new_member)
  const mainSheet = buildMainSheet(
    year, regular, members, sundays,
    new Set(), new Map(), new Map(), [], new Set()
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, mainSheet, '전체')
  XLSX.writeFile(wb, `출석입력_양식_${year}년.xlsx`)
}

type PastoralMember = { id: string; name: string; role: string | null }

/**
 * 새가족 시트 생성 (새가족-방문 탭).
 * 구조:
 *  r=0        제목
 *  r=1~3      빈 행
 *  r=4        달 행 (새가족)
 *  r=5        헤더 (또래 / 이름 / 일 숫자)
 *  r=6~5+N    새가족 데이터 N행
 *  r=6+N      총합 (빨간 폰트)
 *  r=7~10+N   빈 행 4개
 *  r=11+N     달 행 (목회팀)
 *  r=12+N     헤더
 *  r=13+N~12+N+P  목회팀 P행 (c=0 "목회팀" 수직 병합)
 *  r=13+N+P   총합 (빨간 폰트)
 *  r=14~17+N+P 빈 행 4개
 *  r=18+N+P   "미등록 or 방문" 박스 (2행 병합)
 *  r=19+N+P   박스 2번째 행
 *  r=20+N+P   빈 행
 *  r=21+N+P   달 행 (방문자)
 *  r=22+N+P   일 숫자 행
 *  r=23+N+P   방문자 수 데이터
 *  r=24+N+P   빈 행
 *  r=25+N+P   테두리 셀 행
 */
function buildNewMemberSheet(
  members: { id: string; name: string; birth_date: string | null }[],
  sundays: string[],
  attendanceSet: Set<string>,
  gradeMap: Map<string, 'A' | 'B' | 'C'>,
  visitorCountByDate: Map<string, number>,
  pastoralTeam: PastoralMember[],
  pastoralAttendedSet: Set<string>
): XLSX.WorkSheet {
  const year = sundays.length > 0 ? parseInt(sundays[0].slice(0, 4), 10) : new Date().getFullYear()
  const N = members.length
  const P = pastoralTeam.length

  // 월 그룹 및 날짜별 컬럼 오프셋 계산 (c=0=또래, c=1=이름, c=2+=날짜)
  const monthMap = new Map<number, string[]>()
  for (const d of sundays) {
    const month = parseInt(d.slice(5, 7), 10)
    if (!monthMap.has(month)) monthMap.set(month, [])
    monthMap.get(month)!.push(d)
  }
  const monthGroups = [...monthMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, dates]) => ({ month, dates }))

  const dateColOffset = new Map<string, number>()
  let cOff = 2
  for (const { dates } of monthGroups) {
    for (const d of dates) dateColOffset.set(d, cOff++)
  }

  const totalCols = 2 + sundays.length
  const emptyRow = (): (string | number)[] => Array(totalCols).fill('')

  function makeDalRow(): (string | number)[] {
    const row = emptyRow()
    row[0] = '달'
    for (const { month, dates } of monthGroups) {
      row[dateColOffset.get(dates[0])!] = `${month}월`
    }
    return row
  }

  const wsData: (string | number)[][] = []

  // r=0: 제목
  const titleRow = emptyRow()
  titleRow[0] = `${year} 다드림예배 출석부`
  wsData.push(titleRow)

  // r=1~3: 빈 행
  wsData.push(emptyRow(), emptyRow(), emptyRow())

  // r=4: 달 행 (새가족)
  wsData.push(makeDalRow())

  // r=5: 헤더
  const nmHeaderRow = emptyRow()
  nmHeaderRow[0] = '또래'
  nmHeaderRow[1] = '이름'
  for (const d of sundays) nmHeaderRow[dateColOffset.get(d)!] = parseInt(d.slice(8, 10), 10)
  wsData.push(nmHeaderRow)

  // r=6~5+N: 새가족 데이터
  for (const m of members) {
    const row = emptyRow()
    row[0] = getCohort(m.birth_date)
    row[1] = m.name
    for (const d of sundays) {
      row[dateColOffset.get(d)!] = attendanceSet.has(`${m.id}_${d}`) ? (gradeMap.get(`${m.id}_${d}`) ?? 'O') : ''
    }
    wsData.push(row)
  }

  // r=6+N: 새가족 총합
  const nmTotalRow = emptyRow()
  nmTotalRow[0] = '총합'
  for (const d of sundays) {
    nmTotalRow[dateColOffset.get(d)!] = members.filter(m => attendanceSet.has(`${m.id}_${d}`)).length
  }
  wsData.push(nmTotalRow)

  // r=7~10+N: 빈 행 4개
  wsData.push(emptyRow(), emptyRow(), emptyRow(), emptyRow())

  // r=11+N: 달 행 (목회팀)
  wsData.push(makeDalRow())

  // r=12+N: 목회팀 헤더
  const ptHeaderRow = emptyRow()
  ptHeaderRow[1] = '이름'
  for (const d of sundays) ptHeaderRow[dateColOffset.get(d)!] = parseInt(d.slice(8, 10), 10)
  wsData.push(ptHeaderRow)

  // r=13+N~12+N+P: 목회팀 데이터 (c=0은 "목회팀" 병합용, 빈 값 유지)
  for (const pm of pastoralTeam) {
    const row = emptyRow()
    row[1] = `${pm.name}${pm.role ? ' ' + pm.role : ''}`
    for (const d of sundays) {
      row[dateColOffset.get(d)!] = pastoralAttendedSet.has(`${pm.id}_${d}`) ? (gradeMap.get(`${pm.id}_${d}`) ?? 'O') : ''
    }
    wsData.push(row)
  }

  // r=13+N+P: 목회팀 총합
  const ptTotalRow = emptyRow()
  ptTotalRow[0] = '총합'
  for (const d of sundays) {
    ptTotalRow[dateColOffset.get(d)!] = pastoralTeam.filter(pm => pastoralAttendedSet.has(`${pm.id}_${d}`)).length
  }
  wsData.push(ptTotalRow)

  // r=14~17+N+P: 빈 행 4개
  wsData.push(emptyRow(), emptyRow(), emptyRow(), emptyRow())

  // r=18+N+P: "미등록 or 방문" 박스 (1번째 행)
  const miRow1 = emptyRow()
  miRow1[1] = '미등록 or 방문 (새가족첫방문)'
  wsData.push(miRow1)

  // r=19+N+P: 박스 2번째 행
  wsData.push(emptyRow())

  // r=20+N+P: 빈 행
  wsData.push(emptyRow())

  // r=21+N+P: 달 행 (방문자)
  wsData.push(makeDalRow())

  // r=22+N+P: 일 숫자 행
  const visDateRow = emptyRow()
  for (const d of sundays) visDateRow[dateColOffset.get(d)!] = parseInt(d.slice(8, 10), 10)
  wsData.push(visDateRow)

  // r=23+N+P: 방문자 수 데이터
  const visDataRow = emptyRow()
  for (const d of sundays) visDataRow[dateColOffset.get(d)!] = visitorCountByDate.get(d) ?? 0
  wsData.push(visDataRow)

  // r=24+N+P: 빈 행
  wsData.push(emptyRow())

  // r=25+N+P: 테두리 셀 행
  wsData.push(emptyRow())

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, ...sundays.map(() => ({ wch: 5 }))]

  // ── 병합 ──────────────────────────────────────────────────────────────────
  const LAST_COL = totalCols - 1
  const ROW_TITLE     = 0
  const ROW_NM_DAL    = 4
  const ROW_NM_TOTAL  = 6 + N
  const ROW_PT_DAL    = 11 + N
  const ROW_PT_DATA   = 13 + N
  const ROW_PT_TOTAL  = 13 + N + P
  const ROW_MI_BOX    = 18 + N + P
  const ROW_MI_BOX2   = 19 + N + P
  const ROW_VIS_DAL   = 21 + N + P
  const ROW_LAST      = 25 + N + P

  const merges: XLSX.Range[] = [
    // 제목
    { s: { r: ROW_TITLE, c: 0 }, e: { r: ROW_TITLE, c: LAST_COL } },
    // 달 라벨 (c=0-1)
    { s: { r: ROW_NM_DAL, c: 0 }, e: { r: ROW_NM_DAL, c: 1 } },
    { s: { r: ROW_PT_DAL, c: 0 }, e: { r: ROW_PT_DAL, c: 1 } },
    { s: { r: ROW_VIS_DAL, c: 0 }, e: { r: ROW_VIS_DAL, c: 1 } },
    // 총합 라벨 (c=0-1)
    { s: { r: ROW_NM_TOTAL, c: 0 }, e: { r: ROW_NM_TOTAL, c: 1 } },
    { s: { r: ROW_PT_TOTAL, c: 0 }, e: { r: ROW_PT_TOTAL, c: 1 } },
    // "미등록 or 방문" 박스 (2행 × c=1-5)
    { s: { r: ROW_MI_BOX, c: 1 }, e: { r: ROW_MI_BOX2, c: 5 } },
    // 목회팀 수직 병합 (P > 1일 때)
    ...(P > 1 ? [{ s: { r: ROW_PT_DATA, c: 0 }, e: { r: ROW_PT_DATA + P - 1, c: 0 } }] : []),
  ]

  // 월 그룹 병합 (3개 달 행)
  for (const { dates } of monthGroups) {
    if (dates.length > 1) {
      const cStart = dateColOffset.get(dates[0])!
      const cEnd   = dateColOffset.get(dates[dates.length - 1])!
      merges.push({ s: { r: ROW_NM_DAL,  c: cStart }, e: { r: ROW_NM_DAL,  c: cEnd } })
      merges.push({ s: { r: ROW_PT_DAL,  c: cStart }, e: { r: ROW_PT_DAL,  c: cEnd } })
      merges.push({ s: { r: ROW_VIS_DAL, c: cStart }, e: { r: ROW_VIS_DAL, c: cEnd } })
    }
  }

  ws['!merges'] = merges

  // ── 스타일 ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function styleCell(r: number, c: number, style: object) {
    const addr = XLSX.utils.encode_cell({ r, c })
    if (!ws[addr]) ws[addr] = { t: 's', v: '' }
    ;(ws[addr] as any).s = style
  }

  const center     = { horizontal: 'center' as const, vertical: 'center' as const }
  const left       = { horizontal: 'left'   as const, vertical: 'center' as const }
  const redFont    = { color: { rgb: 'FF0000' } }
  const thinBorder = { style: 'thin' as const, color: { rgb: '000000' } }
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
  const headerFill = { patternType: 'solid' as const, fgColor: { rgb: 'DAEEF3' } }

  // 제목
  styleCell(ROW_TITLE, 0, { font: { bold: true, sz: 16 }, alignment: center })

  // ── 새가족 섹션 ──────────────────────────────────────────────────────────

  // 달 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_NM_DAL, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 헤더 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(5, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 새가족 데이터 행 — 테두리
  for (let i = 0; i < N; i++) {
    const r = 6 + i
    styleCell(r, 0, { border: allBorders, alignment: center })
    styleCell(r, 1, { border: allBorders, alignment: left })
    for (let j = 0; j < sundays.length; j++) styleCell(r, 2 + j, { border: allBorders, alignment: center })
  }

  // 새가족 총합 — 테두리 + 빨간 폰트
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_NM_TOTAL, c, { border: allBorders, font: { bold: true, ...redFont }, alignment: center })
  }

  // ── 목회팀 섹션 ──────────────────────────────────────────────────────────

  // 달 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_PT_DAL, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 목회팀 헤더 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_PT_DAL + 1, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // "목회팀" 수직 병합 첫 셀 값 및 스타일
  if (P > 0) {
    const addr = XLSX.utils.encode_cell({ r: ROW_PT_DATA, c: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ws[addr] as any) = { t: 's', v: '목회팀', s: { border: allBorders, font: { bold: true }, alignment: center } }
  }

  // 목회팀 데이터 행 — 테두리
  for (let i = 0; i < P; i++) {
    const r = ROW_PT_DATA + i
    if (i > 0) styleCell(r, 0, { border: allBorders, alignment: center })
    styleCell(r, 1, { border: allBorders, alignment: left })
    for (let j = 0; j < sundays.length; j++) styleCell(r, 2 + j, { border: allBorders, alignment: center })
  }

  // 목회팀 총합 — 테두리 + 빨간 폰트
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_PT_TOTAL, c, { border: allBorders, font: { bold: true, ...redFont }, alignment: center })
  }

  // "미등록 or 방문" 박스
  for (let r = ROW_MI_BOX; r <= ROW_MI_BOX2; r++) {
    for (let c = 1; c <= 5; c++) {
      styleCell(r, c, {
        border: allBorders,
        alignment: center,
        ...(r === ROW_MI_BOX && c === 1 ? { font: { bold: true } } : {}),
      })
    }
  }

  // ── 방문자 섹션 ──────────────────────────────────────────────────────────

  // 달 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_VIS_DAL, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 일 숫자 행 — 배경색 + 테두리 + bold
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_VIS_DAL + 1, c, { fill: headerFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 방문자 데이터 행 — 테두리
  for (let c = 0; c < totalCols; c++) {
    styleCell(ROW_VIS_DAL + 2, c, { border: allBorders, alignment: center })
  }

  // 마지막 테두리 셀 (c=14, column O)
  styleCell(ROW_LAST, 14, { border: allBorders })

  return ws
}

/**
 * 전체 시트 생성 (신규 레이아웃).
 *
 * 행 구조 (0-indexed):
 *  r=0  : 제목 (col 2~끝 병합)
 *  r=1  : 범례 헤더 "구분" | "내용" (col 1, 2)
 *  r=2~7: 구분별 범례 행 (col 1=구분명, col 2=색상 셀)
 *  r=8  : 달 (col 0-2 병합 "달", col 3+는 월별 병합)
 *  r=9  : 합계 (노랑 배경, col 0-2 병합, col 3+는 날짜별 합계)
 *  r=10 : 날짜 (col 0-2 병합, col 3+는 일 숫자)
 *  r=11 : 헤더 (또래, 이름, 구분, col 3+는 월별 병합 "세부사항")
 *  r=12+: 청년 데이터 행
 */
function buildMainSheet(
  year: number,
  regularMembers: { id: string; name: string; birth_date: string | null; district: string | null }[],
  allMembers: { id: string }[],
  sundays: string[],
  attendanceSet: Set<string>,
  gradeMap: Map<string, 'A' | 'B' | 'C'>,
  visitorCountByDate: Map<string, number>,
  pastoralTeam: PastoralMember[],
  pastoralAttendedSet: Set<string>
): XLSX.WorkSheet {
  // 월 그룹 계산
  const monthMap = new Map<number, string[]>()
  for (const d of sundays) {
    const month = parseInt(d.slice(5, 7), 10)
    if (!monthMap.has(month)) monthMap.set(month, [])
    monthMap.get(month)!.push(d)
  }
  const monthGroups = [...monthMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, dates]) => ({ month, dates }))

  // 날짜별 열 오프셋 (col 0=또래, 1=이름, 2=구분, 3+=날짜)
  const dateColOffset = new Map<string, number>()
  let cOff = 3
  for (const { dates } of monthGroups) {
    for (const d of dates) dateColOffset.set(d, cOff++)
  }

  // 합계 계산: 전체 청년(등록+새가족) + 방문자 + 목회팀
  const totalByDate = new Map<string, number>()
  for (const d of sundays) {
    const mc = allMembers.filter(m => attendanceSet.has(`${m.id}_${d}`)).length
    const vc = visitorCountByDate.get(d) ?? 0
    const pc = pastoralTeam.filter(pm => pastoralAttendedSet.has(`${pm.id}_${d}`)).length
    totalByDate.set(d, mc + vc + pc)
  }

  const cols = 3 + sundays.length
  const emptyRow = () => Array<string | number>(cols).fill('')

  const LEGEND_COUNT = DISTRICTS.length
  const ROW_MONTH  = 2 + LEGEND_COUNT
  const ROW_TOTAL  = 3 + LEGEND_COUNT
  const ROW_DATE   = 4 + LEGEND_COUNT
  const ROW_HEADER = 5 + LEGEND_COUNT
  const DATA_START = 6 + LEGEND_COUNT

  // r=0: 제목
  const titleRow = emptyRow()
  titleRow[2] = `${year} 다드림예배 출석부`

  // r=1: 범례 헤더
  const legendHeaderRow = emptyRow()
  legendHeaderRow[1] = '구분'
  legendHeaderRow[2] = '내용'

  // r=2~7: 구분 범례
  const legendRows = DISTRICTS.map(name => {
    const row = emptyRow()
    row[1] = name
    return row
  })

  // r=8: 달 행
  const monthRow = emptyRow()
  monthRow[0] = '달'
  for (const { month, dates } of monthGroups) {
    monthRow[dateColOffset.get(dates[0])!] = `${month}월`
  }

  // r=9: 합계 행
  const totalRow = emptyRow()
  totalRow[0] = '합계'
  for (const d of sundays) totalRow[dateColOffset.get(d)!] = totalByDate.get(d) ?? 0

  // r=10: 날짜 행
  const dateRow = emptyRow()
  dateRow[0] = '날짜'
  for (const d of sundays) dateRow[dateColOffset.get(d)!] = parseInt(d.slice(8, 10), 10)

  // r=11: 헤더 행
  const headerRow = emptyRow()
  headerRow[0] = '또래'
  headerRow[1] = '이름'
  headerRow[2] = '구분'
  for (const { dates } of monthGroups) headerRow[dateColOffset.get(dates[0])!] = '세부사항'

  // r=12+: 청년 데이터
  const dataRows = regularMembers.map(m => {
    const row: (string | number)[] = [
      getCohort(m.birth_date),
      m.name,
      m.district ?? '',
      ...sundays.map(d => attendanceSet.has(`${m.id}_${d}`) ? (gradeMap.get(`${m.id}_${d}`) ?? 'O') : ''),
    ]
    return row
  })

  const wsData = [
    titleRow,
    legendHeaderRow,
    ...legendRows,
    monthRow,
    totalRow,
    dateRow,
    headerRow,
    ...dataRows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // 병합
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 2 }, e: { r: 0, c: 2 + sundays.length - 1 } }, // 제목
    { s: { r: ROW_MONTH,  c: 0 }, e: { r: ROW_MONTH,  c: 2 } },
    { s: { r: ROW_TOTAL,  c: 0 }, e: { r: ROW_TOTAL,  c: 2 } },
    { s: { r: ROW_DATE,   c: 0 }, e: { r: ROW_DATE,   c: 2 } },
  ]
  for (const { dates } of monthGroups) {
    if (dates.length > 1) {
      const cStart = dateColOffset.get(dates[0])!
      const cEnd = dateColOffset.get(dates[dates.length - 1])!
      merges.push({ s: { r: ROW_MONTH,  c: cStart }, e: { r: ROW_MONTH,  c: cEnd } })
      merges.push({ s: { r: ROW_HEADER, c: cStart }, e: { r: ROW_HEADER, c: cEnd } })
    }
  }
  ws['!merges'] = merges

  ws['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 8 },
    ...sundays.map(() => ({ wch: 5 })),
  ]

  // 스타일 적용
  const center     = { horizontal: 'center' as const, vertical: 'center' as const }
  const left       = { horizontal: 'left'   as const, vertical: 'center' as const }
  const thinBorder = { style: 'thin' as const, color: { rgb: '000000' } }
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function styleCell(r: number, c: number, style: object) {
    const addr = XLSX.utils.encode_cell({ r, c })
    if (!ws[addr]) ws[addr] = { t: 's', v: '' }
    ;(ws[addr] as any).s = style
  }

  // 제목 (r=0)
  styleCell(0, 2, { font: { bold: true, sz: 16 }, alignment: center })

  // 범례 헤더 (r=1)
  styleCell(1, 1, { font: { bold: true }, alignment: center })
  styleCell(1, 2, { font: { bold: true }, alignment: center })

  // 구분 범례 (r=2~7)
  DISTRICTS.forEach((name, i) => {
    const r = 2 + i
    const color = DISTRICT_COLORS[name]
    styleCell(r, 1, { alignment: left })
    styleCell(r, 2, { fill: { patternType: 'solid' as const, fgColor: { rgb: color } } })
  })

  // 달 행 — 테두리
  for (let c = 0; c < cols; c++) {
    styleCell(ROW_MONTH, c, { border: allBorders, font: { bold: true }, alignment: center })
  }

  // 합계 행 (노랑) — 테두리
  const yellowFill = { patternType: 'solid' as const, fgColor: { rgb: 'FFFF00' } }
  for (let c = 0; c < cols; c++) {
    styleCell(ROW_TOTAL, c, { fill: yellowFill, border: allBorders, font: { bold: true }, alignment: center })
  }

  // 날짜 행 — 테두리
  for (let c = 0; c < cols; c++) {
    styleCell(ROW_DATE, c, { border: allBorders, alignment: center })
  }

  // 헤더 행 — 테두리
  for (let c = 0; c < cols; c++) {
    styleCell(ROW_HEADER, c, { border: allBorders, font: { bold: true }, alignment: center })
  }

  // 데이터 행 — 테두리
  const grayFill = { patternType: 'solid' as const, fgColor: { rgb: 'D9D9D9' } }
  regularMembers.forEach((m, i) => {
    const r = DATA_START + i
    const district = m.district ?? ''
    const color = DISTRICT_COLORS[district]
    const isLongAbsent = district === '장결자'
    const rowFill = isLongAbsent ? grayFill : undefined
    const rowStyle = rowFill ? { fill: rowFill } : {}

    styleCell(r, 0, { ...rowStyle, border: allBorders, alignment: center })
    styleCell(r, 1, { ...rowStyle, border: allBorders, alignment: left })
    if (color) {
      styleCell(r, 2, { fill: { patternType: 'solid' as const, fgColor: { rgb: color } }, border: allBorders, alignment: center })
    } else {
      styleCell(r, 2, { ...rowStyle, border: allBorders, alignment: center })
    }
    for (let j = 0; j < sundays.length; j++) {
      styleCell(r, 3 + j, { ...rowStyle, border: allBorders, alignment: center })
    }
  })

  return ws
}

function sortCohortList(cohorts: string[]): string[] {
  return [...cohorts].sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10)
    const aOld = na >= 81, bOld = nb >= 81
    if (aOld && bOld) return na - nb
    if (!aOld && !bOld) return na - nb
    return aOld ? -1 : 1
  })
}

function buildStatsSheet(
  year: number,
  members: { id: string; birth_date: string | null }[],
  sundays: string[],
  attendanceSet: Set<string>,
  visitorCountByDate: Map<string, number>,
  pastoralTeam: PastoralMember[],
  pastoralAttendedSet: Set<string>
): XLSX.WorkSheet {
  // 합계 계산 (목회팀 포함)
  const totalByDate = new Map<string, number>()
  for (const d of sundays) {
    const mc = members.filter(m => attendanceSet.has(`${m.id}_${d}`)).length
    const vc = visitorCountByDate.get(d) ?? 0
    const pc = pastoralTeam.filter(pm => pastoralAttendedSet.has(`${pm.id}_${d}`)).length
    totalByDate.set(d, mc + vc + pc)
  }
  const monthMap = new Map<number, string[]>()
  for (const d of sundays) {
    const month = parseInt(d.slice(5, 7), 10)
    if (!monthMap.has(month)) monthMap.set(month, [])
    monthMap.get(month)!.push(d)
  }
  const monthGroups = [...monthMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, mDates]) => ({
      month,
      dates: mDates,
      avg: Math.round(mDates.reduce((s, d) => s + (totalByDate.get(d) ?? 0), 0) / mDates.length),
    }))
  const cohortSet = new Set<string>()
  for (const m of members) {
    if (!m.birth_date) continue
    if (new Date(m.birth_date).getFullYear() > 1980) cohortSet.add(getCohort(m.birth_date))
  }
  const peerRows = ['80이상', ...sortCohortList([...cohortSet])]
  const peerDateCount = new Map<string, Map<string, number>>()
  for (const peer of peerRows) peerDateCount.set(peer, new Map())
  for (const m of members) {
    if (!m.birth_date) continue
    const by = new Date(m.birth_date).getFullYear()
    const peer = by <= 1980 ? '80이상' : getCohort(m.birth_date)
    const peerMap = peerDateCount.get(peer)
    if (!peerMap) continue
    for (const d of sundays) {
      if (attendanceSet.has(`${m.id}_${d}`)) peerMap.set(d, (peerMap.get(d) ?? 0) + 1)
    }
  }

  const totalCols = sundays.length + 1
  const headerRow: (string | number)[] = ['기준월']
  const avgRow: (string | number)[] = ['월평균']
  const peerHRow: (string | number)[] = ['또래']
  for (const { month, dates: mDates, avg } of monthGroups) {
    headerRow.push(`${month}월`, ...Array(mDates.length - 1).fill(''))
    avgRow.push(avg, ...Array(mDates.length - 1).fill(''))
    peerHRow.push('인원수', ...Array(mDates.length - 1).fill(''))
  }
  const dateRow: (string | number)[] = ['날짜', ...sundays.map(d => parseInt(d.slice(8, 10), 10))]
  const totalRow: (string | number)[] = ['합계', ...sundays.map(d => totalByDate.get(d) ?? 0)]

  const wsData: (string | number)[][] = [
    [`${year}년 전체 출석 통계`, ...Array(sundays.length).fill('')],
    headerRow,
    avgRow,
    dateRow,
    totalRow,
    peerHRow,
    ...peerRows.map(peer => [peer, ...sundays.map(d => peerDateCount.get(peer)?.get(d) ?? 0)]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
  ]
  let col = 1
  for (const { dates: mDates } of monthGroups) {
    if (mDates.length > 1) {
      for (const r of [1, 2, 5]) {
        merges.push({ s: { r, c: col }, e: { r, c: col + mDates.length - 1 } })
      }
    }
    col += mDates.length
  }
  ws['!merges'] = merges

  const PINK = 'F3DCDB'
  const RED  = 'C0514d'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setCell(r: number, c: number, style: object) {
    const addr = XLSX.utils.encode_cell({ r, c })
    if (!ws[addr]) ws[addr] = { t: 's', v: '' }
    ;(ws[addr] as any).s = style
  }
  function applyRow(r: number, labelStyle: object, dataStyle: object) {
    for (let c = 0; c < totalCols; c++) setCell(r, c, c === 0 ? labelStyle : dataStyle)
  }

  const center     = { horizontal: 'center' as const, vertical: 'center' as const }
  const left       = { horizontal: 'left'   as const, vertical: 'center' as const }
  const pink       = { patternType: 'solid' as const, fgColor: { rgb: PINK } }
  const red        = { patternType: 'solid' as const, fgColor: { rgb: RED  } }
  const gray       = { patternType: 'solid' as const, fgColor: { rgb: 'D9D9D9' } }
  const thinBorder = { style: 'thin' as const, color: { rgb: '000000' } }
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  setCell(0, 0, { font: { bold: true, sz: 14, color: { rgb: '1F3864' } }, alignment: center })
  applyRow(1, { border: allBorders, alignment: left   }, { border: allBorders, alignment: center })
  applyRow(2, { fill: pink, border: allBorders, font: { bold: true }, alignment: left   },
              { fill: pink, border: allBorders, font: { bold: true }, alignment: center })
  applyRow(3, { border: allBorders, alignment: left   }, { border: allBorders, alignment: center })
  applyRow(4, { fill: red,  border: allBorders, font: { bold: true }, alignment: left   },
              { fill: red,  border: allBorders, font: { bold: true }, alignment: center })
  applyRow(5, { border: allBorders, alignment: left   }, { border: allBorders, alignment: center })
  for (let r = 6; r < wsData.length; r++) {
    applyRow(r, { fill: gray, border: allBorders, alignment: left }, { border: allBorders, alignment: center })
  }

  ws['!cols'] = [{ wch: 8 }, ...sundays.map(() => ({ wch: 5 }))]
  ws['!rows'] = [{ hpt: 28 }, { hpt: 14.3 }]
  return ws
}

/**
 * xlsx-js-style은 freeze panes를 지원하지 않으므로, 출력된 xlsx 바이너리를
 * ZIP 구조 단위로 직접 파싱·재조립하여 각 시트에 freeze pane XML을 주입한다.
 * sheetFreezes: 시트 순서(1-based sheet 번호 순)에 대응하는 ySplit 값 배열.
 */
function patchXlsxFreezePanes(binary: string, sheetFreezes: number[]): string {
  const r16 = (b: string, o: number) => b.charCodeAt(o) | (b.charCodeAt(o + 1) << 8)
  const r32 = (b: string, o: number) =>
    ((b.charCodeAt(o) | (b.charCodeAt(o+1)<<8) | (b.charCodeAt(o+2)<<16) | (b.charCodeAt(o+3)<<24)) >>> 0)
  const w32 = (v: number) =>
    String.fromCharCode(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF)

  // CRC-32 lookup table
  const CRC_T = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    CRC_T[i] = c
  }
  const crc32 = (s: string) => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < s.length; i++) c = (c >>> 8) ^ CRC_T[(c ^ s.charCodeAt(i)) & 0xFF]
    return (c ^ 0xFFFFFFFF) >>> 0
  }

  // End of Central Directory
  const eocdPos = binary.lastIndexOf('PK\x05\x06')
  if (eocdPos < 0) return binary
  const totalEntries = r16(binary, eocdPos + 8)
  const cdOffset    = r32(binary, eocdPos + 16)

  // Parse Central Directory
  type Entry = { name: string; lfhOff: number; compSize: number; cdOff: number; cdLen: number; newContent?: string }
  const entries: Entry[] = []
  let cdPos = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (binary.slice(cdPos, cdPos + 4) !== 'PK\x01\x02') break
    const fnLen = r16(binary, cdPos + 28), exLen = r16(binary, cdPos + 30), cmLen = r16(binary, cdPos + 32)
    entries.push({
      name: binary.slice(cdPos + 46, cdPos + 46 + fnLen),
      lfhOff: r32(binary, cdPos + 42),
      compSize: r32(binary, cdPos + 20),
      cdOff: cdPos, cdLen: 46 + fnLen + exLen + cmLen,
    })
    cdPos += 46 + fnLen + exLen + cmLen
  }

  // Freeze pane XML
  const SHEET_VIEW = '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const freezeXml = (ySplit: number) => {
    const tl = `A${ySplit + 1}`
    return (
      `<sheetViews><sheetView workbookViewId="0">` +
      `<pane ySplit="${ySplit}" topLeftCell="${tl}" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft"/></sheetView></sheetViews>`
    )
  }

  // Patch matching sheet files (sheetN.xml → sheetFreezes[N-1])
  for (const e of entries) {
    const m = e.name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)
    if (!m) continue
    const idx = parseInt(m[1]) - 1
    if (idx >= sheetFreezes.length) continue
    const fnLen = r16(binary, e.lfhOff + 26), exLen = r16(binary, e.lfhOff + 28)
    const dataStart = e.lfhOff + 30 + fnLen + exLen
    const old = binary.slice(dataStart, dataStart + e.compSize)
    const patched = old.replace(SHEET_VIEW, freezeXml(sheetFreezes[idx]))
    if (patched !== old) e.newContent = patched
  }

  if (!entries.some(e => e.newContent !== undefined)) return binary

  // Rebuild local file sections (sorted by original LFH offset)
  const sorted = [...entries].sort((a, b) => a.lfhOff - b.lfhOff)
  const newOffMap = new Map<string, number>()
  let newBin = ''

  for (const e of sorted) {
    newOffMap.set(e.name, newBin.length)
    const fnLen = r16(binary, e.lfhOff + 26), exLen = r16(binary, e.lfhOff + 28)
    const hdrLen = 30 + fnLen + exLen, dataStart = e.lfhOff + hdrLen
    if (e.newContent !== undefined) {
      const nc = e.newContent, newCrc = crc32(nc), newSz = nc.length
      let hdr = binary.slice(e.lfhOff, e.lfhOff + hdrLen)
      hdr = hdr.slice(0, 14) + w32(newCrc) + w32(newSz) + w32(newSz) + hdr.slice(26)
      newBin += hdr + nc
    } else {
      newBin += binary.slice(e.lfhOff, dataStart + e.compSize)
    }
  }

  // Rebuild Central Directory (original CD order)
  const newCdStart = newBin.length
  let newCd = ''
  for (const e of entries) {
    const newOff = newOffMap.get(e.name) ?? e.lfhOff
    let cd = binary.slice(e.cdOff, e.cdOff + e.cdLen)
    if (e.newContent !== undefined) {
      const nc = e.newContent, newCrc = crc32(nc), newSz = nc.length
      cd = cd.slice(0, 16) + w32(newCrc) + w32(newSz) + w32(newSz) + cd.slice(28, 42) + w32(newOff) + cd.slice(46)
    } else {
      cd = cd.slice(0, 42) + w32(newOff) + cd.slice(46)
    }
    newCd += cd
  }

  // Rebuild End of Central Directory
  const newEocd =
    binary.slice(eocdPos, eocdPos + 12) +  // sig + disk info + entry counts
    w32(newCd.length) +                      // new CD size
    w32(newCdStart) +                        // new CD offset
    binary.slice(eocdPos + 20)               // comment length + comment

  return newBin + newCd + newEocd
}

/** 연간 출석 현황 그리드 엑셀 다운로드 (시트1: 전체 출석 통계, 시트2: 전체, 시트3: 새가족) */
export function downloadYearlyAttendanceGrid(
  year: number,
  members: { id: string; name: string; birth_date: string | null; is_new_member: boolean; district: string | null }[],
  attendanceSet: Set<string>,
  gradeMap: Map<string, 'A' | 'B' | 'C'>,
  visitorCountByDate: Map<string, number>,
  pastoralTeam: PastoralMember[],
  pastoralAttendedSet: Set<string>
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

  const newMemberSheet = buildNewMemberSheet(
    newMembers, sundays, attendanceSet, gradeMap, visitorCountByDate, pastoralTeam, pastoralAttendedSet
  )
  const mainSheet = buildMainSheet(
    year, regular, members, sundays, attendanceSet, gradeMap, visitorCountByDate, pastoralTeam, pastoralAttendedSet
  )
  const statsSheet = buildStatsSheet(
    year, members, sundays, attendanceSet, visitorCountByDate, pastoralTeam, pastoralAttendedSet
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, statsSheet, '전체 출석 통계')
  XLSX.utils.book_append_sheet(wb, mainSheet, '전체')
  XLSX.utils.book_append_sheet(wb, newMemberSheet, '새가족-방문')

  // ZIP 구조를 파싱·재조립해서 각 시트에 freeze pane XML을 주입
  // 순서: sheet1=전체 출석 통계(ySplit=5), sheet2=전체(ySplit=11), sheet3=새가족-방문(ySplit=6)
  const binary = patchXlsxFreezePanes(
    XLSX.write(wb, { type: 'binary', bookType: 'xlsx' }),
    [5, 6 + DISTRICTS.length, 6]
  )

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xFF
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `출석현황_${year}년_${dateStr}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 연간 출석 현황 그리드 엑셀 파싱.
 * "전체" 시트를 우선 탐색하고, 없으면 첫 번째 시트를 사용.
 * 헤더 행은 col 0="또래", col 1="이름"인 행으로 자동 탐색.
 * 날짜는 col 3+에서 읽음 (col 2는 구분).
 */
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
        const sheetName = wb.SheetNames.find(n => n === '전체') ?? wb.SheetNames[0]
        if (!sheetName) {
          resolve({ entries: [], allDates: [], errors: ['시트가 없습니다.'] })
          return
        }
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        const errors: string[] = []
        const allDates: string[] = []
        const entries: YearlyGridEntry[] = []

        if (raw.length === 0) {
          resolve({ entries, allDates, errors: ['데이터가 없습니다.'] })
          return
        }

        // 헤더 행 탐색: col 0 = "또래", col 1 = "이름"
        let headerRowIdx = -1
        for (let ri = 0; ri < raw.length; ri++) {
          const row = raw[ri] as unknown[]
          if (
            String(row[0] ?? '').trim() === '또래' &&
            String(row[1] ?? '').trim() === '이름'
          ) {
            headerRowIdx = ri
            break
          }
        }
        if (headerRowIdx === -1) {
          resolve({ entries, allDates, errors: ['헤더 행(또래/이름)을 찾을 수 없습니다.'] })
          return
        }

        // 날짜 추출: col 3+ (col 2는 구분)
        const headerRow = raw[headerRowIdx] as unknown[]
        const DATE_START_COL = 3
        for (let i = DATE_START_COL; i < headerRow.length; i++) {
          const d = normalizeDate(headerRow[i])
          if (d) {
            allDates.push(d)
          } else if (String(headerRow[i] ?? '').trim()) {
            errors.push(`헤더 열 ${XLSX.utils.encode_col(i)}: 날짜 형식이 잘못되었습니다. (건너뜀)`)
          }
        }

        if (allDates.length === 0) {
          resolve({ entries, allDates, errors })
          return
        }

        // 이름 중복 감지
        const nameCount = new Map<string, number[]>()
        for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
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
        for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
          const row = raw[rowIdx] as unknown[]
          const name = String(row[1] ?? '').trim()
          if (!name || duplicateNames.has(name)) continue
          const attendedDates: string[] = []
          for (let colIdx = 0; colIdx < allDates.length; colIdx++) {
            if (['A', 'B', 'C', 'O'].includes(String(row[DATE_START_COL + colIdx] ?? '').trim().toUpperCase())) {
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
 * 전체 시트 그리드 포맷 엑셀에서 출석 이력 파싱 (A/B/C 등급 포함).
 * 헤더 행: col 0=또래, col 1=이름, col 2=구분(건너뜀), col 3+=날짜
 */
export function parseAttendanceGridFile(
  file: File
): Promise<{ entries: AttendanceGridEntry[]; allDates: string[]; errors: string[] }> {
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
        const sheetName = wb.SheetNames.find(n => n === '전체') ?? wb.SheetNames[0]
        if (!sheetName) {
          resolve({ entries: [], allDates: [], errors: ['시트가 없습니다.'] })
          return
        }
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        const errors: string[] = []
        const allDates: string[] = []
        const entries: AttendanceGridEntry[] = []

        // 헤더 행 탐색: col 0=또래, col 1=이름
        let headerRowIdx = -1
        for (let ri = 0; ri < raw.length; ri++) {
          const row = raw[ri] as unknown[]
          if (String(row[0] ?? '').trim() === '또래' && String(row[1] ?? '').trim() === '이름') {
            headerRowIdx = ri
            break
          }
        }
        if (headerRowIdx === -1) {
          resolve({ entries, allDates, errors: ['헤더 행(또래/이름)을 찾을 수 없습니다.'] })
          return
        }

        const headerRow = raw[headerRowIdx] as unknown[]
        const DATE_START_COL = 3

        // 연도: 제목 행(r=0) 에서 추출
        const titleCell = String((raw[0] as unknown[])[2] ?? (raw[0] as unknown[])[0] ?? '').trim()
        const yearMatch = titleCell.match(/^(\d{4})/)
        const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear()

        // 달 행(col 0='달') 과 날짜 행(col 0='날짜') 탐색
        let monthRowIdx = -1, dateRowIdx = -1
        for (let ri = 0; ri < headerRowIdx; ri++) {
          const c0 = String((raw[ri] as unknown[])[0] ?? '').trim()
          if (c0 === '달') monthRowIdx = ri
          if (c0 === '날짜') dateRowIdx = ri
        }

        if (monthRowIdx !== -1 && dateRowIdx !== -1) {
          const monthRow = raw[monthRowIdx] as unknown[]
          const dateRow  = raw[dateRowIdx]  as unknown[]
          let currentMonth = 0
          for (let i = DATE_START_COL; i < headerRow.length; i++) {
            const monthCell = String(monthRow[i] ?? '').trim()
            if (monthCell) {
              const m = monthCell.match(/^(\d+)월/)
              if (m) currentMonth = parseInt(m[1], 10)
            }
            const dayVal = dateRow[i]
            if (typeof dayVal === 'number' && dayVal > 0 && currentMonth > 0) {
              const dateStr = `${year}-${String(currentMonth).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`
              allDates.push(dateStr)
            }
          }
        } else {
          // fallback: 헤더 행에서 직접 날짜 파싱 (구형 포맷)
          for (let i = DATE_START_COL; i < headerRow.length; i++) {
            const d = normalizeDate(headerRow[i])
            if (d) allDates.push(d)
            else if (String(headerRow[i] ?? '').trim())
              errors.push(`헤더 열 ${XLSX.utils.encode_col(i)}: 날짜 형식 오류 (건너뜀)`)
          }
        }

        if (allDates.length === 0) {
          resolve({ entries, allDates, errors })
          return
        }

        // 이름 중복 감지
        const nameCount = new Map<string, number[]>()
        for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
          const row = raw[ri] as unknown[]
          const name = String(row[1] ?? '').trim()
          if (!name) continue
          const existing = nameCount.get(name) ?? []
          existing.push(ri + 1)
          nameCount.set(name, existing)
        }
        const duplicateNames = new Set<string>()
        for (const [name, rows] of nameCount) {
          if (rows.length > 1) {
            errors.push(`중복된 이름: '${name}' (${rows.join(', ')}행) — 업로드 제외됨`)
            duplicateNames.add(name)
          }
        }

        const GRADE_MAP: Record<string, 'A' | 'B' | 'C'> = { A: 'A', B: 'B', C: 'C', O: 'A' }

        for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
          const row = raw[ri] as unknown[]
          const name = String(row[1] ?? '').trim()
          if (!name || duplicateNames.has(name)) continue
          const cohort = String(row[0] ?? '').trim()
          const items: { date: string; grade: 'A' | 'B' | 'C' }[] = []
          for (let ci = 0; ci < allDates.length; ci++) {
            const val = String(row[DATE_START_COL + ci] ?? '').trim().toUpperCase()
            if (val in GRADE_MAP) items.push({ date: allDates[ci], grade: GRADE_MAP[val] })
          }
          if (items.length > 0) entries.push({ name, cohort, items })
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
