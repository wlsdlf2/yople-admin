import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', end: true, label: '홈' },
  { to: '/dashboard/attendance', end: false, label: '주일별 출석 현황' },
  { to: '/dashboard/members', end: false, label: '청년 명단' },
]

const adminOnlyLinks = [
  { to: '/dashboard/approvals', end: false, label: '회원가입 요청 수락' },
]

type NavbarProps = {
  userRole?: 'owner' | 'admin' | 'staff' | null
}

export function Navbar({ userRole }: NavbarProps) {
  const canManageApprovals = userRole === 'owner' || userRole === 'admin'

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-200 min-h-0 flex flex-col">
      <nav className="p-3 space-y-0.5">
        {links.map(({ to, end, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        {canManageApprovals &&
          adminOnlyLinks.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
      </nav>
    </aside>
  )
}
