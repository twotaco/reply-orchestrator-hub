import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Tag, Briefcase, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import type { InqCustomers } from '@/integrations/supabase/types'; // Will be used later
import type { ProcessedTopic } from '@/pages/TopicsDashboardPage'; // Will be used later

export type SelectionType = 'customer' | 'topic' | 'account' | null;

interface SelectionColumnProps {
  dateRange?: DateRange;
  activeSelectionType: SelectionType;
  onSelectionTypeChange: (type: SelectionType) => void;

  // Customer related props (will be fully used later)
  customers: InqCustomers[];
  isLoadingCustomers: boolean;
  selectedCustomerId: string | null;
  onCustomerSelect: (customerId: string | null) => void;
  customerSearchTerm: string;
  onCustomerSearchChange: (term: string) => void;

  // Topic related props (will be fully used later)
  topics: ProcessedTopic[];
  isLoadingTopics: boolean;
  selectedTopicId: string | null;
  onTopicSelect: (topicId: string | null) => void;
  topicSearchTerm: string;
  onTopicSearchChange: (term: string) => void;

  // Account related props (will be fully used later)
  accounts: { id: string; name: string; count: number }[]; // Example structure
  isLoadingAccounts: boolean;
  selectedAccountId: string | null;
  onAccountSelect: (accountId: string | null) => void;
  accountSearchTerm: string;
  onAccountSearchChange: (term: string) => void;
}

export function SelectionColumn({
  dateRange,
  activeSelectionType,
  onSelectionTypeChange,
  customers, isLoadingCustomers, selectedCustomerId, onCustomerSelect, customerSearchTerm, onCustomerSearchChange,
  topics, isLoadingTopics, selectedTopicId, onTopicSelect, topicSearchTerm, onTopicSearchChange,
  accounts, isLoadingAccounts, selectedAccountId, onAccountSelect, accountSearchTerm, onAccountSearchChange
}: SelectionColumnProps) {

  const renderCustomerSelector = () => (
    <CardContent>
      <div className="flex items-center mb-2">
        <Input
          placeholder="Search customers..."
          value={customerSearchTerm}
          onChange={(e) => onCustomerSearchChange(e.target.value)}
          className="mr-2"
        />
        <Button variant="ghost" size="icon" className="border"><Search className="h-4 w-4"/></Button>
      </div>
      {isLoadingCustomers ? <p>Loading customers...</p> : customers.length === 0 ? <p className="text-muted-foreground text-sm">No customers found.</p> : (
        <ScrollArea className="h-[200px]">
          {customers.map(customer => (
            <Button
              key={customer.customer_id}
              variant={selectedCustomerId === customer.customer_id ? "secondary" : "ghost"}
              className="w-full justify-start mb-1"
              onClick={() => onCustomerSelect(customer.customer_id)}
            >
              {customer.name || customer.email || 'Unnamed Customer'}
            </Button>
          ))}
        </ScrollArea>
      )}
    </CardContent>
  );

  const renderTopicSelector = () => (
    <CardContent>
      <div className="flex items-center mb-2">
        <Input
          placeholder="Search topics..."
          value={topicSearchTerm}
          onChange={(e) => onTopicSearchChange(e.target.value)}
          className="mr-2"
        />
        <Button variant="ghost" size="icon" className="border"><Search className="h-4 w-4"/></Button>
      </div>
       {isLoadingTopics ? <p>Loading topics...</p> : topics.length === 0 ? <p className="text-muted-foreground text-sm">No topics found for this period.</p> : (
        <ScrollArea className="h-[200px]">
          {topics.map(topic => (
            <Button
              key={topic.id}
              variant={selectedTopicId === topic.id ? "secondary" : "ghost"}
              className="w-full justify-start mb-1 h-auto py-1"
              onClick={() => onTopicSelect(topic.id)}
            >
              <div className="flex flex-col items-start">
                <span className="text-sm">{topic.displayName}</span>
                <span className="text-xs text-muted-foreground">{topic.emailCount} emails</span>
              </div>
            </Button>
          ))}
        </ScrollArea>
      )}
    </CardContent>
  );

  const renderAccountSelector = () => (
     <CardContent>
      <div className="flex items-center mb-2">
        <Input
          placeholder="Search accounts..."
          value={accountSearchTerm}
          onChange={(e) => onAccountSearchChange(e.target.value)}
          className="mr-2"
        />
        <Button variant="ghost" size="icon" className="border"><Search className="h-4 w-4"/></Button>
      </div>
      {isLoadingAccounts ? (
        <p>Loading accounts...</p>
      ) : accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No accounts found for this period.</p>
      ) : (
        <ScrollArea className="h-[200px]">
          {/* Hardcoded debug item */}
          <div className="p-2 border-b border-red-500 text-red-700">
            DEBUG: Static item in ScrollArea. Accounts count: {accounts.length}
          </div>
          {accounts.map(account => (
            <Button
              key={account.id}
              variant={selectedAccountId === account.id ? "secondary" : "ghost"}
              className="w-full justify-start mb-1 h-auto py-1"
              onClick={() => onAccountSelect(account.id)}
            >
              <div className="flex flex-col items-start">
                <span className="text-sm">{account.name}</span>
                <span className="text-xs text-muted-foreground">{account.count} emails</span>
              </div>
            </Button>
          ))}
        </ScrollArea>
      )}
    </CardContent>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
          onClick={() => onSelectionTypeChange(activeSelectionType === 'customer' ? null : 'customer')}
        >
          <CardTitle className="flex items-center text-base">
            <Users className="mr-2 h-5 w-5" /> Customers
          </CardTitle>
          <CardDescription className="text-xs">Filter by customer profile and activity.</CardDescription>
        </CardHeader>
        {activeSelectionType === 'customer' && renderCustomerSelector()}
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
          onClick={() => onSelectionTypeChange(activeSelectionType === 'topic' ? null : 'topic')}
        >
          <CardTitle className="flex items-center text-base">
            <Tag className="mr-2 h-5 w-5" /> Topics
          </CardTitle>
          <CardDescription className="text-xs">Filter by email subject topics.</CardDescription>
        </CardHeader>
        {activeSelectionType === 'topic' && renderTopicSelector()}
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
          onClick={() => onSelectionTypeChange(activeSelectionType === 'account' ? null : 'account')}
        >
          <CardTitle className="flex items-center text-base">
            <Briefcase className="mr-2 h-5 w-5" /> Inbound Accounts
          </CardTitle>
          <CardDescription className="text-xs">Filter by specific inbound email accounts.</CardDescription>
        </CardHeader>
        {activeSelectionType === 'account' && renderAccountSelector()}
      </Card>
    </div>
  );
}

export default SelectionColumn;
