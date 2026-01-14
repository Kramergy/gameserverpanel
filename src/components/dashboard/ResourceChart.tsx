import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ChartData {
  time: string;
  cpu: number;
  ram: number;
}

const generateData = (): ChartData[] => {
  const data: ChartData[] = [];
  for (let i = 0; i < 24; i++) {
    data.push({
      time: `${i.toString().padStart(2, "0")}:00`,
      cpu: Math.floor(Math.random() * 40) + 20,
      ram: Math.floor(Math.random() * 30) + 40,
    });
  }
  return data;
};

const chartData = generateData();

export function ResourceChart() {
  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-lg font-semibold mb-4">Ressourcen (24h)</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(174 72% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(174 72% 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(215 20% 55%)', fontSize: 12 }}
              interval={3}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(215 20% 55%)', fontSize: 12 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222 47% 8%)',
                border: '1px solid hsl(222 30% 16%)',
                borderRadius: '8px',
                padding: '12px',
              }}
              labelStyle={{ color: 'hsl(210 40% 98%)' }}
              itemStyle={{ padding: '2px 0' }}
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="hsl(174 72% 50%)"
              strokeWidth={2}
              fill="url(#cpuGradient)"
              name="CPU"
            />
            <Area
              type="monotone"
              dataKey="ram"
              stroke="hsl(38 92% 50%)"
              strokeWidth={2}
              fill="url(#ramGradient)"
              name="RAM"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">CPU</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-warning" />
          <span className="text-sm text-muted-foreground">RAM</span>
        </div>
      </div>
    </div>
  );
}
