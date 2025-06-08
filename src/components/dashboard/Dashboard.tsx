import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  InqCustomers,
  InqEmails,
  InqKeyQuestions,
  InqProducts,
  InqResponses
} from '@/integrations/supabase/types';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import type { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { Button } from '@/components/ui/button';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Lucide Icons
import { Users, Mail, MessageSquareText, ShoppingBag, BarChartHorizontalBig, PieChartIcon, Briefcase, Search } from 'lucide-react'; // Added Search

// New Dashboard Components
import { CustomerSummaryCard } from './CustomerSummaryCard';
import { EmailDetailsCard } from './EmailDetailsCard';
import { KeyQuestionsList } from './KeyQuestionsList';
import { ProductInterestsList } from './ProductInterestsList';
// import { CustomerJourneyChart } from './CustomerJourneyChart'; // Removed
import { CustomerActivityChart } from '@/components/charts/CustomerActivityChart'; // Added

// Data Fetching Functions
export async function fetchCustomers(): Promise<InqCustomers[]> {
  const { data, error } = await supabase.from('inq_customers').select('*');
  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }
  return data || [];
}

export async function fetchEmailsForCustomer(customerId: string, dateRange?: DateRange): Promise<InqEmails[]> {
  let query = supabase
    .from('inq_emails')
    .select('*')
    .eq('customer_id', customerId)
    .order('received_at', { ascending: false });

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`Error fetching emails for customer ${customerId}:`, error);
    return [];
  }
  return data || [];
}

export async function fetchKeyQuestionsForEmail(emailId: string): Promise<InqKeyQuestions[]> {
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

export async function fetchProductsForEmail(emailId: string): Promise<InqProducts[]> {
  const { data, error } = await supabase
    .from('inq_products')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(`Error fetching products for email ${emailId}:`, error);
    return [];
  }
  return data || [];
}

export async function fetchResponsesForEmail(emailId: string): Promise<InqResponses[]> {
  const { data, error } = await supabase
    .from('inq_responses')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(`Error fetching responses for email ${emailId}:`, error);
    return [];
  }
  return data || [];
}

export async function fetchAllEmails(dateRange?: DateRange): Promise<InqEmails[]> {
  let query = supabase.from('inq_emails').select('*').order('received_at', { ascending: false }); // Fetches all fields, including agent_id if present

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('received_at', fromDateStr).lte('received_at', toDateStr);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching all emails:', error);
    return [];
  }
  return data || [];
}

async function fetchAgentEmail(agentId: string): Promise<string | null> {
  if (!agentId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', agentId)
      .single();

    if (error) {
      console.error(`Error fetching agent email for ID ${agentId}:`, error);
      return null;
    }
    return data?.email || null;
  } catch (e) {
    console.error(`Exception fetching agent email for ID ${agentId}:`, e);
    return null;
  }
}

// Main Dashboard Component
export function Dashboard() {
  // State Management
  const [customers, setCustomers] = useState<InqCustomers[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<InqCustomers | null>(null);
  const [customerEmails, setCustomerEmails] = useState<InqEmails[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<InqEmails | null>(null);
  const [emailKeyQuestions, setEmailKeyQuestions] = useState<InqKeyQuestions[]>([]);
  const [emailProducts, setEmailProducts] = useState<InqProducts[]>([]);
  const [emailResponses, setEmailResponses] = useState<InqResponses[]>([]);
  const [allEmailsForCharts, setAllEmailsForCharts] = useState<InqEmails[]>([]);

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomerDetails, setLoadingCustomerDetails] = useState(false);
  const [loadingEmailDetails, setLoadingEmailDetails] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [currentFunnelStage, setCurrentFunnelStage] = useState<string | null>(null);
  const [currentSentiment, setCurrentSentiment] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [escalationFilter, setEscalationFilter] = useState<boolean>(false);
  const [respondingAgentEmail, setRespondingAgentEmail] = useState<string | null>(null);
  const [isLoadingAgentEmail, setIsLoadingAgentEmail] = useState<boolean>(false);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: subDays(today, 6), // Default to last 7 days
      to: today,
    };
  });
  const [activePreset, setActivePreset] = useState<string | null>('last7days');

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

  // Initial Load: Customers and All Emails for Charts (respecting dateRange)
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingCustomers(true);
      setLoadingCharts(true);

      // Customers list is not filtered by date for now
      const customersData = await fetchCustomers();
      setCustomers(customersData);
      setLoadingCustomers(false);

      // Fetch all emails for charts, respecting the dateRange
      const allEmailsData = await fetchAllEmails(dateRange);
      setAllEmailsForCharts(allEmailsData);
      setLoadingCharts(false);

      // When dateRange changes, reset selected customer and their specific details
      setSelectedCustomer(null);
      setCustomerEmails([]);
      setSelectedEmail(null);
      setEmailKeyQuestions([]);
      setEmailProducts([]);
      setEmailResponses([]);
    };

    if (dateRange?.from && dateRange?.to) {
      loadInitialData();
    } else {
      setAllEmailsForCharts([]);
      setLoadingCustomers(false);
      setLoadingCharts(false);
      setSelectedCustomer(null);
      setCustomerEmails([]);
      setSelectedEmail(null);
      setCurrentFunnelStage(null);
      setCurrentSentiment(null);
    }
  }, [dateRange]);

  // On selectedCustomer change (now also depends on dateRange)
  useEffect(() => {
    if (selectedCustomer) {
      setLoadingCustomerDetails(true);
      setSelectedEmail(null);
      setEmailKeyQuestions([]);
      setEmailProducts([]);
      setEmailResponses([]);
      setCurrentFunnelStage(null); // Reset while loading new emails
      setCurrentSentiment(null);   // Reset while loading new emails

      fetchEmailsForCustomer(selectedCustomer.customer_id, dateRange).then(emails => {
        setCustomerEmails(emails);
        if (emails && emails.length > 0) {
          const latestEmail = emails[0]; // Emails are sorted by received_at descending
          setCurrentFunnelStage(latestEmail.funnel_stage || null);
          setCurrentSentiment(latestEmail.sentiment_overall || null);
        } else {
          setCurrentFunnelStage(null);
          setCurrentSentiment(null);
        }
        setLoadingCustomerDetails(false);
      });
    } else {
      setCustomerEmails([]);
      setCurrentFunnelStage(null);
      setCurrentSentiment(null);
      setPriorityFilter("all");
      setEscalationFilter(false);
    }
  }, [selectedCustomer, dateRange]);

  // On selectedEmail change
  useEffect(() => {
    if (selectedEmail) {
      setLoadingEmailDetails(true);
      setIsLoadingAgentEmail(true);
      setRespondingAgentEmail(null);

      Promise.all([
        fetchKeyQuestionsForEmail(selectedEmail.email_id),
        fetchProductsForEmail(selectedEmail.email_id),
        fetchResponsesForEmail(selectedEmail.email_id)
      ]).then(async ([questions, products, responses]) => {
        setEmailKeyQuestions(questions);
        setEmailProducts(products);
        setEmailResponses(responses);
        setLoadingEmailDetails(false);

        if (responses && responses.length > 0) {
          const firstResponse = responses[0];
          if (firstResponse.agent_id) {
            const agentEmail = await fetchAgentEmail(firstResponse.agent_id);
            setRespondingAgentEmail(agentEmail);
          } else {
            setRespondingAgentEmail(null);
          }
        } else {
          setRespondingAgentEmail(null);
        }
        setIsLoadingAgentEmail(false);
      });
    } else {
      setEmailKeyQuestions([]);
      setEmailProducts([]);
      setEmailResponses([]);
      setRespondingAgentEmail(null);
      setIsLoadingAgentEmail(false);
    }
  }, [selectedEmail]);

  const filteredCustomers = React.useMemo(() => {
    if (!customerSearchTerm) {
      return customers;
    }
    return customers.filter(customer => {
      const nameMatch = customer.name?.toLowerCase().includes(customerSearchTerm.toLowerCase());
      const emailMatch = customer.email?.toLowerCase().includes(customerSearchTerm.toLowerCase());
      return nameMatch || emailMatch;
    });
  }, [customers, customerSearchTerm]);

  const furtherFilteredEmails = React.useMemo(() => {
    let emails = customerEmails;

    if (priorityFilter !== "all") {
      emails = emails.filter(email => email.priority_level === priorityFilter);
    }

    if (escalationFilter) {
      emails = emails.filter(email => email.include_manager === 'manager_feedback_required');
    }

    return emails;
  }, [customerEmails, priorityFilter, escalationFilter]);

  // UI Structure
  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]"> {/* Outer container for flex direction */}
      {/* Date Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b bg-card">
        <span className="text-sm font-medium">Date Range:</span>
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

      {/* Existing 3-Pane Layout (ensure it's wrapped to allow flex-col for the bar above) */}
      <div className="flex flex-grow gap-4 p-4 overflow-hidden"> {/* Add flex-grow and overflow-hidden */}
        {/* Left Pane: Customer List & Charts */}
        <div className="flex flex-col w-1/4 space-y-4">
        <Card className="flex-shrink-0">
          <CardHeader>
            <CardTitle className="flex items-center"><Users className="mr-2 h-5 w-5" /> Customers</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search customers..."
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingCustomers ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <ScrollArea className="h-[150px]"> {/* Adjusted height */}
                {filteredCustomers.length > 0 ? filteredCustomers.map(customer => (
                  <div
                    key={customer.customer_id}
                    className={`p-2 hover:bg-accent cursor-pointer rounded-md text-sm ${selectedCustomer?.customer_id === customer.customer_id ? 'bg-muted font-semibold' : ''}`}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      // setCustomerSearchTerm(""); // Optional: clear search on select
                    }}
                  >
                    {customer.name || customer.email || 'Unnamed Customer'}
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-4">No customers match your search.</p>}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        {/* CustomerJourneyChart removed from here */}
      </div>

      {/* Center Pane: Selected Customer & Their Emails */}
      <div className="flex flex-col w-1/2 space-y-4">
        {selectedCustomer ? (
          <>
            <CustomerSummaryCard
              customer={selectedCustomer}
              currentFunnelStage={currentFunnelStage}
              currentSentiment={currentSentiment}
            />
            {/* Container for Email List Card and CustomerActivityChart */}
            <div className="flex flex-col space-y-4 flex-grow">
              <Card className="flex-grow flex flex-col"> {/* Email List Card */}
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Mail className="mr-2 h-5 w-5" /> Emails from {selectedCustomer.name || 'Customer'}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    {/* Priority and Escalation Filters */}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="priority-filter" className="text-sm">Priority:</Label>
                      <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger id="priority-filter" className="w-[120px] h-8 text-xs">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="escalation-filter"
                        checked={escalationFilter}
                        onCheckedChange={(checked) => setEscalationFilter(checked as boolean)}
                      />
                      <Label htmlFor="escalation-filter" className="text-sm font-medium">
                        Manager Escalated
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow overflow-hidden">
                  {loadingCustomerDetails ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : (
                    <ScrollArea className="h-full pr-3">
                      {furtherFilteredEmails.length > 0 ? furtherFilteredEmails.map(email => (
                        <div
                          key={email.email_id}
                          className={`p-3 mb-2 border rounded-lg hover:bg-accent cursor-pointer ${selectedEmail?.email_id === email.email_id ? 'bg-muted shadow-inner' : 'bg-card'}`}
                          onClick={() => setSelectedEmail(email)}
                        >
                          <p className={`font-medium text-sm truncate ${selectedEmail?.email_id === email.email_id ? 'text-primary' : ''}`}>
                            {email.email_subject || 'No Subject'}
                          </p>
                          <p className="text-xs text-muted-foreground">{new Date(email.received_at).toLocaleString()}</p>
                        </div>
                      )) : <p className="text-sm text-muted-foreground text-center py-10">No emails match your filters.</p>}
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {furtherFilteredEmails && ( // Render CustomerActivityChart if emails are available
                <CustomerActivityChart
                  emails={furtherFilteredEmails}
                  isLoading={loadingCustomerDetails}
                />
              )}
            </div>
          </>
        ) : (
          <Card className="flex-grow flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Users className="mx-auto h-12 w-12 mb-2" />
              <p>Select a customer to view details.</p>
            </div>
          </Card>
        )}
      </div>

      {/* Right Pane: Selected Email Details */}
      <div className="flex flex-col w-1/4 space-y-4">
        {selectedEmail ? (
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4">
              <EmailDetailsCard
                email={selectedEmail}
                respondingAgentEmail={respondingAgentEmail}
                isLoadingAgentEmail={isLoadingAgentEmail}
              />
              <KeyQuestionsList questions={emailKeyQuestions} isLoading={loadingEmailDetails} />
              <ProductInterestsList products={emailProducts} isLoading={loadingEmailDetails} />
              {/* Responses card removed */}
            </div>
          </ScrollArea>
        ) : (
          <Card className="flex-grow flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Mail className="mx-auto h-12 w-12 mb-2" />
              <p>Select an email to view details.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
