import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ROLE_HOME, useAuth } from './context/AuthContext.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ApplicationDashboard from './pages/applicant/ApplicationDashboard.jsx';
import VerifierDashboard from './pages/verifier/VerifierDashboard.jsx';
import UsersPage from './pages/admin/UsersPage.jsx';
import Forbidden from './pages/shared/Forbidden.jsx';
import NotFound from './pages/shared/NotFound.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forbidden" element={<Forbidden />} />

      <Route element={<ProtectedRoute roles={['APPLICANT']} />}>
        <Route element={<Layout />}>
          <Route path="/applicant" element={<ApplicationDashboard />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['VERIFIER']} />}>
        <Route element={<Layout />}>
          <Route path="/verifier" element={<VerifierDashboard />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMINISTRATOR']} />}>
        <Route element={<Layout />}>
          <Route path="/admin" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
