
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Mail, 
  Zap, 
  Terminal, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  TrendingUp 
} from 'lucide-react';

interface DashboardStats {
  totalEmails: number;
  activeMCPs: number;
  errors: number;
  successRate: number;
}

interface RecentEmail {
  id: string;
  from_email: string;
  subject: string;
  intent: string;
  mcp_used: string;
  status: string;
  created_at: string;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmails: 0,
    activeMCPs: 0,
    errors: 0,
    successRate: 0
  });
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load stats
      const { data: emails } = await supabase
        .from('email_interactions')
        .select('status');
      
      const { data: mcps } = await supabase
        .from('mcp_endpoints')
        .select('active')
        .eq('active', true);

      const totalEmails = emails?.length || 0;
      const activeMCPs = mcps?.length || 0;
      const errors = emails?.filter(e => e.status === 'failed').length || 0;
      const successRate = totalEmails > 0 ? ((totalEmails - errors) / totalEmails) * 100 : 0;

      setStats({ totalEmails, activeMCPs, errors, successRate });

      // Load recent emails
      const { data: recent } = await supabase
        .from('email_interactions')
        .select('id, from_email, subject, intent, mcp_used, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentEmails(recent || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'replied': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'processing': return <Clock className="h-4 w-4 text-yellow-600" />;
      default: return <Mail className="h-4 w-4 text-blue-600" />;
    }
  };

  const getStatusBadge = (status: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (status) {
      case 'replied': return 'default';
      case 'failed': return 'destructive';
      case 'processing': return 'secondary';
      case 'received': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Emails</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalEmails}</p>
                </div>
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active MCPs</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activeMCPs}</p>
                </div>
                <Terminal className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Errors</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.errors}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Emails */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="rounded-2xl shadow-md">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Recent Email Interactions</CardTitle>
            <CardDescription>Latest emails processed through the system</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {recentEmails.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No email interactions yet</p>
                <p className="text-sm">Emails will appear here once you configure Postmark</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentEmails.map((email, index) => (
                  <motion.div
                    key={email.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        {getStatusIcon(email.status)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{email.from_email}</p>
                        <p className="text-sm text-gray-600">{email.subject || 'No subject'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {email.intent && (
                            <Badge variant="outline" className="text-xs">
                              {email.intent}
                            </Badge>
                          )}
                          {email.mcp_used && (
                            <Badge variant="secondary" className="text-xs">
                              {email.mcp_used}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={getStatusBadge(email.status)}>
                        {email.status}
                      </Badge>
                      <p className="text-xs text-gray-500">
                        {new Date(email.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
