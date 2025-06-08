import { useState } from 'react';
import { motion } from 'framer-motion';
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
import { Link } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
}

const navigation = [
  { id: 'unifiedDashboard', name: 'Dashboard', icon: LayoutGrid, path: '/unified-dashboard' }, // New Entry
  { id: 'postmark', name: 'Postmark Setup', icon: Mail, path: '/postmark' },
  { id: 'mcps', name: 'Agent Tools Setup', icon: Terminal, path: '/mcps' },
  { id: 'knowreply', name: 'Know Reply Setup', icon: Zap, path: '/knowreply' },
  { id: 'email-testing', name: 'Email Testing', icon: TestTube, path: '/email-testing' },
  { id: 'logs', name: 'Activity Logs', icon: Activity, path: '/logs' },
];

export function AppLayout({ children, currentPage, onPageChange }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
            <nav>
              {navigation.map((item) => (
                <Link key={item.id} to={item.path}>
                  {item.name}
                </Link>
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
        <nav>
          {navigation.map((item) => (
            <Link key={item.id} to={item.path}>
              {item.name}
            </Link>
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
              {navigation.find(item => item.id === currentPage)?.name || 'Dashboard'}
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
