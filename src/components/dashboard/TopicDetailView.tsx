import React, { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SentimentOverviewChart } from './SentimentOverviewChart';
import { FunnelStageDistributionChart } from './FunnelStageDistributionChart';
import { SimplePieChart } from '@/components/charts/SimplePieChart';
import type { ProcessedTopic } from '@/pages/UnifiedDashboardPage';
import type { InqEmails, InqKeyQuestions } from '@/integrations/supabase/types'; // InqResponses no longer needed directly here
// import { supabase } from '@/integrations/supabase/client'; // No longer needed if all DB access is in utils
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon, HelpCircle } from 'lucide-react';

// Import shared functions and types from dashboardUtils
import {
  fetchResponseTypesForEmails,
  processEmailVolume,
  fetchKeyQuestionsForEmailList,
  type ResponseTypeData,
  type VolumeDataPoint
} from '@/lib/dashboardUtils';

interface TopicDetailViewProps {
  selectedTopic: ProcessedTopic | null;
  dateRange?: DateRange;
}

// Local helper functions are now removed and imported from dashboardUtils

export function TopicDetailView({ selectedTopic, dateRange }: TopicDetailViewProps) {
  const [responseTypesData, setResponseTypesData] = useState<ResponseTypeData[]>([]);
  const [isLoadingResponseTypes, setIsLoadingResponseTypes] = useState(false);
  const [managerEscalationData, setManagerEscalationData] = useState<ResponseTypeData[]>([]);
  const [volumeTrendData, setVolumeTrendData] = useState<VolumeDataPoint[]>([]);
  const [faqData, setFaqData] = useState<InqKeyQuestions[]>([]);
  const [isLoadingFaq, setIsLoadingFaq] = useState(false);

  useEffect(() => {
    if (selectedTopic?.emails) {
      const reasonsCount = selectedTopic.emails.reduce((acc, email) => {
        let reason = 'Not Escalated';
        if (email.include_manager === true || String(email.include_manager).toLowerCase() === 'true') {
            reason = 'Escalated (General)';
        } else if (email.include_manager === 'escalated_by_agent') {
            reason = 'Escalated by Agent';
        } else if (email.include_manager === 'escalated_by_customer') {
            reason = 'Escalated by Customer';
        }
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const formattedData = Object.entries(reasonsCount).map(([name, value]) => ({ name, value })).filter(item => item.value > 0).sort((a,b) => b.value - a.value);
      setManagerEscalationData(formattedData);
    } else { setManagerEscalationData([]); }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic?.emails && selectedTopic.emails.length > 0) {
      // ProcessedTopic.emails now contains email_id due to previous changes in UnifiedDashboardPage
      const emailIdsWithId = selectedTopic.emails.map(e => e.email_id).filter(id => !!id);
      if (emailIdsWithId.length > 0) {
        setIsLoadingResponseTypes(true);
        fetchResponseTypesForEmails(emailIdsWithId).then(data => { setResponseTypesData(data); setIsLoadingResponseTypes(false); })
        .catch(() => {
            setResponseTypesData([]);
            setIsLoadingResponseTypes(false);
        });
      } else { setResponseTypesData([]); setIsLoadingResponseTypes(false); }
    } else { setResponseTypesData([]); setIsLoadingResponseTypes(false); }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic?.emails) {
      // Use imported processEmailVolume, ProcessedTopic.emails has received_at
      setVolumeTrendData(processEmailVolume(selectedTopic.emails));
    } else { setVolumeTrendData([]); }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic?.emails && selectedTopic.emails.length > 0) {
      const emailIdsWithId = selectedTopic.emails.map(e => e.email_id).filter(id => !!id);
      if (emailIdsWithId.length > 0) {
        setIsLoadingFaq(true);
        fetchKeyQuestionsForEmailList(emailIdsWithId)
          .then(data => {
            setFaqData(data);
            setIsLoadingFaq(false);
          })
          .catch(() => {
            setFaqData([]);
            setIsLoadingFaq(false);
          });
      } else {
        setFaqData([]);
        setIsLoadingFaq(false);
      }
    } else {
      setFaqData([]);
      setIsLoadingFaq(false);
    }
  }, [selectedTopic]);


  if (!selectedTopic) {
    return <Card className="flex items-center justify-center min-h-[300px] h-full"><p className="text-muted-foreground">No topic data available.</p></Card>;
  }
  // Casting to InqEmails[] might still be needed if charts expect full InqEmails type and ProcessedTopic.emails is a Pick<...>
  // However, specific charts use specific fields which are now included in the Pick.
  const topicEmailsForCharts = selectedTopic.emails as InqEmails[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="space-y-6">
        <SentimentOverviewChart emails={topicEmailsForCharts} isLoading={false} />
        <FunnelStageDistributionChart emails={topicEmailsForCharts} isLoading={false} />
        <SimplePieChart title="Response Types" data={responseTypesData} isLoading={isLoadingResponseTypes} />
      </div>

      <div className="space-y-6">
         <SimplePieChart data={managerEscalationData} title="Manager Escalation Status" isLoading={false} />
         <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Volume Trend for "{selectedTopic.displayName}"</CardTitle></CardHeader>
            <CardContent className="h-64">
                {volumeTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={volumeTrendData} margin={{ top: 5, right: 20, bottom: 50, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(tick) => new Date(tick + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                angle={-45}
                                textAnchor="end"
                                interval={Math.max(0, Math.floor(volumeTrendData.length / 10) -1)}
                                height={60}
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip labelFormatter={(label) => new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
                            <Legend />
                            <Line type="monotone" dataKey="count" name="Emails" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : ( <div className="h-full flex flex-col items-center justify-center"><LineChartIcon className="h-12 w-12 text-muted-foreground mb-2" /><p className="ml-2 text-muted-foreground text-sm">No volume data for this topic.</p></div> )}
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-medium">Frequently Asked Questions</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Common questions from emails in this topic (top 10 by confidence).</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
                {isLoadingFaq ? (
                    <div className="space-y-2 p-2">
                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
                    </div>
                ) : faqData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center">
                        <HelpCircle className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground text-sm">No key questions found for this topic.</p>
                    </div>
                ) : (
                    <ScrollArea className="h-full pr-3">
                        <ul className="space-y-2 text-xs">
                            {faqData.map(q => (
                                <li key={q.question_id} className="p-2 border rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                                    {q.question_text}
                                    {typeof q.confidence_score === 'number' && (
                                        <span className="text-gray-500 ml-2 text-[10px]">({(q.confidence_score * 100).toFixed(0)}%)</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TopicDetailView;
