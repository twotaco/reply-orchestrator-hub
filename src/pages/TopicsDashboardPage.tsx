import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart, PieChart as PieChartIconLucide, ListChecks, HelpCircle, Construction } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import type { DateRange } from 'react-day-picker';
import type { InqEmails } from '@/integrations/supabase/types';
import { subDays, format } from 'date-fns';
import { SimplePieChart } from '@/components/charts/SimplePieChart';
import { SentimentOverviewChart } from '@/components/dashboard/SentimentOverviewChart';
import { FunnelStageDistributionChart } from '@/components/dashboard/FunnelStageDistributionChart';
import { Skeleton } from '@/components/ui/skeleton';

// Helper function to normalize subjects
function normalizeSubject(subject: string | null): string {
  if (!subject) return "No Subject";
  return subject
    .toLowerCase()
    .replace(/^(re:|fw:|fwd:)\s*/i, '') // Remove common prefixes
    .replace(/[\[\(]?msg:\s*\d+[\]\)]?/i, '') // Remove message ID tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim() || "No Subject"; // Ensure not empty
}

// Interfaces for processed data
interface TopicEmailData {
  sentiment_overall: string | null;
  funnel_stage: string | null;
  include_manager: string | null;
}

export interface ProcessedTopic {
  id: string;
  displayName: string;
  emailCount: number;
  emails: TopicEmailData[];
}

async function fetchAndProcessTopics(dateRange?: DateRange): Promise<ProcessedTopic[]> {
  let query = supabase.from('inq_emails').select('email_subject, sentiment_overall, funnel_stage, include_manager, received_at');

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  }

  const { data: emails, error } = await query;

  if (error) {
    console.error('Error fetching emails for topics:', error);
    return [];
  }
  if (!emails) return [];

  const topicsMap = new Map<string, ProcessedTopic>();

  emails.forEach((email: Partial<InqEmails>) => {
    const normalized = normalizeSubject(email.email_subject);
    const emailData: TopicEmailData = {
      sentiment_overall: email.sentiment_overall || null,
      funnel_stage: email.funnel_stage || null,
      include_manager: email.include_manager || null,
    };

    if (topicsMap.has(normalized)) {
      const existingTopic = topicsMap.get(normalized)!;
      existingTopic.emailCount++;
      existingTopic.emails.push(emailData);
    } else {
      topicsMap.set(normalized, {
        id: normalized,
        displayName: email.email_subject || "No Subject",
        emailCount: 1,
        emails: [emailData],
      });
    }
  });

  return Array.from(topicsMap.values()).sort((a,b) => b.emailCount - a.emailCount);
}

interface TopicAnalytics {
  topicEmailsForCharts: TopicEmailData[];
  managerInclusionReasons: { name: string; value: number }[];
  postPurchaseInquiryCount: number;
}

export function TopicsDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 6), to: new Date(),
  }));
  const [activePreset, setActivePreset] = useState<string | null>('last7days');
  const [topics, setTopics] = useState<ProcessedTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicAnalytics, setTopicAnalytics] = useState<TopicAnalytics | null>(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

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
    setActivePreset(null);
  };

  useEffect(() => {
    const loadTopics = async () => {
      if (!dateRange?.from) {
          setIsLoadingTopics(false);
          setTopics([]);
          return;
      }
      setIsLoadingTopics(true);
      const fetchedTopics = await fetchAndProcessTopics(dateRange);
      setTopics(fetchedTopics);
      setIsLoadingTopics(false);
      setSelectedTopicId(null);
      setTopicAnalytics(null);
    };
    loadTopics();
  }, [dateRange]);

  useEffect(() => {
    if (selectedTopicId) {
      const currentTopic = topics.find(t => t.id === selectedTopicId);
      if (currentTopic) {
        setIsLoadingAnalytics(true);
        const topicEmailsForCharts = currentTopic.emails;
        const managerReasonsCount = currentTopic.emails.reduce((acc, email) => {
          const reason = email.include_manager || 'unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const managerInclusionReasons = Object.entries(managerReasonsCount)
          .map(([name, value]) => ({ name: name === 'unknown' ? 'N/A / Not Specified' : name, value }))
          .sort((a,b) => b.value - a.value);
        const postPurchaseInquiryCount = currentTopic.emails.filter(
          email => email.funnel_stage === 'retention_feedback'
        ).length;
        setTopicAnalytics({
          topicEmailsForCharts,
          managerInclusionReasons,
          postPurchaseInquiryCount,
        });
        setIsLoadingAnalytics(false);
      }
    } else {
      setTopicAnalytics(null);
    }
  }, [selectedTopicId, topics]);

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Topics Dashboard
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Topics</CardTitle>
            <CardDescription>Normalized email subjects by frequency.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTopics ? (
              <p>Loading topics...</p>
            ) : topics.length === 0 ? (
              <p className="text-muted-foreground">No topics found for the selected period.</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-20rem)]">
                <div className="space-y-2">
                {topics.map(topic => (
                  <Button
                    key={topic.id}
                    variant={selectedTopicId === topic.id ? "default" : "outline"}
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    <div>
                      <p className="font-semibold">{topic.displayName}</p>
                      <p className="text-xs text-muted-foreground">{topic.emailCount} emails</p>
                    </div>
                  </Button>
                ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {!selectedTopicId && (
            <Card className="flex items-center justify-center min-h-[300px]">
              <p className="text-muted-foreground">Select a topic to view its analytics.</p>
            </Card>
          )}
          {isLoadingAnalytics && selectedTopicId && (
            <Card className="flex items-center justify-center min-h-[300px]">
              <p>Loading analytics for "{topics.find(t=>t.id === selectedTopicId)?.displayName || 'selected topic'}"...</p>
            </Card>
          )}
          {!isLoadingAnalytics && selectedTopicId && topicAnalytics && (
            <>
              {topicAnalytics.topicEmailsForCharts && (
                <SentimentOverviewChart
                  emails={topicAnalytics.topicEmailsForCharts as InqEmails[]}
                  isLoading={isLoadingAnalytics}
                />
              )}
              {topicAnalytics.topicEmailsForCharts && (
                <FunnelStageDistributionChart
                  emails={topicAnalytics.topicEmailsForCharts as InqEmails[]}
                  isLoading={isLoadingAnalytics}
                />
              )}
              {topicAnalytics.managerInclusionReasons && (
                <SimplePieChart
                  data={topicAnalytics.managerInclusionReasons}
                  title="Manager Inclusion Reasons"
                  isLoading={isLoadingAnalytics}
                />
              )}
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium flex items-center"><HelpCircle className="mr-2"/>Response Types</CardTitle></CardHeader>
                <CardContent className="h-64 flex items-center justify-center"><Construction className="h-12 w-12 text-muted-foreground" /><p className="ml-2 text-muted-foreground">Chart Coming Soon</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center"><ListChecks className="mr-2"/>Key Questions</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground">Data/Display Coming Soon (requires fetching from inq_key_questions)</p></CardContent>
              </Card>
               <Card>
                <CardHeader><CardTitle className="text-sm font-medium flex items-center"><BarChart className="mr-2"/>Post-Purchase Inquiries</CardTitle></CardHeader>
                <CardContent>
                  {isLoadingAnalytics ? <Skeleton className="h-8 w-1/4" /> : <p className="text-2xl font-bold">{topicAnalytics.postPurchaseInquiryCount}</p>}
                  <p className="text-xs text-muted-foreground">(Example: count of 'retention_feedback' stage)</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
