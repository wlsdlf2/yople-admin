import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard/attendance', end: false, label: '주일별 출석 현황' },
  { to: '/dashboard/members', end: false, label: '청년 명단' },
]

const adminOnlyLinks = [
  { to: '/dashboard/approvals', end: false, label: '회원가입 요청 수락' },
]

type NavbarProps = {
  userRole?: 'owner' | 'admin' | 'staff' | null
  collapsed: boolean
  onToggle: () => void
  onHoverChange: (hovered: boolean) => void
}

export function Navbar({ userRole, collapsed, onToggle, onHoverChange }: NavbarProps) {
  const [hovered, setHovered] = useState(false)
  const canManageApprovals = userRole === 'owner' || userRole === 'admin'
  const isExpanded = !collapsed || hovered

  const handleMouseEnter = () => {
    if (collapsed) {
      setHovered(true)
      onHoverChange(true)
    }
  }
  const handleMouseLeave = () => {
    setHovered(false)
    onHoverChange(false)
  }

  return (
    <aside
      className={`flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 overflow-hidden ${isExpanded ? 'w-52' : 'w-10'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 토글 버튼 */}
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label={collapsed ? '사이드바 열기' : '사이드바 닫기'}
        >
          {/* 열린 상태: ← (닫기) / 호버로 임시 열림: → (열린 채로 유지) */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
            }
          </svg>
        </button>
      </div>

      {/* 메뉴 */}
      <nav className="p-2 space-y-0.5">
        {links.map(({ to, end, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center px-2 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`
            }
          >
            <span className={`transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
              {label}
            </span>
          </NavLink>
        ))}
        {canManageApprovals &&
          adminOnlyLinks.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center px-2 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`
              }
            >
              <span className={`transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                {label}
              </span>
            </NavLink>
          ))}
      </nav>
    </aside>
  )
}
