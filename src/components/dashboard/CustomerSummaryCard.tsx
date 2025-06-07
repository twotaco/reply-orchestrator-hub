import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InqCustomers } from '@/integrations/supabase/types'; // Adjust path if necessary
import { UserCircle, Mail, Award, MapPin, CalendarDays } from 'lucide-react'; // Example icons

interface CustomerSummaryCardProps {
  customer: InqCustomers;
}

export function CustomerSummaryCard({ customer }: CustomerSummaryCardProps) {
  if (!customer) {
    return null; // Or a loading/placeholder state
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
