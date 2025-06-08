import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, MessageSquare, Percent, CalendarDays } from 'lucide-react'; // Placeholder icons
import { supabase } from '@/integrations/supabase/client';
import type { DateRange } from 'react-day-picker';
import type { InqKeyQuestions } from '@/integrations/supabase/types';
import { subDays, format } from 'date-fns'; // format might be useful for display
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Button } from '@/components/ui/button';


async function fetchRecentQuestions(dateRange?: DateRange): Promise<InqKeyQuestions[]> {
  let query = supabase
    .from('inq_key_questions')
    .select('question_id, question_text, confidence_score, created_at, email_id') // Specify columns
    .order('created_at', { ascending: false });

  if (dateRange?.from && dateRange?.to) {
    const fromDateStr = dateRange.from.toISOString();
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);
    const toDateStr = toDate.toISOString();
    query = query.gte('created_at', fromDateStr).lte('created_at', toDateStr);
  } else {
    query = query.limit(100); // Default limit if no date range
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching recent questions:', error);
    return [];
  }
  return data || [];
}

export function FAQDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 6), to: new Date(),
  }));

  const [questions, setQuestions] = useState<InqKeyQuestions[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
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

  useEffect(() => {
    const loadQuestions = async () => {
      // if (!dateRange?.from && !dateRange?.to) {
      //   // Handled by fetchRecentQuestions applying a default limit if range is undefined
      // }
      setIsLoadingQuestions(true);
      const fetchedQuestions = await fetchRecentQuestions(dateRange);
      setQuestions(fetchedQuestions);
      setIsLoadingQuestions(false);
    };
    loadQuestions();
  }, [dateRange]);


  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          FAQ Dashboard
        </h1>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <HelpCircle className="mr-2 h-5 w-5" />
            Recently Asked Questions
          </CardTitle>
          <CardDescription>
            Questions extracted from recent inquiries, ordered by most recent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingQuestions ? (
            <p>Loading questions...</p>
          ) : questions.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">
              <MessageSquare className="mx-auto h-12 w-12 mb-3" />
              <p>No questions found for the selected period.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-20rem)]"> {/* Adjust height as needed */}
              <div className="space-y-4">
                {questions.map(q => (
                  <Card key={q.question_id} className="p-4 shadow-sm">
                    <p className="font-medium text-gray-800">{q.question_text || 'N/A'}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center">
                        <CalendarDays className="mr-1 h-3 w-3" />
                        {new Date(q.created_at).toLocaleString()}
                      </div>
                      {q.confidence_score !== null && (
                        <div className="flex items-center">
                          <Percent className="mr-1 h-3 w-3" />
                          Confidence: {(q.confidence_score * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                    {/* <p className="text-xs mt-1">Email ID: {q.email_id}</p> */} {/* Optional context */}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
