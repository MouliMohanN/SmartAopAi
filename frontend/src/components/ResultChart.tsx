import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import type { QueryResponse, ResultRow } from '../types';

interface Props {
  result: QueryResponse;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899'];

function detectAxes(columns: string[], rows: ResultRow[]) {
  // X axis: first column that looks like a label (string or date-like)
  // Y axis: numeric columns
  const numericCols = columns.filter(col =>
    rows.some(r => typeof r[col] === 'number')
  );
  const labelCol = columns.find(col => !numericCols.includes(col)) ?? columns[0];
  return { labelCol, numericCols };
}

export function ResultChart({ result }: Props) {
  const { chart_hint, columns, rows } = result;

  if (!chart_hint || rows.length === 0) return null;

  const { labelCol, numericCols } = detectAxes(columns, rows);

  if (numericCols.length === 0) return null;

  if (chart_hint === 'pie') {
    const valueCol = numericCols[0];
    const data = rows.map(r => ({
      name: String(r[labelCol] ?? ''),
      value: Number(r[valueCol] ?? 0),
    }));
    return (
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart_hint === 'line') {
    return (
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={labelCol} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {numericCols.map((col, i) => (
              <Line key={col} type="monotone" dataKey={col} stroke={COLORS[i % COLORS.length]} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // bar (default)
  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={labelCol} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {numericCols.map((col, i) => (
            <Bar key={col} dataKey={col} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
