import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = ['날짜', '이름'] as const
const TEMPLATE_SHEET_NAME = '출석이력'

export type AttendanceRow = {
  date: string
  name: string
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
    ['2025-01-05', '홍길동'],
    ['2025-01-12', '김영희'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME)
  XLSX.writeFile(wb, '출석이력_일괄업로드_양식.xlsx')
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
          if (!date && !name) continue
          if (!date) {
            errors.push(`${rowNo}행: 날짜가 비어 있거나 형식이 잘못되었습니다. (YYYY-MM-DD)`)
            continue
          }
          if (!name) {
            errors.push(`${rowNo}행: 이름이 비어 있습니다.`)
            continue
          }
          rows.push({ date, name })
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
