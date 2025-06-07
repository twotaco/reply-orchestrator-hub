
import { useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PostmarkSetup } from '@/components/postmark/PostmarkSetup';
import { KnowReplySetup } from '@/components/knowreply/KnowReplySetup';
import { MCPManagement } from '@/components/mcp/MCPManagement';
import { EmailTesting } from '@/components/email-testing/EmailTesting';
import { ActivityLogs } from '@/components/activity-logs/ActivityLogs';
import { BusinessDashboardPage } from '@/pages/BusinessDashboardPage';
import { TopicsDashboardPage } from '@/pages/TopicsDashboardPage'; // New Import

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

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

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'businessDashboard':
        return <BusinessDashboardPage />;
      case 'topicsDashboard': // New Case
        return <TopicsDashboardPage />;
      case 'postmark':
        return <PostmarkSetup />;
      case 'knowreply':
        return <KnowReplySetup />;
      case 'mcps':
        return <MCPManagement />;
      case 'email-testing':
        return <EmailTesting />;
      case 'logs':
                return <ActivityLogs />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AppLayout currentPage={currentPage} onPageChange={setCurrentPage}>
      {renderPage()}
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
