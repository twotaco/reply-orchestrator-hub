import React from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns'; // For date manipulation
import type { InqEmails } from '@/integrations/supabase/types';

export interface CustomerActivityChartProps {
  emails: Partial<InqEmails>[];
  isLoading?: boolean;
}

interface ProcessedChartDataPoint {
  date: string;
  timestamp: number;
  emailCount: number;
  sentiments: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
    unknown: number;
  };
}

const SENTIMENT_COLORS: { [key: string]: string } = {
  positive: '#4CAF50',
  negative: '#F44336',
  neutral: '#2196F3',
  mixed: '#FFC107',
  unknown: '#9E9E9E'
};


export function CustomerActivityChart({ emails, isLoading }: CustomerActivityChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center">
            <TrendingUp className="mr-2 h-4 w-4"/> Customer Engagement & Sentiment
          </CardTitle>
          <CardDescription className="text-xs">Email volume and sentiment over time.</CardDescription>
        </CardHeader>
        <CardContent className="h-72"> {/* Fixed height */}
          <div className="h-full w-full bg-gray-200 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  const processDataForChart = (emailList: Partial<InqEmails>[]): ProcessedChartDataPoint[] => {
    if (!emailList || emailList.length === 0) return [];

    const aggregatedData: { [dateStr: string]: ProcessedChartDataPoint } = {};

    emailList.forEach(email => {
      if (!email.received_at) return;
      // Ensure received_at is a string before parsing, or handle if it could be Date object
      const dateObj = startOfDay(typeof email.received_at === 'string' ? parseISO(email.received_at) : new Date(email.received_at));
      const dateStr = format(dateObj, "yyyy-MM-dd");

      if (!aggregatedData[dateStr]) {
        aggregatedData[dateStr] = {
          date: format(dateObj, "MMM dd"),
          timestamp: dateObj.getTime(),
          emailCount: 0,
          sentiments: { positive: 0, neutral: 0, negative: 0, mixed: 0, unknown: 0 },
        };
      }
      aggregatedData[dateStr].emailCount++;
      const sentiment = (email.sentiment_overall || 'unknown').toLowerCase() as keyof ProcessedChartDataPoint['sentiments'];
      if (aggregatedData[dateStr].sentiments.hasOwnProperty(sentiment)) {
        aggregatedData[dateStr].sentiments[sentiment]++;
      } else {
        aggregatedData[dateStr].sentiments.unknown++;
      }
    });

    return Object.values(aggregatedData).sort((a, b) => a.timestamp - b.timestamp);
  };

  const chartData = processDataForChart(emails);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center">
            <TrendingUp className="mr-2 h-4 w-4"/> Customer Engagement & Sentiment
          </CardTitle>
          <CardDescription className="text-xs">Email volume and sentiment over time.</CardDescription>
        </CardHeader>
        <CardContent className="h-72 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No activity data for this customer in the selected period.</p>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as ProcessedChartDataPoint; // First payload item has the full point
      return (
        <div className="bg-background/90 backdrop-blur-sm p-3 border rounded-md shadow-lg text-sm">
          <p className="font-semibold">Date: {label} ({new Date(dataPoint.timestamp).toLocaleDateString('en-US', { weekday: 'short' })})</p>
          <p>Email Count: <span style={{color: '#8884d8', fontWeight:'bold'}}>{payload.find(p => p.dataKey === 'emailCount')?.value}</span></p>
          <div className="mt-1">
            <p className="font-medium text-xs mb-0.5">Sentiments:</p>
            {Object.entries(dataPoint.sentiments).map(([sentiment, count]) => {
              if (count > 0) {
                return (
                  <p key={sentiment} style={{ color: SENTIMENT_COLORS[sentiment as keyof typeof SENTIMENT_COLORS], fontSize: '0.7rem' }} className="capitalize">
                    {sentiment}: {count}
                  </p>
                );
              }
              return null;
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center">
          <TrendingUp className="mr-2 h-4 w-4"/> Customer Engagement & Sentiment
        </CardTitle>
        <CardDescription className="text-xs">Email volume and sentiment over time.</CardDescription>
      </CardHeader>
      <CardContent className="h-72"> {/* Fixed height */}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 20 }}> {/* Adjusted margins, added bottom for XAxis */}
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" allowDecimals={false} tick={{ fontSize: 10 }} label={{ value: 'Email Count', angle: -90, position: 'insideLeft', style: {fontSize: '10px', fill: '#8884d8'} }}/>
            <YAxis yAxisId="right" orientation="right" stroke="#4CAF50" allowDecimals={false} tick={{ fontSize: 10 }} label={{ value: 'Sentiment Count', angle: 90, position: 'insideRight', style: {fontSize: '10px', fill: '#4CAF50'} }}/>
            <Tooltip content={<CustomTooltip />}/>
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconSize={8} />

            <Bar yAxisId="left" dataKey="emailCount" name="Emails" barSize={20} fill="#8884d8" />

            <Line yAxisId="right" type="monotone" dataKey="sentiments.positive" name="Positive" stroke={SENTIMENT_COLORS.positive} strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="sentiments.neutral" name="Neutral" stroke={SENTIMENT_COLORS.neutral} strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="sentiments.negative" name="Negative" stroke={SENTIMENT_COLORS.negative} strokeWidth={2} dot={false} />
            {/* <Line yAxisId="right" type="monotone" dataKey="sentiments.mixed" name="Mixed" stroke={SENTIMENT_COLORS.mixed} strokeWidth={2} dot={false} /> */}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
