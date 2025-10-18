

import React, { useContext } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StockData } from '../../types';
import { ThemeContext } from '../../contexts/ThemeContext';


interface TopProductsChartProps {
  data: StockData[];
}

export const TopProductsChart: React.FC<TopProductsChartProps> = ({ data }) => {
    const themeContext = useContext(ThemeContext);
    if (!themeContext) {
        throw new Error("TopProductsChart must be used within a ThemeProvider");
    }
    const { theme } = themeContext;
    const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{
          top: 5,
          right: 30,
          left: 50,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis type="number" stroke={tickColor} />
        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} stroke={tickColor} />
        <Tooltip 
            cursor={{fill: theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(229, 231, 235, 0.5)'}}
            contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderColor: theme === 'dark' ? '#334155' : '#e2e8f0'
            }}
        />
        <Legend />
        <Bar dataKey="stock" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
};