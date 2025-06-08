import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { PostmarkSetup } from '@/components/postmark/PostmarkSetup';
import { KnowReplySetup } from '@/components/knowreply/KnowReplySetup';
import { MCPManagement } from '@/components/mcp/MCPManagement';
import { EmailTesting } from '@/components/email-testing/EmailTesting';
import { ActivityLogs } from '@/components/activity-logs/ActivityLogs';
import { UnifiedDashboardPage } from '@/pages/UnifiedDashboardPage';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/unified-dashboard" />} />
        <Route path="/unified-dashboard" element={<UnifiedDashboardPage />} />
        <Route path="/postmark" element={<PostmarkSetup />} />
        <Route path="/knowreply" element={<KnowReplySetup />} />
        <Route path="/mcps" element={<MCPManagement />} />
        <Route path="/email-testing" element={<EmailTesting />} />
        <Route path="/logs" element={<ActivityLogs />} />
        <Route path="*" element={<Navigate to="/unified-dashboard" />} />
      </Routes>
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
