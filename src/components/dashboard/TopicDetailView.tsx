import React, { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SentimentOverviewChart } from './SentimentOverviewChart';
import { FunnelStageDistributionChart } from './FunnelStageDistributionChart';
import { SimplePieChart } from '@/components/charts/SimplePieChart';
import type { ProcessedTopic } from '@/pages/UnifiedDashboardPage';
import type { InqEmails, InqResponses, InqKeyQuestions } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

interface TopicDetailViewProps {
  selectedTopic: ProcessedTopic | null;
  dateRange?: DateRange;
}

interface ResponseTypeData { name: string; value: number; }
interface VolumeDataPoint { date: string; count: number; }

// Function to fetch and process response types for a list of email IDs
async function fetchResponseTypesForEmails(emailIds: string[]): Promise<ResponseTypeData[]> {
  if (!emailIds || emailIds.length === 0) {
    return [];
  }
  const { data: responses, error } = await supabase
    .from('inq_responses')
    .select('response_type')
    .in('email_id', emailIds);

  if (error) {
    console.error('Error fetching responses for email IDs:', error);
    return [];
  }
  if (!responses) return [];

  const counts = responses.reduce((acc, response) => {
    const type = response.response_type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a,b) => b.value - a.value);
}


export function TopicDetailView({ selectedTopic, dateRange }: TopicDetailViewProps) {
  const [responseTypesData, setResponseTypesData] = useState<ResponseTypeData[]>([]);
  const [isLoadingResponseTypes, setIsLoadingResponseTypes] = useState(false);

  const [managerEscalationData, setManagerEscalationData] = useState<ResponseTypeData[]>([]);

  const [volumeTrendData, setVolumeTrendData] = useState<VolumeDataPoint[]>([]);
  const [isLoadingVolumeTrend, setIsLoadingVolumeTrend] = useState(false);

  const [faqData, setFaqData] = useState<InqKeyQuestions[]>([]);
  const [isLoadingFaq, setIsLoadingFaq] = useState(false);

  // Effect for Manager Escalation Reasons
  useEffect(() => {
    if (selectedTopic?.emails) {
      const reasonsCount = selectedTopic.emails.reduce((acc, email) => {
        let reason = 'Not Escalated'; // Default
        // Check the type and value of include_manager
        if (email.include_manager === true || email.include_manager === 'true') {
            reason = 'Escalated (General)';
        } else if (typeof email.include_manager === 'string' && email.include_manager.startsWith('escalated_by_')) {
            // Handles 'escalated_by_agent' and 'escalated_by_customer'
            reason = email.include_manager.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').replace('By ', 'by ');
        }
        // null, false, 'false', or other values will remain 'Not Escalated' implicitly or explicitly

        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const formattedData = Object.entries(reasonsCount)
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0)
        .sort((a,b) => b.value - a.value);
      setManagerEscalationData(formattedData);
    } else {
      setManagerEscalationData([]);
    }
  }, [selectedTopic]);

  // Effect for Response Types
  useEffect(() => {
    if (selectedTopic?.emails && selectedTopic.emails.length > 0) {
      // Attempt to access email_id. This relies on ProcessedTopic.emails elements actually having email_id.
      // If ProcessedTopic.emails elements are Pick<InqEmails, ...> and don't include 'email_id', this will fail.
      const emailIdsWithId = selectedTopic.emails
        .map(e => (e as any).email_id) // Cast to any to try to access email_id. Unsafe, but for current structure.
        .filter(id => !!id) as string[];

      if (emailIdsWithId.length > 0) {
        setIsLoadingResponseTypes(true);
        fetchResponseTypesForEmails(emailIdsWithId)
          .then(data => {
            setResponseTypesData(data);
            setIsLoadingResponseTypes(false);
          })
          .catch(() => {
            setResponseTypesData([]); // Clear data on error
            setIsLoadingResponseTypes(false);
          });
      } else {
        // console.warn("Response Types chart: No email_ids found in selectedTopic.emails. Consider updating ProcessedTopic definition in UnifiedDashboardPage.");
        setResponseTypesData([]);
        setIsLoadingResponseTypes(false);
      }
    } else {
      setResponseTypesData([]);
      setIsLoadingResponseTypes(false);
    }
  }, [selectedTopic]);


  if (!selectedTopic) {
    return (
      <Card className="flex items-center justify-center min-h-[300px] h-full">
        <p className="text-muted-foreground">No topic data available. Select a topic to view details.</p>
      </Card>
    );
  }

  const topicEmailsForCharts = selectedTopic.emails as InqEmails[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* Column 1 of TopicDetailView (Page Column 2) */}
      <div className="space-y-6">
        <SentimentOverviewChart emails={topicEmailsForCharts} isLoading={false} />
        <FunnelStageDistributionChart emails={topicEmailsForCharts} isLoading={false} />
        <SimplePieChart
            title="Response Types"
            data={responseTypesData}
            isLoading={isLoadingResponseTypes}
        />
      </div>

      {/* Column 2 of TopicDetailView (Page Column 3) */}
      <div className="space-y-6">
         <SimplePieChart
            data={managerEscalationData}
            title="Manager Escalation Status"
            isLoading={false}
          />
        <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Volume Trend</CardTitle></CardHeader>
            <CardContent className="h-64">
                <p className="text-muted-foreground text-center pt-10">Volume Trend Chart Coming Soon</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle className="text-sm font-medium">FAQ / Key Questions</CardTitle></CardHeader>
            <CardContent className="h-64">
                <p className="text-muted-foreground text-center pt-10">FAQ/Key Questions Coming Soon</p>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TopicDetailView;
