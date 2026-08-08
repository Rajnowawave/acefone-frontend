import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";
import "./Agents.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const safeTs = (c) => {
  if (!c?.createdAt) return 0;
  if (c.createdAt._seconds) return c.createdAt._seconds * 1000;
  const t = new Date(c.createdAt).getTime();
  return isNaN(t) ? 0 : t;
};

const fmtDur = (s) => {
  s = Number(s) || 0;
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const norm = (s = "") => String(s).toLowerCase().trim();

const COLORS = ["#2c3e6b", "#c17f3e", "#3d5080", "#d4954f", "#1e2d5a", "#e8a85a", "#4a6090", "#b8732e"];
const STATUS_COLORS = { online: "#27694f", active: "#27694f", offline: "#9b9690", busy: "#c17f3e", away: "#d4954f" };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="ag-tooltip">
      <div className="ag-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="ag-tooltip-row">
          <span className="ag-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}: <strong>{p.value}</strong></span>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ icon, label, value, color, sub, trend }) => (
  <div className="ag-summary-card" style={{ "--card-accent": color }}>
    <div className="ag-summary-card-bg" />
    <div className="ag-summary-top">
      <div className="ag-summary-icon-wrap" style={{ background: color + "15" }}>
        <span className="ag-summary-icon">{icon}</span>
      </div>
      {trend !== undefined && (
        <span className={`ag-trend ${trend >= 0 ? "ag-trend--up" : "ag-trend--down"}`}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div className="ag-summary-val" style={{ color }}>{value}</div>
    <div className="ag-summary-label">{label}</div>
    {sub && <div className="ag-summary-sub">{sub}</div>}
  </div>
);

const AgentDetailPanel = ({ agent, allCalls, onClose }) => {
  const agentCalls = allCalls.filter(c => c.answered_agent_name === agent.name);

  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`, calls: 0, answered: 0, missed: 0
    }));
    agentCalls.forEach(c => {
      const ts = safeTs(c);
      if (!ts) return;
      const h = new Date(ts).getHours();
      arr[h].calls++;
      if (["answered", "completed", "connected", "called"].includes(norm(c.call_status))) arr[h].answered++;
      else if (["missed", "no_answer", "no-answer", "failed"].includes(norm(c.call_status))) arr[h].missed++;
    });
    return arr;
  }, [agentCalls]);

  const weeklyData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const arr = days.map(d => ({ day: d, calls: 0, answered: 0 }));
    agentCalls.forEach(c => {
      const ts = safeTs(c);
      if (!ts) return;
      const d = new Date(ts).getDay();
      arr[d].calls++;
      if (["answered", "completed", "connected", "called"].includes(norm(c.call_status))) arr[d].answered++;
    });
    return arr;
  }, [agentCalls]);

  const radarData = [
    { metric: "Answer Rate", value: agent.rate },
    { metric: "Call Volume", value: Math.min(100, Math.round((agent.calls / 50) * 100)) },
    { metric: "Inbound", value: agent.calls > 0 ? Math.round((agent.inbound / agent.calls) * 100) : 0 },
    { metric: "Outbound", value: agent.calls > 0 ? Math.round((agent.outbound / agent.calls) * 100) : 0 },
    { metric: "Avg Duration", value: Math.min(100, Math.round((agent.avgDur / 300) * 100)) },
  ];

  const recentCalls = [...agentCalls].sort((a, b) => safeTs(b) - safeTs(a)).slice(0, 15);

  const [detailTab, setDetailTab] = useState("overview");

  return (
    <div className="ag-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ag-detail-panel">
        {/* Header */}
        <div className="ag-detail-header">
          <div className="ag-detail-header-bg" />
          <div className="ag-detail-avatar-wrap">
            <div className="ag-detail-avatar">
              {agent.name?.charAt(0).toUpperCase()}
            </div>
            <span
              className="ag-detail-status-dot"
              style={{ background: STATUS_COLORS[agent.status] || "#9b9690" }}
            />
          </div>
          <div className="ag-detail-identity">
            <h2 className="ag-detail-name">{agent.name}</h2>
            <div className="ag-detail-badges">
              <span className={`ag-status-pill ag-status-pill--${agent.status}`}>{agent.status}</span>
              <span className="ag-detail-badge">{agent.calls} calls</span>
              {agent.inbound > 0 && <span className="ag-detail-badge">↙ {agent.inbound} in</span>}
              {agent.outbound > 0 && <span className="ag-detail-badge">↗ {agent.outbound} out</span>}
            </div>
          </div>
          <button className="ag-detail-close" onClick={onClose}>✕</button>
        </div>

        {/* Detail Tabs */}
        <div className="ag-detail-tabs">
          {[
            { id: "overview", l: "Overview" },
            { id: "activity", l: "Activity" },
            { id: "calls", l: "Recent Calls" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setDetailTab(t.id)}
              className={`ag-detail-tab ${detailTab === t.id ? "ag-detail-tab--active" : ""}`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="ag-detail-body">

          {/* Overview Tab */}
          {detailTab === "overview" && (
            <>
              <div className="ag-detail-kpi-grid">
                {[
                  { l: "Total Calls", v: agent.calls, c: "#2c3e6b", icon: "📞" },
                  { l: "Answered", v: agent.answered, c: "#27694f", icon: "✅" },
                  { l: "Missed", v: agent.missed, c: "#c0392b", icon: "📵" },
                  { l: "Answer Rate", v: `${agent.rate}%`, c: "#c17f3e", icon: "📊" },
                  { l: "Avg Duration", v: fmtDur(agent.avgDur), c: "#3d5080", icon: "⏱" },
                  { l: "Inbound", v: agent.inbound, c: "#8b5cf6", icon: "↙" },
                ].map((s, i) => (
                  <div key={i} className="ag-kpi-card" style={{ "--kc": s.c }}>
                    <div className="ag-kpi-icon">{s.icon}</div>
                    <div className="ag-kpi-val" style={{ color: s.c }}>{s.v}</div>
                    <div className="ag-kpi-label">{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Rate Bar */}
              <div className="ag-detail-rate-section">
                <div className="ag-detail-rate-header">
                  <span className="ag-detail-section-label">Answer Rate Performance</span>
                  <span className="ag-detail-rate-pct" style={{
                    color: agent.rate >= 70 ? "#27694f" : agent.rate >= 40 ? "#c17f3e" : "#c0392b"
                  }}>{agent.rate}%</span>
                </div>
                <div className="ag-detail-rate-bar">
                  <div
                    className="ag-detail-rate-fill"
                    style={{
                      width: `${agent.rate}%`,
                      background: agent.rate >= 70
                        ? "linear-gradient(90deg,#27694f,#2d8a65)"
                        : agent.rate >= 40
                        ? "linear-gradient(90deg,#c17f3e,#d4954f)"
                        : "linear-gradient(90deg,#c0392b,#e74c3c)"
                    }}
                  />
                </div>
                <div className="ag-detail-rate-marks">
                  <span>0%</span><span>Poor</span><span>Fair</span><span>Good</span><span>100%</span>
                </div>
              </div>

              {/* Radar */}
              <div className="ag-detail-section-label" style={{ marginBottom: 8 }}>Performance Radar</div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e8e5de" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#4a4740" }} />
                  <Radar dataKey="value" fill="#2c3e6b" fillOpacity={0.15} stroke="#2c3e6b" strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </>
          )}

          {/* Activity Tab */}
          {detailTab === "activity" && (
            <>
              <div className="ag-detail-section-label">Hourly Call Distribution</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourly} margin={{ top: 5, right: 10, left: -30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
                  <XAxis dataKey="hour" tick={{ fontSize: 8 }} interval={3} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="answered" fill="#2c3e6b" radius={[3, 3, 0, 0]} name="Answered" stackId="a" />
                  <Bar dataKey="missed" fill="#c17f3e" radius={[3, 3, 0, 0]} name="Missed" stackId="a" />
                </BarChart>
              </ResponsiveContainer>

              <div className="ag-detail-section-label" style={{ marginTop: 20 }}>Weekly Pattern</div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -30, bottom: 5 }}>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2c3e6b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2c3e6b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area dataKey="calls" fill="url(#wGrad)" stroke="#2c3e6b" strokeWidth={2} name="Calls" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}

          {/* Recent Calls Tab */}
          {detailTab === "calls" && (
            <div className="ag-recent-list">
              {!recentCalls.length && (
                <div className="ag-recent-empty">No calls found for this agent</div>
              )}
              {recentCalls.map((c, i) => {
                const ts = safeTs(c);
                const num = norm(c.direction) === "inbound"
                  ? (c.caller_id_number || c.call_to_number)
                  : c.call_to_number;
                const isMissed = ["missed", "no_answer", "no-answer", "failed"].includes(norm(c.call_status));
                const isIn = norm(c.direction) === "inbound";
                return (
                  <div key={i} className={`ag-recent-item ${isMissed ? "ag-recent-item--missed" : ""}`}>
                    <div className={`ag-recent-icon-wrap ${isMissed ? "ag-recent-icon-wrap--miss" : "ag-recent-icon-wrap--ok"}`}>
                      <span>{isMissed ? "📵" : isIn ? "↙" : "↗"}</span>
                    </div>
                    <div className="ag-recent-info">
                      <span className="ag-recent-num">{num || "Unknown"}</span>
                      <span className="ag-recent-time">
                        {ts ? new Date(ts).toLocaleString("en-IN", {
                          day: "2-digit", month: "short",
                          hour: "2-digit", minute: "2-digit"
                        }) : "—"}
                      </span>
                    </div>
                    <div className="ag-recent-meta">
                      <span className={`ag-recent-badge ${isMissed ? "ag-recent-badge--miss" : "ag-recent-badge--ok"}`}>
                        {c.call_status}
                      </span>
                      <span className="ag-recent-dur">{fmtDur(c.billsec)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [allCalls, setAllCalls] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("calls");
  const [toast, setToast] = useState({ show: false, msg: "", type: "success" });
  const [viewMode, setViewMode] = useState("grid");

  const showToast = (msg, type = "success") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "success" }), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s, c] = await Promise.all([
        fetch(`${API}/agents`).then(r => r.json()),
        fetch(`${API}/stats`).then(r => r.json()),
        fetch(`${API}/call-logs?limit=500`).then(r => r.json()),
      ]);
      setAgents(Array.isArray(a) ? a : []);
      setStats(s || {});
      setAllCalls(Array.isArray(c) ? c : []);
      showToast("Data refreshed successfully");
    } catch {
      showToast("Failed to fetch data", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const agentMetrics = useMemo(() => {
    const map = {};
    allCalls.forEach(c => {
      const name = c.answered_agent_name || "Unknown";
      if (!map[name]) {
        map[name] = {
          name, calls: 0, answered: 0, missed: 0,
          totalDur: 0, inbound: 0, outbound: 0, lastCall: 0
        };
      }
      map[name].calls++;
      const ts = safeTs(c);
      if (ts > map[name].lastCall) map[name].lastCall = ts;
      if (["answered", "completed", "connected", "called"].includes(norm(c.call_status))) {
        map[name].answered++;
        map[name].totalDur += Number(c.billsec) || 0;
      } else if (["missed", "no_answer", "no-answer", "failed"].includes(norm(c.call_status))) {
        map[name].missed++;
      }
      if (norm(c.direction) === "inbound") map[name].inbound++;
      else map[name].outbound++;
    });
    return Object.values(map).map(a => ({
      ...a,
      rate: a.calls > 0 ? Math.round((a.answered / a.calls) * 100) : 0,
      avgDur: a.answered > 0 ? Math.round(a.totalDur / a.answered) : 0,
    }));
  }, [allCalls]);

  const enrichedAgents = useMemo(() => {
    const metricMap = Object.fromEntries(agentMetrics.map(m => [m.name, m]));
    const fromList = agents.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status || "offline",
      ...(metricMap[a.name] || {
        calls: 0, answered: 0, missed: 0,
        totalDur: 0, inbound: 0, outbound: 0,
        rate: 0, avgDur: 0, lastCall: 0
      }),
    }));
    const fromCalls = agentMetrics
      .filter(m => m.name !== "Unknown" && !agents.find(a => a.name === m.name))
      .map(m => ({ id: m.name, ...m, status: "offline" }));
    return [...fromList, ...fromCalls];
  }, [agents, agentMetrics]);

  const filtered = useMemo(() => {
    let r = [...enrichedAgents];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(a => a.name?.toLowerCase().includes(q));
    }
    const sorters = {
      calls: (a, b) => b.calls - a.calls,
      rate: (a, b) => b.rate - a.rate,
      name: (a, b) => (a.name || "").localeCompare(b.name || ""),
      answered: (a, b) => b.answered - a.answered,
      missed: (a, b) => b.missed - a.missed,
    };
    r.sort(sorters[sortBy] || sorters.calls);
    return r;
  }, [enrichedAgents, search, sortBy]);

  const totalAgents = enrichedAgents.length;
  const onlineAgents = enrichedAgents.filter(a => a.status === "online" || a.status === "active").length;
  const topAgent = [...enrichedAgents].sort((a, b) => b.calls - a.calls)[0];
  const totalCalls = enrichedAgents.reduce((s, a) => s + a.calls, 0);
  const avgRate = enrichedAgents.length > 0
    ? Math.round(enrichedAgents.reduce((s, a) => s + a.rate, 0) / enrichedAgents.length)
    : 0;

  const pieData = useMemo(() =>
    filtered.slice(0, 8).map(a => ({ name: a.name, value: a.calls })).filter(d => d.value > 0),
    [filtered]
  );

  const barData = useMemo(() =>
    filtered.slice(0, 10).map(a => ({
      name: a.name?.split(" ")[0] || a.name,
      Answered: a.answered,
      Missed: a.missed,
      "Answer Rate": a.rate,
    })),
    [filtered]
  );

  const trendData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const dayStart = new Date(d.setHours(0, 0, 0, 0)).getTime();
      const dayEnd = dayStart + 86400000;
      const dayCalls = allCalls.filter(c => {
        const ts = safeTs(c);
        return ts >= dayStart && ts < dayEnd;
      });
      days.push({
        date: label,
        calls: dayCalls.length,
        answered: dayCalls.filter(c => ["answered", "completed", "connected", "called"].includes(norm(c.call_status))).length,
      });
    }
    return days;
  }, [allCalls]);

  return (
    <div className="ag-root">
      {/* Toast */}
      {toast.show && (
        <div className={`ag-toast ag-toast--${toast.type}`}>
          <span>{toast.type === "success" ? "✓" : "⚠"}</span>
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="ag-page-header">
        <div className="ag-page-header-bg" />
        <div className="ag-page-header-inner">
          <div className="ag-page-title-group">
            <div className="ag-page-icon">👥</div>
            <div>
              <h1 className="ag-page-title">Agent Management</h1>
              <p className="ag-page-sub">Monitor performance, activity & call statistics</p>
            </div>
          </div>
          <div className="ag-header-actions">
            <div className="ag-view-toggle">
              <button
                onClick={() => setViewMode("grid")}
                className={`ag-view-btn ${viewMode === "grid" ? "ag-view-btn--active" : ""}`}
                title="Grid View"
              >⊞</button>
              <button
                onClick={() => setViewMode("list")}
                className={`ag-view-btn ${viewMode === "list" ? "ag-view-btn--active" : ""}`}
                title="List View"
              >≡</button>
            </div>
            <button onClick={fetchAll} disabled={loading} className="ag-refresh-btn">
              <span className={loading ? "ag-spin" : ""}>🔄</span>
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="ag-summary-grid">
        <StatCard icon="👥" label="Total Agents" value={totalAgents} color="#2c3e6b" sub="Registered agents" />
        <StatCard icon="🟢" label="Online Now" value={onlineAgents} color="#27694f" sub={`${totalAgents - onlineAgents} offline`} />
        <StatCard icon="📞" label="Total Calls" value={totalCalls.toLocaleString()} color="#c17f3e" sub="All time" />
        <StatCard icon="📊" label="Avg Answer Rate" value={`${avgRate}%`} color="#3d5080" sub="Across all agents" />
        <StatCard icon="🏆" label="Top Agent" value={topAgent?.name?.split(" ")[0] || "—"} color="#d4954f" sub={topAgent ? `${topAgent.calls} calls` : ""} />
      </div>

      {/* ── 7-Day Trend ── */}
      <div className="ag-trend-card">
        <div className="ag-trend-header">
          <h3 className="ag-trend-title">📈 7-Day Call Trend</h3>
          <div className="ag-trend-legend">
            <span className="ag-legend-dot" style={{ background: "#2c3e6b" }} /> Total
            <span className="ag-legend-dot" style={{ background: "#27694f" }} /> Answered
          </div>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="trendTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2c3e6b" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#2c3e6b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="trendAns" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#27694f" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#27694f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9b9690" }} />
            <YAxis tick={{ fontSize: 9, fill: "#9b9690" }} />
            <Tooltip content={<CustomTooltip />} />
            <Area dataKey="calls" stroke="#2c3e6b" fill="url(#trendTotal)" strokeWidth={2} name="Total" />
            <Area dataKey="answered" stroke="#27694f" fill="url(#trendAns)" strokeWidth={2} name="Answered" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Tabs ── */}
      <div className="ag-tabs-wrap">
        <div className="ag-tabs">
          {[
            { id: "overview", l: "📊 Overview" },
            { id: "table", l: "📋 Table" },
            { id: "charts", l: "📈 Charts" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`ag-tab ${tab === t.id ? "ag-tab--active" : ""}`}
            >
              {t.l}
              {tab === t.id && <span className="ag-tab-line" />}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="ag-toolbar">
          <div className="ag-search-wrap">
            <span className="ag-search-icon">🔍</span>
            <input
              placeholder="Search agents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ag-search"
            />
            {search && (
              <button className="ag-search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
          <select
            className="ag-sort-sel"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="calls">Most Calls</option>
            <option value="answered">Most Answered</option>
            <option value="missed">Most Missed</option>
            <option value="rate">Answer Rate</option>
            <option value="name">Name A–Z</option>
          </select>
          <span className="ag-count-badge">{filtered.length} agents</span>
        </div>
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <>
          {loading && (
            <div className="ag-loading-wrap">
              <div className="ag-loading-spinner" />
              <span>Loading agents...</span>
            </div>
          )}
          {!loading && !filtered.length && (
            <div className="ag-empty">
              <span className="ag-empty-icon">🔍</span>
              <p>No agents found</p>
              {search && <button className="ag-empty-clear" onClick={() => setSearch("")}>Clear search</button>}
            </div>
          )}
          <div className={`ag-cards-grid ${viewMode === "list" ? "ag-cards-grid--list" : ""}`}>
            {!loading && filtered.map((agent, i) => (
              <div
                key={agent.id || i}
                className="ag-card"
                style={{ "--accent-c": COLORS[i % COLORS.length] }}
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="ag-card-header-strip" style={{ background: COLORS[i % COLORS.length] }} />

                <div className="ag-card-top">
                  <div
                    className="ag-card-avatar"
                    style={{
                      background: COLORS[i % COLORS.length] + "18",
                      color: COLORS[i % COLORS.length],
                      borderColor: COLORS[i % COLORS.length] + "30"
                    }}
                  >
                    {agent.name?.charAt(0).toUpperCase() || "?"}
                    <span
                      className="ag-card-status-dot"
                      style={{ background: STATUS_COLORS[agent.status] || "#9b9690" }}
                    />
                  </div>
                  <div className="ag-card-info">
                    <div className="ag-card-name">{agent.name}</div>
                    <span className={`ag-status-pill ag-status-pill--${agent.status}`}>{agent.status}</span>
                  </div>
                  <div
                    className="ag-card-rate-badge"
                    style={{
                      color: agent.rate >= 70 ? "#27694f" : agent.rate >= 40 ? "#c17f3e" : "#c0392b",
                      background: agent.rate >= 70 ? "rgba(39,105,79,0.08)" : agent.rate >= 40 ? "rgba(193,127,62,0.08)" : "rgba(192,57,43,0.08)",
                      borderColor: agent.rate >= 70 ? "rgba(39,105,79,0.2)" : agent.rate >= 40 ? "rgba(193,127,62,0.2)" : "rgba(192,57,43,0.2)",
                    }}
                  >
                    {agent.rate}%
                  </div>
                </div>

                <div className="ag-card-divider" />

                <div className="ag-card-stats">
                  {[
                    { v: agent.calls, l: "Total" },
                    { v: agent.answered, l: "Answered", c: "#27694f" },
                    { v: agent.missed, l: "Missed", c: "#c0392b" },
                    { v: fmtDur(agent.avgDur), l: "Avg Dur" },
                  ].map((s, j) => (
                    <div key={j} className="ag-card-stat">
                      <span className="ag-card-stat-val" style={s.c ? { color: s.c } : {}}>{s.v}</span>
                      <span className="ag-card-stat-label">{s.l}</span>
                    </div>
                  ))}
                </div>

                <div className="ag-card-progress-wrap">
                  <div className="ag-card-progress-track">
                    <div
                      className="ag-card-progress-fill"
                      style={{
                        width: `${agent.rate}%`,
                        background: agent.rate >= 70
                          ? "linear-gradient(90deg,#27694f,#2d8a65)"
                          : agent.rate >= 40
                          ? "linear-gradient(90deg,#c17f3e,#d4954f)"
                          : "linear-gradient(90deg,#c0392b,#e74c3c)"
                      }}
                    />
                  </div>
                </div>

                <div className="ag-card-footer">
                  <span className="ag-card-dir">
                    <span style={{ color: "#2c3e6b" }}>↙{agent.inbound}</span>
                    <span style={{ color: "#c17f3e" }}>↗{agent.outbound}</span>
                  </span>
                  {agent.lastCall > 0 && (
                    <span className="ag-card-last">
                      {new Date(agent.lastCall).toLocaleString("en-IN", {
                        day: "2-digit", month: "short",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  )}
                </div>

                <div className="ag-card-hover-overlay">View Details →</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Table ── */}
      {tab === "table" && (
        <div className="ag-table-wrap">
          <table className="ag-table">
            <thead>
              <tr>
                {["#", "Agent", "Status", "Total", "Answered", "Missed", "Inbound", "Outbound", "Rate", "Avg Duration", "Last Call"].map((h, i) => (
                  <th key={i} className="ag-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filtered.length && (
                <tr><td colSpan={11} className="ag-td-empty">No agents found</td></tr>
              )}
              {filtered.map((agent, i) => (
                <tr
                  key={agent.id || i}
                  className="ag-tr"
                  onClick={() => setSelectedAgent(agent)}
                >
                  <td className="ag-td ag-td--num">{i + 1}</td>
                  <td className="ag-td">
                    <div className="ag-table-agent">
                      <div
                        className="ag-table-avatar"
                        style={{
                          background: COLORS[i % COLORS.length] + "18",
                          color: COLORS[i % COLORS.length]
                        }}
                      >
                        {agent.name?.charAt(0) || "?"}
                      </div>
                      <span className="ag-table-name">{agent.name}</span>
                    </div>
                  </td>
                  <td className="ag-td">
                    <span className={`ag-status-pill ag-status-pill--${agent.status}`}>{agent.status}</span>
                  </td>
                  <td className="ag-td"><strong>{agent.calls}</strong></td>
                  <td className="ag-td ag-td--ok">{agent.answered}</td>
                  <td className="ag-td ag-td--miss">{agent.missed}</td>
                  <td className="ag-td">{agent.inbound}</td>
                  <td className="ag-td">{agent.outbound}</td>
                  <td className="ag-td">
                    <div className="ag-rate-cell">
                      <div className="ag-rate-bar-sm">
                        <div
                          className="ag-rate-fill-sm"
                          style={{
                            width: `${agent.rate}%`,
                            background: agent.rate >= 70 ? "#27694f" : agent.rate >= 40 ? "#c17f3e" : "#c0392b"
                          }}
                        />
                      </div>
                      <span style={{
                        color: agent.rate >= 70 ? "#27694f" : agent.rate >= 40 ? "#c17f3e" : "#c0392b",
                        fontWeight: 700, fontSize: "0.8rem"
                      }}>{agent.rate}%</span>
                    </div>
                  </td>
                  <td className="ag-td ag-td--mono">{fmtDur(agent.avgDur)}</td>
                  <td className="ag-td ag-td--muted">
                    {agent.lastCall > 0
                      ? new Date(agent.lastCall).toLocaleString("en-IN", {
                          day: "2-digit", month: "short",
                          hour: "2-digit", minute: "2-digit"
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Charts ── */}
      {tab === "charts" && (
        <div className="ag-charts-grid">
          <div className="ag-chart-card">
            <div className="ag-chart-header">
              <h3 className="ag-chart-title">📊 Calls by Agent</h3>
              <span className="ag-chart-sub">Answered vs Missed</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 5, right: 20, left: -20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4a4740" }} angle={-35} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: "#9b9690" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Answered" fill="#27694f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Missed" fill="#c17f3e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="ag-chart-card">
            <div className="ag-chart-header">
              <h3 className="ag-chart-title">🍕 Call Distribution</h3>
              <span className="ag-chart-sub">Top 8 agents</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={40}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={3}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={v => <span style={{ fontSize: 11, color: "#4a4740" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="ag-chart-card">
            <div className="ag-chart-header">
              <h3 className="ag-chart-title">📈 Answer Rate</h3>
              <span className="ag-chart-sub">By agent</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 5, right: 20, left: -10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4a4740" }} angle={-35} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: "#9b9690" }} domain={[0, 100]} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Answer Rate" fill="#2c3e6b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="ag-chart-card ag-chart-card--wide">
            <div className="ag-chart-header">
              <h3 className="ag-chart-title">📅 7-Day Trend</h3>
              <span className="ag-chart-sub">Total vs Answered</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="lineGrad1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2c3e6b" />
                    <stop offset="100%" stopColor="#3d5080" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9b9690" }} />
                <YAxis tick={{ fontSize: 11, fill: "#9b9690" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#2c3e6b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#2c3e6b" }}
                  activeDot={{ r: 6 }}
                  name="Total Calls"
                />
                <Line
                  type="monotone"
                  dataKey="answered"
                  stroke="#27694f"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#27694f" }}
                  activeDot={{ r: 6 }}
                  name="Answered"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Detail Panel ── */}
      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          allCalls={allCalls}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}