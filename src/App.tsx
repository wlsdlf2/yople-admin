import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import DashboardLayout from './pages/DashboardLayout'
import AttendanceGrid from './pages/AttendanceGrid'
import AttendanceDetail from './pages/AttendanceDetail'
import MemberList from './pages/MemberList'
import PendingApprovals from './pages/PendingApprovals'

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
          <Route path="approvals" element={<PendingApprovals />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
