import React, { useState, useEffect, useCallback } from 'react';
import { type DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { KpiRow } from '@/components/dashboard/KpiRow';
import { supabase } from '@/integrations/supabase/client';
import type { InqCustomers, InqEmails, InqKeyQuestions } from '@/integrations/supabase/types';
import { SelectionColumn, type SelectionType } from '@/components/dashboard/SelectionColumn';
import { CustomerDetailView } from '@/components/dashboard/CustomerDetailView';
import { TopicDetailView } from '@/components/dashboard/TopicDetailView'; // Import new component
import { Card, CardContent } from '@/components/ui/card';

// Local ProcessedTopic interface (ensure it matches what fetchAndProcessTopics returns)
export interface ProcessedTopic {
  id: string;
  displayName: string;
  emailCount: number;
  emails: Pick<InqEmails, 'sentiment_overall' | 'funnel_stage' | 'include_manager'>[];
}

interface InboundAccount {
  id: string;
  name: string;
  count: number;
}

async function fetchCustomers(): Promise<InqCustomers[]> {
  const { data, error } = await supabase.from('inq_customers').select('*').order('name', { ascending: true });
  if (error) { console.error('Error fetching customers:', error); return []; }
  return data || [];
}

function normalizeSubject(subject: string | null): string {
  if (!subject) return "No Subject";
  return subject.toLowerCase().replace(/^(re:|fw:|fwd:)\s*/i, '').replace(/[\[\(]?msg:\s*\d+[\]\)]?/i, '').replace(/\s+/g, ' ').trim() || "No Subject";
}

async function fetchAndProcessTopics(dateRange?: DateRange): Promise<ProcessedTopic[]> {
  let query = supabase.from('inq_emails').select('email_subject, sentiment_overall, funnel_stage, include_manager, received_at');
  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  } else { return []; }
  const { data: emails, error } = await query;
  if (error) { console.error('Error fetching emails for topics:', error); return []; }
  if (!emails) return [];
  const topicsMap = new Map<string, ProcessedTopic>();
  emails.forEach((email: Partial<InqEmails>) => {
    const normalized = normalizeSubject(email.email_subject);
    const emailData = { sentiment_overall: email.sentiment_overall || null, funnel_stage: email.funnel_stage || null, include_manager: email.include_manager || null };
    if (topicsMap.has(normalized)) {
      const existingTopic = topicsMap.get(normalized)!;
      existingTopic.emailCount++; existingTopic.emails.push(emailData);
    } else {
      topicsMap.set(normalized, { id: normalized, displayName: email.email_subject || "No Subject", emailCount: 1, emails: [emailData] });
    }
  });
  return Array.from(topicsMap.values()).sort((a,b) => b.emailCount - a.emailCount);
}

async function fetchInboundAccounts(dateRange?: DateRange): Promise<InboundAccount[]> {
  let query = supabase.from('inq_emails').select('email_account_id, received_at');
  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  } else { return []; }
  query = query.not('email_account_id', 'is', null);
  const { data: emails, error } = await query;
  if (error) { console.error('Error fetching emails for inbound accounts:', error); return []; }
  if (!emails) return [];
  const accountsMap = new Map<string, number>();
  emails.forEach(email => {
    if (email.email_account_id) {
      accountsMap.set(email.email_account_id, (accountsMap.get(email.email_account_id) || 0) + 1);
    }
  });
  return Array.from(accountsMap.entries()).map(([id, count]) => ({ id, name: id, count })).sort((a,b) => b.count - a.count);
}

async function fetchEmailById(emailId: string): Promise<InqEmails | null> {
    const { data, error } = await supabase.from('inq_emails').select('*').eq('email_id', emailId).single();
    if (error) { console.error(`Error fetching email ${emailId}:`, error); return null; }
    return data;
}

async function fetchKeyQuestionsForEmail(emailId: string): Promise<InqKeyQuestions[]> {
    const { data, error } = await supabase.from('inq_key_questions').select('*').eq('email_id', emailId).order('created_at', { ascending: true });
    if (error) { console.error(`Error fetching key questions for email ${emailId}:`, error); return []; }
    return data || [];
}

export function UnifiedDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({ from: subDays(new Date(), 6), to: new Date() }));
  const [activePreset, setActivePreset] = useState<string | null>('last7days');

  const [activeSelectionType, setActiveSelectionType] = useState<SelectionType>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [topicSearchTerm, setTopicSearchTerm] = useState("");
  const [accountSearchTerm, setAccountSearchTerm] = useState("");

  const [customers, setCustomers] = useState<InqCustomers[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [topics, setTopics] = useState<ProcessedTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [accounts, setAccounts] = useState<InboundAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [emailDetails, setEmailDetails] = useState<InqEmails | null>(null);
  const [isLoadingEmailDetails, setIsLoadingEmailDetails] = useState(false);
  const [keyQuestions, setKeyQuestions] = useState<InqKeyQuestions[]>([]);
  const [isLoadingKeyQuestions, setIsLoadingKeyQuestions] = useState(false);

  const handleSetPresetRange = (preset: 'last7days' | 'last30days') => {
    const today = new Date();
    setDateRange({ from: subDays(today, preset === 'last7days' ? 6 : 29), to: today });
    setActivePreset(preset);
  };
  const handleCustomDateChange = (newRange?: DateRange) => { setDateRange(newRange); setActivePreset(null); };

  const handleSelectionTypeChange = (type: SelectionType) => {
    setActiveSelectionType(type);
    setSelectedCustomerId(null); setSelectedTopicId(null); setSelectedAccountId(null);
    setSelectedEmailId(null);
  };
  const handleCustomerSelect = (customerId: string | null) => {
    setSelectedCustomerId(customerId); setSelectedEmailId(null);
    if (customerId) setActiveSelectionType('customer'); else if (activeSelectionType === 'customer') setActiveSelectionType(null);
  };
  const handleTopicSelect = (topicId: string | null) => {
    setSelectedTopicId(topicId);
    if (topicId) setActiveSelectionType('topic'); else if (activeSelectionType === 'topic') setActiveSelectionType(null);
  };
  const handleAccountSelect = (accountId: string | null) => {
    setSelectedAccountId(accountId);
    if (accountId) setActiveSelectionType('account'); else if (activeSelectionType === 'account') setActiveSelectionType(null);
  };

  const handleEmailSelect = (emailId: string | null) => {
    setSelectedEmailId(emailId);
    if (!emailId) { setEmailDetails(null); setKeyQuestions([]); }
  };

  useEffect(() => {
    setIsLoadingCustomers(true);
    fetchCustomers().then(data => { setCustomers(data); setIsLoadingCustomers(false); })
    .catch(error => { console.error("Failed to load customers", error); setCustomers([]); setIsLoadingCustomers(false); });
  }, []);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      setIsLoadingTopics(true);
      fetchAndProcessTopics(dateRange).then(data => { setTopics(data); setIsLoadingTopics(false); })
      .catch(error => { console.error("Failed to load topics", error); setTopics([]); setIsLoadingTopics(false); });
    } else { setTopics([]); setIsLoadingTopics(false); }
  }, [dateRange]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      setIsLoadingAccounts(true);
      fetchInboundAccounts(dateRange).then(data => { setAccounts(data); setIsLoadingAccounts(false); })
      .catch(error => { console.error("Failed to load inbound accounts", error); setAccounts([]); setIsLoadingAccounts(false); });
    } else { setAccounts([]); setIsLoadingAccounts(false); }
  }, [dateRange]);

  useEffect(() => {
    if (selectedEmailId) {
      setIsLoadingEmailDetails(true); setIsLoadingKeyQuestions(true);
      Promise.all([ fetchEmailById(selectedEmailId), fetchKeyQuestionsForEmail(selectedEmailId) ])
      .then(([emailData, questionsData]) => {
        setEmailDetails(emailData); setIsLoadingEmailDetails(false);
        setKeyQuestions(questionsData); setIsLoadingKeyQuestions(false);
      }).catch(error => {
        console.error("Error fetching email details or key questions:", error);
        setEmailDetails(null); setKeyQuestions([]);
        setIsLoadingEmailDetails(false); setIsLoadingKeyQuestions(false);
      });
    }
  }, [selectedEmailId]);

  const filteredCustomers = customers.filter(c => (c.name?.toLowerCase() || c.email?.toLowerCase() || '').includes(customerSearchTerm.toLowerCase()));
  const filteredTopics = topics.filter(t => (t.displayName?.toLowerCase() || '').includes(topicSearchTerm.toLowerCase()));
  const filteredAccounts = accounts.filter(a => (a.name?.toLowerCase() || '').includes(accountSearchTerm.toLowerCase()));

  const selectedCustomerObject = customers.find(c => c.customer_id === selectedCustomerId) || null;
  const selectedTopicObject = topics.find(t => t.id === selectedTopicId) || null;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 mb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Unified Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={activePreset === 'last7days' ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetRange('last7days')}>Last 7 days</Button>
          <Button variant={activePreset === 'last30days' ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetRange('last30days')}>Last 30 days</Button>
          <DateRangePicker dateRange={dateRange} onDateChange={handleCustomDateChange} className="text-sm"/>
        </div>
      </header>

      <KpiRow dateRange={dateRange} />

      <main className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 lg:col-span-3 space-y-4">
          <SelectionColumn
            dateRange={dateRange} activeSelectionType={activeSelectionType} onSelectionTypeChange={handleSelectionTypeChange}
            customers={filteredCustomers} isLoadingCustomers={isLoadingCustomers} selectedCustomerId={selectedCustomerId} onCustomerSelect={handleCustomerSelect} customerSearchTerm={customerSearchTerm} onCustomerSearchChange={setCustomerSearchTerm}
            topics={filteredTopics} isLoadingTopics={isLoadingTopics} selectedTopicId={selectedTopicId} onTopicSelect={handleTopicSelect} topicSearchTerm={topicSearchTerm} onTopicSearchChange={setTopicSearchTerm}
            accounts={filteredAccounts} isLoadingAccounts={isLoadingAccounts} selectedAccountId={selectedAccountId} onAccountSelect={handleAccountSelect} accountSearchTerm={accountSearchTerm} onAccountSearchChange={setAccountSearchTerm}
          />
        </div>

        <div className="md:col-span-8 lg:col-span-9">
          {activeSelectionType === 'customer' && selectedCustomerId && selectedCustomerObject ? (
            <CustomerDetailView
              selectedCustomerId={selectedCustomerId}
              selectedCustomerDetails={selectedCustomerObject}
              dateRange={dateRange}
              selectedEmailId={selectedEmailId}
              onEmailSelect={handleEmailSelect}
              emailDetails={emailDetails}
              isLoadingEmailDetails={isLoadingEmailDetails}
              keyQuestions={keyQuestions}
              isLoadingKeyQuestions={isLoadingKeyQuestions}
            />
          ) : activeSelectionType === 'topic' && selectedTopicId && selectedTopicObject ? (
            <TopicDetailView
              selectedTopic={selectedTopicObject}
              dateRange={dateRange} // Pass dateRange if TopicDetailView might use it
            />
          ) : activeSelectionType === 'account' && selectedAccountId ? (
            <Card className="h-full"><CardContent className="p-4 flex items-center justify-center min-h-[300px]"><p>Account Detail View for: <strong>{selectedAccountId}</strong> (Placeholder)</p></CardContent></Card>
          ) : (
            <Card className="flex items-center justify-center min-h-[300px] h-full">
              <p className="text-muted-foreground">Select an item from the left panel to see details.</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

export default UnifiedDashboardPage;
