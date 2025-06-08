import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Mail, 
  Zap, 
  Terminal, 
  Activity, 
  Settings,
  LogOut,
  Menu,
  X,
  Briefcase,
  Tag,
  LayoutGrid, // New Icon for Dashboard
  TestTube
} from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { id: 'unifiedDashboard', name: 'Dashboard', icon: LayoutGrid, path: '/' }, // New Entry
  { id: 'postmark', name: 'Postmark Setup', icon: Mail, path: '/postmark' },
  { id: 'mcps', name: 'Agent Tools Setup', icon: Terminal, path: '/mcps' },
  { id: 'knowreply', name: 'Know Reply Setup', icon: Zap, path: '/knowreply' },
  { id: 'email-testing', name: 'Email Testing', icon: TestTube, path: '/email-testing' },
  { id: 'logs', name: 'Activity Logs', icon: Activity, path: '/logs' },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="relative flex flex-col w-64 h-full bg-white shadow-xl"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <img src="/knowreply-black-512x512.png" alt="Know Reply Hub Logo" className="h-8 w-8" />
                <span className="font-semibold text-gray-900">Know Reply Hub</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              {navigation.map((item) => (
                <Button asChild key={item.id} variant={location.pathname === item.path ? "default" : "ghost"} className="w-full justify-start">
                  <Link to={item.path} onClick={() => setSidebarOpen(false)}>
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                </Button>
              ))}
            </nav>
          </motion.div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:bg-white lg:border-r">
        <div className="flex items-center gap-2 p-6 border-b">
          <img src="/knowreply-black-512x512.png" alt="Know Reply Hub Logo" className="h-8 w-8" />
          <span className="font-semibold text-gray-900">Know Reply Hub</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => (
            <Button asChild key={item.id} variant={location.pathname === item.path ? "default" : "ghost"} className="w-full justify-start">
              <Link to={item.path}>
                <item.icon className="h-4 w-4 mr-2" />
                {item.name}
              </Link>
            </Button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top navigation */}
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold text-gray-900 capitalize">
              {navigation.find(item => item.path === location.pathname)?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
