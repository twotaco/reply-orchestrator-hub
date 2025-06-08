import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InqEmails, InqKeyQuestions, InqCustomers } from '@/integrations/supabase/types';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// Correctly import the existing components
import { CustomerSummaryCard } from './CustomerSummaryCard';
import { EmailDetailsCard } from './EmailDetailsCard';
import { KeyQuestionsList } from './KeyQuestionsList';

interface CustomerDetailViewProps {
  selectedCustomerId: string;
  selectedCustomerDetails: InqCustomers | null;
  dateRange?: DateRange;
  selectedEmailId: string | null;
  onEmailSelect: (emailId: string | null) => void;
  emailDetails: InqEmails | null;
  isLoadingEmailDetails: boolean;
  keyQuestions: InqKeyQuestions[];
  isLoadingKeyQuestions: boolean;
}

async function fetchEmailsForCustomer(customerId: string, dateRange?: DateRange): Promise<InqEmails[]> {
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

export function CustomerDetailView({
  selectedCustomerId,
  selectedCustomerDetails,
  dateRange,
  selectedEmailId,
  onEmailSelect, // This is the original prop function from the parent
  emailDetails,
  isLoadingEmailDetails,
  keyQuestions,
  isLoadingKeyQuestions
}: CustomerDetailViewProps) {
  const [customerEmails, setCustomerEmails] = useState<InqEmails[]>([]);
  const [isLoadingCustomerEmails, setIsLoadingCustomerEmails] = useState(true);

  // Create a stable version of onEmailSelect for the useEffect dependency array.
  // This is because the onEmailSelect function itself might be recreated on every render of the parent component
  // if it's not memoized there (e.g., with useCallback in UnifiedDashboardPage).
  const stableOnEmailSelect = useCallback(onEmailSelect, [onEmailSelect]);

  useEffect(() => {
    if (selectedCustomerId) {
      setIsLoadingCustomerEmails(true);
      // Call the stable version of onEmailSelect to reset selected email.
      // This ensures that if onEmailSelect from props changes, the effect re-runs if necessary,
      // but typically onEmailSelect itself (the prop) is what we want to ensure is stable from the parent.
      // For this effect, using stableOnEmailSelect ensures this effect's dependency on the function is stable.
      stableOnEmailSelect(null);
      fetchEmailsForCustomer(selectedCustomerId, dateRange)
        .then(emails => {
          setCustomerEmails(emails);
          setIsLoadingCustomerEmails(false);
        })
        .catch(error => {
          console.error("Failed to load customer emails:", error);
          setCustomerEmails([]);
          setIsLoadingCustomerEmails(false);
        });
    } else {
      setCustomerEmails([]);
      setIsLoadingCustomerEmails(false);
    }
  }, [selectedCustomerId, dateRange, stableOnEmailSelect]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* Column 1 of CustomerDetailView (Overall page column 2) */}
      <div className="space-y-4 flex flex-col">
        {selectedCustomerDetails ? (
          <CustomerSummaryCard customer={selectedCustomerDetails} />
        ) : (
            <Card><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
        )}
        <Card className="flex-grow flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">
              Emails from {selectedCustomerDetails?.name || selectedCustomerDetails?.email || 'Customer'}
              {dateRange?.from && ` (filtered)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden p-2">
            {isLoadingCustomerEmails ? (
              <div className="space-y-2 p-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : customerEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No emails found for this customer in the selected period.</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-28rem)]"> {/* Adjust height as needed */}
                {customerEmails.map(email => (
                  <Button
                    key={email.email_id}
                    variant={selectedEmailId === email.email_id ? "secondary" : "ghost"}
                    className="w-full justify-start mb-1 text-left h-auto py-2"
                    onClick={() => onEmailSelect(email.email_id)} // Use the original onEmailSelect prop for the click handler
                  >
                    <div>
                      <p className={`font-medium text-xs truncate ${selectedEmailId === email.email_id ? '' : ''}`}>
                        {email.email_subject || 'No Subject'}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(email.received_at).toLocaleString()}</p>
                    </div>
                  </Button>
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Column 2 of CustomerDetailView (Overall page column 3) */}
      <div className="space-y-4">
        {selectedEmailId && isLoadingEmailDetails && (
            <Card><CardContent className="p-4 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-24 w-full" /></CardContent></Card>
        )}
        {selectedEmailId && !isLoadingEmailDetails && emailDetails && (
          <ScrollArea className="h-[calc(100vh-12rem)] pr-3">
            <div className="space-y-4">
                <EmailDetailsCard email={emailDetails} />
                <KeyQuestionsList questions={keyQuestions} isLoading={isLoadingKeyQuestions} />
            </div>
          </ScrollArea>
        )}
        {!selectedEmailId && ( // Only show "Select an email" if no email is selected. If loading, the above conditions handle it.
          <Card className="flex items-center justify-center min-h-[300px] h-full">
            <p className="text-muted-foreground">Select an email to view details.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default CustomerDetailView;
