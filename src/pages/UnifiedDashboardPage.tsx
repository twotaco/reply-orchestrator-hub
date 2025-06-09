import React, { useState, useEffect, useCallback } from 'react';
import { type DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { KpiRow } from '@/components/dashboard/KpiRow';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserEmailAccountIds } from '@/lib/userUtils';
import type { InqCustomers, InqEmails, InqKeyQuestions, InqResponses } from '@/integrations/supabase/types';
import { SelectionColumn, type SelectionType } from '@/components/dashboard/SelectionColumn';
import { CustomerDetailView } from '@/components/dashboard/CustomerDetailView';
import { TopicDetailView } from '@/components/dashboard/TopicDetailView';
import { AccountDetailView } from '@/components/dashboard/AccountDetailView';
import { Card, CardContent } from '@/components/ui/card';

export interface ProcessedTopic {
  id: string;
  displayName: string;
  emailCount: number;
  emails: Pick<InqEmails, 'email_id' | 'sentiment_overall' | 'funnel_stage' | 'include_manager' | 'received_at'>[];
}

// Updated InboundAccount interface
interface InboundAccount {
  id: string;    // This will be agent_email_mappings.id (which is inq_emails.email_account_id)
  name: string;  // This will be agent_email_mappings.email_address
  count: number;
}

async function fetchCustomers(userEmailAccountIds: string[] | null): Promise<InqCustomers[]> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) {
    return [];
  }

  // Step 1: Query inq_emails to get a distinct list of customer_id's
  const { data: emailData, error: emailError } = await supabase
    .from('inq_emails')
    .select('customer_id')
    .in('email_account_id', userEmailAccountIds)
    .not('customer_id', 'is', null);

  if (emailError) {
    console.error('Error fetching customer_ids from inq_emails:', emailError);
    return [];
  }
  if (!emailData || emailData.length === 0) {
    return [];
  }

  // Extract unique customer_id's
  const customerIds = [...new Set(emailData.map(e => e.customer_id))].filter(id => id !== null);

  if (customerIds.length === 0) {
    return [];
  }

  // Step 2: Fetch customers
  const { data, error } = await supabase
    .from('inq_customers')
    .select('*')
    .in('customer_id', customerIds)
    .order('name', { ascending: true });

  if (error) { console.error('Error fetching customers:', error); return []; }
  return data || [];
}

// Add these missing functions:
async function fetchEmailById(emailId: string): Promise<InqEmails | null> {
  const { data, error } = await supabase
    .from('inq_emails')
    .select('*')
    .eq('email_id', emailId)
    .single();
  if (error) {
    console.error(`Error fetching email ${emailId}:`, error);
    // Potentially return a more specific error or throw,
    // but for now, null indicates failure or not found.
    return null;
  }
  return data;
}

async function fetchKeyQuestionsForEmail(emailId: string): Promise<InqKeyQuestions[]> {
  const { data, error } = await supabase
    .from('inq_key_questions')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(`Error fetching key questions for email ${emailId}:`, error);
    return [];
  }
  return data || [];
}

function normalizeSubject(subject: string | null): string {
  if (!subject) return "No Subject";
  return subject.toLowerCase().replace(/^(re:|fw:|fwd:)\s*/i, '').replace(/[\[\(]?msg:\s*\d+[\]\)]?/i, '').replace(/\s+/g, ' ').trim() || "No Subject";
}

async function fetchAndProcessTopics(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<ProcessedTopic[]> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) {
    return [];
  }
  let query = supabase.from('inq_emails').select('email_id, email_subject, sentiment_overall, funnel_stage, include_manager, received_at');
  if (dateRange?.from && dateRange?.to) {
    query = query.in('email_account_id', userEmailAccountIds); // Added filter
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
  emails.forEach((email: Pick<InqEmails, 'email_id' | 'email_subject' | 'sentiment_overall' | 'funnel_stage' | 'include_manager' | 'received_at'>) => {
    const normalized = normalizeSubject(email.email_subject);
    const emailData = { email_id: email.email_id, sentiment_overall: email.sentiment_overall || null, funnel_stage: email.funnel_stage || null, include_manager: email.include_manager || null, received_at: email.received_at, };
    if (topicsMap.has(normalized)) {
      const existingTopic = topicsMap.get(normalized)!;
      existingTopic.emailCount++; existingTopic.emails.push(emailData);
    } else {
      topicsMap.set(normalized, { id: normalized, displayName: email.email_subject || "No Subject", emailCount: 1, emails: [emailData] });
    }
  });
  return Array.from(topicsMap.values()).sort((a,b) => b.emailCount - a.emailCount);
}

// Updated fetchInboundAccounts function
async function fetchInboundAccounts(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<InboundAccount[]> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) {
    return [];
  }

  let emailQuery = supabase
    .from('inq_emails')
    .select(`
      email_account_id,
      received_at,
      agent_email_mappings ( id, email_address )
    `)
    .in('email_account_id', userEmailAccountIds) // Added filter
    .not('email_account_id', 'is', null);
    // Removed .not('agent_email_mappings', 'is', null') for now to see all results from inq_emails initially for debugging.
    // We will filter client-side if agent_email_mappings is null.

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    emailQuery = emailQuery.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  } else {
    // console.warn("[fetchInboundAccounts] Date range is required."); // REMOVED
    return [];
  }

  const { data: emails, error } = await emailQuery;

  if (error) {
    console.error('[fetchInboundAccounts] Error fetching emails for inbound accounts:', error); // Kept this error log
    return [];
  }

  // console.log('[fetchInboundAccounts] Raw emails data from Supabase:', emails); // REMOVED

  if (!emails || emails.length === 0) {
    // console.log('[fetchInboundAccounts] No emails found after query.'); // REMOVED
    return [];
  }

  const accountsMap = new Map<string, { name: string; count: number }>();

  emails.forEach(email => {
    if (!email.email_account_id) {
      return;
    }

    const mapping = email.agent_email_mappings;
    if (mapping && !Array.isArray(mapping) && typeof mapping === 'object' && mapping.email_address) {
      const accountId = email.email_account_id;
      const emailAddress = mapping.email_address;

      const current = accountsMap.get(accountId);
      if (current) {
        accountsMap.set(accountId, { ...current, count: current.count + 1 });
      } else {
        accountsMap.set(accountId, { name: emailAddress, count: 1 });
      }
    }
  });

  // console.log('[fetchInboundAccounts] Processed accountsMap:', accountsMap); // REMOVED

  if (accountsMap.size === 0) {
    // console.log('[fetchInboundAccounts] No accounts with valid mappings and email addresses found.'); // REMOVED
  }

  return Array.from(accountsMap.entries())
    .map(([id, { name, count }]) => ({
      id,
      name,
      count
    }))
    .sort((a,b) => b.count - a.count);
}


// New function to fetch all emails that have an email_account_id (for "All Accounts" view)
async function fetchAllEmailsWithAccounts(dateRange: DateRange | undefined, userEmailAccountIds: string[] | null): Promise<InqEmails[]> {
  if (!userEmailAccountIds || userEmailAccountIds.length === 0) {
    return [];
  }
  let query = supabase
    .from('inq_emails')
    .select('*') // Select all fields needed by AccountDetailView's charts
    .in('email_account_id', userEmailAccountIds) // Added filter
    .not('email_account_id', 'is', null);

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  } else {
    return []; // Date range is essential
  }
  query = query.order('received_at', { ascending: false });
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching all emails with accounts:', error);
    return [];
  }
  return data || [];
}


export function UnifiedDashboardPage() {
  const { user } = useAuth();
  const [userEmailAccountIds, setUserEmailAccountIds] = useState<string[] | null>(null);
  const [isLoadingUserEmailAccountIds, setIsLoadingUserEmailAccountIds] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({ from: subDays(new Date(), 6), to: new Date() }));
  const [activePreset, setActivePreset] = useState<string | null>('last7days');

  const [activeSelectionType, setActiveSelectionType] = useState<SelectionType>('topic');
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
  const [allAccountEmails, setAllAccountEmails] = useState<InqEmails[]>([]);
  const [isLoadingAllAccountEmails, setIsLoadingAllAccountEmails] = useState(false);

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

  const handleEmailSelect = useCallback((emailId: string | null) => {
    setSelectedEmailId(emailId);
    if (!emailId) {
      setEmailDetails(null);
      setKeyQuestions([]);
    }
  }, []);

  useEffect(() => {
    setIsLoadingCustomers(true);
    fetchCustomers().then(data => { setCustomers(data); setIsLoadingCustomers(false); })
    .catch(error => { console.error("Failed to load customers", error); setCustomers([]); setIsLoadingCustomers(false); });
  }, [userEmailAccountIds, isLoadingUserEmailAccountIds]); // Add dependencies

  useEffect(() => {
    // Wait for userEmailAccountIds to be loaded and not null
    if (dateRange?.from && dateRange?.to && userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      setIsLoadingTopics(true);
      fetchAndProcessTopics(dateRange, userEmailAccountIds) // Pass it here
        .then(data => { setTopics(data); setIsLoadingTopics(false); })
        .catch(error => { console.error("Failed to load topics", error); setTopics([]); setIsLoadingTopics(false); });
    } else if (!userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      // If user has no accounts or not loaded yet, set empty
      setTopics([]);
      setIsLoadingTopics(false);
    }
  }, [dateRange, userEmailAccountIds, isLoadingUserEmailAccountIds]); // Add dependencies

  useEffect(() => {
    if (dateRange?.from && dateRange?.to && userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      setIsLoadingAccounts(true);
      fetchInboundAccounts(dateRange, userEmailAccountIds) // Pass it here
        .then(data => { setAccounts(data); setIsLoadingAccounts(false); })
        .catch(error => { console.error("Failed to load inbound accounts", error); setAccounts([]); setIsLoadingAccounts(false); });
    } else if (!userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      setAccounts([]);
      setIsLoadingAccounts(false);
    }
  }, [dateRange, userEmailAccountIds, isLoadingUserEmailAccountIds]); // Add dependencies

  // useEffect for fetching all emails for "All Accounts" view
  useEffect(() => {
    if (activeSelectionType === 'account' && !selectedAccountId && dateRange?.from && dateRange?.to && userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      setIsLoadingAllAccountEmails(true);
      fetchAllEmailsWithAccounts(dateRange, userEmailAccountIds) // Pass it here
        .then(emails => {
          setAllAccountEmails(emails);
          setIsLoadingAllAccountEmails(false);
        })
        .catch(error => {
          console.error("Failed to load all account emails:", error);
          setAllAccountEmails([]);
          setIsLoadingAllAccountEmails(false);
        });
    } else if (!userEmailAccountIds && !isLoadingUserEmailAccountIds) {
      setAllAccountEmails([]);
      setIsLoadingAllAccountEmails(false);
    } else if (activeSelectionType !== 'account' || selectedAccountId) {
      // Clear if not in "all accounts" view to free up memory
      setAllAccountEmails([]);
    }
  }, [activeSelectionType, selectedAccountId, dateRange, userEmailAccountIds, isLoadingUserEmailAccountIds]); // Add dependencies

  useEffect(() => {
    if (selectedEmailId) { // This useEffect does not depend on userEmailAccountIds as it fetches specific email details
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

  useEffect(() => {
    if (user?.id) {
      setIsLoadingUserEmailAccountIds(true);
      fetchUserEmailAccountIds(user.id, supabase)
        .then(ids => {
          setUserEmailAccountIds(ids);
          setIsLoadingUserEmailAccountIds(false);
        })
        .catch(() => {
          setUserEmailAccountIds(null);
          setIsLoadingUserEmailAccountIds(false);
        });
    } else {
      setUserEmailAccountIds(null);
      setIsLoadingUserEmailAccountIds(false);
    }
  }, [user?.id]);

  const filteredCustomers = customers.filter(c => (c.name?.toLowerCase() || c.email?.toLowerCase() || '').includes(customerSearchTerm.toLowerCase()));
  const filteredTopics = topics.filter(t => (t.displayName?.toLowerCase() || '').includes(topicSearchTerm.toLowerCase()));
  const filteredAccounts = accounts.filter(a => (a.name?.toLowerCase() || '').includes(accountSearchTerm.toLowerCase()));

  const selectedCustomerObject = customers.find(c => c.customer_id === selectedCustomerId) || null;

  let topicDetailViewData: ProcessedTopic | null = null;
  if (activeSelectionType === 'topic') {
    if (selectedTopicId) {
      topicDetailViewData = topics.find(t => t.id === selectedTopicId) || null;
    } else if (topics.length > 0) {
      const allEmailsFromTopics = topics.reduce((acc, topic) => acc.concat(topic.emails), [] as ProcessedTopic['emails']);
      topicDetailViewData = { id: "ALL_TOPICS_AGGREGATED", displayName: "All Topics (Aggregated)", emailCount: allEmailsFromTopics.length, emails: allEmailsFromTopics };
    }
  }

  let accountDetailViewAggregateEmails: InqEmails[] | null = null;
  let isAccountAggregateView = false;

  if (activeSelectionType === 'account' && !selectedAccountId) {
    accountDetailViewAggregateEmails = allAccountEmails;
    isAccountAggregateView = true;
  }

  const selectedAccountObject = accounts.find(acc => acc.id === selectedAccountId);
  const selectedAccountName = selectedAccountObject?.name || selectedAccountId;

  // console.log('[UnifiedDashboardPage Render] isLoadingAccounts:', isLoadingAccounts, 'Accounts State:', accounts, 'Filtered Accounts:', filteredAccounts); // REMOVED

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 mb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={activePreset === 'last7days' ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetRange('last7days')}>Last 7 days</Button>
          <Button variant={activePreset === 'last30days' ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetRange('last30days')}>Last 30 days</Button>
          <DateRangePicker dateRange={dateRange} onDateChange={handleCustomDateChange} className="text-sm"/>
        </div>
      </header>

      <KpiRow dateRange={dateRange} userEmailAccountIds={userEmailAccountIds} />

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
          ) : activeSelectionType === 'topic' && topicDetailViewData ? (
            <TopicDetailView
              selectedTopic={topicDetailViewData}
              dateRange={dateRange}
            />
          ) : activeSelectionType === 'account' ? (
            <AccountDetailView
              selectedAccountId={selectedAccountId}
              selectedAccountName={selectedAccountId ? selectedAccountName : null}
              aggregateEmailsData={selectedAccountId ? null : accountDetailViewAggregateEmails}
              isAggregateView={isAccountAggregateView}
              isLoadingAggregateEmails={selectedAccountId ? false : isLoadingAllAccountEmails}
              dateRange={dateRange}
            />
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
