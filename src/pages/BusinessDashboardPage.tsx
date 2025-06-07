import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Construction, ThumbsUp, LineChart as LineChartIcon, Users, CalendarDays, ShieldAlert } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { type DateRange } from 'react-day-picker';
import { subDays, format } from 'date-fns'; // addDays is not used in the snippet, format might be
import { Button } from '@/components/ui/button';
// Assuming InqEmails provides { received_at: string }
// import type { InqEmails } from '@/integrations/supabase/types';


// Placeholder for data fetching functions that will be added later
// For example:
// import { fetchAverageConfidence } from '@/lib/api/businessDashboard';

async function fetchTotalEmailsProcessedCount(dateRange?: DateRange): Promise<number> {
  let query = supabase
    .from('inq_emails')
    .select('*', { count: 'exact', head: true });

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999); // End of the selected 'to' day
    const toDateStr = toDate.toISOString();

    query = query.gte('received_at', fromDateStr);
    query = query.lte('received_at', toDateStr);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error fetching total emails processed count:', error);
    return 0;
  }
  return count || 0;
}

async function fetchAverageConfidenceScore(dateRange?: DateRange): Promise<number | null> {
  let query = supabase
    .from('inq_responses')
    .select('confidence_score');

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();

    // Assuming 'created_at' is the relevant field for when a response was recorded
    query = query.gte('created_at', fromDateStr);
    query = query.lte('created_at', toDateStr);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching confidence scores:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null; // No responses to average
  }

  const validScores = data
    .map(item => item.confidence_score)
    .filter(score => typeof score === 'number') as number[]; // Filter out null/non-numeric scores

  if (validScores.length === 0) {
    return null; // No valid scores to average
  }

  const sum = validScores.reduce((acc, score) => acc + score, 0);
  return sum / validScores.length;
}

async function fetchEmailTimeData(dateRange?: DateRange): Promise<{ received_at: string }[]> {
  let query = supabase
    .from('inq_emails')
    .select('received_at')
    .order('received_at', { ascending: true });

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();

    query = query.gte('received_at', fromDateStr);
    query = query.lte('received_at', toDateStr);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching email time data:', error);
    return [];
  }
  return data || [];
}

async function fetchActiveAgentsCount(dateRange?: DateRange): Promise<number> {
  if (!dateRange?.from || !dateRange?.to) {
    return 0;
  }

  const fromDateStr = dateRange.from.toISOString();
  const toDate = new Date(dateRange.to);
  toDate.setHours(23, 59, 59, 999);
  const toDateStr = toDate.toISOString();

  const { data, error } = await supabase
    .from('inq_emails')
    .select('email_account_id')
    .not('email_account_id', 'is', null)
    .gte('received_at', fromDateStr)
    .lte('received_at', toDateStr);

  if (error) {
    console.error('Error fetching active agents data:', error);
    return 0;
  }

  if (!data) {
    return 0;
  }

  const distinctAgentIds = new Set(data.map(item => item.email_account_id));
  return distinctAgentIds.size;
}

interface EmailVolumeDataPoint { date: string; count: number; }

function processEmailVolume(emails: { received_at: string }[]): EmailVolumeDataPoint[] {
  if (!emails || emails.length === 0) return [];

  const countsByDate: { [date: string]: number } = {};
  emails.forEach(email => {
    const date = new Date(email.received_at).toLocaleDateString('en-CA'); // YYYY-MM-DD for sorting
    countsByDate[date] = (countsByDate[date] || 0) + 1;
  });

  return Object.entries(countsByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date
}

export function BusinessDashboardPage() {
  const [totalEmailsProcessed, setTotalEmailsProcessed] = useState<number | null>(null);
  const [isLoadingEmailsProcessed, setIsLoadingEmailsProcessed] = useState(true);
  const [averageConfidenceScore, setAverageConfidenceScore] = useState<number | null>(null);
  const [isLoadingConfidenceScore, setIsLoadingConfidenceScore] = useState(true);
  const [emailVolumeData, setEmailVolumeData] = useState<EmailVolumeDataPoint[]>([]);
  const [isLoadingEmailVolume, setIsLoadingEmailVolume] = useState(true);
  const [activeAgentsCount, setActiveAgentsCount] = useState<number | null>(null);
  const [isLoadingActiveAgents, setIsLoadingActiveAgents] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: subDays(today, 6), // last 7 days including today
      to: today,
    };
  });
  const [activePreset, setActivePreset] = useState<string | null>('last7days');
  // ... other existing placeholder states can be removed or updated later

  const handleSetPresetRange = (preset: 'last7days' | 'last30days') => {
    const today = new Date();
    let fromDate;
    if (preset === 'last7days') {
      fromDate = subDays(today, 6);
    } else { // last30days
      fromDate = subDays(today, 29);
    }
    setDateRange({ from: fromDate, to: today });
    setActivePreset(preset);
  };

  const handleCustomDateChange = (newRange?: DateRange) => {
    setDateRange(newRange);
    setActivePreset(null); // Clear preset when custom range is picked
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!dateRange?.from || !dateRange?.to) {
        console.warn("Date range is not fully defined. Skipping data load.");
        // Clear data and set loading to false
        setTotalEmailsProcessed(null);
        setIsLoadingEmailsProcessed(false);
        setAverageConfidenceScore(null);
        setIsLoadingConfidenceScore(false);
        setEmailVolumeData([]);
        setIsLoadingEmailVolume(false);
        setActiveAgentsCount(null);
        setIsLoadingActiveAgents(false);
        return;
      }

      setIsLoadingEmailsProcessed(true);
      setIsLoadingConfidenceScore(true);
      setIsLoadingEmailVolume(true);
      setIsLoadingActiveAgents(true);

      const [
        emailsCount,
        avgConfidence,
        rawEmailVolume,
        agentsCount
      ] = await Promise.all([
        fetchTotalEmailsProcessedCount(dateRange),
        fetchAverageConfidenceScore(dateRange),
        fetchEmailTimeData(dateRange),
        fetchActiveAgentsCount(dateRange)
      ]);

      setTotalEmailsProcessed(emailsCount);
      setIsLoadingEmailsProcessed(false);

      setAverageConfidenceScore(avgConfidence);
      setIsLoadingConfidenceScore(false);

      setEmailVolumeData(processEmailVolume(rawEmailVolume));
      setIsLoadingEmailVolume(false);

      setActiveAgentsCount(agentsCount);
      setIsLoadingActiveAgents(false);
    };

    loadDashboardData();
  }, [dateRange]); // Dependency array updated

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Business Dashboard
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activePreset === 'last7days' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSetPresetRange('last7days')}
          >
            Last 7 days
          </Button>
          <Button
            variant={activePreset === 'last30days' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSetPresetRange('last30days')}
          >
            Last 30 days
          </Button>
          <DateRangePicker
            dateRange={dateRange}
            onDateChange={handleCustomDateChange}
            className="text-sm"
          />
          {/* Optional: Display current range for clarity, though DateRangePicker button shows it */}
          {/* {dateRange?.from && dateRange?.to && (
            <p className="text-sm text-muted-foreground hidden md:block">
              Selected: {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
            </p>
          )} */}
        </div>
      </div>

      {/* Grid for KPIs and Charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Example KPI Card - Will be replaced by actual implementations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Emails Processed
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingEmailsProcessed ? (
              <Skeleton className="h-8 w-1/2 mt-1" />
            ) : (
              <div className="text-2xl font-bold">
                {totalEmailsProcessed !== null ? totalEmailsProcessed.toLocaleString() : 'N/A'}
              </div>
            )}
            {/* Optional: <p className="text-xs text-muted-foreground">Total since beginning</p> */}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average Confidence
            </CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" /> {/* New Icon */}
          </CardHeader>
          <CardContent>
            {isLoadingConfidenceScore ? (
              <Skeleton className="h-8 w-1/2 mt-1" />
            ) : (
              <div className="text-2xl font-bold">
                {averageConfidenceScore !== null ? `${(averageConfidenceScore * 100).toFixed(1)}%` : 'N/A'}
              </div>
            )}
            {/* <p className="text-xs text-muted-foreground">Based on all responses</p> */}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Agents
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingActiveAgents ? (
              <Skeleton className="h-8 w-1/2 mt-1" />
            ) : (
              <div className="text-2xl font-bold">
                {activeAgentsCount !== null ? activeAgentsCount.toLocaleString() : 'N/A'}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Unique agents in period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Manager Escalations
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" /> {/* New Icon */}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              N/A
            </div>
            <p className="text-xs text-muted-foreground">
              Escalation criteria pending
            </p>
          </CardContent>
        </Card>

        {/* Email Volume Trends Chart */}
        <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Volume Trends</CardTitle>
            <LineChartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-64"> {/* Ensure fixed height for chart container */}
            {isLoadingEmailVolume ? (
              <Skeleton className="h-full w-full" />
            ) : emailVolumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={emailVolumeData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="count" name="Emails Received" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <LineChartIcon className="h-12 w-12 text-muted-foreground" />
                <p className="ml-2 text-muted-foreground">No email volume data available.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Placeholder for Funnel Stage Distribution Chart (will take more width) */}
         <Card className="md:col-span-2 lg:col-span-1 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Funnel Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
             <Construction className="h-12 w-12 text-muted-foreground" />
             <p className="ml-2 text-muted-foreground">Chart Coming Soon</p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
