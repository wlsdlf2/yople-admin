import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import DashboardLayout from './pages/DashboardLayout'
import Dashboard from './pages/Dashboard'
import AttendanceList from './pages/AttendanceList'
import AttendanceDetail from './pages/AttendanceDetail'
import AttendanceGrid from './pages/AttendanceGrid'
import MemberList from './pages/MemberList'
import PendingApprovals from './pages/PendingApprovals'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="attendance" element={<AttendanceList />} />
          <Route path="attendance/grid" element={<AttendanceGrid />} />
          <Route path="attendance/:date" element={<AttendanceDetail />} />
          <Route path="members" element={<MemberList />} />
          <Route path="approvals" element={<PendingApprovals />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
