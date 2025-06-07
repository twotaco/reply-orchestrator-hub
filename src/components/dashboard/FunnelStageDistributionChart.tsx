import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { InqEmails } from '@/integrations/supabase/types'; // Adjust if necessary
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Filter } from 'lucide-react'; // Icon for legend/empty state

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
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 70 }}> {/* Adjusted bottom margin for XAxis labels */}
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} interval={0} tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(value: number, name: string) => [value, name === 'count' ? 'Emails' : name]} />
            <Legend />
            <Bar dataKey="count" name="Emails">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={FUNNEL_STAGE_COLORS[entry.name.toLowerCase() as keyof typeof FUNNEL_STAGE_COLORS] || FUNNEL_STAGE_COLORS.unknown} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
