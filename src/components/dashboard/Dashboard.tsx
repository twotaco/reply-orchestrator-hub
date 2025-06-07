import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  InqCustomers,
  InqEmails,
  InqKeyQuestions,
  InqProducts,
  InqResponses
} from '@/integrations/supabase/types';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge'; // Added for response display
import { Skeleton } from "@/components/ui/skeleton"; // For loading states

// Lucide Icons (example, adjust as needed for the new layout)
import { Users, Mail, MessageSquareText, ShoppingBag, BarChartHorizontalBig, PieChartIcon, Briefcase } from 'lucide-react';

// New Dashboard Components
import { CustomerSummaryCard } from './CustomerSummaryCard';
import { EmailDetailsCard } from './EmailDetailsCard';
import { KeyQuestionsList } from './KeyQuestionsList';
import { ProductInterestsList } from './ProductInterestsList';
import { SentimentOverviewChart } from './SentimentOverviewChart';
import { FunnelStageDistributionChart } from './FunnelStageDistributionChart';

// Data Fetching Functions
export async function fetchCustomers(): Promise<InqCustomers[]> {
  const { data, error } = await supabase.from('inq_customers').select('*');
  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }
  return data || [];
}

export async function fetchEmailsForCustomer(customerId: string): Promise<InqEmails[]> {
  const { data, error } = await supabase
    .from('inq_emails')
    .select('*')
    .eq('customer_id', customerId)
    .order('received_at', { ascending: false });
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

export async function fetchAllEmails(): Promise<InqEmails[]> {
  const { data, error } = await supabase.from('inq_emails').select('*').order('received_at', { ascending: false });
  if (error) {
    console.error('Error fetching all emails:', error);
    return [];
  }
  return data || [];
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

  // Initial Load: Customers and All Emails for Charts
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingCustomers(true);
      setLoadingCharts(true);

      const [customersData, allEmailsData] = await Promise.all([
        fetchCustomers(),
        fetchAllEmails()
      ]);

      setCustomers(customersData);
      setLoadingCustomers(false);

      setAllEmailsForCharts(allEmailsData);
      setLoadingCharts(false);
    };
    loadInitialData();
  }, []);

  // On selectedCustomer change
  useEffect(() => {
    if (selectedCustomer) {
      setLoadingCustomerDetails(true);
      setSelectedEmail(null); // Reset selected email
      setEmailKeyQuestions([]);
      setEmailProducts([]);
      setEmailResponses([]);
      fetchEmailsForCustomer(selectedCustomer.customer_id).then(emails => {
        setCustomerEmails(emails);
        setLoadingCustomerDetails(false);
      });
    } else {
      setCustomerEmails([]); // Clear emails if no customer is selected
    }
  }, [selectedCustomer]);

  // On selectedEmail change
  useEffect(() => {
    if (selectedEmail) {
      setLoadingEmailDetails(true);
      Promise.all([
        fetchKeyQuestionsForEmail(selectedEmail.email_id),
        fetchProductsForEmail(selectedEmail.email_id),
        fetchResponsesForEmail(selectedEmail.email_id)
      ]).then(([questions, products, responses]) => {
        setEmailKeyQuestions(questions);
        setEmailProducts(products);
        setEmailResponses(responses);
        setLoadingEmailDetails(false);
      });
    }
  }, [selectedEmail]);

  // UI Structure
  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] gap-4 p-4">
      {/* Left Pane: Customer List & Charts */}
      <div className="flex flex-col w-1/4 space-y-4">
        <Card className="flex-shrink-0">
          <CardHeader>
            <CardTitle className="flex items-center"><Users className="mr-2 h-5 w-5" /> Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCustomers ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                {customers.length > 0 ? customers.map(customer => (
                  <div
                    key={customer.customer_id}
                    className={`p-2 hover:bg-accent cursor-pointer rounded-md text-sm ${selectedCustomer?.customer_id === customer.customer_id ? 'bg-muted font-semibold' : ''}`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    {customer.name || customer.email || 'Unnamed Customer'}
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-4">No customers found.</p>}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        <SentimentOverviewChart emails={allEmailsForCharts} isLoading={loadingCharts} />
        <FunnelStageDistributionChart emails={allEmailsForCharts} isLoading={loadingCharts} />
      </div>

      {/* Center Pane: Selected Customer & Their Emails */}
      <div className="flex flex-col w-1/2 space-y-4">
        {selectedCustomer ? (
          <>
            <CustomerSummaryCard customer={selectedCustomer} />
            <Card className="flex-grow flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center"><Mail className="mr-2 h-5 w-5" /> Emails from {selectedCustomer.name || 'Customer'}</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow overflow-hidden">
                {loadingCustomerDetails ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <ScrollArea className="h-full pr-3"> {/* Max height for scroll area */}
                    {customerEmails.length > 0 ? customerEmails.map(email => (
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
                    )) : <p className="text-sm text-muted-foreground text-center py-10">No emails found for this customer.</p>}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
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
          <ScrollArea className="h-full pr-3"> {/* Make the whole right pane scrollable if content overflows */}
            <div className="space-y-4">
              <EmailDetailsCard email={selectedEmail} />
              <KeyQuestionsList questions={emailKeyQuestions} isLoading={loadingEmailDetails} />
              <ProductInterestsList products={emailProducts} isLoading={loadingEmailDetails} />

              {/* Simple Response Display */}
              {loadingEmailDetails && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center"><MessageSquareText className="mr-2 h-5 w-5" />Responses</CardTitle></CardHeader>
                    <CardContent><Skeleton className="h-10 w-full" /></CardContent>
                  </Card>
              )}
              {!loadingEmailDetails && emailResponses.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center"><MessageSquareText className="mr-2 h-5 w-5" />Responses</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {emailResponses.map(r => (
                      <div key={r.response_id} className="text-xs p-2 bg-gray-50 rounded-md border">
                        <p className="font-medium mb-1">Type: <Badge variant="outline" className="ml-1">{r.response_type || 'N/A'}</Badge></p>
                        <p>{r.response_text}</p>
                        {r.confidence_score && <p className="text-muted-foreground mt-1">Confidence: {r.confidence_score}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
               {!loadingEmailDetails && emailResponses.length === 0 && selectedEmail && (
                 <Card>
                   <CardHeader><CardTitle className="flex items-center"><MessageSquareText className="mr-2 h-5 w-5" />Responses</CardTitle></CardHeader>
                   <CardContent><p className="text-sm text-muted-foreground text-center py-4">No responses for this email.</p></CardContent>
                 </Card>
               )}
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
