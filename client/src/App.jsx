import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ROLE_HOME, useAuth } from './context/AuthContext.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ApplicationDashboard from './pages/applicant/ApplicationDashboard.jsx';
import UploadDocument from './pages/applicant/UploadDocument.jsx';
import PendingCases from './pages/verifier/PendingCases.jsx';
import ReviewDocument from './pages/verifier/ReviewDocument.jsx';
import ApplicationView from './pages/verifier/ApplicationView.jsx';
// The dashboard is the only page using the chart library; load both only when an administrator opens it.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
import UsersPage from './pages/admin/UsersPage.jsx';
import UserDetailPage from './pages/admin/UserDetailPage.jsx';
import ReportsPage from './pages/admin/ReportsPage.jsx';
import SystemPage from './pages/admin/SystemPage.jsx';
import CategoriesPage from './pages/admin/CategoriesPage.jsx';
import CategoryDetailPage from './pages/admin/CategoryDetailPage.jsx';
import Forbidden from './pages/shared/Forbidden.jsx';
import NotFound from './pages/shared/NotFound.jsx';
import NotificationsPage from './pages/shared/NotificationsPage.jsx';

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
          <Route path="/applicant/documents/:itemId" element={<UploadDocument />} />
        </Route>
      </Route>

      {/* Verifiers record decisions; administrators see the same pages read-only and can correct decisions. */}
      <Route element={<ProtectedRoute roles={['VERIFIER', 'ADMINISTRATOR']} />}>
        <Route element={<Layout />}>
          <Route path="/cases" element={<PendingCases />} />
          <Route path="/cases/documents/:id" element={<ReviewDocument />} />
          <Route path="/cases/applications/:id" element={<ApplicationView />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMINISTRATOR']} />}>
        <Route element={<Layout />}>
          <Route
            path="/admin"
            element={
              <Suspense fallback={<div className="page-loading">Loading dashboard…</div>}>
                <AdminDashboard />
              </Suspense>
            }
          />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/settings" element={<SystemPage />} />
          <Route path="/admin/categories" element={<CategoriesPage />} />
          <Route path="/admin/categories/:id" element={<CategoryDetailPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
