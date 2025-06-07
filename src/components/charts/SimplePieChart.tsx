import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Optional, if chart is self-contained in a card
import { AlertCircle } from 'lucide-react';

interface DataPoint {
  name: string;
  value: number;
}

interface SimplePieChartProps {
  data: DataPoint[];
  title?: string;
  description?: string;
  isLoading?: boolean;
  // Basic predefined color palette
  colors?: string[]; // e.g., ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']
}

const DEFAULT_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#775DD0'];

export function SimplePieChart({ data, title, description, isLoading, colors = DEFAULT_COLORS }: SimplePieChartProps) {
  if (isLoading) {
    return (
      <Card>
        {title && <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle>{description && <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>}</CardHeader>}
        <CardContent className="h-64 w-full flex items-center justify-center">
            <div className="h-48 w-48 bg-gray-200 rounded-full animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        {title && <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle>{description && <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>}</CardHeader>}
        <CardContent className="h-64 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No data available to display the chart.</p>
        </CardContent>
      </Card>
    );
  }

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6; // Adjust label position
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent * 100 < 5) return null; // Don't render label for very small slices

    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10px" fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    // If not self-contained in a card, remove Card wrapper here and let parent handle it.
    // For this subtask, assume it's self-contained for simplicity.
    <Card>
      {title && <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle>{description && <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>}</CardHeader>}
      <CardContent className="h-64"> {/* Ensure consistent height */}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [value, name]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
