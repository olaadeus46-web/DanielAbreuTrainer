import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import FinancePage from './pages/FinancePage';
import MyMetricsPage from './pages/MyMetricsPage';
import AutomationsPage from './pages/AutomationsPage';
import PublicCheckInPage from './pages/PublicCheckInPage';
import PublicOnlineClientPage from './pages/PublicOnlineClientPage';
import PublicFeedbackPage from './pages/PublicFeedbackPage';
import Layout from './components/ui/Layout';
import BrandLoadingScreen from './components/ui/BrandLoadingScreen';
import { FeedbackProvider } from './components/ui/FeedbackProvider';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <BrandLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/check-in/:token" element={<PublicCheckInPage />} />
          <Route path="/online-client/:token" element={<PublicOnlineClientPage />} />
          <Route path="/feedback/:token" element={<PublicFeedbackPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="clients" element={<PrivateRoute role="TRAINER"><ClientsPage /></PrivateRoute>} />
            <Route path="packages" element={<PrivateRoute role="TRAINER"><Navigate to="/finance?tab=packages" replace /></PrivateRoute>} />
            <Route path="clients/:id" element={<PrivateRoute role="TRAINER"><ClientDetailPage /></PrivateRoute>} />
            <Route path="finance" element={<PrivateRoute role="TRAINER"><FinancePage /></PrivateRoute>} />
            <Route path="automations" element={<PrivateRoute role="TRAINER"><AutomationsPage /></PrivateRoute>} />
            <Route path="my-metrics" element={<PrivateRoute role="CLIENT"><MyMetricsPage /></PrivateRoute>} />
          </Route>
        </Routes>
      </FeedbackProvider>
    </AuthProvider>
  );
}
