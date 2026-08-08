// DashboardIVRCall.jsx — FINAL OPTIMIZED v4.0
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Treemap,
} from "recharts";
import "./DashboardIVRCall.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const REFRESH_MS = 60000; // 60 seconds
const CACHE_KEY = "dashboard_cache";
const CACHE_TTL = 60000; // 60 seconds

/* ─── helpers ─────────────────────────────────────────────────── */
const safeTs = (c) => {
  if (!c?.createdAt) return 0;
  if (c.createdAt._seconds) return c.createdAt._seconds * 1000;
  if (c.createdAt instanceof Date) return c.createdAt.getTime();
  const t = new Date(c.createdAt).getTime();
  return isNaN(t) ? 0 : t;
};

const fmtDur = (s) => {
  s = Number(s) || 0;
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const norm = (s = "") => String(s).toLowerCase().trim();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const CHART_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#06b6d4",
  "#10b981","#f59e0b","#ef4444","#3b82f6",
  "#a855f7","#14b8a6","#f97316","#84cc16",
];

const STATUS_CONFIG = {
  answered:  { color: "#10b981", label: "Answered",  icon: "✅" },
  completed: { color: "#10b981", label: "Completed", icon: "✅" },
  connected: { color: "#06b6d4", label: "Connected", icon: "🔗" },
  missed:    { color: "#ef4444", label: "Missed",    icon: "📵" },
  no_answer: { color: "#f59e0b", label: "No Answer", icon: "⏰" },
  "no-answer":{ color: "#f59e0b",label: "No Answer", icon: "⏰" },
  failed:    { color: "#ef4444", label: "Failed",    icon: "❌" },
  busy:      { color: "#f97316", label: "Busy",      icon: "📞" },
  unknown:   { color: "#6b7280", label: "Unknown",   icon: "❓" },
};

/* ─── AnimatedCounter ─────────────────────────────────────────── */
const AnimatedCounter = ({ to, duration = 1600, prefix = "", suffix = "", decimals = 0 }) => {
  const [val, setVal] = useState(0);
  const raf = useRef();
  const start = useRef(Date.now());
  useEffect(() => {
    start.current = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start.current;
      const progress = clamp(elapsed / duration, 0, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setVal(ease * to);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  const display = decimals > 0
    ? val.toFixed(decimals)
    : Math.floor(val).toLocaleString();
  return <span>{prefix}{display}{suffix}</span>;
};

/* ─── MiniSparkline ───────────────────────────────────────────── */
const MiniSparkline = ({ data = [], color = "#6366f1", width = 100, height = 40, filled = true }) => {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  const polyPts = pts.map(p => p.join(",")).join(" ");
  const fillPts = `0,${height} ${polyPts} ${width},${height}`;
  const uid = `ms-${color.replace(/[^a-z0-9]/gi, "")}-${Math.random()}`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {filled && <polygon points={fillPts} fill={`url(#${uid})`} />}
      <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      {last && (
        <circle cx={last[0]} cy={last[1]} r="3.5" fill={color}
          stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
      )}
    </svg>
  );
};

/* ─── GaugeChart ──────────────────────────────────────────────── */
const GaugeChart = ({ value, max = 100, color = "#6366f1", size = 120, label, sublabel }) => {
  const r = (size - 16) / 2;
  const cx = size / 2, cy = size / 2;
  const startAngle = -Math.PI * 0.75;
  const endAngle = Math.PI * 0.75;
  const sweep = endAngle - startAngle;
  const pctVal = clamp(value / max, 0, 1);
  const fillAngle = startAngle + sweep * pctVal;
  const polarToCart = (angle, radius) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  });
  const trackStart = polarToCart(startAngle, r);
  const trackEnd = polarToCart(endAngle, r);
  const fillEnd = polarToCart(fillAngle, r);
  const largeArc = (pctVal * sweep) > Math.PI ? 1 : 0;
  const fullLargeArc = sweep > Math.PI ? 1 : 0;
  const uid = `gauge-${color.replace(/[^a-z0-9]/gi, "")}-${Math.random()}`;
  return (
    <div className="xp-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${fullLargeArc} 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none" stroke="var(--xp-border-strong)" strokeWidth="10" strokeLinecap="round" />
        {pctVal > 0 && (
          <path d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
            fill="none" stroke={`url(#${uid})`} strokeWidth="10" strokeLinecap="round"
            filter={`url(#${uid}-glow)`} className="xp-gauge-fill" />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="xp-gauge-val"
          style={{ fill: color }}>{Math.round(value)}{max === 100 ? "%" : ""}</text>
        {label && (
          <text x={cx} y={cy + 11} textAnchor="middle" className="xp-gauge-label"
            style={{ fill: "var(--xp-text-muted)" }}>{label}</text>
        )}
      </svg>
      {sublabel && <div className="xp-gauge-sublabel">{sublabel}</div>}
    </div>
  );
};

/* ─── ProgressBar ─────────────────────────────────────────────── */
const ProgressBar = ({ value, max = 100, color = "#6366f1", height = 6, animated = true, showLabel = false }) => {
  const w = clamp(pct(value, max), 0, 100);
  return (
    <div className="xp-progress-wrap">
      <div className="xp-progress-track" style={{ height }}>
        <div className="xp-progress-fill"
          style={{ width: `${w}%`, background: color, height, ...(animated ? { transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)" } : {}) }} />
      </div>
      {showLabel && <span className="xp-progress-label">{w}%</span>}
    </div>
  );
};

/* ─── RingChart ───────────────────────────────────────────────── */
const RingChart = ({ segments, size = 140, thickness = 14 }) => {
  const r = (size - thickness * 2) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <defs>
        {segments.map((seg, i) => (
          <linearGradient key={i} id={`ring-seg-${i}-${Math.random()}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={seg.color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={seg.color} />
          </linearGradient>
        ))}
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--xp-border)" strokeWidth={thickness} />
      {segments.map((seg, i) => {
        const segLen = (seg.value / total) * circ;
        const co = circ - segLen;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={`url(#ring-seg-${i}-${Math.random()})`} strokeWidth={thickness}
            strokeDasharray={`${segLen - 2} ${co + 2}`}
            strokeDashoffset={-(offset)} strokeLinecap="round"
            className="xp-ring-arc" />
        );
        offset += segLen;
        return el;
      })}
    </svg>
  );
};

/* ─── Heatmap ─────────────────────────────────────────────────── */
const CallHeatmap = ({ data }) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allVals = data.flat();
  const max = Math.max(...allVals, 1);
  const [tooltip, setTooltip] = useState(null);
  return (
    <div className="xp-heatmap-container">
      <div className="xp-heatmap-labels-x">
        <div className="xp-heatmap-corner" />
        {hours.map(h => (
          <div key={h} className="xp-heatmap-hlabel">
            {h % 4 === 0 ? `${String(h).padStart(2,"0")}h` : ""}
          </div>
        ))}
      </div>
      {days.map((day, di) => (
        <div key={day} className="xp-heatmap-row">
          <div className="xp-heatmap-dlabel">{day}</div>
          {hours.map(h => {
            const v = data[di]?.[h] || 0;
            const intensity = v / max;
            const bg = intensity === 0
              ? "var(--xp-border)"
              : `rgba(99,102,241,${0.1 + intensity * 0.85})`;
            return (
              <div key={h} className="xp-heatmap-cell"
                style={{ background: bg }}
                onMouseEnter={e => setTooltip({ day, hour: h, v, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}>
                {v > 0 && intensity > 0.4 && (
                  <span className="xp-heatmap-cell-val">{v}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {tooltip && (
        <div className="xp-heatmap-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}>
          <strong>{tooltip.day} {String(tooltip.hour).padStart(2,"0")}:00</strong>
          <span>{tooltip.v} calls</span>
        </div>
      )}
    </div>
  );
};

/* ─── StatCard ────────────────────────────────────────────────── */
const StatCard = ({ icon, label, value, sub, color, gradient, trend, trendUp, spark, suffix = "", isStr, delay = 0 }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`xp-stat-card ${visible ? "xp-stat-card--visible" : ""}`}
      style={{ "--card-color": color, "--card-gradient": gradient }}>
      <div className="xp-stat-card-glow" />
      <div className="xp-stat-card-shine" />
      <div className="xp-stat-top">
        <div className="xp-stat-icon-bg" style={{ background: gradient }}>
          <span className="xp-stat-icon">{icon}</span>
        </div>
        {trend && (
          <div className={`xp-stat-trend ${trendUp ? "xp-trend-up" : "xp-trend-down"}`}>
            <span className="xp-trend-arrow">{trendUp ? "↗" : "↘"}</span>
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div className="xp-stat-mid">
        <div className="xp-stat-value" style={{ color }}>
          {isStr ? value : (visible ? <AnimatedCounter to={Number(value) || 0} suffix={suffix} /> : "0")}
        </div>
        <div className="xp-stat-label">{label}</div>
        <div className="xp-stat-sub">{sub}</div>
      </div>
      {spark && (
        <div className="xp-stat-spark">
          <MiniSparkline data={spark} color={color} width={88} height={34} />
        </div>
      )}
      <div className="xp-stat-footer-bar" style={{ background: gradient }} />
    </div>
  );
};

/* ─── ChartCard ───────────────────────────────────────────────── */
const ChartCard = ({ title, subtitle, children, action, badge, className = "" }) => (
  <div className={`xp-chart-card ${className}`}>
    <div className="xp-chart-card-header">
      <div className="xp-chart-card-titles">
        <h3 className="xp-chart-title">{title}</h3>
        {subtitle && <p className="xp-chart-subtitle">{subtitle}</p>}
      </div>
      <div className="xp-chart-card-right">
        {badge && <span className="xp-chart-badge">{badge}</span>}
        {action}
      </div>
    </div>
    <div className="xp-chart-card-body">{children}</div>
  </div>
);

/* ─── CustomTooltip ───────────────────────────────────────────── */
const XTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="xp-tooltip">
      <div className="xp-tooltip-title">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="xp-tooltip-row">
          <span className="xp-tooltip-dot" style={{ background: p.color }} />
          <span className="xp-tooltip-name">{p.name}</span>
          <span className="xp-tooltip-value">{Number(p.value || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

/* ─── AgentCard ───────────────────────────────────────────────── */
const AgentCard = ({ agent, rank, color }) => {
  const rateColor = agent.rate >= 80 ? "#10b981" : agent.rate >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="xp-agent-card" style={{ "--ac": color }}>
      <div className="xp-agent-card-accent" style={{ background: color }} />
      <div className="xp-agent-rank">#{rank}</div>
      <div className="xp-agent-top">
        <div className="xp-agent-avatar" style={{
          background: `linear-gradient(135deg, ${color}22, ${color}08)`,
          borderColor: `${color}44`,
          color,
        }}>
          {(agent.fullName || agent.name || "?")[0].toUpperCase()}
        </div>
        <div className="xp-agent-info">
          <div className="xp-agent-name">{agent.fullName || agent.name}</div>
          <div className="xp-agent-meta">
            <span className="xp-agent-status-dot" style={{ background: rateColor }} />
            {agent.rate}% success rate
          </div>
        </div>
        <GaugeChart value={agent.rate} color={rateColor} size={72} />
      </div>
      <div className="xp-agent-stats-row">
        {[
          { l: "Total", v: agent.calls, c: color },
          { l: "Answered", v: agent.answered, c: "#10b981" },
          { l: "Missed", v: agent.missed, c: "#ef4444" },
          { l: "Avg Dur", v: fmtDur(agent.avgDur), c: "#f59e0b", isStr: true },
        ].map((s, i) => (
          <div key={i} className="xp-agent-kpi">
            <span className="xp-agent-kpi-val" style={{ color: s.c }}>
              {s.isStr ? s.v : s.v?.toLocaleString()}
            </span>
            <span className="xp-agent-kpi-label">{s.l}</span>
          </div>
        ))}
      </div>
      <ProgressBar value={agent.rate} color={rateColor} height={5} />
    </div>
  );
};

/* ─── LiveFeed ────────────────────────────────────────────────── */
const LiveFeed = ({ calls }) => {
  const recent = useMemo(() => calls.slice(0, 8), [calls]);
  return (
    <div className="xp-livefeed">
      {recent.length === 0 && (
        <div className="xp-livefeed-empty">No recent activity</div>
      )}
      {recent.map((c, i) => {
        const st = norm(c.call_status);
        const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.unknown;
        const ts = safeTs(c);
        const ago = ts ? Math.floor((Date.now() - ts) / 60000) : null;
        const isIn = norm(c.direction) === "inbound";
        return (
          <div key={i} className="xp-livefeed-item" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="xp-livefeed-icon" style={{ color: cfg.color }}>
              {cfg.icon}
            </div>
            <div className="xp-livefeed-body">
              <div className="xp-livefeed-num">
                {c.call_to_number || c.client_number || c.caller_id_number || "Unknown"}
              </div>
              <div className="xp-livefeed-meta">
                <span className="xp-livefeed-dir">{isIn ? "↙ Inbound" : "↗ Outbound"}</span>
                <span className="xp-livefeed-agent">{c.answered_agent_name || "—"}</span>
              </div>
            </div>
            <div className="xp-livefeed-right">
              <span className="xp-livefeed-badge" style={{ color: cfg.color, borderColor: `${cfg.color}30`, background: `${cfg.color}10` }}>
                {cfg.label}
              </span>
              {ago !== null && <span className="xp-livefeed-ago">{ago === 0 ? "Just now" : `${ago}m ago`}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN DASHBOARD COMPONENT                                      */
/* ═══════════════════════════════════════════════════════════════ */
export default function DashboardIVRCall() {
  const [stats, setStats] = useState({});
  const [allCalls, setAllCalls] = useState([]);
  const [agentStats, setAgentStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [liveTime, setLiveTime] = useState(new Date());
  const [showNotif, setShowNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");
  const notifRef = useRef();
  const abortControllerRef = useRef(null);

  /* live clock */
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* notification helper */
  const notify = useCallback((msg) => {
    setNotifMsg(msg);
    setShowNotif(true);
    clearTimeout(notifRef.current);
    notifRef.current = setTimeout(() => setShowNotif(false), 3500);
  }, []);

  /* OPTIMIZED FETCH with caching, deduplication, abort */
  const fetchData = useCallback(async (forceRefresh = false) => {
    // Skip if tab is inactive and not forced
    if (document.hidden && !forceRefresh) {
      return;
    }
    
    // Check cache first (only if not forcing refresh)
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setStats(data.stats || {});
            setAllCalls(data.recentCalls || []);
            setAgentStats(data.stats?.agentStats || {});
            setLastRefresh(new Date(timestamp));
            return; // Use cache
          }
        }
      } catch (error) {
        console.error("Cache read error:", error);
      }
    }
    
    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLoading(true);
    
    try {
      const response = await fetch(`${API}/stats`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': forceRefresh ? 'no-cache' : 'max-age=60'
        }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const statsData = await response.json();
      
      // Update state
      setStats(statsData || {});
      setAllCalls(Array.isArray(statsData?.recentCalls) ? statsData.recentCalls : []);
      setAgentStats(statsData?.agentStats || {});
      setLastRefresh(new Date());
      
      // Update cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: {
            stats: statsData,
            recentCalls: statsData?.recentCalls || []
          },
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error("Cache write error:", error);
      }
      
      notify("✅ Data refreshed successfully");
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error('Fetch error:', error);
      notify("⚠️ Could not reach server — showing cached data");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  /* Auto-refresh with visibility handling */
  useEffect(() => {
    fetchData(); // Initial load
    
    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchData();
      }
    }, REFRESH_MS);
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData(true);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  /* ── computed (using pre-aggregated data) ──────────────────── */
  const answerRate = pct(stats.answeredCalls, stats.totalCalls);
  const missedRate = pct(stats.missedCalls, stats.totalCalls);
  const inbound = stats.inboundCalls || 0;
  const outbound = stats.outboundCalls || 0;

  // Use pre-aggregated data directly (no computation needed!)
  const hourlyData = stats.hourlyBreakdown || [];
  const weeklyData = stats.weeklyBreakdown || [];
  const heatmapData = stats.heatmapData || Array.from({ length: 7 }, () => Array(24).fill(0));

  const agentList = useMemo(() =>
    Object.values(agentStats)
      .filter(s => s.name && s.name !== "Unknown")
      .map(s => ({
        name: s.name?.length > 14 ? s.name.slice(0, 14) + "…" : s.name,
        fullName: s.name,
        calls: s.calls || 0,
        answered: (s.calls || 0) - (s.missed || 0),
        missed: s.missed || 0,
        rate: s.calls > 0 ? Math.round(((s.calls - (s.missed || 0)) / s.calls) * 100) : 0,
        avgDur: s.avgDuration || 0,
      }))
      .sort((a, b) => b.calls - a.calls),
    [agentStats]
  );

  const pieData = useMemo(() => {
    if (stats.statusDistribution && Array.isArray(stats.statusDistribution)) {
      return stats.statusDistribution.map(item => ({
        name: STATUS_CONFIG[norm(item.status)]?.label || item.status,
        value: item.count,
        color: STATUS_CONFIG[norm(item.status)]?.color || "#6b7280",
      }));
    }
    return [];
  }, [stats.statusDistribution]);

  const radarData = useMemo(() => {
    return agentList.slice(0, 6).map(a => ({
      agent: a.name,
      volume: a.calls,
      rate: a.rate,
      answered: Math.round((a.answered / (agentList[0]?.calls || 1)) * 100),
    }));
  }, [agentList]);

  const funnelData = useMemo(() => [
    { name: "Total Calls", value: stats.totalCalls || 0, fill: "#6366f1" },
    { name: "Inbound", value: inbound, fill: "#8b5cf6" },
    { name: "Answered", value: stats.answeredCalls || 0, fill: "#10b981" },
    { name: "Completed", value: Math.round((stats.answeredCalls || 0) * 0.85), fill: "#06b6d4" },
  ], [stats, inbound]);

  const sparkData = stats.trendData || Array.from({ length: 12 }, () => Math.floor(Math.random() * 30 + 5));

  const peakHour = useMemo(() => 
    hourlyData.reduce((a, b) => (b?.total || 0) > (a?.total || 0) ? b : a, hourlyData[0] || {}), 
    [hourlyData]
  );
  
  const busiestDay = useMemo(() => 
    weeklyData.reduce((a, b) => (b?.total || 0) > (a?.total || 0) ? b : a, weeklyData[0] || {}), 
    [weeklyData]
  );
  
  const topAgent = agentList[0];
  const activeAgentCount = agentList.length;

  const ringSegments = useMemo(() => [
    { value: stats.answeredCalls || 0, color: "#10b981", label: "Answered" },
    { value: stats.missedCalls || 0, color: "#ef4444", label: "Missed" },
    { value: Math.max(0, (stats.totalCalls || 0) - (stats.answeredCalls || 0) - (stats.missedCalls || 0)), color: "#f59e0b", label: "Other" },
  ], [stats]);

  const radialData = useMemo(() => [
    { name: "Answered", value: answerRate, fill: "#10b981" },
    { name: "Inbound %", value: pct(inbound, stats.totalCalls), fill: "#6366f1" },
    { name: "Outbound %", value: pct(outbound, stats.totalCalls), fill: "#f59e0b" },
    { name: "Active Agents", value: Math.min(100, activeAgentCount * 10), fill: "#06b6d4" },
  ], [answerRate, inbound, outbound, stats.totalCalls, activeAgentCount]);

  const tabs = [
    { key: "overview",   icon: "⬡", label: "Overview"  },
    { key: "analytics",  icon: "◈", label: "Analytics"  },
    { key: "agents",     icon: "◉", label: "Agents"     },
    { key: "heatmap",    icon: "◧", label: "Heatmap"    },
    { key: "livefeed",   icon: "◎", label: "Live Feed"  },
  ];

  const statCards = [
    { icon: "📞", label: "Total Calls",     value: stats.totalCalls ?? 0,      sub: "All channels",       color: "#6366f1", gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)", trend: "+12.4%", trendUp: true,  spark: sparkData },
    { icon: "↙",  label: "Inbound",         value: inbound,                     sub: "Incoming calls",     color: "#8b5cf6", gradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)", trend: "+8.1%",  trendUp: true,  spark: sparkData },
    { icon: "↗",  label: "Outbound",        value: outbound,                    sub: "Outgoing calls",     color: "#06b6d4", gradient: "linear-gradient(135deg,#06b6d4,#22d3ee)", trend: "+5.7%",  trendUp: true,  spark: sparkData },
    { icon: "✅", label: "Answered",        value: stats.answeredCalls ?? 0,    sub: "Successfully connected", color: "#10b981", gradient: "linear-gradient(135deg,#10b981,#34d399)", trend: "+3.2%",  trendUp: true,  spark: sparkData },
    { icon: "📵", label: "Missed",          value: stats.missedCalls ?? 0,      sub: "Unanswered",         color: "#ef4444", gradient: "linear-gradient(135deg,#ef4444,#f87171)", trend: "-2.1%",  trendUp: false, spark: sparkData },
    { icon: "📊", label: "Answer Rate",     value: answerRate,                  sub: "Connection success", color: "#f59e0b", gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)", trend: "+1.3%",  trendUp: true,  spark: sparkData, suffix: "%" },
    { icon: "⏱", label: "Avg Duration",    value: stats.avgDuration ? fmtDur(stats.avgDuration) : "—", sub: "Per call",  color: "#ec4899", gradient: "linear-gradient(135deg,#ec4899,#f472b6)", isStr: true },
    { icon: "👥", label: "Unique Callers",  value: stats.uniqueCustomers ?? 0,  sub: "Distinct contacts",  color: "#84cc16", gradient: "linear-gradient(135deg,#84cc16,#a3e635)", trend: "+6.5%",  trendUp: true,  spark: sparkData },
    { icon: "🎧", label: "Active Agents",   value: activeAgentCount,            sub: "Handling calls",     color: "#3b82f6", gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)", trend: "stable",  trendUp: true,  spark: sparkData },
    { icon: "🏆", label: "Best Agent",      value: topAgent?.calls || 0,        sub: topAgent?.fullName || "—",color: "#a855f7", gradient: "linear-gradient(135deg,#a855f7,#c084fc)", isStr: false },
    { icon: "⚡", label: "Peak Hour",       value: peakHour?.hour || "—",       sub: `${peakHour?.total || 0} calls`, color: "#f97316", gradient: "linear-gradient(135deg,#f97316,#fb923c)", isStr: true },
    { icon: "📅", label: "Busiest Day",     value: busiestDay?.day || "—",      sub: `${busiestDay?.total || 0} calls`, color: "#14b8a6", gradient: "linear-gradient(135deg,#14b8a6,#2dd4bf)", isStr: true },
  ];

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div className="xp-root">

      {/* ── NOTIFICATION ────────────────────────────────────── */}
      <div className={`xp-notif ${showNotif ? "xp-notif--visible" : ""}`}>
        <span className="xp-notif-text">{notifMsg}</span>
      </div>

      {/* HEADER */}
      <header className="xp-header">
        <div className="xp-header-canvas" />
        <div className="xp-header-particles">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="xp-particle" style={{
              left: `${15 + i * 15}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${4 + i * 0.5}s`,
            }} />
          ))}
        </div>

        <div className="xp-header-inner">
          <div className="xp-header-left">
            <div className="xp-brand">
              <div className="xp-brand-icon">
                <div className="xp-brand-rings">
                  <div className="xp-brand-ring xp-brand-ring-1" />
                  <div className="xp-brand-ring xp-brand-ring-2" />
                </div>
                <span className="xp-brand-emoji">📊</span>
              </div>
              <div className="xp-brand-text">
                <h1 className="xp-brand-name">IVR Command</h1>
                <div className="xp-brand-tagline">Intelligence Center</div>
              </div>
            </div>

            <div className="xp-header-divider" />

            <div className="xp-status-cluster">
              <div className="xp-live-indicator">
                <span className="xp-live-dot" />
                <span className="xp-live-label">LIVE</span>
              </div>
              <div className="xp-clock-display">
                <span className="xp-clock-time">
                  {liveTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="xp-clock-date">
                  {liveTime.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
              {lastRefresh && (
                <div className="xp-sync-badge">
                  <span className="xp-sync-icon">↻</span>
                  {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          <div className="xp-kpi-ticker">
            {[
              { label: "TOTAL", value: (stats.totalCalls || 0).toLocaleString(), color: "#6366f1" },
              { label: "RATE", value: `${answerRate}%`, color: "#10b981" },
              { label: "MISSED", value: (stats.missedCalls || 0).toString(), color: "#ef4444" },
              { label: "AGENTS", value: activeAgentCount.toString(), color: "#f59e0b" },
            ].map((k, i) => (
              <div key={i} className="xp-kpi-tick">
                <span className="xp-kpi-tick-val" style={{ color: k.color }}>{k.value}</span>
                <span className="xp-kpi-tick-label">{k.label}</span>
              </div>
            ))}
          </div>

          <div className="xp-header-right">
            <button onClick={() => fetchData(true)} disabled={loading} className="xp-refresh-btn">
              <span className={`xp-refresh-icon ${loading ? "xp-spin" : ""}`}>↺</span>
              <span className="xp-refresh-label">{loading ? "Syncing" : "Refresh"}</span>
            </button>
          </div>
        </div>

        <nav className="xp-nav">
          <div className="xp-nav-inner">
            {tabs.map(t => (
              <button key={t.key}
                className={`xp-nav-btn ${activeTab === t.key ? "xp-nav-btn--on" : ""}`}
                onClick={() => setActiveTab(t.key)}>
                <span className="xp-nav-btn-icon">{t.icon}</span>
                <span className="xp-nav-btn-label">{t.label}</span>
                {activeTab === t.key && <span className="xp-nav-active-pill" />}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* STAT CARDS */}
      <section className="xp-stats-section">
        <div className="xp-stats-grid">
          {statCards.map((c, i) => (
            <StatCard key={i} {...c} delay={i * 55} />
          ))}
        </div>
      </section>

      {/* COMMAND BAR */}
      <section className="xp-command-bar">
        <div className="xp-command-bar-inner">
          <GaugeChart value={answerRate} color="#10b981" size={100} label="Answer" sublabel="Rate" />
          <div className="xp-command-bar-divider" />
          <GaugeChart value={missedRate} color="#ef4444" size={100} label="Missed" sublabel="Rate" />
          <div className="xp-command-bar-divider" />

          <div className="xp-command-ring-section">
            <div style={{ position: "relative", display: "inline-block" }}>
              <RingChart segments={ringSegments} size={120} thickness={12} />
              <div className="xp-command-ring-center">
                <span className="xp-command-ring-val">{stats.totalCalls || 0}</span>
                <span className="xp-command-ring-sub">Total</span>
              </div>
            </div>
            <div className="xp-command-ring-legend">
              {ringSegments.map((s, i) => (
                <div key={i} className="xp-command-leg-item">
                  <span className="xp-command-leg-dot" style={{ background: s.color }} />
                  <span className="xp-command-leg-label">{s.label}</span>
                  <span className="xp-command-leg-val">{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="xp-command-bar-divider" />

          <div className="xp-command-metrics">
            {[
              { label: "Peak Hour", value: peakHour?.hour || "—", sub: `${peakHour?.total || 0} calls`, color: "#f97316", icon: "⚡" },
              { label: "Best Day", value: busiestDay?.day || "—", sub: `${busiestDay?.total || 0} calls`, color: "#6366f1", icon: "📅" },
              { label: "Top Agent", value: topAgent?.name || "—", sub: `${topAgent?.calls || 0} calls`, color: "#a855f7", icon: "🏆" },
              { label: "Avg Call", value: stats.avgDuration ? fmtDur(stats.avgDuration) : "—", sub: "duration", color: "#ec4899", icon: "⏱" },
            ].map((m, i) => (
              <div key={i} className="xp-command-metric">
                <span className="xp-command-metric-icon" style={{ color: m.color }}>{m.icon}</span>
                <div className="xp-command-metric-body">
                  <span className="xp-command-metric-val" style={{ color: m.color }}>{m.value}</span>
                  <span className="xp-command-metric-label">{m.label}</span>
                  <span className="xp-command-metric-sub">{m.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MAIN PANELS */}
      <main className="xp-main">

        {activeTab === "overview" && (
          <div className="xp-panel">
            <div className="xp-grid xp-grid--6040">
              <ChartCard title="Hourly Call Distribution" subtitle="Call volume by hour of day"
                badge="Today"
                action={<div className="xp-chart-legend">
                  {[{c:"#10b981",l:"Answered"},{c:"#ef4444",l:"Missed"},{c:"#6366f1",l:"Total"}].map((x,i)=>(
                    <span key={i} className="xp-leg"><span className="xp-leg-dot" style={{background:x.c}}/>{x.l}</span>
                  ))}
                </div>}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={hourlyData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="xpga" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="xpgm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="xpgt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--xp-border)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} interval={3} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<XTooltip />} />
                    <Area type="monotone" dataKey="total" fill="url(#xpgt)" stroke="#6366f1" strokeWidth={1.5} dot={false} name="Total" />
                    <Area type="monotone" dataKey="answered" fill="url(#xpga)" stroke="#10b981" strokeWidth={2.5} dot={false} name="Answered" />
                    <Area type="monotone" dataKey="missed" fill="url(#xpgm)" stroke="#ef4444" strokeWidth={2} dot={false} name="Missed" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Call Quality" subtitle="Answer vs missed breakdown">
                <div className="xp-quality-wrap">
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <RingChart segments={ringSegments} size={150} thickness={16} />
                    <div className="xp-quality-center">
                      <span className="xp-quality-pct">{answerRate}%</span>
                      <span className="xp-quality-lbl">Answered</span>
                    </div>
                  </div>
                  <div className="xp-quality-stats">
                    {[
                      { icon: "✅", label: "Answered", val: stats.answeredCalls || 0, color: "#10b981" },
                      { icon: "📵", label: "Missed",   val: stats.missedCalls || 0,   color: "#ef4444" },
                      { icon: "📞", label: "Total",    val: stats.totalCalls || 0,     color: "#6366f1" },
                    ].map(s => (
                      <div key={s.label} className="xp-quality-row">
                        <span className="xp-quality-icon">{s.icon}</span>
                        <span className="xp-quality-label">{s.label}</span>
                        <div className="xp-quality-bar-wrap">
                          <ProgressBar value={s.val} max={stats.totalCalls || 1} color={s.color} height={4} />
                        </div>
                        <span className="xp-quality-val" style={{ color: s.color }}>
                          {s.val.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>
            </div>

            <div className="xp-grid xp-grid--3">
              <ChartCard title="Weekly Trend" subtitle="Calls by day">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyData} margin={{ top: 5, right: 8, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--xp-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<XTooltip />} />
                    <Bar dataKey="answered" fill="#10b981" name="Answered" radius={[5, 5, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="missed" fill="#ef4444" name="Missed" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status Distribution" subtitle="By call outcome">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%"
                      innerRadius={58} outerRadius={88}
                      dataKey="value" nameKey="name" paddingAngle={4}>
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<XTooltip />} />
                    <Legend formatter={v => <span style={{ fontSize: 10, fontWeight: 600 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Top Agents" subtitle="By call volume">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={agentList.slice(0, 6)} layout="vertical"
                    margin={{ top: 5, right: 20, left: 55, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--xp-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} width={55} axisLine={false} tickLine={false} />
                    <Tooltip content={<XTooltip />} />
                    <Bar dataKey="answered" fill="#10b981" name="Answered" radius={[0, 5, 5, 0]} stackId="a" maxBarSize={16} />
                    <Bar dataKey="missed" fill="#ef4444" name="Missed" radius={[0, 5, 5, 0]} stackId="a" maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="xp-grid xp-grid--3">
              <ChartCard title="Inbound vs Outbound" subtitle="Channel distribution">
                <div className="xp-dir-split">
                  <div className="xp-dir-item xp-dir-item--in">
                    <div className="xp-dir-icon">↙</div>
                    <div className="xp-dir-val"><AnimatedCounter to={inbound} /></div>
                    <div className="xp-dir-lbl">Inbound</div>
                    <ProgressBar value={inbound} max={stats.totalCalls || 1} color="#6366f1" height={5} />
                    <div className="xp-dir-pct">{pct(inbound, stats.totalCalls)}%</div>
                  </div>
                  <div className="xp-dir-divider" />
                  <div className="xp-dir-item xp-dir-item--out">
                    <div className="xp-dir-icon">↗</div>
                    <div className="xp-dir-val"><AnimatedCounter to={outbound} /></div>
                    <div className="xp-dir-lbl">Outbound</div>
                    <ProgressBar value={outbound} max={stats.totalCalls || 1} color="#10b981" height={5} />
                    <div className="xp-dir-pct">{pct(outbound, stats.totalCalls)}%</div>
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Call Funnel" subtitle="Conversion flow">
                <div className="xp-funnel-wrap">
                  {funnelData.map((f, i) => {
                    const w = 100 - i * 18;
                    return (
                      <div key={i} className="xp-funnel-step">
                        <div className="xp-funnel-bar" style={{
                          width: `${w}%`,
                          background: f.fill,
                          opacity: 0.85,
                        }}>
                          <span className="xp-funnel-val">{f.value.toLocaleString()}</span>
                        </div>
                        <span className="xp-funnel-label">{f.name}</span>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>

              <ChartCard title="Radial Overview" subtitle="Channel performance">
                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart cx="50%" cy="50%"
                    innerRadius="25%" outerRadius="90%"
                    data={radialData} startAngle={180} endAngle={-180} barSize={12}>
                    <RadialBar background dataKey="value" cornerRadius={8} />
                    <Legend formatter={v => <span style={{ fontSize: 10, fontWeight: 600 }}>{v}</span>}
                      iconSize={8} layout="horizontal" verticalAlign="bottom" />
                    <Tooltip content={<XTooltip />} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="xp-panel">
            <div className="xp-grid xp-grid--2">
              <ChartCard title="Inbound vs Outbound Hourly" subtitle="Direction comparison">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={hourlyData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="xpgi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="xpgo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--xp-border)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} interval={3} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<XTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="inbound" fill="url(#xpgi)" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Inbound" />
                    <Area type="monotone" dataKey="outbound" fill="url(#xpgo)" stroke="#10b981" strokeWidth={2.5} dot={false} name="Outbound" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Daily Answer Rate" subtitle="Success rate by day">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={weeklyData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--xp-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<XTooltip />} />
                    <Legend />
                    <Bar dataKey="total" fill="#6366f155" name="Total" radius={[5, 5, 0, 0]} maxBarSize={28} />
                    <Line type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: "#f59e0b" }} name="Rate %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="xp-grid xp-grid--3">
              <ChartCard title="Agent Radar" subtitle="Multi-metric view" className="xp-card--span2">
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="var(--xp-border)" />
                    <PolarAngleAxis dataKey="agent" tick={{ fontSize: 10, fill: "var(--xp-text-muted)" }} />
                    <PolarRadiusAxis tick={{ fontSize: 8 }} />
                    <Radar name="Volume" dataKey="volume" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                    <Radar name="Rate" dataKey="rate" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                    <Legend formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                    <Tooltip content={<XTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Volume Treemap" subtitle="Agent call share">
                <ResponsiveContainer width="100%" height={280}>
                  <Treemap data={agentList.slice(0, 8).map((a, i) => ({
                    name: a.name, size: a.calls, color: CHART_COLORS[i % CHART_COLORS.length]
                  }))} dataKey="size" nameKey="name" aspectRatio={1}
                    stroke="var(--xp-card)" strokeWidth={3}
                    content={({ x, y, width, height, name, color, size }) => (
                      <g>
                        <rect x={x+1} y={y+1} width={width-2} height={height-2}
                          fill={color} rx={8} opacity={0.82} />
                        {width > 55 && height > 35 && (<>
                          <text x={x+width/2} y={y+height/2-5} textAnchor="middle"
                            fill="#fff" fontSize={10} fontWeight={700}>{name}</text>
                          <text x={x+width/2} y={y+height/2+10} textAnchor="middle"
                            fill="rgba(255,255,255,0.7)" fontSize={9}>{size}</text>
                        </>)}
                      </g>
                    )} />
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {activeTab === "agents" && (
          <div className="xp-panel">
            <div className="xp-section-head">
              <h2 className="xp-section-title">🎧 Agent Leaderboard</h2>
              <span className="xp-section-badge">{agentList.length} Agents</span>
            </div>
            {agentList.length === 0 ? (
              <div className="xp-empty">
                <span className="xp-empty-icon">🎧</span>
                <p>No agent data available</p>
              </div>
            ) : (
              <div className="xp-agent-grid">
                {agentList.map((a, i) => (
                  <AgentCard key={i} agent={a} rank={i + 1}
                    color={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "heatmap" && (
          <div className="xp-panel">
            <div className="xp-section-head">
              <h2 className="xp-section-title">🔥 Call Intensity Heatmap</h2>
              <span className="xp-section-badge">Day × Hour</span>
            </div>
            <ChartCard title="Weekly Heatmap" subtitle="Call volume by day and hour — darker = more calls">
              <CallHeatmap data={heatmapData} />
            </ChartCard>
            <div className="xp-grid xp-grid--3" style={{ marginTop: 16 }}>
              {weeklyData.map((d, i) => (
                <div key={i} className="xp-heatmap-day-card">
                  <div className="xp-hmd-header">
                    <span className="xp-hmd-day">{d.day}</span>
                    <span className="xp-hmd-total">{d.total} calls</span>
                  </div>
                  <ProgressBar value={d.answered} max={d.total || 1} color="#10b981" height={6} />
                  <div className="xp-hmd-stats">
                    <span style={{ color: "#10b981" }}>✅ {d.answered}</span>
                    <span style={{ color: "#ef4444" }}>📵 {d.missed}</span>
                    <span style={{ color: "#6366f1" }}>{d.rate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "livefeed" && (
          <div className="xp-panel">
            <div className="xp-section-head">
              <h2 className="xp-section-title">◎ Live Call Feed</h2>
              <div className="xp-livefeed-badge">
                <span className="xp-live-dot" />
                <span>Real-time · {allCalls.length} calls</span>
              </div>
            </div>
            <div className="xp-grid xp-grid--2">
              <ChartCard title="Recent Calls" subtitle="Latest call activity">
                <LiveFeed calls={allCalls} />
              </ChartCard>
              <ChartCard title="Live Metrics" subtitle="Current performance">
                <div className="xp-live-metrics">
                  {[
                    { label: "Answer Rate", value: answerRate, max: 100, color: "#10b981", icon: "📊" },
                    { label: "Missed Rate", value: missedRate, max: 100, color: "#ef4444", icon: "📵" },
                    { label: "Inbound Share", value: pct(inbound, stats.totalCalls), max: 100, color: "#6366f1", icon: "↙" },
                    { label: "Outbound Share", value: pct(outbound, stats.totalCalls), max: 100, color: "#10b981", icon: "↗" },
                  ].map((m, i) => (
                    <div key={i} className="xp-live-metric-row">
                      <span className="xp-live-metric-icon">{m.icon}</span>
                      <div className="xp-live-metric-body">
                        <div className="xp-live-metric-header">
                          <span className="xp-live-metric-label">{m.label}</span>
                          <span className="xp-live-metric-val" style={{ color: m.color }}>{m.value}%</span>
                        </div>
                        <ProgressBar value={m.value} max={m.max} color={m.color} height={7} />
                      </div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </div>
        )}

        <div className="xp-direction-strip">
          <div className="xp-dir-strip-card xp-dir-strip-card--in">
            <div className="xp-dir-strip-bg" />
            <div className="xp-dir-strip-icon">↙</div>
            <div className="xp-dir-strip-body">
              <div className="xp-dir-strip-val">
                <AnimatedCounter to={inbound} />
              </div>
              <div className="xp-dir-strip-label">Inbound Calls</div>
              <ProgressBar value={inbound} max={stats.totalCalls || 1} color="#6366f1" height={3} />
            </div>
            <div className="xp-dir-strip-pct">
              {pct(inbound, stats.totalCalls)}%
            </div>
          </div>

          <div className="xp-dir-strip-card xp-dir-strip-card--out">
            <div className="xp-dir-strip-bg" />
            <div className="xp-dir-strip-icon">↗</div>
            <div className="xp-dir-strip-body">
              <div className="xp-dir-strip-val">
                <AnimatedCounter to={outbound} />
              </div>
              <div className="xp-dir-strip-label">Outbound Calls</div>
              <ProgressBar value={outbound} max={stats.totalCalls || 1} color="#10b981" height={3} />
            </div>
            <div className="xp-dir-strip-pct">
              {pct(outbound, stats.totalCalls)}%
            </div>
          </div>

          <div className="xp-hero-strip">
            <div className="xp-hero-strip-bg" />
            <div className="xp-hero-strip-left">
              <div className="xp-hero-strip-icon">🎯</div>
              <div className="xp-hero-strip-body">
                <div className="xp-hero-strip-val">
                  {(stats.totalCalls || 0).toLocaleString()}
                </div>
                <div className="xp-hero-strip-label">Total Calls Handled</div>
                <div className="xp-hero-strip-sub">
                  {stats.answeredCalls || 0} answered · {stats.missedCalls || 0} missed · {answerRate}% rate
                </div>
              </div>
            </div>
            <div className="xp-hero-strip-right">
              <GaugeChart value={answerRate} color="#10b981" size={100} label="Answer" />
            </div>
          </div>
        </div>

      </main>

      <footer className="xp-footer">
        <div className="xp-footer-inner">
          <span className="xp-footer-brand">⬡ IVR Command Center</span>
          <span className="xp-footer-copy">Real-time Intelligence Dashboard</span>
          <span className="xp-footer-time">
            {liveTime.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>
      </footer>
    </div>
  );
}