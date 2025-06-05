
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom'; // Import Outlet and useLocation
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PostmarkSetup } from '@/components/postmark/PostmarkSetup';
import { KnowReplySetup } from '@/components/knowreply/KnowReplySetup';
import { MCPManagement } from '@/components/mcp/MCPManagement';
import { EmailTesting } from '@/components/email-testing/EmailTesting';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const location = useLocation(); // Get current location

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

  const renderLegacyPageContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'postmark':
        return <PostmarkSetup />;
      case 'knowreply':
        return <KnowReplySetup />;
      case 'mcps':
        return <MCPManagement />;
      case 'email-testing':
        return <EmailTesting />;
      default:
        return <Dashboard />; // Fallback for current page state
    }
  };

  return (
    <AppLayout currentPage={currentPage} onPageChange={setCurrentPage}>
      <Outlet />
      {/* Conditionally render legacy page content if at the root path */}
      {location.pathname === '/' ? renderLegacyPageContent() : null}
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
