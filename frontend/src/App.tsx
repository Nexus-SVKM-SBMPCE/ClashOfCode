import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ToastProvider } from './Toast';
import Navbar from './Navbar';
import BatchGate from './BatchGate';
import LoginPage from './pages/LoginPage';
import ProblemsPage from './pages/ProblemsPage';
// Lazy: keeps the multi-MB Monaco editor out of the login/problems first load
const ProblemPage = lazy(() => import('./pages/ProblemPage'));
import LeaderboardPage from './pages/LeaderboardPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="splash"><span className="spinner" aria-label="Loading" /></div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { user, loading } = useAuth();
  return (
    <div className="app-root">
      {user && <Navbar />}
      {/* Hold the navbar's space while a stored session is verified, so the page doesn't jump */}
      {!user && loading && <div className="header-placeholder" aria-hidden="true" />}
      <main className="main-content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/*
            BatchGate wraps problem routes: shows WaitingScreen for
            contestants when batch is NOT_STARTED, passes through
            when ACTIVE/COMPLETED or user is admin.
          */}
          <Route
            path="/problems"
            element={
              <RequireAuth>
                <BatchGate>
                  <ProblemsPage />
                </BatchGate>
              </RequireAuth>
            }
          />
          <Route
            path="/problems/:slug"
            element={
              <RequireAuth>
                <BatchGate>
                  <Suspense fallback={<div className="state"><span className="spinner" /> Loading editor…</div>}>
                    <ProblemPage />
                  </Suspense>
                </BatchGate>
              </RequireAuth>
            }
          />
          <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/problems" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

