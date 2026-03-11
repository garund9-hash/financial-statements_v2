'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import styles from '../page.module.css';

function formatAsEokWon(value) {
  const inEok = value / 100000000;
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(inEok) + '억';
}

export default function FinancialChart({ chartData, year }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>📊 주요 재무 지표 ({year}년)</h3>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{fill: 'var(--foreground)', fontSize: 13, fontWeight: 600}} axisLine={{stroke: 'var(--border)'}} tickLine={false} />
            <YAxis tickFormatter={formatAsEokWon} tick={{fill: 'var(--foreground)', fontSize: 13}} width={80} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => formatAsEokWon(value)}
              cursor={{fill: 'rgba(0,0,0,0.05)'}}
              contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderRadius: '12px', color: 'var(--foreground)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              itemStyle={{ color: '#ffffff', fontWeight: 600 }}
              labelStyle={{ color: 'var(--secondary)' }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.value < 0 ? 'var(--error)' : 'var(--primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
