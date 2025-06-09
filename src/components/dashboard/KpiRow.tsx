import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ThumbsUp, Users, ShieldAlert, HelpCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRange } from 'react-day-picker';
import type { SupabaseClient } from '@supabase/supabase-js';

interface KpiRowProps {
  dateRange?: DateRange;
  userEmailAccountIds: string[] | null;
}

async function fetchTotalEmailsProcessedCount(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<number> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) return 0;
  let query = supabase
    .from('inq_emails')
    .in('email_account_id', userEmailAccountIds)
    .select('*', { count: 'exact', head: true });

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  }

  const { count, error } = await query;
  if (error) {
    console.error('Error fetching total emails processed count:', error);
    return 0;
  }
  return count || 0;
}

async function fetchAverageConfidenceScore(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null, supabaseClient: SupabaseClient): Promise<number | null> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) return null;

  const { data: emailData, error: emailError } = await supabaseClient
    .from('inq_emails')
    .select('email_id')
    .in('email_account_id', userEmailAccountIds);

  if (emailError || !emailData || emailData.length === 0) {
    console.error('Error fetching email_ids for confidence score or no emails found:', emailError);
    return null;
  }
  const emailIds = emailData.map(e => e.email_id);
  if (emailIds.length === 0) return null;

  let query = supabaseClient
    .from('inq_responses')
    .select('confidence_score')
    .in('email_id', emailIds); // Filter by fetched email_ids

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    // Assuming inq_responses also has a timestamp like created_at related to the dateRange
    // If not, this part of the query might need adjustment or removal if filtering by email_id is sufficient
    query = query.gte('created_at', fromDateStr).lte('created_at', toDateStr);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching confidence scores:', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  const validScores = data.map(item => item.confidence_score).filter(score => typeof score === 'number') as number[];
  if (validScores.length === 0) return null;
  const sum = validScores.reduce((acc, score) => acc + score, 0);
  return sum / validScores.length;
}

async function fetchActiveAgentsCount(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<number> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) return 0;
  if (!dateRange?.from || !dateRange?.to) return 0;

  const fromDateStr = dateRange.from.toISOString();
  const toDate = new Date(dateRange.to);
  toDate.setHours(23, 59, 59, 999);
  const toDateStr = toDate.toISOString();

  // The query above with { count: 'exact' } on a select might not give distinct count.
  // Fetching distinct values and counting them client-side for simplicity here.
  // For performance on large datasets, a distinct count on the DB is better.
  const { data: distinctData, error: distinctError } = await supabase
    .from('inq_emails')
    .select('email_account_id')
    .in('email_account_id', userEmailAccountIds) // Added filter
    .not('email_account_id', 'is', null)
    .gte('received_at', fromDateStr)
    .lte('received_at', toDateStr);

  if (distinctError) {
    console.error('Error fetching active agents data:', distinctError);
    return 0;
  }
  if (!distinctData) return 0;
  const distinctAgentIds = new Set(distinctData.map(item => item.email_account_id));
  return distinctAgentIds.size;
}

async function fetchManagerEscalationsCount(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<number> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) return 0;
  // Define the conditions for an escalation.
  let query = supabase
    .from('inq_emails')
    .select('*', { count: 'exact', head: false }) // Using count exact, no head
    .in('email_account_id', userEmailAccountIds) // Added filter
    .not('include_manager', 'eq', 'no_manager_needed') // Exclude 'no_manager_needed'
    .not('include_manager', 'is', null); // Exclude nulls

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error fetching manager escalations count:', error);
    return 0;
  }
  return count || 0;
}


export function KpiRow({ dateRange, userEmailAccountIds }: KpiRowProps) {
  const [totalEmails, setTotalEmails] = useState<number | null>(null);
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [activeAgents, setActiveAgents] = useState<number | null>(null);
  const [managerEscalations, setManagerEscalations] = useState<number | null>(null);

  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingConfidence, setLoadingConfidence] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingEscalations, setLoadingEscalations] = useState(true);

  useEffect(() => {
    const loadKpis = async () => {
      // Ensure all necessary data is present before fetching
      if (!dateRange?.from || !dateRange?.to || !userEmailAccountIds) {
        setTotalEmails(null);
        setAvgConfidence(null);
        setActiveAgents(null);
        setManagerEscalations(null);
        setLoadingEmails(false);
        setLoadingConfidence(false);
        setLoadingAgents(false);
        setLoadingEscalations(false);
        return;
      }
      // If userEmailAccountIds is an empty array, the fetch functions will handle returning 0 or null.

      setLoadingEmails(true);
      setLoadingConfidence(true);
      setLoadingAgents(true);
      setLoadingEscalations(true);

      const [
        emailsCount,
        confidenceScore,
        agentsCount,
        escalationsCount
      ] = await Promise.all([
        fetchTotalEmailsProcessedCount(dateRange, userEmailAccountIds),
        fetchAverageConfidenceScore(dateRange, userEmailAccountIds, supabase), // pass supabase
        fetchActiveAgentsCount(dateRange, userEmailAccountIds),
        fetchManagerEscalationsCount(dateRange, userEmailAccountIds)
      ]);

      setTotalEmails(emailsCount);
      setLoadingEmails(false);
      setAvgConfidence(confidenceScore);
      setLoadingConfidence(false);
      setActiveAgents(agentsCount);
      setLoadingAgents(false);
      setManagerEscalations(escalationsCount);
      setLoadingEscalations(false);
    };
    loadKpis();
  }, [dateRange, userEmailAccountIds]); // Add userEmailAccountIds

  const isLoading = loadingEmails || loadingConfidence || loadingAgents || loadingEscalations;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Emails Processed</CardTitle>
          <Mail className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loadingEmails ? <Skeleton className="h-8 w-1/2 mt-1" /> : (
            <div className="text-2xl font-bold">
              {totalEmails !== null ? totalEmails.toLocaleString() : 'N/A'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
          <ThumbsUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loadingConfidence ? <Skeleton className="h-8 w-1/2 mt-1" /> : (
            <div className="text-2xl font-bold">
              {avgConfidence !== null ? `${(avgConfidence * 100).toFixed(1)}%` : 'N/A'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loadingAgents ? <Skeleton className="h-8 w-1/2 mt-1" /> : (
            <div className="text-2xl font-bold">
              {activeAgents !== null ? activeAgents.toLocaleString() : 'N/A'}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Unique agents in period</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Manager Escalations</CardTitle>
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loadingEscalations ? <Skeleton className="h-8 w-1/2 mt-1" /> : (
            <div className="text-2xl font-bold">
              {managerEscalations !== null ? managerEscalations.toLocaleString() : 'N/A'}
            </div>
          )}
           <p className="text-xs text-muted-foreground">Emails flagged for manager</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default KpiRow;
