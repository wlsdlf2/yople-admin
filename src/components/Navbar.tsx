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
}

export function Navbar({ userRole, collapsed }: NavbarProps) {
  const [hovered, setHovered] = useState(false)
  const canManageApprovals = userRole === 'owner' || userRole === 'admin'
  const isExpanded = !collapsed || hovered

  return (
    <aside
      className={`flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 overflow-hidden ${isExpanded ? 'w-52' : 'w-10'}`}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <nav className="p-2 space-y-0.5 mt-1">
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
