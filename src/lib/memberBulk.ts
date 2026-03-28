import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = ['이름', '전화번호', '생년월일', '새가족', '비고'] as const
const TEMPLATE_SHEET_NAME = '청년명단'

export type MemberRow = {
  name: string
  phone: string
  birth_date: string | null
  is_new_member: boolean
  memo: string | null
}

/** 청년 명단 일괄 등록용 엑셀 양식 다운로드 */
export function downloadMemberTemplate(): void {
  const wsData: string[][] = [
    [...TEMPLATE_HEADERS],
    ['홍길동', '010-1234-5678', '1995-01-15', 'Y', ''],
    ['김영희', '010-1111-2222', '1998-06-01', 'N', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 8 },
    { wch: 15 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME)
  XLSX.writeFile(wb, '청년명단_일괄등록_양식.xlsx')
}

function normalizePhone(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim().replace(/\s/g, '')
  return s
}

/** 엑셀 시리얼 날짜(숫자) 또는 문자열을 YYYY-MM-DD로 변환 */
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

function normalizeNewMember(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).trim().toUpperCase()
  if (s === 'N' || s === '0' || s === 'FALSE' || s === '아니오') return false
  return true
}

/**
 * 업로드된 엑셀 파일에서 청년 행 배열 파싱.
 * 첫 시트 사용. 첫 행을 헤더로 인식 (이름, 전화번호, 생년월일, 새가족, 비고).
 */
export function parseMemberFile(file: File): Promise<{ rows: MemberRow[]; errors: string[] }> {
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
        const rows: MemberRow[] = []

        for (let i = 0; i < json.length; i++) {
          const raw = json[i]
          const rowNo = i + 2
          const name = String(raw['이름'] ?? raw['이름 '] ?? '').trim()
          const phone = normalizePhone(raw['전화번호'] ?? raw['전화번호 '] ?? '')
          if (!name && !phone) continue
          if (!name) {
            errors.push(`${rowNo}행: 이름이 비어 있습니다.`)
            continue
          }
          if (!phone) {
            errors.push(`${rowNo}행: 전화번호가 비어 있습니다.`)
            continue
          }
          rows.push({
            name,
            phone,
            birth_date: normalizeDate(raw['생년월일'] ?? raw['생년월일 '] ?? ''),
            is_new_member: normalizeNewMember(raw['새가족'] ?? raw['새가족 '] ?? 'Y'),
            memo: String(raw['비고'] ?? raw['비고 '] ?? '').trim() || null,
          })
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
