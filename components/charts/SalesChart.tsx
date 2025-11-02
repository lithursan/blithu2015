

import React, { useContext } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SalesData } from '../../types';
import { ThemeContext } from '../../contexts/ThemeContext';

interface SalesChartProps {
  data: SalesData[];
}

export const SalesChart: React.FC<SalesChartProps> = ({ data }) => {
    const themeContext = useContext(ThemeContext);
    if (!themeContext) {
        throw new Error("SalesChart must be used within a ThemeProvider");
    }
    const { theme } = themeContext;
    const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';


  // Rotate x-axis labels when there are many points to keep them readable
  const xLabelRotate = data.length > 6 ? -30 : 0;

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
          dataKey="month"
          stroke={tickColor}
          tick={{ fill: tickColor, fontSize: 12, angle: xLabelRotate, textAnchor: xLabelRotate ? 'end' : 'middle' }}
          interval={0}
        />
        <YAxis stroke={tickColor} />
        <Tooltip 
            contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderColor: theme === 'dark' ? '#334155' : '#e2e8f0'
            }}
        />
        <Legend />
        <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};