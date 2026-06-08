import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useSelector } from 'react-redux';
import { ThemeProvider, CssBaseline } from '@mui/material';
import store from './store';
import theme from './theme';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ConsumerDashboard from './pages/ConsumerDashboard';
import StaffDashboard from './pages/StaffDashboard';
import SupervisorDashboard from './pages/SupervisorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ErrorBoundary from './components/ErrorBoundary';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  console.log('[DEBUG] ProtectedRoute authentication check:', { isAuthenticated, userRole: user?.role });

  if (!isAuthenticated) {
    console.log('[DEBUG] User is not authenticated. Redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    console.warn(`[DEBUG] Role "${user?.role}" is not in allowed roles:`, allowedRoles, 'Redirecting to correct portal.');
    // Redirect to correct dashboard based on actual role
    if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user?.role === 'SUPERVISOR') return <Navigate to="/supervisor" replace />;
    if (user?.role === 'STAFF') return <Navigate to="/staff" replace />;
    return <Navigate to="/consumer" replace />;
  }

  return <Layout>{children}</Layout>;
};

// Home Redirect Component
const HomeRedirect = () => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  console.log('[DEBUG] HomeRedirect state check:', { isAuthenticated, userRole: user?.role });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user?.role === 'SUPERVISOR') return <Navigate to="/supervisor" replace />;
  if (user?.role === 'STAFF') return <Navigate to="/staff" replace />;
  return <Navigate to="/consumer" replace />;
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Dashboard Routes wrapped with individual boundaries */}
          <Route
            path="/consumer"
            element={
              <ProtectedRoute allowedRoles={['CONSUMER']}>
                <ErrorBoundary>
                  <ConsumerDashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['STAFF']}>
                <ErrorBoundary>
                  <StaffDashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute allowedRoles={['SUPERVISOR']}>
                <ErrorBoundary>
                  <SupervisorDashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <ErrorBoundary>
                  <AdminDashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Home Redirect */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppRoutes />
      </ThemeProvider>
    </Provider>
  );
}

export default App;
