import { AppLayout } from "@/components/layout/AppLayout";
import { Outlet } from "react-router-dom";
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';

// This component now primarily serves as the layout for authenticated routes
function PagesApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    // AuthPage might redirect or show a login form.
    // This ensures that AppLayout and Outlet are only rendered for authenticated users.
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <Outlet /> {/* Child routes defined in AppRouter will render here */}
    </AppLayout>
  );
}

export default PagesApp;
