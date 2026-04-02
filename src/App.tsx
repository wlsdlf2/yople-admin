import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import DashboardLayout from './pages/DashboardLayout'
import AttendanceGrid from './pages/AttendanceGrid'
import AttendanceDetail from './pages/AttendanceDetail'
import MemberList from './pages/MemberList'
import MemberDetail from './pages/MemberDetail'
import AbsentMembers from './pages/AbsentMembers'
import PendingApprovals from './pages/PendingApprovals'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="attendance" replace />} />
          <Route path="attendance" element={<AttendanceGrid />} />
          <Route path="attendance/:date" element={<AttendanceDetail />} />
          <Route path="members" element={<MemberList />} />
          <Route path="members/:id" element={<MemberDetail />} />
          <Route path="absent" element={<AbsentMembers />} />
          <Route path="approvals" element={<PendingApprovals />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
