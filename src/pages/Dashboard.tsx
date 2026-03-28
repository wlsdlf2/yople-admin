import { Link } from 'react-router-dom'

export default function Dashboard() {
  return (
    <div>
      <p className="text-slate-600 mb-6">
        주일별 출석 현황과 청년 명단을 관리할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/dashboard/attendance"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark"
        >
          주일별 출석 현황
        </Link>
        <Link
          to="/dashboard/members"
          className="inline-flex items-center px-4 py-2 rounded-lg border-2 border-slate-200 text-slate-700 font-medium hover:border-slate-300 hover:bg-slate-50"
        >
          청년 명단 관리
        </Link>
      </div>
    </div>
  )
}
