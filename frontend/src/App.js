import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TopNav } from './components/layout/TopNav';
import { LeftNav } from './components/layout/LeftNav';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ChangesListPage from './pages/ChangesListPage';
import ChangeDetailPage from './pages/ChangeDetailPage';
import NewChangePage from './pages/NewChangePage';
import CMDBPage from './pages/CMDBPage';
import TaskDetailPage from './pages/TaskDetailPage';
import './index.css';

function Layout({ children }) {
  return (
    <div style={{ background: 'var(--sn-body-bg)', minHeight: '100vh' }}>
      <TopNav />
      <div style={{ display: 'flex', paddingTop: 48 }}>
        <LeftNav />
        <main style={{ marginLeft: 220, flex: 1, padding: '20px 24px', minHeight: 'calc(100vh - 48px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--sn-text-muted)', fontSize: 14 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
      <Route path="/changes" element={<ProtectedLayout><ChangesListPage /></ProtectedLayout>} />
      <Route path="/changes/new" element={<ProtectedLayout><NewChangePage /></ProtectedLayout>} />
      <Route path="/changes/:id" element={<ProtectedLayout><ChangeDetailPage /></ProtectedLayout>} />
      <Route path="/cmdb" element={<ProtectedLayout><CMDBPage /></ProtectedLayout>} />
      <Route path="/changes/:changeId/tasks/:taskId" element={<ProtectedLayout><TaskDetailPage /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
