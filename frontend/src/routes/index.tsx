import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import Dashboard from '../components/Dashboard';
import Login from '../components/Login';
// import ServiceRequestForm from '../components/ServiceRequestForm';
import Register from '../components/Register';
// import Profile from '../components/Profile';
import Layout from '../components/Layout';
// import NotFound from '../components/NotFound';
import ServiceRequests from '../components/ServiceRequests';
// import ServiceRequestDetail from '../components/ServiceRequestDetail';
// import ProtectedRoute from '../components/ProtectedRoute';
// import AdminRoute from '../components/AdminRoute';
// import Users from '../components/Users';
// import UserDetail from '../components/UserDetail';
import Monitoring from '../components/Monitoring';
import UserMonitoring from '../components/UserMonitoring';

const AppRouter = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route element={<Layout>{<Outlet />}</Layout>}>
          <Route path="/" element={<Dashboard />} />
          {/* <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} /> */}
          {/* <Route path="/services/request" element={<ProtectedRoute><ServiceRequestForm /></ProtectedRoute>} /> */}
          <Route path="/my-monitoring" element={<UserMonitoring />} />
        </Route>
        
        <Route path="*" element={<div>페이지를 찾을 수 없습니다</div>} />
      </Routes>
    </Router>
  );
};

export default AppRouter; 