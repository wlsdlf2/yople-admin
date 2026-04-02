import { Link } from 'react-router-dom'
import logo from '../assets/yople_logo.jpg'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full border-4 border-white shadow-md overflow-hidden bg-slate-50 flex items-center justify-center">
            <img src={logo} alt="젊은백성" className="h-full w-full object-contain" />
          </div>
        </div>

        {/* 타이틀 */}
        <h1 className="text-3xl font-bold text-slate-800 text-center mb-2">
          젊은백성 출결관리
        </h1>
        <p className="text-slate-500 text-center mb-8">
          주일별 출석 현황과 청년 명단을 관리하세요
        </p>

        {/* 기능 안내 */}
        <div className="grid grid-cols-1 gap-3 mb-8">
          <div className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200">
            <span className="text-primary mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">주일별 출석 현황</p>
              <p className="text-xs text-slate-500">날짜별 출석 인원 확인 및 일괄 업로드</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200">
            <span className="text-primary mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">청년 명단 관리</p>
              <p className="text-xs text-slate-500">청년 등록·수정·삭제 및 일괄 등록</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200">
            <span className="text-primary mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">월별 그리드 뷰</p>
              <p className="text-xs text-slate-500">엑셀 형식으로 한 달 출석 현황 한눈에 보기</p>
            </div>
          </div>
        </div>

        {/* 로그인 버튼 */}
        <Link
          to="/login"
          className="cursor-pointer block w-full py-4 px-6 rounded-xl bg-primary text-white text-lg font-semibold text-center hover:bg-primary-dark active:scale-[0.99] shadow-sm"
        >
          관리자 로그인
        </Link>
      </div>
    </div>
  )
}
