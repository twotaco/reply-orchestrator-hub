import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InqCustomers } from '@/integrations/supabase/types';
import { UserCircle, Mail, Award, MapPin, CalendarDays, Filter, Smile, Frown, Meh } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CustomerSummaryCardProps {
  customer: InqCustomers;
  currentFunnelStage?: string | null;
  currentSentiment?: string | null;
}

export function CustomerSummaryCard({
  customer,
  currentFunnelStage,
  currentSentiment
}: CustomerSummaryCardProps) {
  if (!customer) {
    return null;
  }

  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">
          {customer.name || 'N/A'}
        </CardTitle>
        <UserCircle className="h-6 w-6 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center">
          <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{customer.email || 'No email provided'}</span>
        </div>
        {customer.loyalty_indicator && (
          <div className="flex items-center">
            <Award className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Loyalty: {customer.loyalty_indicator}</span>
          </div>
        )}
        {customer.geographic_info && (
          <div className="flex items-center">
            <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Location: {customer.geographic_info}</span>
          </div>
        )}
        {currentFunnelStage && (
          <div className="flex items-center">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Stage: <Badge variant="outline" className="capitalize ml-1">{currentFunnelStage}</Badge></span>
          </div>
        )}
        {currentSentiment && (
          <div className="flex items-center">
            {currentSentiment.toLowerCase() === 'positive' && <Smile className="mr-2 h-4 w-4 text-green-500" />}
            {currentSentiment.toLowerCase() === 'negative' && <Frown className="mr-2 h-4 w-4 text-red-500" />}
            {currentSentiment.toLowerCase() === 'neutral' && <Meh className="mr-2 h-4 w-4 text-blue-500" />}
            {currentSentiment.toLowerCase() === 'mixed' && <Meh className="mr-2 h-4 w-4 text-yellow-500" />}
            {!(currentSentiment.toLowerCase() === 'positive' || currentSentiment.toLowerCase() === 'negative' || currentSentiment.toLowerCase() === 'neutral' || currentSentiment.toLowerCase() === 'mixed') && (
              <Meh className="mr-2 h-4 w-4 text-muted-foreground" /> // Default for unknown/other
            )}
            <span>Sentiment: <Badge variant="secondary" className="capitalize ml-1">{currentSentiment}</Badge></span>
          </div>
        )}
        <div className="flex items-center pt-2">
          <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>
            Joined: {new Date(customer.created_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
