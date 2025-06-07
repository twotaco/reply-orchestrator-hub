import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InqEmails } from '@/integrations/supabase/types'; // Adjust path if necessary
import { Mail, MessageSquare, CalendarDays, Tag, BarChart2, AlertTriangle, CheckCircle, Clock } from 'lucide-react'; // Example icons

interface EmailDetailsCardProps {
  email: InqEmails;
}

export function EmailDetailsCard({ email }: EmailDetailsCardProps) {
  if (!email) {
    return null; // Or a loading/placeholder state
  }

  const getPriorityIcon = (priority?: string | null) => {
    if (priority === 'high') return <AlertTriangle className="mr-1 h-4 w-4 text-red-500" />;
    if (priority === 'medium') return <Clock className="mr-1 h-4 w-4 text-yellow-500" />;
    if (priority === 'low') return <CheckCircle className="mr-1 h-4 w-4 text-green-500" />;
    return null;
  };

  const getSentimentColor = (sentiment?: string | null) => {
    if (sentiment === 'positive') return 'bg-green-100 text-green-800';
    if (sentiment === 'negative') return 'bg-red-100 text-red-800';
    if (sentiment === 'neutral') return 'bg-blue-100 text-blue-800';
    if (sentiment === 'mixed') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold break-all">
              {email.email_subject || 'No Subject'}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground pt-1">
              <CalendarDays className="mr-1 h-3 w-3" /> Received: {new Date(email.received_at).toLocaleString()}
              {email.language && <span className="ml-2">| Language: {email.language.toUpperCase()}</span>}
            </CardDescription>
          </div>
          <Mail className="h-6 w-6 text-muted-foreground flex-shrink-0 ml-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {email.email_summary && (
          <div>
            <h4 className="font-medium mb-1 text-gray-700">Summary:</h4>
            <p className="text-gray-600 bg-gray-50 p-2 rounded">{email.email_summary}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {email.priority_level && (
            <div className="flex items-center">
              {getPriorityIcon(email.priority_level)}
              <span className="font-medium mr-1">Priority:</span>
              <Badge variant="outline" className="capitalize">{email.priority_level}</Badge>
            </div>
          )}
          {email.sentiment_overall && (
            <div className="flex items-center">
              <BarChart2 className="mr-1 h-4 w-4 text-muted-foreground" />
              <span className="font-medium mr-1">Sentiment:</span>
              <Badge variant="outline" className={`capitalize ${getSentimentColor(email.sentiment_overall)}`}>{email.sentiment_overall}</Badge>
            </div>
          )}
          {email.funnel_stage && (
            <div className="flex items-center">
              <Tag className="mr-1 h-4 w-4 text-muted-foreground" />
              <span className="font-medium mr-1">Funnel Stage:</span>
              <Badge variant="secondary" className="capitalize">{email.funnel_stage}</Badge>
            </div>
          )}
          {email.customer_intent && (
            <div className="flex items-center">
              <MessageSquare className="mr-1 h-4 w-4 text-muted-foreground" />
              <span className="font-medium mr-1">Intent:</span>
               <Badge variant="outline" className="capitalize">{email.customer_intent}</Badge>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
