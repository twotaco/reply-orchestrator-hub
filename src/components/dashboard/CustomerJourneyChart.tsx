import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis
} from 'recharts';
import { InqEmails } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, AlertCircle } from 'lucide-react'; // Example icons

// Use the same funnel stage order as defined elsewhere, or redefine if scoped to this chart
export const FUNNEL_STAGE_ORDER: string[] = [
  'unrelated',
  'awareness_inquiry',
  'consideration_request',
  'decision_confirmation',
  'retention_feedback',
  'unknown'
];

// Reuse sentiment colors (ensure consistency or import from a shared const)
const SENTIMENT_COLORS: { [key: string]: string } = {
  positive: '#4CAF50',
  negative: '#F44336',
  neutral: '#2196F3',
  mixed: '#FFC107',
  unknown: '#9E9E9E'
};

interface CustomerJourneyChartProps {
  emails: InqEmails[];
  isLoading?: boolean;
}

interface ChartDataPoint {
  timestamp: number; // Milliseconds for recharts
  funnelStageValue: number;
  funnelStageName: string;
  sentiment: string;
  emailSubject: string; // For tooltip
  customerId: string | null; // For tooltip
}

export function CustomerJourneyChart({ emails, isLoading }: CustomerJourneyChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Journey Overview</CardTitle>
          <CardDescription>Funnel stage progression over time, colored by sentiment.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full bg-gray-200 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  const processChartData = (emailList: InqEmails[]): ChartDataPoint[] => {
    return emailList
      .map(email => {
        const stage = email.funnel_stage || 'unknown';
        let stageValue = FUNNEL_STAGE_ORDER.indexOf(stage.toLowerCase());
        // Ensure 'unknown' or stages not in FUNNEL_STAGE_ORDER get a consistent numerical value
        if (stageValue === -1) {
            const unknownIndex = FUNNEL_STAGE_ORDER.indexOf('unknown');
            stageValue = unknownIndex !== -1 ? unknownIndex : FUNNEL_STAGE_ORDER.length -1; // Fallback further if 'unknown' isn't even in order
        }


        return {
          timestamp: new Date(email.received_at).getTime(),
          funnelStageValue: stageValue,
          funnelStageName: stage.charAt(0).toUpperCase() + stage.slice(1),
          sentiment: email.sentiment_overall || 'unknown',
          emailSubject: email.email_subject || 'No Subject',
          customerId: email.customer_id
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by time for correct plotting
  };

  const chartData = processChartData(emails);

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Journey Overview</CardTitle>
          <CardDescription>Funnel stage progression over time, colored by sentiment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <AlertCircle className="w-16 h-16 text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No email data available to display the journey.</p>
        </CardContent>
      </Card>
    );
  }

  const formatXAxis = (tickItem: number) => {
    return new Date(tickItem).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatYAxis = (tickItem: number) => {
    // Ensure tickItem is a valid index for FUNNEL_STAGE_ORDER
    if (tickItem >= 0 && tickItem < FUNNEL_STAGE_ORDER.length) {
      const stageName = FUNNEL_STAGE_ORDER[tickItem];
      return stageName.charAt(0).toUpperCase() + stageName.slice(1);
    }
    return '';
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-background/90 backdrop-blur-sm p-3 border rounded-md shadow-lg text-sm">
          <p className="font-semibold break-all">{data.emailSubject}</p>
          <p><strong>Time:</strong> {new Date(data.timestamp).toLocaleString()}</p>
          <p><strong>Stage:</strong> {data.funnelStageName}</p>
          <p><strong>Sentiment:</strong> <span style={{ color: SENTIMENT_COLORS[data.sentiment.toLowerCase() as keyof typeof SENTIMENT_COLORS] || SENTIMENT_COLORS.unknown }}>{data.sentiment}</span></p>
          {data.customerId && <p className="text-xs text-muted-foreground mt-1">Customer ID: {data.customerId}</p>}
        </div>
      );
    }
    return null;
  };

  const sentimentGroups = chartData.reduce((acc, point) => {
    const sentiment = point.sentiment.toLowerCase(); // Ensure consistent key casing
    if (!acc[sentiment]) {
      acc[sentiment] = [];
    }
    acc[sentiment].push(point);
    return acc;
  }, {} as Record<string, ChartDataPoint[]>);


  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center">
          <TrendingUp className="mr-2 h-5 w-5" /> Customer Journey Overview
        </CardTitle>
        <CardDescription>Funnel stage progression over time, colored by sentiment.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 30 }}> {/* Increased bottom margin for XAxis labels */}
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              angle={-45} // Angled labels for better fit
              textAnchor="end"
              height={70}
              interval="preserveStartEnd"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              dataKey="funnelStageValue"
              type="number"
              tickFormatter={formatYAxis}
              domain={[0, FUNNEL_STAGE_ORDER.length -1]} // Domain based on order length
              ticks={FUNNEL_STAGE_ORDER.map((_, index) => index)}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }}/>
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {Object.entries(sentimentGroups).map(([sentiment, data]) => (
              <Scatter
                key={sentiment}
                name={sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                data={data}
                fill={SENTIMENT_COLORS[sentiment as keyof typeof SENTIMENT_COLORS] || SENTIMENT_COLORS.unknown}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
