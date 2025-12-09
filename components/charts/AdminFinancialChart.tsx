import React, { useContext } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ThemeContext } from '../../contexts/ThemeContext';

interface Point {
  label: string;
  fullLabel?: string;
  paid?: number;
  cheque?: number;
  credit?: number;
  returns?: number;
}

interface AdminFinancialChartProps {
  data: Point[];
  maxXTicks?: number;
}

export const AdminFinancialChart: React.FC<AdminFinancialChartProps> = ({ data, maxXTicks = 8 }) => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) throw new Error('AdminFinancialChart must be used within a ThemeProvider');
  const { theme } = themeContext;
  const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';

  const xLabelRotate = data.length > maxXTicks ? -30 : 0;
  const tickInterval = data.length > maxXTicks ? Math.ceil(data.length / maxXTicks) - 1 : 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 24, left: 12, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="label" stroke={tickColor} tick={{ fill: tickColor, fontSize: 12, angle: xLabelRotate, textAnchor: xLabelRotate ? 'end' : 'middle' }} interval={tickInterval} />
        <YAxis stroke={tickColor} />
        <Tooltip
          contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0' }}
          formatter={(value: number, name: string) => [`LKR ${Number(value || 0).toLocaleString()}`, name]}
          labelFormatter={(label) => {
            const point = data.find(d => d.label === label);
            return `Date: ${point?.fullLabel || label}`;
          }}
        />
        <Legend />
        <Line type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2} name="Total Paid" dot={false} />
        <Line type="monotone" dataKey="cheque" stroke="#f97316" strokeWidth={2} name="Total Cheque" dot={false} />
        <Line type="monotone" dataKey="credit" stroke="#ef4444" strokeWidth={2} name="Total Credit" dot={false} />
        <Line type="monotone" dataKey="returns" stroke="#3b82f6" strokeWidth={2} name="Total Returns" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};
