

import React, { useContext } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SalesData } from '../../types';
import { ThemeContext } from '../../contexts/ThemeContext';

interface SalesChartProps {
  data: SalesData[];
  // optional: control maximum number of x ticks shown (helps mobile)
  maxXTicks?: number;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data, maxXTicks = 7 }) => {
    const themeContext = useContext(ThemeContext);
    if (!themeContext) {
        throw new Error("SalesChart must be used within a ThemeProvider");
    }
    const { theme } = themeContext;
    const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';


  // Rotate x-axis labels when there are many points to keep them readable
  const xLabelRotate = data.length > maxXTicks ? -30 : 0;
  // Compute tick interval so the x-axis doesn't crowd on small screens
  const tickInterval = data.length > maxXTicks ? Math.ceil(data.length / maxXTicks) - 1 : 0;

  return (
    // Make the chart fill the parent's height so the dashboard can control sizing responsively
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="label"
          stroke={tickColor}
          tick={{ fill: tickColor, fontSize: 12, angle: xLabelRotate, textAnchor: xLabelRotate ? 'end' : 'middle' }}
          interval={tickInterval}
        />
        <YAxis stroke={tickColor} />
        <Tooltip 
            contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderColor: theme === 'dark' ? '#334155' : '#e2e8f0'
            }}
            formatter={(value: number, name: string) => [
                `LKR ${value.toLocaleString()}`, 
                name
            ]}
      // If the dataset contains a `fullLabel` for the point, show that in the tooltip.
      labelFormatter={(label) => {
          const point = data.find(d => d.label === label);
          return `Date: ${point?.fullLabel || label}`;
      }}
        />
        <Legend />
        <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 6 }} name="Total Sales" />
        <Line type="monotone" dataKey="deliveryCost" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 6 }} name="Delivery Cost" />
        <Line type="monotone" dataKey="grossProfit" stroke="#10b981" strokeWidth={2} activeDot={{ r: 6 }} name="Gross Profit" />
        <Line type="monotone" dataKey="netProfit" stroke="#8b5cf6" strokeWidth={2} activeDot={{ r: 6 }} name="Net Profit" />
      </LineChart>
    </ResponsiveContainer>
  );
};