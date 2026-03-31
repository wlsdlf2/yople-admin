/** 해당 연도의 모든 일요일 날짜 배열 (YYYY-MM-DD) */
export function getSundaysInYear(year: number): string[] {
  const dates: string[] = []
  const d = new Date(year, 0, 1)
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  while (d.getFullYear() === year) {
    dates.push(
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
    )
    d.setDate(d.getDate() + 7)
  }
  return dates
}

/** birth_date로부터 또래(연도 끝 2자리) 반환 */
export function getCohort(birth_date: string | null): string {
  if (!birth_date) return '-'
  const y = new Date(birth_date).getFullYear() % 100
  return String(y).padStart(2, '0')
}
