import React, { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import TrafficMixCard from "./components/TrafficMixCard";
import AqiGaugeECharts from "./components/AqiGaugeECharts";
import RedditFeed from "./components/RedditFeed";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { motion } from "framer-motion";
import {
  Activity, CloudRain, Thermometer, Gauge, Wind, Droplets, Cloud, Car, MapPin, RefreshCcw, SunMoon, Sparkles,
} from "lucide-react";

import {
   LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
   BarChart, Bar, CartesianGrid, ReferenceLine, AreaChart, Area, ReferenceArea,

} from "recharts";








const CITY = "Turin";
const DEFAULT_CENTER = { lat: 45.0705, lng: 7.6868 };
const API_BASE = import.meta?.env?.VITE_API_BASE_URL || "";
const REFRESH_SEC = 60;

const SEV_COLORS = { free:"#10b981", moderate:"#f59e0b", busy:"#fb7185", heavy:"#ef4444", jam:"#b91c1c" };
const AQI_BANDS = [
  { max: 50, color: "#22c55e" }, { max: 100, color: "#84cc16" }, { max: 150, color: "#f59e0b" },
  { max: 200, color: "#ef4444" }, { max: 300, color: "#8b5cf6" }, { max: 500, color: "#6b7280" },
];
const aqiColor = (aqi) => (AQI_BANDS.find((b) => aqi <= b.max) || AQI_BANDS[AQI_BANDS.length - 1]).color;

const Card = ({ title, icon: Icon, children, className = "" }) => (
  <motion.div
    className={
      "card-neon rounded-2xl border border-slate-200/60 dark:border-slate-800/60 " +
      "bg-white/65 dark:bg-slate-900/60 backdrop-blur-md " +
      "shadow-[0_1px_1px_rgba(0,0,0,.04),0_10px_30px_rgba(2,6,23,.10)] " +
      "transition-all duration-200 p-4 " + className
    }
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
  >
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="icon-neon inline-flex items-center justify-center w-7 h-7 rounded-xl
                           bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700">
            <Icon size={16} className="text-slate-700 dark:text-slate-200" />
          </span>
        )}
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
    </div>
    {children}
  </motion.div>
);

const Stat = ({ label, value, suffix = "", icon: Icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      {Icon && <Icon size={16} />} <span className="text-xs">{label}</span>
    </div>
    <div className="text-lg font-semibold text-slate-900 dark:text-white">
      {value ?? "—"}{value != null && suffix}
    </div>
  </div>
);

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => { if (bounds && map) map.fitBounds(bounds, { padding: [40, 40] }); }, [bounds, map]);
  return null;
}

function MetricRow({ icon: Icon, label, value, unit }) {
  return (
    <div className="flex items-baseline py-2">
      {/* ستون برچسب ثابت؛ باعث میشه عددها زیاد از بخش خودشون دور نشن */}
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 w-32 min-w-32">
        <Icon size={16} className="opacity-75" />
        <span className="text-[13px]">{label}</span>
      </div>

      {/* مقدار */}
      <div className="ml-2 tabular-nums text-[15px] font-semibold text-slate-900 dark:text-slate-100">
        {value ?? "—"}
        {unit ? (
          <span className="ml-1 text-[12px] font-normal text-slate-500 dark:text-slate-400">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}


function WeatherCard({ snapshot }) {
  const t = snapshot ? Number(snapshot.temp_c).toFixed(1) : "—";
  const h = snapshot ? Number(snapshot.humidity).toFixed(0) : "—";
  const w = snapshot ? Number(snapshot.wind_ms).toFixed(1) : "—";
  const c = snapshot ? Number(snapshot.cloud_cover).toFixed(0) : "—";
  const p = snapshot ? Number(snapshot.precip_mm).toFixed(1) : "—";

  return (
    <Card title="Weather" icon={Activity}>
      <div className="mx-auto w-full max-w-[420px]">
        <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
          <MetricRow icon={Thermometer} label="Temp"     value={t} unit="°C" />
          <MetricRow icon={Droplets}   label="Humidity" value={h} unit="%"  />
          <MetricRow icon={Wind}       label="Wind"     value={w} unit="m/s"/>
          <MetricRow icon={Cloud}      label="Cloud"    value={c} unit="%"  />
          <MetricRow icon={CloudRain}  label="Precip"   value={p} unit="mm" />
        </div>
      </div>

      <div className="text-[11px] mt-3 text-slate-500 dark:text-slate-400">
        {snapshot && `Updated ${new Date(snapshot.weather_ts).toLocaleString()}`}
      </div>
    </Card>
  );
}

function TrafficCard({ snapshot }) {
  return (
    <Card title="Traffic" icon={Car}>
      <div className="mx-auto w-full max-w-[420px]">
        <div className="grid grid-cols-3 gap-4 items-end">
          {/* Avg Speed */}
          <div className="col-span-1">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Avg Speed
            </div>
            <div className="flex items-baseline">
              <span className="tabular-nums text-3xl font-bold leading-none">
                {snapshot ? Number(snapshot.avg_speed_kmh).toFixed(0) : "—"}
              </span>
              <span className="ml-1 text-xs text-slate-500 dark:text-slate-400 mb-[2px]">km/h</span>
            </div>
          </div>

          {/* Segments */}
          <div className="col-span-1">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Segments
            </div>
            <div className="tabular-nums text-2xl font-semibold">
              {snapshot ? Number(snapshot.segments).toFixed(0) : "—"}
            </div>
          </div>

          {/* Heavy & Jam (راست‌چین، نزدیک هم) */}
          <div className="col-span-1 justify-self-end text-right">
            <div className="flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Heavy</span>
              <span className="tabular-nums text-lg font-semibold text-amber-600 dark:text-amber-400">
                {Number(snapshot?.heavy_cnt || 0)}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Jam</span>
              <span className="tabular-nums text-lg font-semibold text-rose-600 dark:text-rose-400">
                {Number(snapshot?.jam_cnt || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11px] mt-3 text-slate-500 dark:text-slate-400">
        {snapshot && new Date(snapshot.traffic_ts).toLocaleString()}
      </div>
    </Card>
  );
}



// ==== Fancy helpers for Air Pollutants card ====

const POL_GRADS = {
  "PM2.5": ["#34d399", "#10b981"],
  "NO₂":   ["#fbbf24", "#f59e0b"],
  "O₃":    ["#60a5fa", "#3b82f6"],
};

function GradientDefs() {
  return (
    <defs>
      {/* glow for tallest bar */}
      <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="currentColor" floodOpacity="0.35" />
      </filter>

      {/* gradients per pollutant */}
      {Object.entries(POL_GRADS).map(([k, [a, b]]) => (
        <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={a} stopOpacity="0.95" />
          <stop offset="100%" stopColor={b} stopOpacity="0.25" />
        </linearGradient>
      ))}
    </defs>
  );
}

// rounded bar shape (Recharts custom shape)
function RoundedBar({ x, y, width, height, payload, name, isTallest }) {
  const rx = 10;
  const id = `grad-${payload.name}`;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={rx}
            fill={`url(#${id})`}
            style={isTallest ? { filter: "url(#barGlow)", color: POL_GRADS[payload.name]?.[0] || "#22c55e" } : undefined}
      />
    </g>
  );
}

// value label above each bar
const ValueLabel = (props) => {
  const { x, y, value } = props;
  if (value == null) return null;
  return (
    <text x={x} y={y - 6} textAnchor="middle" fontSize="11"
          className="fill-slate-600 dark:fill-slate-300">
      {Number(value).toFixed(0)}
    </text>
  );
};

// custom tooltip
const AirTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 text-xs shadow-md">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: POL_GRADS[p.name]?.[0] || "#22c55e" }} />
        <b>{p.name}</b>
        <span className="ml-2 text-slate-500">{Number(p.value).toFixed(0)}</span>
        <span className="text-slate-400">µg/m³</span>
      </div>
    </div>
  );
};





export default function App() {
  // THEME + NEON (defaults: ON)
  const [dark, setDark] = useState(true);
  const [neon, setNeon] = useState(true);
  const [redditPosts, setRedditPosts] = useState([]);


  // sync with pre-paint classes & localStorage
  useEffect(() => {
    const hasDark = document.documentElement.classList.contains("dark");
    const hasNeon = document.documentElement.classList.contains("neon");
    setDark(hasDark); setNeon(hasNeon);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0b1220" : "#f8f9ff");
  }, [dark]);

  useEffect(() => {
    document.documentElement.classList.toggle("neon", neon);
    localStorage.setItem("neon", neon ? "on" : "off");
  }, [neon]);

  // DATA
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [topJams, setTopJams] = useState([]);
  const [history, setHistory] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), REFRESH_SEC*1000); return () => clearInterval(id); }, []);

  const safeJSON = async (res) => {
    if (!res || !res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    try { return await res.json(); } catch { return null; }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        const [snapS, jamsS, histS, redditS] = await Promise.allSettled([
          fetch(`${API_BASE}/api/v1/city_snapshot?city=${encodeURIComponent(CITY)}`),
          fetch(`${API_BASE}/api/v1/traffic/top_jams?city=${encodeURIComponent(CITY)}&limit=20`),
          fetch(`${API_BASE}/api/v1/city_snapshot/history?city=${encodeURIComponent(CITY)}&hours=24`),

          // ← NEW: خواندن 50 پست آخر از جدول api.reddit_torino_posts

          fetch(`${API_BASE}/api/v1/reddit_torino_posts?select=post_id,ts,title,selftext,permalink&order=ts.desc&limit=50`,
            { headers: { "Accept-Profile": "api" } })
        ]);

        // ...
        const redditJson = await safeJSON(redditS.status === "fulfilled" ? redditS.value : null);
        setRedditPosts(Array.isArray(redditJson) ? redditJson : []);

        const snapRes = snapS.status === "fulfilled" ? snapS.value : null;
        if (!snapRes || !snapRes.ok) throw new Error(`Snapshot ${snapRes ? snapRes.status : "fetch failed"}`);
        const snap = await safeJSON(snapRes); if (!snap) throw new Error("Snapshot not JSON");
        setSnapshot(Array.isArray(snap) ? snap[0] : snap);

        const jamsJson = await safeJSON(jamsS.status === "fulfilled" ? jamsS.value : null);
        setTopJams(Array.isArray(jamsJson) ? jamsJson : []);

        const histJson = await safeJSON(histS.status === "fulfilled" ? histS.value : null);
        setHistory(Array.isArray(histJson) ? histJson : []);
      } catch (e) { console.error(e); setErr(e.message || "fetch failed"); }
      finally { setLoading(false); }
    })();
  }, [tick]);

  // DERIVED
  const congestion = useMemo(() => ({
    free: Number(snapshot?.free_cnt || 0),
    moderate: Number(snapshot?.moderate_cnt || 0),
    busy: Number(snapshot?.busy_cnt || 0),
    heavy: Number(snapshot?.heavy_cnt || 0),
    jam: Number(snapshot?.jam_cnt || 0),
  }), [snapshot]);

  const congestionData = useMemo(() => ([
    { name: "Free", value: congestion.free, color: SEV_COLORS.free },
    { name: "Moderate", value: congestion.moderate, color: SEV_COLORS.moderate },
    { name: "Busy", value: congestion.busy, color: SEV_COLORS.busy },
    { name: "Heavy", value: congestion.heavy, color: SEV_COLORS.heavy },
    { name: "Jam", value: congestion.jam, color: SEV_COLORS.jam },
  ]), [congestion]);

  const hourlyHistory = useMemo(() => {
    const map = new Map();
    for (const r of history || []) { const d = new Date(r.weather_ts || r.traffic_ts || Date.now()); d.setMinutes(0,0,0); map.set(d.toISOString(), r); }
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([,r])=>r);
  }, [history]);

  const tempSeries = useMemo(() => {
    const base = hourlyHistory.length ? hourlyHistory : (snapshot ? [snapshot] : []);
    return base.map((h) => ({
      time: new Date(h.weather_ts || h.traffic_ts || Date.now()).toLocaleTimeString(),
      temp: h.temp_c == null ? null : Number(h.temp_c),
    })).filter(d => d.temp != null);
  }, [hourlyHistory, snapshot]);

  const pollutants = useMemo(() => ([
    { name: "PM2.5", value: snapshot?.pm25 != null ? Number(snapshot.pm25) : null },
    { name: "NO₂",  value: snapshot?.no2  != null ? Number(snapshot.no2)  : null },
    { name: "O₃",   value: snapshot?.o3   != null ? Number(snapshot.o3)   : null },
  ]).filter(p => p.value != null), [snapshot]);

  const bounds = useMemo(() => {
    if (!topJams?.length) return undefined;
    const lats = topJams.map(j => Number(j.center_lat ?? j.lat ?? j.start_lat)).filter(Number.isFinite);
    const lons = topJams.map(j => Number(j.center_lon ?? j.lon ?? j.start_lon)).filter(Number.isFinite);
    if (!lats.length || !lons.length) return undefined;
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [topJams]);

  const sevKey = (j) => String(j.severity || j.level || "jam").toLowerCase();

  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="app-bg app-viewport text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="title-neon text-3xl md:text-4xl font-bold tracking-tight text-blue-900 dark:text-slate-100">
              Smart City Dashboard
            </h1>
            <p className="text-xs text-slate-500">
              Sample KPI dashboard for Turin 
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNeon(n => !n)}
              className="btn-neon inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/80 hover:bg-fuchsia-100 text-fuchsia-700
                         dark:border-fuchsia-900 dark:bg-fuchsia-950/30 dark:hover:bg-fuchsia-900/40"
              title="Neon mode"
            >
              <Sparkles size={16} /><span className="text-xs">{neon ? "Neon: On" : "Neon: Off"}</span>
            </button>
            <button
              onClick={() => setDark(d => !d)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800
                         bg-white/70 dark:bg-slate-900/60 hover:shadow-[0_0_16px_rgba(99,102,241,.35)] transition"
              title="Toggle theme"
            >
              <SunMoon size={16} /><span className="text-xs">{dark ? "Light" : "Dark"}</span>
            </button>
            <button
              onClick={() => setTick(t => t + 1)}
              className="btn-neon inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700
                         dark:border-indigo-900 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50"
              title="Refresh data"
            >
              <RefreshCcw size={16} /><span className="text-xs">Refresh</span>
            </button>
          </div>
        </div>

        {err && (
          <div className="text-xs px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-200">
            {String(err)}
          </div>
        )}

        {/* ===== KPIs: compact left column + balanced AQ + Traffic Mix ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* 1) Left slim column: Weather + Traffic stacked (compact) */}
          <div className="grid gap-4 xl:col-span-3">
            <div className="grid gap-4">
              <WeatherCard snapshot={snapshot} />
              <TrafficCard snapshot={snapshot} />
            </div>

            
          </div>

          {/* 2) Middle: Air Quality (balanced size) */}
          <Card title="Air Quality" icon={Gauge} className="xl:col-span-6">
            <AqiGaugeECharts
              value={Number(snapshot?.aqi || 0)}
              height={360}
              radius="150%"
              centerY="82%"
              lineWidth={58}
              pointerWidth={5}
            />
            <div className="text-[10px] mt-2 text-slate-500">
              {snapshot && `Station ${snapshot.station_id} · ${new Date(snapshot.air_ts).toLocaleString()}`}
            </div>
          </Card>

          {/* 3) Right: Traffic Mix (donut + legend) */}
          <TrafficMixCard snapshot={snapshot} className="xl:col-span-3" />

        </div>


          



        {/* Map (left) + Reddit (right) + two cards under map */}
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[500px_auto] gap-6 items-start">
          {/* LEFT: Map (shorter) */}
          <Card title="Map · Top Jams" icon={MapPin} className="lg:col-span-2 lg:row-start-1 self-start">
            <div className="relative h-[420px] overflow-hidden rounded-xl">
          
              <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: "100%", width: "100%" }}>
                <FitBounds bounds={
                  (() => {
                    if (!topJams?.length) return undefined;
                    const lats = topJams.map(j => Number(j.center_lat ?? j.lat ?? j.start_lat)).filter(Number.isFinite);
                    const lons = topJams.map(j => Number(j.center_lon ?? j.lon ?? j.start_lon)).filter(Number.isFinite);
                    if (!lats.length || !lons.length) return undefined;
                    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
                  })()
                } />
                <TileLayer attribution="&copy; OSM & CARTO" url={tileUrl} />
                {topJams?.map((j, i) => {
                  const lat = Number(j.center_lat ?? j.lat ?? j.start_lat);
                  const lon = Number(j.center_lon ?? j.lon ?? j.start_lon);
                  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                  const sev = (j.severity || j.level || "jam").toString().toLowerCase();
                  const color = SEV_COLORS[sev] || "#64748b";
                  const lenKm = j.length_km ?? (j.length_m ? Number(j.length_m) / 1000 : undefined);
                  const speed = j.speed_kmh ?? j.avg_speed_kmh;

                  return (
                    <CircleMarker key={j.id ?? i} center={[lat, lon]} radius={10} color={color} fillColor={color} fillOpacity={0.75}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">{j.road_name || j.name || j.segment_id || `Jam #${i + 1}`}</div>
                          <div>Severity: <span style={{ color }}>{sev}</span></div>
                          {Number.isFinite(lenKm) && <div>Length: {Number(lenKm).toFixed(2)} km</div>}
                          {speed != null && <div>Speed: {Number(speed).toFixed(0)} km/h</div>}
                          {j.delay_min != null && <div>Delay: {j.delay_min} min</div>}
                          {j.updated_at && <div className="text-xs text-slate-500">{new Date(j.updated_at).toLocaleString()}</div>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              {/* Legend */}
              <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1">
                {[
                  { k: "busy",  label: "Busy",  val: congestion.busy,  color: SEV_COLORS.busy },
                  { k: "heavy", label: "Heavy", val: congestion.heavy, color: SEV_COLORS.heavy },
                  { k: "free",  label: "Free",  val: congestion.free,  color: SEV_COLORS.free  },
                ].map((it) => (
                  <span key={it.k}
                        className="px-2 py-1 rounded-lg text-xs bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800
                                   shadow-[0_0_12px_rgba(2,6,23,.08)] flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: it.color, boxShadow: `0 0 10px ${it.color}80` }} />
                    {it.label}: <b className="ml-1">{it.val}</b>
                  </span>
                ))}
              </div>

              {!topJams?.length && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-xs px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    No jams to display
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div className="lg:col-span-1 lg:row-span-2 lg:row-start-1 lg:h-full min-h-0">
            <RedditFeed
              API_BASE={API_BASE}
              height={873}
              className="h-full"
            />
          </div>





          {/* UNDER MAP: two cards side-by-side on md+ */}
          <div className="lg:col-span-2 lg:row-start-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Air Pollutants (latest)" icon={Activity}>
              {/* ---- Air Pollutants · Clean version ---- */}
              <div className="relative h-56 rounded-lg overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pollutants}
                    barCategoryGap={28}
                    margin={{ top: 12, right: 12, bottom: 6, left: 0 }}
                  >
                    {/* خطوط پس‌زمینه ملایم */}
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />

                    {/* محور‌ها ساده و کم‌تراکم */}
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tickCount={4}
                      domain={[0, (dataMax) => Math.ceil(dataMax * 1.15)]}
                    />

                    {/* Tooltip مینیمال و حرفه‌ای */}
                    <Tooltip
                      cursor={{ opacity: 0.1 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:bg-slate-900/80 dark:border-slate-700/60 p-2 shadow-md text-xs">
                            <div className="font-medium mb-1">{label}</div>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ background: (POL_GRADS[label]?.[0] || "#22c55e") }}
                              />
                              <span className="tabular-nums font-semibold">
                                {Number(d.value ?? 0).toFixed(0)}
                              </span>
                              <span className="text-slate-500">µg/m³</span>
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* خطوط مرجع WHO (اگر خواستی) */}
                    {[
                      { key: "PM2.5", val: 25, color: "#10b981" },
                      { key: "NO₂",   val: 40, color: "#f59e0b" },
                      { key: "O₃",    val: 100, color: "#3b82f6" },
                    ].map(ref => (
                      <ReferenceLine
                        key={ref.key}
                        y={ref.val}
                        stroke={ref.color}
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        ifOverflow="extendDomain"
                        label={{
                          value: `${ref.key} WHO ${ref.val}`,
                          position: "right",
                          fill: "#64748b",
                          fontSize: 10,
                          offset: 6,
                        }}
                      />
                    ))}

                    {/* میله‌ها: بدون لیبل عددی روی میله (دیگه تکرار نداریم) */}
                    <Bar
                      dataKey="value"
                      isAnimationActive
                      animationBegin={120}
                      animationDuration={820}
                      animationEasing="ease-out"
                      shape={(props) => {
                        // RoundedBar سفارشی شما اگر دارید:
                        // return <RoundedBar {...props} />;
                        // یا ساده:
                        const { x, y, width, height, payload } = props;
                        const radius = 10;
                        const fill = (POL_GRADS[payload.name]?.[0] || "#22c55e");
                        return (
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            rx={radius}
                            ry={radius}
                            fill={`url(#grad-${payload.name})`}
                          />
                        );
                      }}
                    />

                    {/* تعریف گرادینت برای هر آلاینده (ملایم و مدرن) */}
                    <defs>
                      {pollutants.map((p) => {
                        const c = POL_GRADS[p.name] || ["#22c55e", "#86efac"];
                        return (
                          <linearGradient id={`grad-${p.name}`} x1="0" y1="0" x2="0" y2="1" key={p.name}>
                            <stop offset="0%" stopColor={c[0]} stopOpacity="0.95" />
                            <stop offset="100%" stopColor={c[1] || c[0]} stopOpacity="0.35" />
                          </linearGradient>
                        );
                      })}
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* لگند جمع‌وجور بدون اعداد تکراری */}
              <div className="mt-3 flex items-center gap-4 text-[11px]">
                {pollutants.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{
                        background: POL_GRADS[p.name]?.[0] || "#22c55e",
                        boxShadow: `0 0 8px ${(POL_GRADS[p.name]?.[0] || "#22c55e")}55`,
                      }}
                    />
                    <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                  </div>
                ))}

                {/* خلاصه‌ی هوشمند (اختیاری): بیشینه */}
                {(() => {
                  const max = pollutants?.reduce((a, b) => (a.value > b.value ? a : b), { value: -1 });
                  if (!max || max.value < 0) return null;
                  return (
                    <span className="ml-auto text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
                      Max: <b className="tabular-nums">{Number(max.value).toFixed(0)}</b> ({max.name})
                    </span>
                  );
                })()}
              </div>

            </Card>


            <Card title="Temperature · 24h" icon={Activity}>
             {/* --- Temperature · Polished --- */}
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={tempSeries}
                    margin={{ top: 10, right: 14, bottom: 8, left: 0 }}
                  >
                    {/* پس‌زمینه‌ی لطیف و خطوط افقی */}
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.22} />

                    {/* Comfort band: 18–24 °C (در صورت نیاز اعداد را عوض کن) */}
                    <ReferenceArea
                      y1={18}
                      y2={24}
                      ifOverflow="extendDomain"
                      fill="#22c55e"
                      fillOpacity={0.08}
                      strokeOpacity={0}
                    />

                    {/* محور‌ها: ساده و خلوت */}
                    <XAxis
                      dataKey="time"
                      interval="preserveStartEnd"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickCount={5}
                      domain={[
                        (dataMin) => Math.floor((dataMin ?? 0) - 2),
                        (dataMax) => Math.ceil((dataMax ?? 0) + 2),
                      ]}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    {/* Tooltip سفارشی و مینیمال */}
                    <Tooltip
                      cursor={{ strokeOpacity: 0.05 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0]?.value;
                        return (
                          <div className="rounded-lg border border-slate-200/70 bg-white/90 dark:bg-slate-900/85 dark:border-slate-700/60 px-2.5 py-1.5 text-xs shadow">
                            <div className="font-medium mb-0.5">{label}</div>
                            <div className="tabular-nums">
                              <b>{Number(v).toFixed(1)}</b> <span className="text-slate-500">°C</span>
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* گرادیان برای فیل و استروک */}
                    <defs>
                      <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="tempStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.85" />
                      </linearGradient>
                    </defs>

                    {/* Area + خط بالایی (نقاط فقط در hover با Tooltip) */}
                    <Area
                      type="monotone"
                      dataKey="temp"
                      stroke="url(#tempStroke)"
                      strokeWidth={2}
                      fill="url(#tempFill)"
                      isAnimationActive
                      animationDuration={800}
                      animationBegin={120}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* خلاصه‌ی Min / Avg / Max */}
              {(() => {
                const vals = tempSeries?.map(d => Number(d.temp)).filter(n => Number.isFinite(n)) ?? [];
                if (!vals.length) return null;
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
                const Pill = ({ label, value }) => (
                  <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                    {label}: <b className="tabular-nums">{value}</b>°C
                  </span>
                );
                return (
                  <div className="mt-3 flex items-center gap-2">
                    <Pill label="Min" value={min.toFixed(1)} />
                    <Pill label="Avg" value={avg.toFixed(1)} />
                    <Pill label="Max" value={max.toFixed(1)} />
                    <span className="ml-auto text-[10px] text-slate-500">
                      Comfort band: 18–24°C
                    </span>
                  </div>
                );
              })()}
            </Card>
          </div>
        </div>

        <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Data: your APIs · Map © OSM & CARTO · © Navid Tavakoli Shalmani</span>
          <span>Auto-refresh: {REFRESH_SEC}s</span>
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/5 dark:bg-black/20 backdrop-blur-[1px] flex items-center justify-center pointer-events-none" style={{zIndex: 9999}}>
          <div className="text-xs px-3 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            Loading…
          </div>
        </div>
      )}
    </div>
  );
}
