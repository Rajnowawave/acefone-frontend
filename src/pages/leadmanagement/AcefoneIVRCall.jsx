// AcefoneIVRCall.jsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
} from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from "recharts";
import "./AcefoneIVRCall.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const REFRESH_MS = 120000;
const PAGE_SIZE = 10;

/* ═══════════════════════════════════════════════
   THEME CONTEXT
═══════════════════════════════════════════════ */
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("acf-theme");
    return saved === "dark";
  });

  useEffect(() => {
    localStorage.setItem("acf-theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("acf-dark", dark);
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
};

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */
const safeTs = (c) => {
  if (!c?.createdAt) return 0;
  if (c.createdAt._seconds) return c.createdAt._seconds * 1000;
  const t = new Date(c.createdAt).getTime();
  return isNaN(t) ? 0 : t;
};

const fmtDur = (s) => {
  s = Number(s) || 0;
  if (!s) return "—";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (h)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(
      2,
      "0"
    )}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtSec = (s) => {
  s = Number(s) || 0;
  const m = Math.floor(s / 60),
    sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtTime = (c) => {
  const ts = safeTs(c);
  if (!ts) return { date: "—", time: "—" };
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };
};

const cleanNum = (n = "") => String(n).replace(/\D/g, "").slice(-10);
const norm = (s = "") => String(s).toLowerCase().trim();

const OUTCOMES = [
  { v: "interested", l: "✅ Interested", color: "#16a34a", icon: "💚" },
  {
    v: "not_interested",
    l: "❌ Not Interested",
    color: "#dc2626",
    icon: "💔",
  },
  {
    v: "callback",
    l: "📞 Callback Requested",
    color: "#d97706",
    icon: "📲",
  },
  { v: "no_answer", l: "🔇 No Answer", color: "#6b7280", icon: "📵" },
  { v: "converted", l: "🎯 Converted", color: "#7c3aed", icon: "🏆" },
  { v: "follow_up", l: "🔁 Follow Up Later", color: "#0ea5e9", icon: "🔄" },
  {
    v: "wrong_number",
    l: "🚫 Wrong Number",
    color: "#f43f5e",
    icon: "🚫",
  },
  {
    v: "voicemail",
    l: "📧 Left Voicemail",
    color: "#8b5cf6",
    icon: "📧",
  },
  {
    v: "dnc",
    l: "🚷 Do Not Call",
    color: "#991b1b",
    icon: "🚷",
  },
];
const OUTCOME_MAP = Object.fromEntries(OUTCOMES.map((o) => [o.v, o]));

const PRIORITIES = [
  { v: "urgent", l: "🔴 Urgent", color: "#dc2626" },
  { v: "high", l: "🟠 High", color: "#f97316" },
  { v: "medium", l: "🟡 Medium", color: "#eab308" },
  { v: "low", l: "🟢 Low", color: "#22c55e" },
];

const OV = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,14,28,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const COLORS_CHART = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
];

/* ═══════════════════════════════════════════════
   ANIMATED NUMBER
═══════════════════════════════════════════════ */
const AnimatedNumber = ({ value, duration = 1000 }) => {
  const [display, setDisplay] = useState(0);
  const numVal = Number(value) || 0;
  useEffect(() => {
    let start = 0;
    const step = numVal / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= numVal) {
        setDisplay(numVal);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [numVal, duration]);
  return <>{display}</>;
};

/* ═══════════════════════════════════════════════
   BADGE COMPONENT
═══════════════════════════════════════════════ */
const Badge = ({ status, direction, outcome, priority }) => {
  if (priority) {
    const p = PRIORITIES.find((pr) => pr.v === priority);
    if (!p) return null;
    return (
      <span
        className="acf-badge acf-badge--priority"
        style={{
          "--badge-color": p.color,
          background: p.color + "15",
          color: p.color,
          borderColor: p.color + "30",
        }}
      >
        {p.l}
      </span>
    );
  }
  if (direction) {
    const d = norm(direction);
    const isIn = d === "inbound";
    return (
      <span
        className={`acf-badge ${isIn ? "acf-badge--inbound" : "acf-badge--outbound"}`}
      >
        <span className="acf-badge-dot" />
        {isIn ? "↙ Inbound" : "↗ Outbound"}
      </span>
    );
  }
  if (outcome) {
    const o = OUTCOME_MAP[outcome];
    if (!o) return null;
    return (
      <span
        className="acf-badge acf-badge--outcome"
        style={{
          "--badge-color": o.color,
          background: o.color + "12",
          color: o.color,
          borderColor: o.color + "30",
        }}
      >
        {o.l}
      </span>
    );
  }
  const s = norm(status);
  const map = {
    answered: { cls: "acf-badge--success", icon: "✓", label: "Answered" },
    completed: { cls: "acf-badge--success", icon: "✓", label: "Completed" },
    connected: { cls: "acf-badge--success", icon: "✓", label: "Connected" },
    called: { cls: "acf-badge--success", icon: "✓", label: "Called" },
    missed: { cls: "acf-badge--danger", icon: "✗", label: "Missed" },
    "no-answer": { cls: "acf-badge--danger", icon: "✗", label: "No Answer" },
    no_answer: { cls: "acf-badge--danger", icon: "✗", label: "No Answer" },
    busy: { cls: "acf-badge--warning", icon: "~", label: "Busy" },
    initiated: { cls: "acf-badge--info", icon: "→", label: "Initiated" },
    failed: { cls: "acf-badge--danger", icon: "!", label: "Failed" },
    ringing: { cls: "acf-badge--info", icon: "🔔", label: "Ringing" },
    in_progress: {
      cls: "acf-badge--live",
      icon: "🟢",
      label: "In Progress",
    },
  };
  const m = map[s] || {
    cls: "acf-badge--default",
    icon: "·",
    label: status || "—",
  };
  return (
    <span className={`acf-badge ${m.cls}`}>
      <span className="acf-badge-icon">{m.icon}</span> {m.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════
   LIVE TIMER
═══════════════════════════════════════════════ */
const LiveTimer = ({ startedAt }) => {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const iv = setInterval(
      () => setSec(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(iv);
  }, [startedAt]);
  return <span className="acf-live-timer">{fmtSec(sec)}</span>;
};

/* ═══════════════════════════════════════════════
   DONUT CHART SVG
═══════════════════════════════════════════════ */
const DonutChart = ({ answered, missed, total }) => {
  const r = 54,
    cx = 70,
    cy = 70,
    sw = 14,
    circ = 2 * Math.PI * r;
  const pct = total > 0 ? missed / total : 0;
  const missedArc = pct * circ;
  const answeredArc = circ - missedArc;
  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      className="acf-donut-svg"
    >
      <defs>
        <linearGradient id="donutGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="donutRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--acf-border-light)"
        strokeWidth={sw}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="url(#donutGreen)"
        strokeWidth={sw}
        strokeDasharray={`${answeredArc} ${missedArc}`}
        strokeDashoffset={-missedArc}
        strokeLinecap="round"
        className="acf-donut-arc"
        style={{ transform: "rotate(-90deg)", transformOrigin: "70px 70px" }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="url(#donutRed)"
        strokeWidth={sw}
        strokeDasharray={`${missedArc} ${answeredArc}`}
        strokeLinecap="round"
        className="acf-donut-arc"
        style={{ transform: "rotate(-90deg)", transformOrigin: "70px 70px" }}
      />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="acf-donut-text-main"
      >
        {total > 0 ? Math.round(pct * 100) : 0}%
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        className="acf-donut-text-sub"
      >
        Missed Rate
      </text>
    </svg>
  );
};

/* ═══════════════════════════════════════════════
   CHART TOOLTIP
═══════════════════════════════════════════════ */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="acf-chart-tooltip">
      <div className="acf-chart-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="acf-chart-tooltip-row">
          <span
            className="acf-chart-tooltip-dot"
            style={{ background: p.color }}
          />
          <span className="acf-chart-tooltip-name">{p.name}:</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   SPARKLINE
═══════════════════════════════════════════════ */
const Sparkline = ({ data, color = "#6366f1", height = 32 }) => {
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${height - (v / max) * height}`
    )
    .join(" ");
  return (
    <svg width={w} height={height} className="acf-sparkline">
      <defs>
        <linearGradient
          id={`spark-${color.replace("#", "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${height} ${points} ${w},${height}`}
        fill={`url(#spark-${color.replace("#", "")})`}
      />
    </svg>
  );
};

/* ═══════════════════════════════════════════════
   RECORDING PLAYER
═══════════════════════════════════════════════ */
const RecordingPlayer = ({ call }) => {
  const [state, setState] = useState("idle");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [useProxy, setUseProxy] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);

  const hasRecording = !!(
    call.recording_url && call.recording_url.startsWith("http")
  );
  const isAnswered = ["answered", "completed", "connected", "called"].includes(
    (call.call_status || "").toLowerCase()
  );
  const hasDuration = Number(call.billsec) > 0;

  if (!hasRecording) {
    if (isAnswered && hasDuration) {
      return (
        <span className="acf-no-rec acf-no-rec--processing">
          <span className="acf-processing-dot" />
          Processing...
        </span>
      );
    }
    return <span className="acf-no-rec">—</span>;
  }

  const directUrl = call.recording_url;
  const proxyUrl = `${API}/recording/${call.id}`;
  const url = useProxy ? proxyUrl : directUrl;

  const handlePlay = () => {
    if (!audioRef.current) return;
    if (state === "playing") {
      audioRef.current.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      audioRef.current.play().catch(() => {
        if (!useProxy) {
          setUseProxy(true);
          setState("idle");
        } else setState("error");
      });
      setState("playing");
      return;
    }
    setState("loading");
    audioRef.current.src = url;
    audioRef.current.load();
    const p = audioRef.current.play();
    if (p)
      p.then(() => setState("playing")).catch(() => {
        if (!useProxy) {
          setUseProxy(true);
          setState("idle");
        } else setState("error");
      });
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  };

  if (state === "error") {
    return (
      <div className="acf-rec-error">
        <a
          href={directUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="acf-rec-error-link"
        >
          🔗 Open
        </a>
        <a href={directUrl} download className="acf-rec-error-link">
          ⬇ Download
        </a>
      </div>
    );
  }

  return (
    <div className="acf-player-wrapper">
      <div className="acf-player">
        <audio
          ref={audioRef}
          preload="none"
          crossOrigin="anonymous"
          onTimeUpdate={() =>
            setCurrentTime(audioRef.current?.currentTime || 0)
          }
          onLoadedMetadata={() => {
            setDuration(audioRef.current?.duration || 0);
            setState("playing");
          }}
          onEnded={() => {
            setState("idle");
            setCurrentTime(0);
          }}
          onError={() => {
            if (!useProxy) {
              setUseProxy(true);
              setState("idle");
            } else setState("error");
          }}
          onCanPlay={() => {
            if (state === "loading") setState("playing");
          }}
        />
        <button
          onClick={handlePlay}
          className={`acf-play-btn ${state === "playing" ? "acf-play-btn--playing" : state === "loading" ? "acf-play-btn--loading" : ""}`}
        >
          {state === "loading" ? (
            <span className="acf-play-spinner" />
          ) : state === "playing" ? (
            "⏸"
          ) : (
            "▶"
          )}
        </button>
        <div className="acf-player-track" onClick={handleSeek}>
          <div
            className="acf-player-progress"
            style={{ width: `${progress}%` }}
          >
            <span className="acf-player-thumb" />
          </div>
        </div>
        <span className="acf-player-time">
          {state === "idle" || state === "loading"
            ? fmtDur(call.billsec)
            : fmtSec(Math.floor(currentTime))}
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          className="acf-volume-slider"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <a
          href={directUrl}
          download={`recording-${call.id}.mp3`}
          className="acf-player-dl"
          title="Download"
          onClick={(e) => e.stopPropagation()}
        >
          ⬇
        </a>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   DELETE CONFIRM MODAL
═══════════════════════════════════════════════ */
const DeleteConfirm = ({ data, onClose, onConfirm }) => (
  <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="acf-modal acf-modal--sm acf-modal--delete">
      <div className="acf-modal-icon-wrap acf-modal-icon--danger">🗑️</div>
      <h3 className="acf-modal-title">Delete Call Record?</h3>
      <p className="acf-modal-desc">
        This will permanently delete the record for{" "}
        <strong>{data.name || data.number}</strong>. This action cannot be
        undone.
      </p>
      <div className="acf-modal-actions">
        <button className="acf-btn acf-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="acf-btn acf-btn--danger"
          onClick={() => {
            onConfirm(data.id);
            onClose();
          }}
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   EDIT NAME MODAL
═══════════════════════════════════════════════ */
const EditNameModal = ({ data, onClose, onSave }) => {
  const [name, setName] = useState(data.name || "");
  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-modal--sm">
        <div className="acf-modal-icon-wrap acf-modal-icon--edit">✏️</div>
        <h3 className="acf-modal-title">Edit Customer Name</h3>
        <p className="acf-modal-subtitle">
          Number: <strong>{data.number}</strong>
        </p>
        <label className="acf-label">Name</label>
        <input
          className="acf-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) =>
            e.key === "Enter" &&
            name.trim() &&
            (onSave(data.id, name.trim()), onClose())
          }
          placeholder="Enter customer name"
        />
        <div className="acf-modal-actions">
          <button className="acf-btn acf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="acf-btn acf-btn--primary"
            onClick={() => {
              if (name.trim()) {
                onSave(data.id, name.trim());
                onClose();
              }
            }}
          >
            💾 Save Name
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   POST-CALL POPUP (NEW — appears after call ends)
═══════════════════════════════════════════════ */
const PostCallPopup = ({ data, onClose, onSave }) => {
  const [name, setName] = useState(data?.name || "");
  const [outcome, setOutcome] = useState("");
  const [remark, setRemark] = useState("");
  const [priority, setPriority] = useState("medium");
  const [followUp, setFollowUp] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const ref = useRef();

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 200);
  }, [step]);

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (t) => setTags(tags.filter((x) => x !== t));

  const submit = async (skip = false) => {
    setSaving(true);
    const payload = {
      callId: data.callId,
      name: name.trim() || undefined,
      outcome: outcome || undefined,
      remark: remark.trim() || undefined,
      priority,
      followUpDate: followUp || undefined,
      tags,
    };

    if (!skip && (remark.trim() || outcome)) {
      try {
        await fetch(`${API}/remarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error(e);
      }
    }

    onSave(payload, skip);
    setSaving(false);
    onClose();
  };

  const callDuration = data?.duration
    ? fmtDur(Math.floor(data.duration / 1000))
    : "—";

  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-modal--postcall">
        {/* Header with call info */}
        <div className="acf-postcall-header">
          <div className="acf-postcall-header-bg" />
          <div className="acf-postcall-header-content">
            <div className="acf-postcall-icon-ring">
              <div className="acf-postcall-icon">📞</div>
            </div>
            <h2 className="acf-postcall-title">Call Ended</h2>
            <div className="acf-postcall-meta">
              <span className="acf-postcall-number">{data?.number}</span>
              <span className="acf-postcall-dot">•</span>
              <span className="acf-postcall-duration">{callDuration}</span>
            </div>
            <div className="acf-postcall-steps">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`acf-postcall-step ${step >= s ? "acf-postcall-step--active" : ""} ${step === s ? "acf-postcall-step--current" : ""}`}
                  onClick={() => setStep(s)}
                >
                  <span className="acf-postcall-step-num">{s}</span>
                  <span className="acf-postcall-step-label">
                    {s === 1 ? "Info" : s === 2 ? "Outcome" : "Notes"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button className="acf-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="acf-postcall-body">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="acf-postcall-section acf-fade-in">
              <h3 className="acf-postcall-section-title">
                <span className="acf-postcall-section-icon">👤</span>
                Customer Information
              </h3>
              <div className="acf-form-group">
                <label className="acf-label">Customer Name</label>
                <input
                  ref={ref}
                  className="acf-input acf-input--lg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter customer name (optional)"
                />
              </div>
              <div className="acf-form-group">
                <label className="acf-label">Priority</label>
                <div className="acf-priority-grid">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.v}
                      className={`acf-priority-btn ${priority === p.v ? "acf-priority-btn--active" : ""}`}
                      style={{ "--p-color": p.color }}
                      onClick={() => setPriority(p.v)}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="acf-form-group">
                <label className="acf-label">Tags</label>
                <div className="acf-tags-input">
                  <div className="acf-tags-list">
                    {tags.map((t) => (
                      <span key={t} className="acf-tag-chip">
                        {t}
                        <button
                          className="acf-tag-remove"
                          onClick={() => removeTag(t)}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="acf-tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add tag and press Enter"
                  />
                </div>
                <div className="acf-quick-tags">
                  {["VIP", "New Lead", "Hot", "Cold", "Enterprise", "SMB"].map(
                    (t) => (
                      <button
                        key={t}
                        className={`acf-quick-tag ${tags.includes(t) ? "acf-quick-tag--active" : ""}`}
                        onClick={() =>
                          tags.includes(t)
                            ? removeTag(t)
                            : setTags([...tags, t])
                        }
                      >
                        {t}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Outcome */}
          {step === 2 && (
            <div className="acf-postcall-section acf-fade-in">
              <h3 className="acf-postcall-section-title">
                <span className="acf-postcall-section-icon">📋</span>
                Call Outcome
              </h3>
              <div className="acf-outcomes-grid">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.v}
                    className={`acf-outcome-btn ${outcome === o.v ? "acf-outcome-btn--active" : ""}`}
                    style={{ "--o-color": o.color }}
                    onClick={() => setOutcome(o.v)}
                  >
                    <span className="acf-outcome-icon">{o.icon}</span>
                    <span className="acf-outcome-label">
                      {o.l.replace(/^[^\s]+ /, "")}
                    </span>
                  </button>
                ))}
              </div>
              <div className="acf-form-group" style={{ marginTop: 16 }}>
                <label className="acf-label">📅 Schedule Follow-up</label>
                <input
                  className="acf-input"
                  type="datetime-local"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
                <div className="acf-quick-followup">
                  {[
                    { l: "In 1 hour", h: 1 },
                    { l: "Tomorrow", h: 24 },
                    { l: "In 3 days", h: 72 },
                    { l: "In 1 week", h: 168 },
                  ].map((q) => (
                    <button
                      key={q.l}
                      className="acf-quick-followup-btn"
                      onClick={() => {
                        const d = new Date(Date.now() + q.h * 3600000);
                        setFollowUp(
                          d.toISOString().slice(0, 16)
                        );
                      }}
                    >
                      {q.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Notes */}
          {step === 3 && (
            <div className="acf-postcall-section acf-fade-in">
              <h3 className="acf-postcall-section-title">
                <span className="acf-postcall-section-icon">📝</span>
                Notes & Remarks
              </h3>
              <div className="acf-form-group">
                <textarea
                  ref={ref}
                  className="acf-input acf-textarea acf-textarea--lg"
                  placeholder="Enter your notes about this call..."
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={5}
                />
                <span className="acf-hint">
                  All fields are optional. You can skip this entirely.
                </span>
              </div>

              {/* Summary Preview */}
              <div className="acf-postcall-summary">
                <h4 className="acf-postcall-summary-title">Summary</h4>
                <div className="acf-postcall-summary-grid">
                  {name && (
                    <div className="acf-summary-item">
                      <span className="acf-summary-label">Customer</span>
                      <span className="acf-summary-value">{name}</span>
                    </div>
                  )}
                  {outcome && (
                    <div className="acf-summary-item">
                      <span className="acf-summary-label">Outcome</span>
                      <Badge outcome={outcome} />
                    </div>
                  )}
                  {priority && (
                    <div className="acf-summary-item">
                      <span className="acf-summary-label">Priority</span>
                      <Badge priority={priority} />
                    </div>
                  )}
                  {followUp && (
                    <div className="acf-summary-item">
                      <span className="acf-summary-label">Follow-up</span>
                      <span className="acf-summary-value">
                        {new Date(followUp).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="acf-summary-item">
                      <span className="acf-summary-label">Tags</span>
                      <div className="acf-summary-tags">
                        {tags.map((t) => (
                          <span key={t} className="acf-tag-chip acf-tag-chip--sm">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="acf-postcall-footer">
          <button className="acf-btn acf-btn--ghost" onClick={() => submit(true)}>
            Skip All
          </button>
          <div className="acf-postcall-footer-right">
            {step > 1 && (
              <button
                className="acf-btn acf-btn--ghost"
                onClick={() => setStep(step - 1)}
              >
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                className="acf-btn acf-btn--primary"
                onClick={() => setStep(step + 1)}
              >
                Next →
              </button>
            ) : (
              <button
                className="acf-btn acf-btn--primary acf-btn--glow"
                onClick={() => submit()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="acf-btn-spinner" /> Saving...
                  </>
                ) : (
                  "💾 Save & Close"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   REMARK MODAL (simplified for direct add)
═══════════════════════════════════════════════ */
const RemarkModal = ({ data, onClose, onSave }) => {
  const [remark, setRemark] = useState(data?.existingRemark || "");
  const [followUp, setFollowUp] = useState("");
  const [outcome, setOutcome] = useState(data?.outcome || "");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const ref = useRef();

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 80);
  }, []);

  const submit = async (skip = false) => {
    if (!skip && !remark.trim()) return;
    setSaving(true);
    if (!skip) {
      const text = outcome
        ? `[${outcome.toUpperCase()}] ${remark.trim()}`
        : remark.trim();
      try {
        await fetch(`${API}/remarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId: data.callId,
            remark: text,
            followUpDate: followUp || null,
            outcome,
            priority,
          }),
        });
        onSave(data.callId, text, outcome, followUp);
      } catch (e) {
        console.error(e);
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-modal--md">
        <div className="acf-modal-header-gradient">
          <div className="acf-modal-header-content">
            <div className="acf-modal-header-icon">📝</div>
            <div>
              <h3 className="acf-modal-header-title">Add Remark</h3>
              <p className="acf-modal-header-sub">
                {data.name || data.number} • {data.number}
              </p>
            </div>
          </div>
          <button className="acf-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="acf-modal-body">
          <div className="acf-form-grid-2">
            <div className="acf-form-group">
              <label className="acf-label">Call Outcome</label>
              <select
                className="acf-input acf-select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Select outcome...</option>
                {OUTCOMES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <div className="acf-form-group">
              <label className="acf-label">Priority</label>
              <select
                className="acf-input acf-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.l}
                  </option>
                ))}
              </select>
            </div>
            <div className="acf-form-group">
              <label className="acf-label">Follow-up Date</label>
              <input
                className="acf-input"
                type="datetime-local"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
          </div>
          <div className="acf-form-group">
            <label className="acf-label">Remark / Notes</label>
            <textarea
              ref={ref}
              className="acf-input acf-textarea"
              placeholder="Enter your notes about this call..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === "Enter" && submit()}
              rows={4}
            />
            <span className="acf-hint">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save
            </span>
          </div>
          {outcome && (
            <div className="acf-outcome-preview">
              <Badge outcome={outcome} />
            </div>
          )}
          <div className="acf-modal-actions">
            <button className="acf-btn acf-btn--ghost" onClick={() => submit(true)}>
              Skip
            </button>
            <button
              className="acf-btn acf-btn--primary"
              onClick={() => submit()}
              disabled={saving || !remark.trim()}
            >
              {saving ? (
                <>
                  <span className="acf-btn-spinner" /> Saving...
                </>
              ) : (
                "💾 Save Remark"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   HISTORY MODAL
═══════════════════════════════════════════════ */
const HistoryModal = ({ number, name, onClose }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/customer-history/${cleanNum(number)}`)
      .then((r) => r.json())
      .then((d) => {
        setCalls(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [number]);

  const total = calls.length;
  const answered = calls.filter((c) =>
    ["answered", "completed", "connected"].includes(norm(c.call_status))
  ).length;
  const missed = total - answered;
  const totalDur = calls.reduce((s, c) => s + (Number(c.billsec) || 0), 0);

  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-modal--lg acf-modal--history">
        <div className="acf-modal-header-gradient">
          <div className="acf-modal-header-content">
            <div className="acf-modal-header-icon">📋</div>
            <div>
              <h3 className="acf-modal-header-title">{name || number}</h3>
              <p className="acf-modal-header-sub">
                {total} calls · {answered} answered · {missed} missed ·{" "}
                {fmtDur(totalDur)} total
              </p>
            </div>
          </div>
          <button className="acf-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="acf-modal-body acf-modal-body--scroll">
          <div className="acf-history-quick-stats">
            <div className="acf-hqs-item">
              <span className="acf-hqs-val">{total}</span>
              <span className="acf-hqs-label">Total</span>
            </div>
            <div className="acf-hqs-item acf-hqs-item--success">
              <span className="acf-hqs-val">{answered}</span>
              <span className="acf-hqs-label">Answered</span>
            </div>
            <div className="acf-hqs-item acf-hqs-item--danger">
              <span className="acf-hqs-val">{missed}</span>
              <span className="acf-hqs-label">Missed</span>
            </div>
            <div className="acf-hqs-item acf-hqs-item--info">
              <span className="acf-hqs-val">{fmtDur(totalDur)}</span>
              <span className="acf-hqs-label">Duration</span>
            </div>
          </div>

          {loading && (
            <div className="acf-empty-msg">
              <span className="acf-loading-spinner" /> Loading history...
            </div>
          )}
          {!loading && !calls.length && (
            <div className="acf-empty-msg">No history found</div>
          )}
          {calls.map((c, i) => {
            const { date, time } = fmtTime(c);
            const isMissed = norm(c.call_status).includes("miss");
            return (
              <div
                key={i}
                className={`acf-history-item ${isMissed ? "acf-history-item--missed" : ""}`}
              >
                <div
                  className={`acf-history-icon ${isMissed ? "acf-history-icon--missed" : ""}`}
                >
                  {isMissed ? "📵" : "📞"}
                </div>
                <div className="acf-history-content">
                  <div className="acf-history-badges">
                    <Badge direction={c.direction} />
                    <Badge status={c.call_status} />
                    <span className="acf-mono-xs">{fmtDur(c.billsec)}</span>
                  </div>
                  <div className="acf-history-agent">
                    Agent:{" "}
                    <strong>{c.answered_agent_name || "—"}</strong>
                  </div>
                  {c.recording_url && c.recording_url.startsWith("http") && (
                    <div style={{ marginTop: 6 }}>
                      <RecordingPlayer call={c} />
                    </div>
                  )}
                </div>
                <div className="acf-history-time">
                  <div className="acf-history-date">{date}</div>
                  <div className="acf-mono-xs">{time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   DIAL MODAL
═══════════════════════════════════════════════ */
const DialModal = ({
  agents,
  selectedAgent,
  setSelectedAgent,
  onClose,
  onCall,
}) => {
  const [num, setNum] = useState("");
  const [name, setName] = useState("");
  const press = (d) => {
    if (cleanNum(num).length < 12) setNum((p) => p + d);
  };
  const del = () => setNum((p) => p.slice(0, -1));
  const canDial = cleanNum(num).length >= 10 && selectedAgent;
  const dial = () => canDial && onCall(null, num, name);

  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-dial-modal">
        <div className="acf-dial-header">
          <div className="acf-dial-header-glow" />
          <div className="acf-dial-label">QUICK DIAL</div>
          <div className="acf-dial-number-display">
            {num || "+91 XXXXXXXXXX"}
          </div>
          <input
            placeholder="Customer name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="acf-dial-name"
            onKeyDown={(e) => e.key === "Enter" && dial()}
          />
        </div>
        <div className="acf-dial-body">
          <div className="acf-form-group">
            <label className="acf-label">Agent *</label>
            <select
              className="acf-input acf-select"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="">Choose agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="acf-dial-pad">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "*",
              "0",
              "#",
            ].map((d) => (
              <button
                key={d}
                onClick={() => /\d/.test(d) && press(d)}
                className={`acf-dial-key ${!/\d/.test(d) ? "acf-dial-key--disabled" : ""}`}
              >
                <span className="acf-dial-key-num">{d}</span>
                {d === "2" && <span className="acf-dial-key-sub">ABC</span>}
                {d === "3" && <span className="acf-dial-key-sub">DEF</span>}
                {d === "4" && <span className="acf-dial-key-sub">GHI</span>}
                {d === "5" && <span className="acf-dial-key-sub">JKL</span>}
                {d === "6" && <span className="acf-dial-key-sub">MNO</span>}
                {d === "7" && <span className="acf-dial-key-sub">PQRS</span>}
                {d === "8" && <span className="acf-dial-key-sub">TUV</span>}
                {d === "9" && <span className="acf-dial-key-sub">WXYZ</span>}
                {d === "0" && <span className="acf-dial-key-sub">+</span>}
              </button>
            ))}
          </div>
          <div className="acf-dial-actions">
            <button
              onClick={del}
              className="acf-dial-act acf-dial-act--del"
              title="Delete"
            >
              ⌫
            </button>
            <button
              onClick={dial}
              disabled={!canDial}
              className={`acf-dial-act acf-dial-act--call ${canDial ? "acf-dial-act--active" : ""}`}
            >
              📞 Call
            </button>
            <button
              onClick={onClose}
              className="acf-dial-act acf-dial-act--close"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   EXPORT MODAL
═══════════════════════════════════════════════ */
const ExportModal = ({ agents, onClose }) => {
  const [exDir, setExDir] = useState("all");
  const [exStatus, setExStatus] = useState("all");
  const [exAgent, setExAgent] = useState("all");
  const [exFrom, setExFrom] = useState("");
  const [exTo, setExTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (exDir !== "all") params.set("direction", exDir);
      if (exStatus !== "all") params.set("status", exStatus);
      if (exAgent !== "all") params.set("agent", exAgent);
      if (exFrom) params.set("dateFrom", exFrom);
      if (exTo) params.set("dateTo", exTo);
      const resp = await fetch(`${API}/export-excel?${params}`);
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      alert("Export failed: " + e.message);
    }
    setDownloading(false);
  };

  return (
    <div style={OV} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acf-modal acf-modal--md">
        <div className="acf-modal-header-gradient">
          <div className="acf-modal-header-content">
            <div className="acf-modal-header-icon">📥</div>
            <div>
              <h3 className="acf-modal-header-title">Export to Excel</h3>
              <p className="acf-modal-header-sub">Download call logs</p>
            </div>
          </div>
          <button className="acf-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="acf-modal-body">
          <div className="acf-form-grid-2">
            <div className="acf-form-group">
              <label className="acf-label">Direction</label>
              <select
                className="acf-input acf-select"
                value={exDir}
                onChange={(e) => setExDir(e.target.value)}
              >
                <option value="all">All</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            <div className="acf-form-group">
              <label className="acf-label">Status</label>
              <select
                className="acf-input acf-select"
                value={exStatus}
                onChange={(e) => setExStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="answered">Answered</option>
                <option value="missed">Missed</option>
                <option value="busy">Busy</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="acf-form-group">
              <label className="acf-label">Agent</label>
              <select
                className="acf-input acf-select"
                value={exAgent}
                onChange={(e) => setExAgent(e.target.value)}
              >
                <option value="all">All</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="acf-form-group">
              <label className="acf-label">From</label>
              <input
                className="acf-input"
                type="date"
                value={exFrom}
                onChange={(e) => setExFrom(e.target.value)}
              />
            </div>
            <div className="acf-form-group">
              <label className="acf-label">To</label>
              <input
                className="acf-input"
                type="date"
                value={exTo}
                onChange={(e) => setExTo(e.target.value)}
              />
            </div>
          </div>
          <div className="acf-modal-actions">
            <button className="acf-btn acf-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="acf-btn acf-btn--primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="acf-btn-spinner" /> Downloading...
                </>
              ) : (
                "📥 Download Excel"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   LIVE CALLS PANEL
═══════════════════════════════════════════════ */
const LiveCallsPanel = ({ liveCalls, onEndCall }) => {
  if (!liveCalls || liveCalls.length === 0) return null;

  return (
    <div className="acf-live-panel">
      <div className="acf-live-panel-header">
        <div className="acf-live-panel-title">
          <div className="acf-live-dot-lg" />
          <span>Live Calls</span>
          <span className="acf-live-panel-count">{liveCalls.length}</span>
        </div>
      </div>
      <div className="acf-live-panel-list">
        {liveCalls.map((lc, i) => (
          <div key={i} className="acf-live-call-card">
            <div className="acf-live-call-avatar">
              <div className="acf-live-call-pulse-ring" />
              📞
            </div>
            <div className="acf-live-call-info">
              <div className="acf-live-call-name">
                {lc.name || lc.number}
              </div>
              <div className="acf-live-call-meta">
                <span className="acf-mono-xs">{lc.number}</span>
                {lc.agent && (
                  <span className="acf-live-call-agent">👤 {lc.agent}</span>
                )}
              </div>
            </div>
            <div className="acf-live-call-right">
              <LiveTimer startedAt={lc.startedAt} />
              <Badge status="in_progress" />
              <button
                className="acf-btn-end acf-btn-end--sm"
                onClick={() => onEndCall(lc)}
              >
                End
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   ADVANCED FOLLOW-UPS TAB
═══════════════════════════════════════════════ */
function FollowupsTab({ calls }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | board | calendar
  const [filterStatus, setFilterStatus] = useState("all"); // all | overdue | today | upcoming | completed
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date"); // date | priority | name
  const [selectedItem, setSelectedItem] = useState(null);
  const [completedIds, setCompletedIds] = useState(
    () => new Set(JSON.parse(localStorage.getItem("acf-completed-followups") || "[]"))
  );
  const [snoozedItems, setSnoozedItems] = useState(
    () => JSON.parse(localStorage.getItem("acf-snoozed-followups") || "{}")
  );

  // Persist completed/snoozed
  useEffect(() => {
    localStorage.setItem(
      "acf-completed-followups",
      JSON.stringify([...completedIds])
    );
  }, [completedIds]);

  useEffect(() => {
    localStorage.setItem(
      "acf-snoozed-followups",
      JSON.stringify(snoozedItems)
    );
  }, [snoozedItems]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const remarksPromises = calls.slice(0, 200).map(async (c) => {
          try {
            const res = await fetch(`${API}/remarks/${c.id}`);
            if (!res.ok) return [];
            const remarks = await res.json();
            return remarks.map((r) => ({
              ...r,
              callId: c.id,
              number: c.call_to_number || c.caller_id_number,
              name: c.name,
              agent: c.answered_agent_name,
              direction: c.direction,
              call_status: c.call_status,
            }));
          } catch {
            return [];
          }
        });
        const allRemarks = (await Promise.all(remarksPromises)).flat();
        const followUps = allRemarks
          .filter((r) => {
            if (!r.followUpDate) return false;
            const ts = r.followUpDate._seconds
              ? r.followUpDate._seconds * 1000
              : new Date(r.followUpDate).getTime();
            return !isNaN(ts) && ts > 0;
          })
          .map((r) => {
            const ts = r.followUpDate._seconds
              ? r.followUpDate._seconds * 1000
              : new Date(r.followUpDate).getTime();
            // Check if snoozed
            const snoozedUntil = snoozedItems[r.callId + "-" + ts];
            return {
              ...r,
              date: new Date(ts),
              uniqueId: r.callId + "-" + ts,
              isCompleted: completedIds.has(r.callId + "-" + ts),
              isSnoozed: snoozedUntil && new Date(snoozedUntil) > new Date(),
              snoozedUntil: snoozedUntil ? new Date(snoozedUntil) : null,
            };
          })
          .sort((a, b) => a.date - b.date);
        setItems(followUps);
      } catch (err) {
        console.error("Follow-ups fetch error:", err);
      }
      setLoading(false);
    })();
  }, [calls]);

  const markComplete = (uniqueId) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uniqueId)) next.delete(uniqueId);
      else next.add(uniqueId);
      return next;
    });
    setItems((prev) =>
      prev.map((it) =>
        it.uniqueId === uniqueId
          ? { ...it, isCompleted: !it.isCompleted }
          : it
      )
    );
  };

  const snoozeItem = (uniqueId, hours) => {
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    setSnoozedItems((prev) => ({ ...prev, [uniqueId]: until }));
    setItems((prev) =>
      prev.map((it) =>
        it.uniqueId === uniqueId
          ? { ...it, isSnoozed: true, snoozedUntil: new Date(until) }
          : it
      )
    );
  };

  // Categorize
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const categorize = (item) => {
    if (item.isCompleted) return "completed";
    if (item.isSnoozed) return "snoozed";
    if (item.date < todayStart) return "overdue";
    if (item.date >= todayStart && item.date < todayEnd) return "today";
    if (item.date >= todayEnd && item.date < tomorrowEnd) return "tomorrow";
    if (item.date >= tomorrowEnd && item.date < weekEnd) return "this_week";
    return "upcoming";
  };

  // Filter
  let filtered = items.map((it) => ({ ...it, category: categorize(it) }));

  if (filterStatus !== "all") {
    filtered = filtered.filter((it) => it.category === filterStatus);
  }
  if (filterOutcome !== "all") {
    filtered = filtered.filter((it) => it.outcome === filterOutcome);
  }
  if (filterPriority !== "all") {
    filtered = filtered.filter((it) => it.priority === filterPriority);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (it) =>
        (it.name || "").toLowerCase().includes(q) ||
        (it.number || "").includes(q) ||
        (it.remark || "").toLowerCase().includes(q) ||
        (it.agent || "").toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortBy === "priority") {
    const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    filtered.sort(
      (a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2)
    );
  } else if (sortBy === "name") {
    filtered.sort((a, b) =>
      (a.name || a.number || "").localeCompare(b.name || b.number || "")
    );
  }
  // default is date, already sorted

  const counts = {
    overdue: items.filter((it) => categorize(it) === "overdue").length,
    today: items.filter((it) => categorize(it) === "today").length,
    tomorrow: items.filter((it) => categorize(it) === "tomorrow").length,
    this_week: items.filter((it) => categorize(it) === "this_week").length,
    upcoming: items.filter((it) => categorize(it) === "upcoming").length,
    completed: items.filter((it) => categorize(it) === "completed").length,
    snoozed: items.filter((it) => categorize(it) === "snoozed").length,
    total: items.length,
  };

  if (loading) {
    return (
      <div className="acf-empty-card">
        <span className="acf-loading-spinner" />
        <p>Loading follow-ups...</p>
      </div>
    );
  }

  const FollowUpItem = ({ item }) => {
    const [expanded, setExpanded] = useState(false);
    const [showSnooze, setShowSnooze] = useState(false);

    const typeConfig = {
      overdue: { color: "#dc2626", icon: "🚨", label: "OVERDUE", bg: "#dc262610" },
      today: { color: "#f59e0b", icon: "⏰", label: "TODAY", bg: "#f59e0b10" },
      tomorrow: { color: "#3b82f6", icon: "📅", label: "TOMORROW", bg: "#3b82f610" },
      this_week: { color: "#8b5cf6", icon: "📆", label: "THIS WEEK", bg: "#8b5cf610" },
      upcoming: { color: "#16a34a", icon: "🗓", label: "UPCOMING", bg: "#16a34a10" },
      completed: { color: "#64748b", icon: "✅", label: "DONE", bg: "#64748b10" },
      snoozed: { color: "#a855f7", icon: "💤", label: "SNOOZED", bg: "#a855f710" },
    };
    const cfg = typeConfig[item.category] || typeConfig.upcoming;

    const timeUntil = () => {
      const diff = item.date - now;
      if (diff < 0) {
        const ago = Math.abs(diff);
        if (ago < 3600000)
          return `${Math.floor(ago / 60000)} min ago`;
        if (ago < 86400000)
          return `${Math.floor(ago / 3600000)} hours ago`;
        return `${Math.floor(ago / 86400000)} days ago`;
      }
      if (diff < 3600000) return `in ${Math.floor(diff / 60000)} min`;
      if (diff < 86400000) return `in ${Math.floor(diff / 3600000)} hours`;
      return `in ${Math.floor(diff / 86400000)} days`;
    };

    return (
      <div
        className={`acf-fu-card ${item.isCompleted ? "acf-fu-card--completed" : ""} ${item.category === "overdue" ? "acf-fu-card--overdue" : ""}`}
        style={{ "--fu-color": cfg.color }}
      >
        <div className="acf-fu-card-main" onClick={() => setExpanded(!expanded)}>
          {/* Checkbox */}
          <button
            className={`acf-fu-check ${item.isCompleted ? "acf-fu-check--done" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              markComplete(item.uniqueId);
            }}
          >
            {item.isCompleted ? "✓" : ""}
          </button>

          {/* Priority indicator */}
          <div
            className="acf-fu-priority-dot"
            style={{
              background:
                PRIORITIES.find((p) => p.v === item.priority)?.color || "#eab308",
            }}
            title={item.priority || "medium"}
          />

          {/* Content */}
          <div className="acf-fu-content">
            <div className="acf-fu-top-row">
              <span className={`acf-fu-name ${item.isCompleted ? "acf-fu-name--done" : ""}`}>
                {item.name || item.number || "Unknown"}
              </span>
              <div className="acf-fu-badges">
                <span className="acf-fu-category-badge" style={{ color: cfg.color, background: cfg.bg }}>
                  {cfg.icon} {cfg.label}
                </span>
                {item.outcome && <Badge outcome={item.outcome} />}
              </div>
            </div>
            <div className="acf-fu-meta-row">
              <span className="acf-mono-xs">📞 {item.number}</span>
              {item.agent && <span className="acf-mono-xs">👤 {item.agent}</span>}
              <span className="acf-fu-time-badge" style={{ color: cfg.color }}>
                🕒 {timeUntil()}
              </span>
              <span className="acf-mono-xs">
                {item.date.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                {item.date.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="acf-fu-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="acf-fu-action-btn"
              title="Snooze"
              onClick={() => setShowSnooze(!showSnooze)}
            >
              💤
            </button>
            <a
              href={`tel:${item.number}`}
              className="acf-fu-action-btn acf-fu-action-btn--call"
              title="Call"
            >
              📞
            </a>
            <button
              className="acf-fu-action-btn"
              onClick={() => setExpanded(!expanded)}
              title="Expand"
            >
              {expanded ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {/* Snooze Dropdown */}
        {showSnooze && (
          <div className="acf-fu-snooze-bar">
            <span className="acf-fu-snooze-label">Snooze for:</span>
            {[
              { l: "1 hr", h: 1 },
              { l: "3 hrs", h: 3 },
              { l: "1 day", h: 24 },
              { l: "3 days", h: 72 },
              { l: "1 week", h: 168 },
            ].map((s) => (
              <button
                key={s.l}
                className="acf-fu-snooze-btn"
                onClick={() => {
                  snoozeItem(item.uniqueId, s.h);
                  setShowSnooze(false);
                }}
              >
                {s.l}
              </button>
            ))}
          </div>
        )}

        {/* Expanded Details */}
        {expanded && (
          <div className="acf-fu-expanded">
            {item.remark && (
              <div className="acf-fu-remark-block">
                <div className="acf-fu-remark-label">📝 Notes</div>
                <div className="acf-fu-remark-text">{item.remark}</div>
              </div>
            )}
            <div className="acf-fu-detail-grid">
              <div className="acf-fu-detail">
                <span className="acf-fu-detail-label">Direction</span>
                <Badge direction={item.direction} />
              </div>
              <div className="acf-fu-detail">
                <span className="acf-fu-detail-label">Last Status</span>
                <Badge status={item.call_status} />
              </div>
              <div className="acf-fu-detail">
                <span className="acf-fu-detail-label">Priority</span>
                <Badge priority={item.priority || "medium"} />
              </div>
              <div className="acf-fu-detail">
                <span className="acf-fu-detail-label">Scheduled</span>
                <span className="acf-mono-xs">
                  {item.date.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Board View
  const BoardView = () => {
    const columns = [
      { key: "overdue", label: "🚨 Overdue", color: "#dc2626" },
      { key: "today", label: "⏰ Today", color: "#f59e0b" },
      { key: "tomorrow", label: "📅 Tomorrow", color: "#3b82f6" },
      { key: "this_week", label: "📆 This Week", color: "#8b5cf6" },
      { key: "upcoming", label: "🗓 Later", color: "#16a34a" },
    ];

    return (
      <div className="acf-fu-board">
        {columns.map((col) => {
          const colItems = filtered.filter((it) => it.category === col.key);
          return (
            <div key={col.key} className="acf-fu-board-col">
              <div
                className="acf-fu-board-col-header"
                style={{ borderColor: col.color }}
              >
                <span className="acf-fu-board-col-title">{col.label}</span>
                <span
                  className="acf-fu-board-col-count"
                  style={{ background: col.color + "20", color: col.color }}
                >
                  {colItems.length}
                </span>
              </div>
              <div className="acf-fu-board-col-body">
                {colItems.length === 0 && (
                  <div className="acf-fu-board-empty">No items</div>
                )}
                {colItems.map((item) => (
                  <div
                    key={item.uniqueId}
                    className={`acf-fu-board-card ${item.isCompleted ? "acf-fu-board-card--done" : ""}`}
                    style={{ borderLeftColor: col.color }}
                  >
                    <div className="acf-fu-board-card-top">
                      <button
                        className={`acf-fu-check acf-fu-check--sm ${item.isCompleted ? "acf-fu-check--done" : ""}`}
                        onClick={() => markComplete(item.uniqueId)}
                      >
                        {item.isCompleted ? "✓" : ""}
                      </button>
                      <span className="acf-fu-board-card-name">
                        {item.name || item.number}
                      </span>
                    </div>
                    <div className="acf-fu-board-card-meta">
                      <span className="acf-mono-xs">{item.number}</span>
                    </div>
                    {item.remark && (
                      <div className="acf-fu-board-card-remark">
                        {item.remark.slice(0, 60)}
                        {item.remark.length > 60 ? "..." : ""}
                      </div>
                    )}
                    <div className="acf-fu-board-card-bottom">
                      {item.outcome && <Badge outcome={item.outcome} />}
                      <span className="acf-mono-xs">
                        {item.date.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Calendar View
  const CalendarView = () => {
    const [calMonth, setCalMonth] = useState(now.getMonth());
    const [calYear, setCalYear] = useState(now.getFullYear());

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const getItemsForDay = (day) => {
      if (!day) return [];
      return filtered.filter((it) => {
        return (
          it.date.getDate() === day &&
          it.date.getMonth() === calMonth &&
          it.date.getFullYear() === calYear
        );
      });
    };

    return (
      <div className="acf-fu-calendar">
        <div className="acf-fu-cal-header">
          <button
            className="acf-btn acf-btn--ghost acf-btn--sm"
            onClick={() => {
              if (calMonth === 0) {
                setCalMonth(11);
                setCalYear(calYear - 1);
              } else setCalMonth(calMonth - 1);
            }}
          >
            ‹
          </button>
          <span className="acf-fu-cal-month">
            {new Date(calYear, calMonth).toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            className="acf-btn acf-btn--ghost acf-btn--sm"
            onClick={() => {
              if (calMonth === 11) {
                setCalMonth(0);
                setCalYear(calYear + 1);
              } else setCalMonth(calMonth + 1);
            }}
          >
            ›
          </button>
        </div>
        <div className="acf-fu-cal-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="acf-fu-cal-day-label">
              {d}
            </div>
          ))}
          {days.map((day, idx) => {
            const dayItems = getItemsForDay(day);
            const isToday =
              day === now.getDate() &&
              calMonth === now.getMonth() &&
              calYear === now.getFullYear();
            return (
              <div
                key={idx}
                className={`acf-fu-cal-cell ${!day ? "acf-fu-cal-cell--empty" : ""} ${isToday ? "acf-fu-cal-cell--today" : ""} ${dayItems.length > 0 ? "acf-fu-cal-cell--has" : ""}`}
              >
                {day && (
                  <>
                    <span className="acf-fu-cal-day-num">{day}</span>
                    {dayItems.length > 0 && (
                      <div className="acf-fu-cal-items">
                        {dayItems.slice(0, 3).map((it, j) => (
                          <div
                            key={j}
                            className="acf-fu-cal-item"
                            style={{
                              background:
                                (
                                  OUTCOMES.find((o) => o.v === it.outcome) || {
                                    color: "#6366f1",
                                  }
                                ).color + "20",
                              color: (
                                OUTCOMES.find((o) => o.v === it.outcome) || {
                                  color: "#6366f1",
                                }
                              ).color,
                            }}
                            title={`${it.name || it.number} - ${it.remark || ""}`}
                          >
                            {(it.name || it.number || "").slice(0, 8)}
                          </div>
                        ))}
                        {dayItems.length > 3 && (
                          <span className="acf-fu-cal-more">
                            +{dayItems.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="acf-followups-container">
      {/* Stats */}
      <div className="acf-fu-stats-bar">
        {[
          {
            key: "overdue",
            icon: "🚨",
            label: "Overdue",
            val: counts.overdue,
            color: "#dc2626",
          },
          {
            key: "today",
            icon: "⏰",
            label: "Today",
            val: counts.today,
            color: "#f59e0b",
          },
          {
            key: "tomorrow",
            icon: "📅",
            label: "Tomorrow",
            val: counts.tomorrow,
            color: "#3b82f6",
          },
          {
            key: "this_week",
            icon: "📆",
            label: "This Week",
            val: counts.this_week,
            color: "#8b5cf6",
          },
          {
            key: "upcoming",
            icon: "🗓",
            label: "Later",
            val: counts.upcoming,
            color: "#16a34a",
          },
          {
            key: "completed",
            icon: "✅",
            label: "Done",
            val: counts.completed,
            color: "#64748b",
          },
        ].map((s) => (
          <button
            key={s.key}
            className={`acf-fu-stat-card ${filterStatus === s.key ? "acf-fu-stat-card--active" : ""}`}
            style={{ "--fs-color": s.color }}
            onClick={() =>
              setFilterStatus(filterStatus === s.key ? "all" : s.key)
            }
          >
            <span className="acf-fu-stat-icon">{s.icon}</span>
            <span className="acf-fu-stat-val">{s.val}</span>
            <span className="acf-fu-stat-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="acf-fu-toolbar">
        <div className="acf-fu-toolbar-left">
          <div className="acf-search-wrapper acf-search-wrapper--sm">
            <span className="acf-search-icon-sm">🔍</span>
            <input
              placeholder="Search follow-ups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="acf-input acf-search-input acf-search-input--sm"
            />
            {search && (
              <button
                className="acf-search-clear"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
          <select
            className="acf-input acf-filter-select acf-filter-select--sm"
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
          >
            <option value="all">All Outcomes</option>
            {OUTCOMES.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          <select
            className="acf-input acf-filter-select acf-filter-select--sm"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.l}
              </option>
            ))}
          </select>
          <select
            className="acf-input acf-filter-select acf-filter-select--sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="date">Sort by Date</option>
            <option value="priority">Sort by Priority</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
        <div className="acf-fu-toolbar-right">
          <span className="acf-record-count">{filtered.length} items</span>
          <div className="acf-fu-view-toggle">
            {[
              { id: "list", icon: "☰", label: "List" },
              { id: "board", icon: "▦", label: "Board" },
              { id: "calendar", icon: "📅", label: "Calendar" },
            ].map((v) => (
              <button
                key={v.id}
                className={`acf-fu-view-btn ${view === v.id ? "acf-fu-view-btn--active" : ""}`}
                onClick={() => setView(v.id)}
                title={v.label}
              >
                {v.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Views */}
      {view === "list" && (
        <div className="acf-fu-list">
          {filtered.length === 0 && (
            <div className="acf-empty-card">
              <div className="acf-empty-icon">🎉</div>
              <h3>All Clear!</h3>
              <p>No follow-ups matching your filters</p>
            </div>
          )}
          {filtered.map((item) => (
            <FollowUpItem key={item.uniqueId} item={item} />
          ))}
        </div>
      )}

      {view === "board" && <BoardView />}
      {view === "calendar" && <CalendarView />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CALL TABLE
═══════════════════════════════════════════════ */
function CallTable({
  calls,
  activeCall,
  callingRows,
  onCall,
  onEnd,
  onRemark,
  onHistory,
  onDelete,
  onEditName,
  onSort,
  sortKey,
  sortDir,
  mini,
}) {
  const TH = ({ k, children }) => (
    <th
      onClick={() => onSort?.(k)}
      className={`acf-th ${sortKey === k ? "acf-th--sorted" : ""}`}
    >
      <span className="acf-th-content">
        {children}
        {sortKey === k && (
          <span className="acf-sort-arrow">{sortDir === 1 ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="acf-table-wrap">
      <table className="acf-table">
        <thead>
          <tr>
            <TH k="call_to_number">CUSTOMER</TH>
            <TH k="direction">TYPE</TH>
            <TH k="createdAt">DATE & TIME</TH>
            <TH k="call_status">STATUS</TH>
            <TH k="answered_agent_name">AGENT</TH>
            {!mini && <TH k="billsec">DURATION</TH>}
            {!mini && <th className="acf-th">RECORDING</th>}
            <th className="acf-th">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {!calls.length && (
            <tr>
              <td colSpan={mini ? 6 : 8} className="acf-table-empty">
                <div className="acf-table-empty-content">
                  <span className="acf-table-empty-icon">📭</span>
                  <p>No calls found</p>
                </div>
              </td>
            </tr>
          )}
          {calls.map((c, i) => {
            const num =
              String(c.direction).toLowerCase() === "inbound"
                ? c.client_number ||
                  c.caller_id_number ||
                  c.call_to_number ||
                  "—"
                : c.call_to_number || c.client_number || "—";
            const key = c.id || num;
            const isActive = activeCall?.key === key;
            const isCalling = callingRows[key];
            const isMissed =
              norm(c.call_status).includes("miss") ||
              norm(c.call_status).includes("fail");
            const isInbound = norm(c.direction) === "inbound";
            const { date, time } = fmtTime(c);

            return (
              <tr
                key={c.id || i}
                className={`acf-table-row ${isActive ? "acf-table-row--active" : ""} ${isMissed ? "acf-table-row--missed" : ""}`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="acf-td">
                  <div className="acf-customer-cell">
                    <div
                      className={`acf-customer-avatar ${isMissed ? "acf-customer-avatar--missed" : isInbound ? "acf-customer-avatar--inbound" : "acf-customer-avatar--outbound"}`}
                    >
                      {isMissed ? "📵" : isInbound ? "↙" : "↗"}
                    </div>
                    <div className="acf-customer-info">
                      <div className="acf-customer-name-row">
                        <button
                          onClick={() =>
                            onHistory({ number: num, name: c.name })
                          }
                          className="acf-name-link"
                        >
                          {c.name || num}
                        </button>
                        {!mini && (
                          <button
                            onClick={() =>
                              onEditName({
                                id: c.id,
                                number: num,
                                name: c.name,
                              })
                            }
                            className="acf-edit-icon"
                            title="Edit name"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                      {c.name && <div className="acf-mono-xs">{num}</div>}
                    </div>
                  </div>
                </td>
                <td className="acf-td">
                  <Badge direction={c.direction} />
                </td>
                <td className="acf-td">
                  <div className="acf-datetime">
                    <span className="acf-date">{date}</span>
                    <span className="acf-mono-xs">{time}</span>
                  </div>
                </td>
                <td className="acf-td">
                  <div className="acf-status-cell">
                    <Badge status={c.call_status} />
                    {c._remark && (
                      <div className="acf-remark-tag">📝 {c._remark}</div>
                    )}
                    {c._outcome && <Badge outcome={c._outcome} />}
                  </div>
                </td>
                <td className="acf-td">
                  <span className="acf-agent-name">
                    {c.answered_agent_name || "—"}
                  </span>
                </td>
                {!mini && (
                  <td className="acf-td">
                    <span className="acf-duration">{fmtDur(c.billsec)}</span>
                  </td>
                )}
                {!mini && (
                  <td className="acf-td">
                    <RecordingPlayer call={c} />
                  </td>
                )}
                <td className="acf-td">
                  <div className="acf-actions-cell">
                    {isActive ? (
                      <button onClick={() => onEnd(c)} className="acf-btn-end">
                        <span className="acf-end-pulse" />
                        End · <LiveTimer startedAt={activeCall.startedAt} />
                      </button>
                    ) : (
                      <button
                        onClick={() => onCall(c)}
                        disabled={isCalling}
                        className={`acf-btn-call ${isCalling ? "acf-btn-call--busy" : ""}`}
                      >
                        {isCalling ? (
                          <>
                            <span className="acf-btn-spinner" /> Calling...
                          </>
                        ) : (
                          "📞 Call"
                        )}
                      </button>
                    )}
                    {!mini && (
                      <>
                        <button
                          onClick={() =>
                            onRemark({
                              callId: c.id,
                              number: num,
                              name: c.name,
                              existingRemark: c._remark,
                              outcome: c._outcome,
                            })
                          }
                          className="acf-btn-icon acf-btn-icon--remark"
                          title="Add remark"
                        >
                          📝
                        </button>
                        <button
                          onClick={() =>
                            onDelete({
                              id: c.id,
                              number: num,
                              name: c.name,
                            })
                          }
                          className="acf-btn-icon acf-btn-icon--delete"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
═══════════════════════════════════════════════ */
function AcefoneIVRCallInner() {
  const { dark, toggle: toggleTheme } = useTheme();
  const [tab, setTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({});
  const [allCalls, setAllCalls] = useState([]);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(false);

  // Live calls tracking
  const [liveCalls, setLiveCalls] = useState([]);
  const [activeCall, setActiveCall] = useState(null);
  const [callingRows, setCallingRows] = useState({});

  // Modals
  const [remarkModal, setRemarkModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [dialModal, setDialModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [editNameModal, setEditNameModal] = useState(null);
  const [exportModal, setExportModal] = useState(false);
  const [postCallPopup, setPostCallPopup] = useState(null);

  // Filters
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState(-1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [fDir, setFDir] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [fDate, setFDate] = useState("");

  // Toast
  const [toast, setToast] = useState({ show: false, msg: "", ok: true });
  const toastT = useRef();
  const showToast = useCallback((msg, ok = true) => {
    setToast({ show: true, msg, ok });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(
      () => setToast((t) => ({ ...t, show: false })),
      3800
    );
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "d":
            e.preventDefault();
            setDialModal(true);
            break;
          case "e":
            e.preventDefault();
            setExportModal(true);
            break;
          case "k":
            e.preventDefault();
            document.querySelector(".acf-search-input")?.focus();
            break;
          default:
            break;
        }
      }
      if (e.key === "Escape") {
        setDialModal(false);
        setExportModal(false);
        setRemarkModal(null);
        setHistoryModal(null);
        setDeleteModal(null);
        setEditNameModal(null);
        setPostCallPopup(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fetch
  const fetchAgents = useCallback(async () => {
    try {
      setAgents(await (await fetch(`${API}/agents`)).json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await (await fetch(`${API}/stats`)).json());
    } catch {}
  }, []);

  const fetchCalls = useCallback(async () => {
    try {
      setAllCalls(await (await fetch(`${API}/call-logs?limit=500`)).json());
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAgents(), fetchStats(), fetchCalls()]);
    setLastRefresh(new Date());
    setLoading(false);
  }, [fetchAgents, fetchStats, fetchCalls]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Filter + Sort
  useEffect(() => {
    let r = [...allCalls];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((c) =>
        [
          c.call_to_number,
          c.caller_id_number,
          c.name,
          c.answered_agent_name,
          c.id,
        ].some((v) => v && String(v).toLowerCase().includes(q))
      );
    }
    if (fDir) r = r.filter((c) => norm(c.direction) === norm(fDir));
    if (fStatus) r = r.filter((c) => norm(c.call_status) === norm(fStatus));
    if (fAgent) r = r.filter((c) => c.answered_agent_name === fAgent);
    if (fDate)
      r = r.filter((c) => {
        const ts = safeTs(c);
        return ts && new Date(ts).toISOString().slice(0, 10) === fDate;
      });
    r.sort((a, b) => {
      let va = a[sortKey] ?? "",
        vb = b[sortKey] ?? "";
      if (sortKey === "createdAt") {
        va = safeTs(a);
        vb = safeTs(b);
      } else if (sortKey === "billsec") {
        va = Number(va);
        vb = Number(vb);
      }
      if (va < vb) return -sortDir;
      if (va > vb) return sortDir;
      return 0;
    });
    setFilteredCalls(r);
    setPage(1);
  }, [allCalls, search, fDir, fStatus, fAgent, fDate, sortKey, sortDir]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir((d) => d * -1);
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  const paged = filteredCalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.ceil(filteredCalls.length / PAGE_SIZE);

  // Call Actions
  const handleCall = async (c) => {
    if (!selectedAgent) {
      showToast("Select an agent first", false);
      return;
    }
    const cleanN = (n = "") => String(n).replace(/^\+91/, "").trim();
    const num =
      String(c?.direction || "").toLowerCase() === "inbound"
        ? cleanN(
            c?.client_number ||
              c?.caller_id_num ||
              c?.caller_id_number ||
              ""
          )
        : cleanN(c?.call_to_number || c?.client_number || "");
    const key = c?.id || num;
    const agentName =
      agents.find((a) => a.id === selectedAgent)?.name || "Agent";

    setCallingRows((p) => ({ ...p, [key]: true }));
    try {
      const r = await fetch(`${API}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: num,
          agentId: selectedAgent,
          name: c?.name || "",
          leadId: c?.id || "",
        }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast(`📞 Calling ${c?.name || num}...`);
        const callData = {
          key,
          number: num,
          name: c?.name || "",
          startedAt: Date.now(),
          agent: agentName,
          callId: c?.id || d.callId || key,
        };
        setActiveCall(callData);
        // Add to live calls
        setLiveCalls((prev) => [
          ...prev.filter((lc) => lc.key !== key),
          callData,
        ]);
      } else {
        showToast(d.error || "Call failed", false);
        setCallingRows((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
      }
    } catch {
      showToast("Network error", false);
      setCallingRows((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  };

  const handleManualCall = (_, num, name) => {
    handleCall({ call_to_number: num, caller_id_number: num, name });
    setDialModal(false);
  };

  const handleEnd = (c) => {
    const num =
      c?.call_to_number ||
      c?.caller_id_number ||
      activeCall?.number ||
      "";
    const key = c?.id || num;
    const callDuration = activeCall?.startedAt
      ? Date.now() - activeCall.startedAt
      : 0;

    setActiveCall(null);
    setCallingRows((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
    // Remove from live calls
    setLiveCalls((prev) => prev.filter((lc) => lc.key !== key));

    // Show post-call popup
    setPostCallPopup({
      callId: c?.id || key,
      number: num,
      name: c?.name || activeCall?.name || "",
      duration: callDuration,
      agent: activeCall?.agent || "",
    });
  };

  const handleEndLiveCall = (lc) => {
    const callDuration = Date.now() - lc.startedAt;
    setLiveCalls((prev) => prev.filter((x) => x.key !== lc.key));
    setCallingRows((p) => {
      const n = { ...p };
      delete n[lc.key];
      return n;
    });
    if (activeCall?.key === lc.key) setActiveCall(null);

    setPostCallPopup({
      callId: lc.callId || lc.key,
      number: lc.number,
      name: lc.name || "",
      duration: callDuration,
      agent: lc.agent || "",
    });
  };

  const handlePostCallSave = (payload, skipped) => {
    if (!skipped) {
      showToast("✅ Call data saved!");
      if (payload.name) {
        setAllCalls((prev) =>
          prev.map((c) =>
            c.id === payload.callId ? { ...c, name: payload.name } : c
          )
        );
      }
      if (payload.outcome || payload.remark) {
        setAllCalls((prev) =>
          prev.map((c) =>
            c.id === payload.callId
              ? { ...c, _remark: payload.remark, _outcome: payload.outcome }
              : c
          )
        );
      }
    }
  };

  const handleRemarkSave = (callId, text, outcome) => {
    showToast("✅ Remark saved!");
    setAllCalls((prev) =>
      prev.map((c) =>
        c.id === callId ? { ...c, _remark: text, _outcome: outcome } : c
      )
    );
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/call-logs/${id}`, { method: "DELETE" });
    } catch {}
    setAllCalls((prev) => prev.filter((c) => c.id !== id));
    showToast("Record deleted");
  };

  const handleEditName = (id, name) => {
    setAllCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
    fetch(`${API}/call-logs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    showToast("Name updated");
  };

  // Derived
  const agentStats = stats.agentStats || {};
  const rate = stats.totalCalls
    ? Math.round((stats.answeredCalls / stats.totalCalls) * 100)
    : 0;

  const hourlyData = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      calls: 0,
      answered: 0,
      missed: 0,
    }));
    allCalls.slice(0, 300).forEach((c) => {
      const ts = safeTs(c);
      if (!ts) return;
      const h = new Date(ts).getHours();
      arr[h].calls++;
      if (
        ["answered", "completed", "connected"].includes(norm(c.call_status))
      )
        arr[h].answered++;
      if (
        ["missed", "no_answer", "no-answer", "failed"].includes(
          norm(c.call_status)
        )
      )
        arr[h].missed++;
    });
    return arr;
  }, [allCalls]);

  const agentChartData = useMemo(
    () =>
      Object.values(agentStats)
        .filter((s) => s.name !== "Unknown")
        .map((s) => ({
          name: s.name,
          calls: s.calls || 0,
          answered: (s.calls || 0) - (s.missed || 0),
          missed: s.missed || 0,
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 8),
    [agentStats]
  );

  const sparklineData = useMemo(() => {
    return Array.from({ length: 7 }, () =>
      Math.floor(Math.random() * 20 + 5)
    );
  }, [allCalls]);

  const inboundCount = allCalls.filter(
    (c) => norm(c.direction) === "inbound"
  ).length;
  const outboundCount = allCalls.filter(
    (c) => norm(c.direction) === "outbound"
  ).length;

  const pieData = useMemo(() => {
    const statusMap = {};
    allCalls.forEach((c) => {
      const s = norm(c.call_status) || "unknown";
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [allCalls]);

  const TABS = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "calls", label: "Call Logs", icon: "📞" },
    { id: "agents", label: "Agents", icon: "👥" },
    { id: "followups", label: "Follow-ups", icon: "📅" },
    { id: "live", label: "Live Calls", icon: "🔴" },
  ];

  return (
    <div
      className={`acf-root ${sidebarCollapsed ? "acf-root--collapsed" : ""}`}
    >
      {/* SIDEBAR */}
      <aside
        className={`acf-sidebar ${sidebarCollapsed ? "acf-sidebar--collapsed" : ""}`}
      >
        <div className="acf-sidebar-top">
          <div className="acf-sidebar-brand">
            <div className="acf-brand-icon">📞</div>
            {!sidebarCollapsed && (
              <div className="acf-brand-text">
                <div className="acf-brand-name">Acefone IVR</div>
                <div className="acf-brand-sub">Call Dashboard</div>
              </div>
            )}
          </div>
          <button
            className="acf-sidebar-toggle"
            onClick={() => setSidebarCollapsed((s) => !s)}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="acf-sidebar-nav">
          {!sidebarCollapsed && (
            <div className="acf-nav-section-label">NAVIGATION</div>
          )}
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`acf-nav-item ${tab === t.id ? "acf-nav-item--active" : ""}`}
              title={sidebarCollapsed ? t.label : undefined}
            >
              <span className="acf-nav-icon">{t.icon}</span>
              {!sidebarCollapsed && (
                <span className="acf-nav-label">{t.label}</span>
              )}
              {t.id === "live" && liveCalls.length > 0 && (
                <span className="acf-nav-badge acf-nav-badge--live">
                  {liveCalls.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="acf-sidebar-quick-stats">
            <div className="acf-quick-stat acf-quick-stat--in">
              <span className="acf-qs-icon">↙</span>
              <div>
                <div className="acf-qs-val">
                  <AnimatedNumber value={inboundCount} />
                </div>
                <div className="acf-qs-label">Inbound</div>
              </div>
            </div>
            <div className="acf-quick-stat acf-quick-stat--out">
              <span className="acf-qs-icon">↗</span>
              <div>
                <div className="acf-qs-val">
                  <AnimatedNumber value={outboundCount} />
                </div>
                <div className="acf-qs-label">Outbound</div>
              </div>
            </div>
          </div>
        )}

        <div className="acf-sidebar-bottom">
          <button
            onClick={() => setDialModal(true)}
            className="acf-sidebar-action-btn acf-sidebar-action-btn--primary"
          >
            📞 {!sidebarCollapsed && "New Call"}
          </button>
          <button
            onClick={() => setExportModal(true)}
            className="acf-sidebar-action-btn"
          >
            📥 {!sidebarCollapsed && "Export"}
          </button>
          <button
            onClick={async () => {
              try {
                const r = await fetch(`${API}/refresh-session`, {
                  method: "POST",
                });
                r.ok
                  ? showToast("Session refreshed!")
                  : showToast("Failed", false);
              } catch {
                showToast("Error", false);
              }
            }}
            className="acf-sidebar-action-btn"
          >
            🔄 {!sidebarCollapsed && "Refresh Session"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="acf-main">
        {/* Header */}
        <header className="acf-header">
          <div className="acf-header-left">
            <div className="acf-header-title-group">
              <h1 className="acf-header-title">
                {TABS.find((t) => t.id === tab)?.icon}{" "}
                {TABS.find((t) => t.id === tab)?.label}
              </h1>
              <div className="acf-header-meta">
                <div className="acf-live-indicator">
                  <div className="acf-live-dot" />
                  <span>LIVE</span>
                </div>
                {lastRefresh && (
                  <span className="acf-updated-at">
                    Updated{" "}
                    {lastRefresh.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {liveCalls.length > 0 && (
                  <span className="acf-live-calls-badge">
                    🔴 {liveCalls.length} live
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="acf-header-right">
            {activeCall && (
              <div className="acf-active-call-indicator">
                <div className="acf-active-pulse" />
                <span>
                  {activeCall.name || activeCall.number} ·{" "}
                  <LiveTimer startedAt={activeCall.startedAt} />
                </span>
              </div>
            )}
            <div className="acf-header-controls">
              <button
                onClick={toggleTheme}
                className="acf-header-icon-btn"
                title="Toggle theme"
              >
                {dark ? "☀️" : "🌙"}
              </button>
              <div className="acf-agent-selector">
                <label className="acf-agent-label">Agent</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="acf-agent-select"
                >
                  <option value="">Select...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={fetchAll}
                disabled={loading}
                className="acf-header-icon-btn"
                title="Refresh"
              >
                <span className={loading ? "acf-spin-inline" : ""}>🔄</span>
              </button>
              <button
                onClick={() => setDialModal(true)}
                className="acf-header-action-btn acf-header-action-btn--call"
              >
                📞 Quick Call
              </button>
            </div>
          </div>
        </header>

        {/* Live Calls Panel (visible everywhere when calls are active) */}
        {liveCalls.length > 0 && tab !== "live" && (
          <LiveCallsPanel
            liveCalls={liveCalls}
            onEndCall={handleEndLiveCall}
          />
        )}

        {/* Content */}
        <div className="acf-content">
          {/* DASHBOARD TAB */}
          {tab === "dashboard" && (
            <div className="acf-dashboard-content">
              <div className="acf-stats-grid">
                {[
                  {
                    label: "Total Calls",
                    value: stats.totalCalls ?? "—",
                    icon: "📞",
                    sub: "Today",
                    color: "#6366f1",
                    gradient:
                      "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  },
                  {
                    label: "Inbound",
                    value: stats.inboundCalls ?? "—",
                    icon: "↙",
                    sub: "Incoming",
                    color: "#8b5cf6",
                    gradient:
                      "linear-gradient(135deg, #8b5cf6, #a78bfa)",
                  },
                  {
                    label: "Outbound",
                    value: stats.outboundCalls ?? "—",
                    icon: "↗",
                    sub: "Outgoing",
                    color: "#059669",
                    gradient:
                      "linear-gradient(135deg, #059669, #10b981)",
                  },
                  {
                    label: "Answered",
                    value: stats.answeredCalls ?? "—",
                    icon: "✅",
                    sub: "Connected",
                    color: "#16a34a",
                    gradient:
                      "linear-gradient(135deg, #16a34a, #22c55e)",
                  },
                  {
                    label: "Missed",
                    value: stats.missedCalls ?? "—",
                    icon: "📵",
                    sub: "Unanswered",
                    color: "#dc2626",
                    gradient:
                      "linear-gradient(135deg, #dc2626, #ef4444)",
                  },
                  {
                    label: "Answer Rate",
                    value: `${rate}%`,
                    icon: "📊",
                    sub: "Success",
                    color: "#0ea5e9",
                    gradient:
                      "linear-gradient(135deg, #0ea5e9, #38bdf8)",
                  },
                  {
                    label: "Avg Duration",
                    value: stats.avgDuration
                      ? fmtDur(stats.avgDuration)
                      : "—",
                    icon: "⏱",
                    sub: "Per call",
                    color: "#d97706",
                    gradient:
                      "linear-gradient(135deg, #d97706, #f59e0b)",
                  },
                  {
                    label: "Live Now",
                    value: liveCalls.length,
                    icon: "🔴",
                    sub: "Active",
                    color: "#ec4899",
                    gradient:
                      "linear-gradient(135deg, #ec4899, #f472b6)",
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="acf-stat-card"
                    style={{
                      "--stat-color": s.color,
                      "--stat-gradient": s.gradient,
                      animationDelay: `${i * 60}ms`,
                    }}
                  >
                    <div className="acf-stat-card-inner">
                      <div className="acf-stat-top">
                        <div className="acf-stat-label">{s.label}</div>
                        <div
                          className="acf-stat-icon-wrap"
                          style={{ background: s.gradient }}
                        >
                          <span className="acf-stat-icon">{s.icon}</span>
                        </div>
                      </div>
                      <div
                        className="acf-stat-value"
                        style={{ color: s.color }}
                      >
                        {typeof s.value === "number" ? (
                          <AnimatedNumber value={s.value} />
                        ) : (
                          s.value
                        )}
                      </div>
                      <div className="acf-stat-bottom">
                        <span className="acf-stat-sub">{s.sub}</span>
                        <Sparkline data={sparklineData} color={s.color} />
                      </div>
                    </div>
                    <div
                      className="acf-stat-card-glow"
                      style={{ background: s.color }}
                    />
                  </div>
                ))}
              </div>

              <div className="acf-charts-row">
                <div className="acf-chart-card acf-chart-card--main">
                  <div className="acf-chart-header">
                    <div className="acf-chart-title-group">
                      <h3 className="acf-chart-title">
                        📈 Call Volume (Hourly)
                      </h3>
                      <p className="acf-chart-subtitle">
                        Today's call distribution
                      </p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient
                          id="gTotal"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#6366f1"
                            stopOpacity={0.15}
                          />
                          <stop
                            offset="95%"
                            stopColor="#6366f1"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="gAnswered"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#22c55e"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="#22c55e"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--acf-border-light)"
                      />
                      <XAxis
                        dataKey="hour"
                        tick={{
                          fontSize: 10,
                          fill: "var(--acf-text-muted)",
                        }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{
                          fontSize: 10,
                          fill: "var(--acf-text-muted)",
                        }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        name="Total"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fill="url(#gTotal)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="answered"
                        name="Answered"
                        stroke="#22c55e"
                        strokeWidth={2}
                        fill="url(#gAnswered)"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="missed"
                        name="Missed"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="5 5"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="acf-chart-card acf-chart-card--side">
                  <div className="acf-chart-header">
                    <h3 className="acf-chart-title">📉 Missed Rate</h3>
                  </div>
                  <div className="acf-donut-center">
                    <DonutChart
                      answered={stats.answeredCalls || 0}
                      missed={stats.missedCalls || 0}
                      total={stats.totalCalls || 0}
                    />
                  </div>
                  <div className="acf-donut-legend">
                    <span className="acf-legend-item">
                      <span
                        className="acf-legend-dot"
                        style={{ background: "#ef4444" }}
                      />{" "}
                      Missed
                    </span>
                    <span className="acf-legend-item">
                      <span
                        className="acf-legend-dot"
                        style={{ background: "#22c55e" }}
                      />{" "}
                      Answered
                    </span>
                  </div>
                  {pieData.length > 0 && (
                    <div className="acf-mini-pie">
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={50}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieData.map((_, idx) => (
                              <Cell
                                key={idx}
                                fill={
                                  COLORS_CHART[idx % COLORS_CHART.length]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              <div className="acf-chart-card">
                <div className="acf-chart-header">
                  <h3 className="acf-chart-title">
                    👥 Agent Performance
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={agentChartData} barSize={24}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--acf-border-light)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="answered"
                      name="Answered"
                      fill="#22c55e"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="missed"
                      name="Missed"
                      fill="#ef4444"
                      radius={[6, 6, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="calls"
                      name="Total"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="acf-card">
                <div className="acf-card-header">
                  <div className="acf-card-header-left">
                    <span className="acf-card-header-icon">📋</span>
                    <div>
                      <span className="acf-card-title">Recent Calls</span>
                      <span className="acf-card-subtitle">
                        {allCalls.length} total calls
                      </span>
                    </div>
                  </div>
                  <button
                    className="acf-btn acf-btn--ghost acf-btn--sm"
                    onClick={() => setTab("calls")}
                  >
                    View All →
                  </button>
                </div>
                <CallTable
                  calls={allCalls.slice(0, 8)}
                  activeCall={activeCall}
                  callingRows={callingRows}
                  onCall={handleCall}
                  onEnd={handleEnd}
                  onRemark={setRemarkModal}
                  onHistory={setHistoryModal}
                  onDelete={() => {}}
                  onEditName={() => {}}
                  mini
                />
              </div>
            </div>
          )}

          {/* CALL LOGS TAB */}
          {tab === "calls" && (
            <div className="acf-card">
              <div className="acf-filters-bar">
                <div className="acf-filters-left">
                  <div className="acf-search-wrapper">
                    <span className="acf-search-icon-sm">🔍</span>
                    <input
                      placeholder="Search calls... (Ctrl+K)"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="acf-input acf-search-input"
                    />
                    {search && (
                      <button
                        className="acf-search-clear"
                        onClick={() => setSearch("")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <select
                    className="acf-input acf-filter-select"
                    value={fDir}
                    onChange={(e) => setFDir(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="inbound">↙ Inbound</option>
                    <option value="outbound">↗ Outbound</option>
                  </select>
                  <select
                    className="acf-input acf-filter-select"
                    value={fStatus}
                    onChange={(e) => setFStatus(e.target.value)}
                  >
                    <option value="">All Status</option>
                    <option value="answered">✓ Answered</option>
                    <option value="missed">✗ Missed</option>
                    <option value="busy">~ Busy</option>
                    <option value="failed">! Failed</option>
                  </select>
                  <select
                    className="acf-input acf-filter-select"
                    value={fAgent}
                    onChange={(e) => setFAgent(e.target.value)}
                  >
                    <option value="">All Agents</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="acf-input acf-filter-date"
                    value={fDate}
                    onChange={(e) => setFDate(e.target.value)}
                  />
                  {(search || fDir || fStatus || fAgent || fDate) && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setFDir("");
                        setFStatus("");
                        setFAgent("");
                        setFDate("");
                      }}
                      className="acf-btn acf-btn--ghost acf-btn--sm"
                    >
                      ✕ Reset
                    </button>
                  )}
                </div>
                <div className="acf-filters-right">
                  <span className="acf-record-count">
                    {filteredCalls.length} records
                  </span>
                  <button
                    className="acf-btn acf-btn--ghost"
                    onClick={() => setExportModal(true)}
                  >
                    📥 Export
                  </button>
                  <button
                    className="acf-btn acf-btn--primary"
                    onClick={() => setDialModal(true)}
                  >
                    📞 New Call
                  </button>
                </div>
              </div>

              <CallTable
                calls={paged}
                activeCall={activeCall}
                callingRows={callingRows}
                onCall={handleCall}
                onEnd={handleEnd}
                onRemark={setRemarkModal}
                onHistory={setHistoryModal}
                onDelete={setDeleteModal}
                onEditName={setEditNameModal}
                onSort={handleSort}
                sortKey={sortKey}
                sortDir={sortDir}
              />

              {pages > 1 && (
                <div className="acf-pagination">
                  <div className="acf-pagination-info">
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, filteredCalls.length)} of{" "}
                    {filteredCalls.length}
                  </div>
                  <div className="acf-pagination-controls">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="acf-pg-btn"
                    >
                      «
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="acf-pg-btn"
                    >
                      ‹
                    </button>
                    {Array.from(
                      { length: Math.min(7, pages) },
                      (_, i) => {
                        let p = i + 1;
                        if (pages > 7 && page > 4) p = page - 3 + i;
                        if (p < 1 || p > pages) return null;
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`acf-pg-btn ${p === page ? "acf-pg-btn--active" : ""}`}
                          >
                            {p}
                          </button>
                        );
                      }
                    )}
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(pages, p + 1))
                      }
                      disabled={page === pages}
                      className="acf-pg-btn"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => setPage(pages)}
                      disabled={page === pages}
                      className="acf-pg-btn"
                    >
                      »
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AGENTS TAB */}
          {tab === "agents" && (
            <>
              <div className="acf-chart-card">
                <div className="acf-chart-header">
                  <h3 className="acf-chart-title">
                    📊 Agent Call Distribution
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={agentChartData} barSize={28}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--acf-border-light)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="calls"
                      name="Total"
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="acf-agent-grid">
                {Object.keys(agentStats)
                  .sort(
                    (a, b) => agentStats[b].calls - agentStats[a].calls
                  )
                  .map((agName) => {
                    const s = agentStats[agName];
                    const aRate = s.calls
                      ? Math.round(
                          ((s.calls - s.missed) / s.calls) * 100
                        )
                      : 0;
                    const avg = s.calls
                      ? Math.round(s.duration / s.calls)
                      : 0;
                    // Determine status based on live calls
                    const isLive = liveCalls.some(
                      (lc) => lc.agent === agName
                    );

                    return (
                      <div key={agName} className="acf-agent-card">
                        <div className="acf-agent-card-header">
                          <div className="acf-agent-avatar">
                            <span>
                              {agName[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div className="acf-agent-info">
                            <div className="acf-agent-card-name">
                              {agName}
                            </div>
                            <div className="acf-agent-card-role">
                              {isLive
                                ? "🔴 On Call"
                                : "Sales Agent"}
                            </div>
                          </div>
                          <div
                            className={`acf-agent-status-dot ${isLive ? "acf-agent-status-dot--live" : aRate >= 70 ? "acf-agent-status-dot--online" : "acf-agent-status-dot--busy"}`}
                          />
                        </div>
                        <div className="acf-agent-metrics">
                          {[
                            {
                              l: "Calls",
                              v: s.calls,
                              c: "var(--acf-text-primary)",
                            },
                            {
                              l: "Rate",
                              v: `${aRate}%`,
                              c:
                                aRate >= 70
                                  ? "#16a34a"
                                  : "#dc2626",
                            },
                            {
                              l: "Avg Dur",
                              v: fmtDur(avg),
                              c: "#6366f1",
                            },
                            {
                              l: "Missed",
                              v: s.missed,
                              c: "#dc2626",
                            },
                          ].map((x, j) => (
                            <div key={j} className="acf-agent-metric">
                              <div
                                className="acf-agent-metric-val"
                                style={{ color: x.c }}
                              >
                                {x.v}
                              </div>
                              <div className="acf-agent-metric-lbl">
                                {x.l}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="acf-agent-bar-wrap">
                          <div className="acf-agent-bar-top">
                            <span>Answer rate</span>
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  aRate >= 70
                                    ? "#16a34a"
                                    : "#dc2626",
                              }}
                            >
                              {aRate}%
                            </span>
                          </div>
                          <div className="acf-agent-bar-bg">
                            <div
                              className="acf-agent-bar-fill"
                              style={{
                                width: `${aRate}%`,
                                background:
                                  aRate >= 70
                                    ? "linear-gradient(90deg, #16a34a, #22c55e)"
                                    : "linear-gradient(90deg, #dc2626, #ef4444)",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {!Object.keys(agentStats).length && (
                  <div className="acf-empty-card">
                    <div className="acf-empty-icon">👥</div>
                    <p>No agent data available</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* FOLLOW-UPS TAB */}
          {tab === "followups" && <FollowupsTab calls={allCalls} />}

          {/* LIVE CALLS TAB */}
          {tab === "live" && (
            <div className="acf-live-tab">
              <div className="acf-live-tab-header">
                <div className="acf-live-tab-indicator">
                  <div className="acf-live-dot-xl" />
                  <h2 className="acf-live-tab-title">
                    Live Calls
                  </h2>
                  <span className="acf-live-tab-count">
                    {liveCalls.length} active
                  </span>
                </div>
              </div>

              {liveCalls.length === 0 ? (
                <div className="acf-empty-card acf-empty-card--lg">
                  <div className="acf-empty-icon-lg">📵</div>
                  <h3>No Active Calls</h3>
                  <p>There are currently no live calls in progress</p>
                  <button
                    className="acf-btn acf-btn--primary"
                    onClick={() => setDialModal(true)}
                  >
                    📞 Start a Call
                  </button>
                </div>
              ) : (
                <div className="acf-live-grid">
                  {liveCalls.map((lc, i) => (
                    <div key={i} className="acf-live-card">
                      <div className="acf-live-card-header">
                        <div className="acf-live-card-avatar">
                          <div className="acf-live-card-pulse" />
                          📞
                        </div>
                        <div className="acf-live-card-info">
                          <div className="acf-live-card-name">
                            {lc.name || "Unknown"}
                          </div>
                          <div className="acf-mono-xs">
                            {lc.number}
                          </div>
                        </div>
                        <Badge status="in_progress" />
                      </div>
                      <div className="acf-live-card-body">
                        <div className="acf-live-card-timer">
                          <LiveTimer startedAt={lc.startedAt} />
                        </div>
                        <div className="acf-live-card-meta">
                          <span>👤 {lc.agent || "—"}</span>
                          <span>
                            Started{" "}
                            {new Date(
                              lc.startedAt
                            ).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="acf-live-card-footer">
                        <button
                          className="acf-btn-end acf-btn-end--full"
                          onClick={() =>
                            handleEndLiveCall(lc)
                          }
                        >
                          <span className="acf-end-pulse" />
                          End Call
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {remarkModal && (
        <RemarkModal
          data={remarkModal}
          onClose={() => setRemarkModal(null)}
          onSave={handleRemarkSave}
        />
      )}
      {historyModal && (
        <HistoryModal
          number={historyModal.number}
          name={historyModal.name}
          onClose={() => setHistoryModal(null)}
        />
      )}
      {dialModal && (
        <DialModal
          agents={agents}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          onClose={() => setDialModal(false)}
          onCall={handleManualCall}
        />
      )}
      {deleteModal && (
        <DeleteConfirm
          data={deleteModal}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleDelete}
        />
      )}
      {editNameModal && (
        <EditNameModal
          data={editNameModal}
          onClose={() => setEditNameModal(null)}
          onSave={handleEditName}
        />
      )}
      {exportModal && (
        <ExportModal
          agents={agents}
          onClose={() => setExportModal(false)}
        />
      )}
      {postCallPopup && (
        <PostCallPopup
          data={postCallPopup}
          onClose={() => setPostCallPopup(null)}
          onSave={handlePostCallSave}
        />
      )}

      {/* Toast */}
      <div
        className={`acf-toast ${toast.show ? "acf-toast--visible" : ""}`}
      >
        <div
          className={`acf-toast-body ${toast.ok ? "acf-toast-body--success" : "acf-toast-body--error"}`}
        >
          <span className="acf-toast-icon">
            {toast.ok ? "✅" : "❌"}
          </span>
          <span className="acf-toast-msg">{toast.msg}</span>
        </div>
      </div>
    </div>
  );
}

export default function AcefoneIVRCall() {
  return (
    <ThemeProvider>
      <AcefoneIVRCallInner />
    </ThemeProvider>
  );
}