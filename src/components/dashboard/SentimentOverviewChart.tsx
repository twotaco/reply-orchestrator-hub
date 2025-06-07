import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { InqEmails } from '@/integrations/supabase/types'; // Adjust if necessary
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Smile, Frown, Meh } from 'lucide-react'; // Icons for legend

interface SentimentOverviewChartProps {
  emails: InqEmails[];
  isLoading?: boolean;
}

const COLORS = {
  positive: '#4CAF50', // Green
  negative: '#F44336', // Red
  neutral: '#2196F3',  // Blue
  mixed: '#FFC107',    // Amber
  unknown: '#9E9E9E'   // Grey
};

const SENTIMENT_ICONS: { [key: string]: JSX.Element } = {
  positive: <Smile className="h-4 w-4 text-green-500 mr-1" />,
  negative: <Frown className="h-4 w-4 text-red-500 mr-1" />,
  neutral: <Meh className="h-4 w-4 text-blue-500 mr-1" />,
  mixed: <Meh className="h-4 w-4 text-yellow-500 mr-1" />, // Using Meh for mixed too, or find another
  unknown: <Meh className="h-4 w-4 text-gray-500 mr-1" />
};

export function SentimentOverviewChart({ emails, isLoading }: SentimentOverviewChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Overview</CardTitle>
          <CardDescription>Distribution of email sentiments.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full bg-gray-200 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  const sentimentData = emails.reduce((acc, email) => {
    const sentiment = email.sentiment_overall || 'unknown';
    acc[sentiment] = (acc[sentiment] || 0) + 1;
    return acc;
  }, {} as { [key: string]: number });

  const chartData = Object.entries(sentimentData).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize
    value,
  }));

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Overview</CardTitle>
          <CardDescription>Distribution of email sentiments.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Meh className="w-16 h-16 text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No sentiment data available to display.</p>
        </CardContent>
      </Card>
    );
  }

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12px">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomLegend = (props: any) => {
    const { payload } = props;
    return (
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs">
        {payload.map((entry: any, index: number) => (
          <li key={`item-${index}`} className="flex items-center">
            {SENTIMENT_ICONS[entry.payload.name.toLowerCase()] || <Meh className="h-4 w-4 text-gray-400 mr-1"/>}
            <span style={{ color: entry.color }}>{entry.value}</span>
            <span className="ml-1 text-gray-600">({entry.payload.value})</span>
          </li>
        ))}
      </ul>
    );
  };


  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Sentiment Overview</CardTitle>
        <CardDescription>Distribution of email sentiments.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS] || COLORS.unknown} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [value, name]} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
