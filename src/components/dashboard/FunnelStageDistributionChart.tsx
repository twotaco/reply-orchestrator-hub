import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from 'recharts'; // Added LabelList
import { InqEmails } from '@/integrations/supabase/types'; // Adjust if necessary
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Filter } from 'lucide-react'; // Icon for legend/empty state

export const FUNNEL_STAGE_ORDER: string[] = [
  'unrelated',
  'awareness_inquiry',
  'consideration_request',
  'decision_confirmation',
  'retention_feedback',
  'unknown'
];

interface FunnelStageDistributionChartProps {
  emails: InqEmails[];
  isLoading?: boolean;
}

// Define a color palette for funnel stages, can be expanded
const FUNNEL_STAGE_COLORS: { [key: string]: string } = {
  awareness: '#8884d8',
  interest: '#82ca9d',
  consideration: '#ffc658',
  conversion: '#ff8042',
  retention: '#00C49F',
  advocacy: '#0088FE',
  unrelated: '#A9A9A9', // DarkGray for 'unrelated'
  unknown: '#D3D3D3',   // LightGray for 'unknown'
};

export function FunnelStageDistributionChart({ emails, isLoading }: FunnelStageDistributionChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funnel Stage Distribution</CardTitle>
          <CardDescription>Distribution of emails across funnel stages.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full bg-gray-200 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  const funnelStageData = emails.reduce((acc, email) => {
    const stage = email.funnel_stage || 'unknown';
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {} as { [key: string]: number });

  const chartData = Object.entries(funnelStageData).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize
    count: value,
  }));

  // Sort chartData based on FUNNEL_STAGE_ORDER
  chartData.sort((a, b) => {
    const aIndex = FUNNEL_STAGE_ORDER.indexOf(a.name.toLowerCase());
    const bIndex = FUNNEL_STAGE_ORDER.indexOf(b.name.toLowerCase());

    // If a stage isn't in FUNNEL_STAGE_ORDER, push it to the end.
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funnel Stage Distribution</CardTitle>
          <CardDescription>Distribution of emails across funnel stages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Filter className="w-16 h-16 text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No funnel stage data available to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Funnel Stage Distribution</CardTitle>
        <CardDescription>Distribution of emails across funnel stages.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}> {/* Adjusted margins */}
            <CartesianGrid strokeDasharray="3 3" />
            {/* Simplified XAxis - ticks and labels are now on the bars */}
            <XAxis dataKey="name" axisLine={true} tickLine={false} tick={false} height={10} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(value: number, name: string, entry) => [value, entry.payload.name]} /> {/* Tooltip shows stage name and count */}
            {/* Legend was already removed in a previous step */}
            <Bar dataKey="count">
              {/* LabelList to render stage names inside/on bars */}
              <LabelList
                dataKey="name"
                position="insideTop" // Try different positions: 'top', 'center', 'insideStart', 'insideEnd', 'insideBottom'
                angle={-45}      // Angle for readability if names are long
                offset={5}      // Adjust offset as needed
                style={{ fontSize: '10px', fill: '#333' }} // Style for the label, fill color might need to be dynamic based on bar color
              />
              {chartData.map((entry, index) => (
                <Cell
                    key={`cell-${index}`}
                    fill={FUNNEL_STAGE_COLORS[entry.name.toLowerCase() as keyof typeof FUNNEL_STAGE_COLORS] || FUNNEL_STAGE_COLORS.unknown}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
