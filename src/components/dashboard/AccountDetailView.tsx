import React, { useEffect, useState } from 'react';
// DateRange import removed as it's not used in props
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton'; // Single Skeleton import
import type { InqEmails, InqKeyQuestions } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

// Import Chart Components
import { FunnelStageDistributionChart } from './FunnelStageDistributionChart';
import { SimplePieChart } from '@/components/charts/SimplePieChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'; // Legend removed from imports
import { LineChart as LineChartIcon, HelpCircle } from 'lucide-react';

// Import shared functions and types from dashboardUtils
import {
  fetchResponseTypesForEmails,
  processEmailVolume,
  fetchKeyQuestionsForEmailList,
  type ResponseTypeData,
  type VolumeDataPoint
} from '@/lib/dashboardUtils';

interface AccountDetailViewProps {
  selectedAccountId: string | null;
  aggregateEmailsData?: InqEmails[] | null;
  isAggregateView?: boolean;
  isLoadingAggregateEmails?: boolean;
  dateRange?: DateRange; // Keep dateRange as it's used by fetchEmailsForAccount
}

async function fetchEmailsForAccount(accountId: string, dateRange?: DateRange): Promise<InqEmails[]> {
    let query = supabase.from('inq_emails').select('*').eq('email_account_id', accountId);
    if (dateRange?.from && dateRange?.to) {
        const fromDateStr = dateRange.from.toISOString();
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        const toDateStr = toDate.toISOString();
        query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
    } else { return []; }
    query = query.order('received_at', { ascending: false });
    const { data, error } = await query;
    if (error) { console.error(`Error fetching emails for account ${accountId}:`, error); return []; }
    return data || [];
}

export function AccountDetailView({
  selectedAccountId,
  dateRange,
  aggregateEmailsData,
  isAggregateView,
  isLoadingAggregateEmails
}: AccountDetailViewProps) {
  const [accountEmails, setAccountEmails] = useState<InqEmails[]>([]);
  const [isLoadingAccountEmails, setIsLoadingAccountEmails] = useState(false);

  const [responseTypesData, setResponseTypesData] = useState<ResponseTypeData[]>([]);
  const [isLoadingResponseTypes, setIsLoadingResponseTypes] = useState(false);
  const [managerEscalationData, setManagerEscalationData] = useState<ResponseTypeData[]>([]);
  const [volumeTrendData, setVolumeTrendData] = useState<VolumeDataPoint[]>([]);
  const [faqData, setFaqData] = useState<InqKeyQuestions[]>([]);
  const [isLoadingFaq, setIsLoadingFaq] = useState(false);

  useEffect(() => {
    if (!isAggregateView && selectedAccountId && dateRange?.from && dateRange?.to) {
      setIsLoadingAccountEmails(true);
      setResponseTypesData([]); setIsLoadingResponseTypes(false);
      setManagerEscalationData([]); setVolumeTrendData([]); setFaqData([]); setIsLoadingFaq(false);

      fetchEmailsForAccount(selectedAccountId, dateRange)
        .then(emails => {
          setAccountEmails(emails);
          setIsLoadingAccountEmails(false);
        })
        .catch(error => {
          console.error("Failed to load specific account emails:", error);
          setAccountEmails([]);
          setIsLoadingAccountEmails(false);
        });
    } else if (!isAggregateView && !selectedAccountId) {
      setAccountEmails([]);
      setIsLoadingAccountEmails(false);
    }
  }, [selectedAccountId, dateRange, isAggregateView]);

  const emailsToProcess = isAggregateView ? aggregateEmailsData : accountEmails;
  const currentOverallLoadingState = isAggregateView ? isLoadingAggregateEmails : isLoadingAccountEmails;

  useEffect(() => {
    if (emailsToProcess && emailsToProcess.length > 0) {
      const reasonsCount = emailsToProcess.reduce((acc, email) => {
        const reason = email.include_manager;
        if (reason && reason !== 'no_manager_needed') {
          acc[reason] = (acc[reason] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const formattedData = Object.entries(reasonsCount)
        .map(([name, value]) => ({
            name: name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
            value
        }))
        .filter(item => item.value > 0)
        .sort((a,b) => b.value - a.value);
      setManagerEscalationData(formattedData);

      setVolumeTrendData(processEmailVolume(emailsToProcess));

      const emailIds = emailsToProcess.map(e => e.email_id).filter(id => !!id);
      if (emailIds.length > 0) {
        setIsLoadingResponseTypes(true);
        fetchResponseTypesForEmails(emailIds).then(data => { setResponseTypesData(data); setIsLoadingResponseTypes(false); }).catch(() => {setResponseTypesData([]); setIsLoadingResponseTypes(false);});

        setIsLoadingFaq(true);
        fetchKeyQuestionsForEmailList(emailIds).then(data => { setFaqData(data); setIsLoadingFaq(false); }).catch(() => {setFaqData([]); setIsLoadingFaq(false);});
      }
      else {
        setResponseTypesData([]); setIsLoadingResponseTypes(false);
        setFaqData([]); setIsLoadingFaq(false);
      }
    } else {
        setManagerEscalationData([]); setVolumeTrendData([]);
        setResponseTypesData([]); setIsLoadingResponseTypes(false);
        setFaqData([]); setIsLoadingFaq(false);
    }
  }, [emailsToProcess]);

  if (isAggregateView && isLoadingAggregateEmails) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <Card><CardHeader><CardTitle>Loading All Accounts Data...</CardTitle></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
            <Card><CardHeader><CardTitle>Loading All Accounts Data...</CardTitle></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
    );
  }
  if (!isAggregateView && selectedAccountId && isLoadingAccountEmails) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <Card><CardHeader><CardTitle>Loading emails for {selectedAccountId}...</CardTitle></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
            <Card><CardHeader><CardTitle>Loading emails for {selectedAccountId}...</CardTitle></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
    );
  }
  if (!selectedAccountId && !isAggregateView) {
    return <Card className="flex items-center justify-center min-h-[300px] h-full"><p className="text-muted-foreground">No account selected.</p></Card>;
  }
  if (emailsToProcess && emailsToProcess.length === 0 && !currentOverallLoadingState) {
     return <Card className="flex items-center justify-center min-h-[300px] h-full"><p className="text-muted-foreground">No emails found for {isAggregateView ? 'any account' : `account "${selectedAccountId}"`} in the selected period.</p></Card>;
  }

  const viewTitle = isAggregateView ? "All Inbound Accounts" : selectedAccountId;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-medium">Volume Trend</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                    {viewTitle === "All Inbound Accounts" ? "All Inbound Accounts (Aggregated)" : `Account: ${viewTitle}`}
                </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
                {currentOverallLoadingState ? <Skeleton className="h-full w-full" /> : volumeTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={volumeTrendData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} angle={-30} textAnchor="end" height={50}/>
                            <YAxis allowDecimals={false} />
                            <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
                            {/* <Legend /> */} {/* REMOVED */}
                            <Line type="monotone" dataKey="count" name="Emails" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : ( <div className="h-full flex items-center justify-center"><LineChartIcon className="h-12 w-12 text-muted-foreground" /><p className="ml-2 text-muted-foreground">No volume data.</p></div> )}
            </CardContent>
        </Card>
        <FunnelStageDistributionChart emails={emailsToProcess || []} isLoading={currentOverallLoadingState || false} />
        <SimplePieChart title="Response Types" data={responseTypesData} isLoading={isLoadingResponseTypes} />
        <SimplePieChart data={managerEscalationData} title="Manager Escalation Status" isLoading={currentOverallLoadingState || false} />
      </div>
      <Card>
            <CardHeader>
                <CardTitle className="text-sm font-medium">Frequently Asked Questions</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Common questions from emails for this {isAggregateView ? 'set of accounts' : 'account'}.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
                {isLoadingFaq ? (
                    <div className="space-y-2 p-2"><Skeleton className="h-8 w-full rounded-md" /><Skeleton className="h-8 w-full rounded-md" /><Skeleton className="h-8 w-full rounded-md" /></div>
                ) : faqData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center"><HelpCircle className="h-12 w-12 text-muted-foreground mb-2" /><p className="ml-2 text-muted-foreground text-sm">No key questions found.</p></div>
                ) : (
                    <ScrollArea className="h-full pr-3">
                        <ul className="space-y-2 text-xs">
                            {faqData.map(q => ( <li key={q.question_id} className="p-2 border rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">{q.question_text}{typeof q.confidence_score === 'number' && (<span className="text-gray-500 ml-2 text-[10px]">({(q.confidence_score * 100).toFixed(0)}%)</span>)}</li> ))}
                        </ul>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

export default AccountDetailView;
