import React from 'react';
import { InqKeyQuestions } from '@/integrations/supabase/types'; // Adjust path if necessary
import { HelpCircle, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KeyQuestionsListProps {
  questions: InqKeyQuestions[];
  isLoading?: boolean;
}

export function KeyQuestionsList({ questions, isLoading }: KeyQuestionsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4">
            <HelpCircle className="w-12 h-12 text-gray-400 mb-2" />
            <p className="text-sm text-muted-foreground">No key questions extracted for this email.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Key Questions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {questions.map((question) => (
            <li key={question.question_id} className="p-3 bg-gray-50 rounded-md text-sm">
              <div className="flex items-start justify-between">
                <p className="text-gray-700 flex-grow mr-2">{question.question_text || 'N/A'}</p>
                {question.confidence_score !== null && typeof question.confidence_score === 'number' && (
                  <Badge variant="secondary" className="flex-shrink-0">
                    <Percent className="mr-1 h-3 w-3" />
                    {(question.confidence_score * 100).toFixed(0)}% Conf.
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
