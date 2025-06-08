import { supabase } from '@/integrations/supabase/client';
import type { InqEmails, InqResponses, InqKeyQuestions } from '@/integrations/supabase/types';

export interface ResponseTypeData { name: string; value: number; }
export interface VolumeDataPoint { date: string; count: number; }

export async function fetchResponseTypesForEmails(emailIds: string[]): Promise<ResponseTypeData[]> {
  if (!emailIds || emailIds.length === 0) return [];
  const { data: responses, error } = await supabase.from('inq_responses').select('response_type').in('email_id', emailIds);
  if (error) { console.error('Error fetching responses for email IDs:', error); return []; }
  if (!responses) return [];
  const counts = responses.reduce((acc, response) => {
    const type = response.response_type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
}

export function processEmailVolume(emails: Pick<InqEmails, 'received_at'>[]): VolumeDataPoint[] {
  if (!emails || emails.length === 0) return [];
  const countsByDate: { [date: string]: number } = {};
  emails.forEach(email => {
    if (email.received_at) {
      const date = new Date(email.received_at).toLocaleDateString('en-CA');
      countsByDate[date] = (countsByDate[date] || 0) + 1;
    }
  });
  return Object.entries(countsByDate).map(([date, count]) => ({ date, count })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function fetchKeyQuestionsForEmailList(emailIds: string[]): Promise<InqKeyQuestions[]> {
  if (!emailIds || emailIds.length === 0) return [];
  const { data, error } = await supabase
    .from('inq_key_questions')
    .select('question_id, question_text, confidence_score')
    .in('email_id', emailIds)
    .order('confidence_score', { ascending: false })
    .limit(10);
  if (error) { console.error('Error fetching key questions for email list:', error); return []; }
  return data || [];
}
