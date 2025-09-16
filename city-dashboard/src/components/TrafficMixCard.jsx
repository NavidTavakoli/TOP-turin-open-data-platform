import React, { useMemo, useState, useId } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Sector, Tooltip } from "recharts";
import { Activity } from "lucide-react";

function Card({ title, icon: Icon, className = "", children }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="icon-badge"><Icon size={16} /></span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function RoundedSector(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      cornerRadius={outerRadius - innerRadius}
    />
  );
}

function ActiveShape(props) {
  return <RoundedSector {...props} outerRadius={props.outerRadius + 6} />;
}

function MixTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="text-xs text-slate-500 mb-1">{p.name}</div>
      <div className="flex items-baseline gap-1">
        {typeof p.payload?.pct === "number" && (
          <span className="text-lg font-semibold">{Math.round(p.payload.pct)}%</span>
        )}
      </div>
    </div>
  );
}

export default function TrafficMixCard({ snapshot, className = "" }) {
  const gradIdPrefix = useId();

  const COLORS = {
    Free:     "#22c55e",
    Moderate: "#f59e0b",
    Busy:     "#fb923c",
    Heavy:    "#ef4444",
    Jam:      "#7f1d1d",
  };

  const raw = {
    Free: Number(snapshot?.free_cnt || 0),
    Moderate: Number(snapshot?.moderate_cnt || 0),
    Busy: Number(snapshot?.busy_cnt || 0),
    Heavy: Number(snapshot?.heavy_cnt || 0),
    Jam: Number(snapshot?.jam_cnt || 0),
  };

  const data = useMemo(() => {
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    return Object.entries(raw).map(([name, value]) => ({
      name,
      value,
      color: COLORS[name],
      pct: total ? (value * 100) / total : 0,
      key: name.toLowerCase(),
    }));
  }, [snapshot]);

  const total = data.reduce((a, b) => a + b.value, 0);
  const [activeIdx, setActiveIdx] = useState(null);

  return (
    <Card title="Traffic Mix" icon={Activity} className={className}>
      <div className="relative h-64 overflow-visible">
        <div className="relative z-20 h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((d) => (
                  <linearGradient key={d.key} id={`${gradIdPrefix}-grad-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={d.color} stopOpacity="0.65" />
                  </linearGradient>
                ))}
              </defs>

              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={2}
                minAngle={4}
                activeIndex={activeIdx}
                activeShape={ActiveShape}
                onMouseEnter={(_, i) => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
                shape={RoundedSector}
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={`url(#${gradIdPrefix}-grad-${d.key})`} stroke="none" />
                ))}
              </Pie>

              <Tooltip content={<MixTooltip />} wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xs text-slate-500">Segments</div>
            <div className="tabular-nums text-2xl font-bold leading-none">{total}</div>
            <div className="text-[10px] mt-1 text-slate-400">
              {snapshot && new Date(snapshot.traffic_ts).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs sm:text-sm">
        {data.map((d) => (
          <div key={d.key} className="flex items-center min-w-0 gap-x-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0"
              style={{ background: d.color, boxShadow: `0 0 0 3px ${d.color}22, 0 0 10px ${d.color}66` }}
            />
            <span className="text-slate-700 dark:text-slate-200 whitespace-nowrap" title={d.name}>{d.name}</span>
            <span className="ml-auto tabular-nums font-semibold flex-shrink-0">{Math.round(d.pct)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
