import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import "./CallLogs.css";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const PAGE_SIZE = 50;
const DISPLAY_SIZE = 10;
const CACHE_KEY = "cl_cache_v2";
const CACHE_TTL = 5 * 60 * 1000;
const HISTORY_CACHE_TTL = 10 * 60 * 1000;
const AUTO_REFRESH_INTERVAL = 60 * 1000;
const SEARCH_DEBOUNCE = 300;
const CACHE_VERSION = 2;

// ─── Name Map Cache ───────────────────────────────────────────────────────────
// Stores { last10digits -> name } mapping in localStorage
const NAME_MAP_KEY = "cl_name_map_v1";

const getNameMap = () => {
  try {
    const raw = localStorage.getItem(NAME_MAP_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const setNameMap = (map) => {
  try {
    localStorage.setItem(NAME_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error("NameMap write error:", e);
  }
};

const updateNameMap = (number, name) => {
  const map = getNameMap();
  const key = cleanNum(number);
  if (!key) return;
  if (name) {
    map[key] = name;
  } else {
    delete map[key];
  }
  setNameMap(map);
};

const lookupName = (number) => {
  const map = getNameMap();
  const key = cleanNum(number);
  if (!key) return null;
  return map[key] || null;
};

// ─── Cache Helpers ────────────────────────────────────────────────────────────
const getCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (parsed.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    if (!Array.isArray(parsed.calls)) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (e) {
    console.error("Cache read error:", e);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const setCache = (calls, meta = {}) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        calls,
        ts: Date.now(),
        version: CACHE_VERSION,
        ...meta,
      })
    );
  } catch (e) {
    console.error("Cache write error:", e);
  }
};

const invalidateCache = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.error("Cache invalidate error:", e);
  }
};

const getHistoryCache = (number) => {
  try {
    const raw = sessionStorage.getItem(`hist_${number}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);

    if (Date.now() - ts > HISTORY_CACHE_TTL) {
      sessionStorage.removeItem(`hist_${number}`);
      return null;
    }

    return data;
  } catch {
    return null;
  }
};

const setHistoryCache = (number, data) => {
  try {
    sessionStorage.setItem(
      `hist_${number}`,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch {}
};

// Invalidate history cache for a number so it refreshes with new name
const invalidateHistoryCache = (number) => {
  try {
    const key = cleanNum(number);
    sessionStorage.removeItem(`hist_${key}`);
  } catch {}
};

// ─── Utility Functions ────────────────────────────────────────────────────────
const norm = (s = "") => String(s).toLowerCase().trim();
const onlyDigits = (v = "") => String(v).replace(/\D/g, "");
const cleanNum = (n = "") => onlyDigits(n).slice(-10);
const hasLetters = (s = "") => /[a-z]/i.test(String(s));

const isShortExt = (v = "") => {
  const d = onlyDigits(v);
  return d.length >= 2 && d.length <= 6;
};

const toIndianMobile10 = (v = "") => {
  const d = onlyDigits(v);
  if (!d) return null;
  const t = d.length > 10 ? d.slice(-10) : d;
  return t.length === 10 && /^[6-9]/.test(t) ? t : null;
};

const getSafeObj = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? v : null;

const isTextName = (s = "") => {
  const v = String(s || "").trim();
  return !!v && hasLetters(v);
};

const firstText = (arr = []) => {
  for (const item of arr) {
    const val = String(item || "").trim();
    if (isTextName(val)) return val;
  }
  return null;
};

const firstShortExt = (arr = []) => {
  for (const item of arr) {
    const d = onlyDigits(item);
    if (d && isShortExt(d)) return d;
  }
  return null;
};

const firstMobile = (arr = []) => {
  for (const item of arr) {
    const m = toIndianMobile10(item);
    if (m) return m;
  }
  return null;
};

// ─── Extract all possible numbers from a call record ─────────────────────────
const extractCallNumbers = (call) => {
  const nums = new Set();
  const candidates = [
    call?.client_number,
    call?.caller_id_number,
    call?.call_to_number,
    call?.from_number,
    call?.to_number,
    call?.phone,
    call?.mobile,
    call?.number,
  ];
  candidates.forEach((v) => {
    const d = cleanNum(v);
    if (d && d.length === 10) nums.add(d);
  });
  return [...nums];
};

// ─── Resolve display name for a call (checks name map first) ─────────────────
const resolveDisplayName = (call) => {
  if (!call) return null;

  // Check all numbers from this call against nameMap
  const numbers = extractCallNumbers(call);
  for (const num of numbers) {
    const mapped = lookupName(num);
    if (mapped) return mapped;
  }

  // Fall back to whatever name is stored on the call record itself
  return call.name || null;
};

const getFlowAgentNodes = (call) => {
  if (!Array.isArray(call?.call_flow)) return [];
  return call.call_flow.filter((x) => norm(x?.type) === "agent");
};

const getAgentNameFromMaster = (a) =>
  a?.name ||
  a?.agent_name ||
  a?.agentName ||
  a?.displayName ||
  a?.fullName ||
  null;

const safeTs = (c) => {
  if (!c?.createdAt && !c?.start_stamp) return 0;

  if (c?.createdAt?._seconds) return c.createdAt._seconds * 1000;

  const fromCreatedAt = new Date(c?.createdAt).getTime();
  if (!Number.isNaN(fromCreatedAt) && fromCreatedAt > 0) return fromCreatedAt;

  const fromStartStamp = new Date(c?.start_stamp).getTime();
  if (!Number.isNaN(fromStartStamp) && fromStartStamp > 0)
    return fromStartStamp;

  return 0;
};

const fmtDur = (s) => {
  s = Number(s) || 0;
  if (!s) return "—";

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtSec = (s) => {
  s = Number(s) || 0;
  const m = Math.floor(s / 60);
  const sec = s % 60;
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

const OUTCOMES = [
  { v: "interested", l: "✅ Interested", color: "#16a34a" },
  { v: "not_interested", l: "❌ Not Interested", color: "#dc2626" },
  { v: "callback", l: "📞 Callback", color: "#d97706" },
  { v: "no_answer", l: "🔇 No Answer", color: "#6b7280" },
  { v: "converted", l: "🎯 Converted", color: "#7c3aed" },
  { v: "follow_up", l: "🔁 Follow Up", color: "#0ea5e9" },
  { v: "wrong_number", l: "🚫 Wrong Number", color: "#f43f5e" },
  { v: "voicemail", l: "📧 Voicemail", color: "#8b5cf6" },
  { v: "dnc", l: "🚷 DNC", color: "#991b1b" },
];

// ─── Debounce Hook ────────────────────────────────────────────────────────────
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
};

// ─── Agent Directory / Resolver ───────────────────────────────────────────────
const buildAgentDirectory = (agents = []) => {
  const byMobile = new Map();
  const byExt = new Map();
  const byAny = new Map();

  agents.forEach((a) => {
    const name = getAgentNameFromMaster(a);
    if (!name) return;

    const mobileCandidates = [
      a?.agent_number,
      a?.agentNumber,
      a?.mobile,
      a?.phone,
      a?.number,
      a?.mobileNumber,
      a?.did,
      a?.did_number,
      a?.didNumber,
    ];

    const extCandidates = [
      a?.extension,
      a?.ext,
      a?.exten,
      a?.extenstion,
      a?.agent_extension,
      a?.agentExtension,
      a?.user_extension,
      a?.sip_extension,
    ];

    const anyCandidates = [
      ...mobileCandidates,
      ...extCandidates,
      a?.id,
      a?.userId,
    ];

    const mobile = firstMobile(mobileCandidates);
    const ext = firstShortExt(extCandidates);

    const record = { raw: a, name, mobile, ext };

    if (mobile) byMobile.set(mobile, record);
    if (ext) byExt.set(ext, record);

    anyCandidates.forEach((v) => {
      const d = onlyDigits(v);
      if (!d) return;
      if (!byAny.has(d)) byAny.set(d, record);
      if (d.length > 10 && !byAny.has(d.slice(-10))) {
        byAny.set(d.slice(-10), record);
      }
    });
  });

  return { byMobile, byExt, byAny };
};

const findAgentInDirectory = (value, directory) => {
  if (!value || !directory) return null;

  const d = onlyDigits(value);
  if (!d) return null;

  const mobile = toIndianMobile10(d);
  if (mobile && directory.byMobile?.has(mobile)) {
    return directory.byMobile.get(mobile);
  }

  if (isShortExt(d) && directory.byExt?.has(d)) {
    return directory.byExt.get(d);
  }

  if (directory.byAny?.has(d)) {
    return directory.byAny.get(d);
  }

  if (d.length > 10 && directory.byAny?.has(d.slice(-10))) {
    return directory.byAny.get(d.slice(-10));
  }

  return null;
};

const resolveAgentInfo = (call, agentDirectory) => {
  if (!call) {
    return {
      name: null,
      label: null,
      number: null,
      ext: null,
      did: null,
      isResolved: false,
      isMissed: false,
      isMissedBy: false,
    };
  }

  const isMissed = [
    "missed",
    "no-answer",
    "no_answer",
    "failed",
    "busy",
  ].includes(norm(call.call_status));

  const answeredObj = getSafeObj(call.answered_agent);
  const missedObj = getSafeObj(call.missed_agent);
  const flowAgents = getFlowAgentNodes(call);

  const directName = firstText([
    answeredObj?.name,
    missedObj?.name,
    call.answered_agent_name,
    call.missed_agent_name,
    call.agent_name,
    call.agentName,
    call.agent,
    call.assigned_agent,
    call.assignedAgent,
    call.handled_by,
    call.handledBy,
    call.answered_by,
    call.answeredBy,
    ...flowAgents.map((a) => a?.name),
  ]);

  const mobileCandidates = [
    answeredObj?.agent_number,
    missedObj?.agent_number,
    answeredObj?.num,
    missedObj?.num,
    call.answered_agent_mobile,
    call.missed_agent_mobile,
    call.agent_mobile,
    call.agentMobile,
    call.agent_phone,
    call.agentPhone,
    call.agent_number,
    call.agentNumber,
    ...flowAgents.map((a) => a?.num),
  ].filter(Boolean);

  const extCandidates = [
    answeredObj?.extension,
    missedObj?.extension,
    call.agent_extension,
    call.agentExtension,
    call.extension,
    call.ext,
    call.exten,
    call.extenstion,
    ...flowAgents.map((a) => a?.extension),
  ].filter(Boolean);

  const didCandidates = [
    answeredObj?.number,
    answeredObj?.id,
    missedObj?.number,
    missedObj?.id,
    call.answered_agent_number,
    call.missed_agent_number,
    call.destination_number,
    call.destinationNumber,
    call.routed_to,
    call.routedTo,
    call.forwarded_to,
    call.forwardedTo,
    call.transfer_to,
    call.transferTo,
    call.ring_to,
    call.ringTo,
    ...flowAgents.map((a) => a?.id),
    ...flowAgents.map((a) => a?.extension),
  ].filter(Boolean);

  let matched = null;
  for (const candidate of [
    ...mobileCandidates,
    ...extCandidates,
    ...didCandidates,
  ]) {
    matched = findAgentInDirectory(candidate, agentDirectory);
    if (matched) break;
  }

  const name = directName || matched?.name || null;
  const mobile = firstMobile([...mobileCandidates, matched?.mobile]);
  const ext = firstShortExt([...extCandidates, matched?.ext]);
  const did = didCandidates.map((x) => onlyDigits(x)).find(Boolean) || null;

  let label = null;
  if (name) {
    label = name;
  } else if (mobile) {
    label = mobile;
  } else if (matched?.name) {
    label = matched.name;
  } else if (ext || did) {
    label = "Unknown Agent";
  }

  return {
    name,
    label,
    number: mobile,
    ext,
    did,
    isResolved: !!name,
    isMissed,
    isMissedBy: isMissed && !!label,
  };
};

// ─── Call Chain / Routing ─────────────────────────────────────────────────────
const buildCallChain = (allCalls, currentCall) => {
  if (!currentCall) return [];

  const currentNum = cleanNum(
    currentCall.client_number ||
      currentCall.caller_id_number ||
      currentCall.call_to_number ||
      ""
  );
  const currentTs = safeTs(currentCall);

  if (!currentNum || !currentTs) return [];

  const windowMs = 5 * 60 * 1000;

  return [...allCalls]
    .filter((c) => {
      const cNum = cleanNum(
        c.client_number || c.caller_id_number || c.call_to_number || ""
      );
      const cTs = safeTs(c);

      return (
        cNum === currentNum &&
        cTs &&
        Math.abs(cTs - currentTs) < windowMs &&
        c.id !== currentCall.id
      );
    })
    .sort((a, b) => safeTs(a) - safeTs(b));
};

const getCallRouting = (allCalls, call, agentDirectory) => {
  const chain = buildCallChain(allCalls, call);
  if (chain.length === 0) return null;

  const fullChain = [...chain, call].sort((a, b) => safeTs(a) - safeTs(b));

  const missedAgents = fullChain
    .filter((c) =>
      ["missed", "no-answer", "no_answer", "failed", "busy"].includes(
        norm(c.call_status)
      )
    )
    .map((c) => {
      const info = resolveAgentInfo(c, agentDirectory);
      return {
        name: info.label || "Unknown Agent",
        ext: info.ext,
        number: info.number,
        time: safeTs(c),
      };
    })
    .filter((a) => a.name);

  const answeredCall = fullChain.find((c) =>
    ["answered", "completed", "connected"].includes(norm(c.call_status))
  );

  let answeredBy = null;
  if (answeredCall) {
    const info = resolveAgentInfo(answeredCall, agentDirectory);
    answeredBy = {
      name: info.label || "Unknown Agent",
      ext: info.ext,
      number: info.number,
      time: safeTs(answeredCall),
    };
  }

  if (missedAgents.length === 0 && !answeredBy) return null;

  return {
    missedAgents,
    answeredBy,
    totalAttempts: fullChain.length,
  };
};

// ─── API Helper ───────────────────────────────────────────────────────────────
const apiFetch = async (url, options = {}) => {
  try {
    const resp = await fetch(`${API}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    return resp;
  } catch (e) {
    console.error(`API Error [${url}]:`, e);
    throw e;
  }
};

const apiJson = async (url, options) => {
  const resp = await apiFetch(url, options);
  return resp.json();
};

// ─── Badge ────────────────────────────────────────────────────────────────────
const Badge = React.memo(({ status, direction, outcome }) => {
  if (direction) {
    const d = norm(direction);
    const isIn = d === "inbound";
    const isClickToCall = d === "clicktocall";

    return (
      <span
        className={`cl-badge ${
          isIn
            ? "cl-badge--inbound"
            : isClickToCall
            ? "cl-badge--outbound"
            : "cl-badge--outbound"
        }`}
      >
        {isIn ? "↙ Inbound" : isClickToCall ? "📲 ClickToCall" : "↗ Outbound"}
      </span>
    );
  }

  if (outcome) {
    const o = OUTCOMES.find((x) => x.v === outcome);
    if (!o) return null;
    return (
      <span
        className="cl-badge cl-badge--outcome"
        style={{
          color: o.color,
          background: `${o.color}12`,
          border: `1px solid ${o.color}30`,
        }}
      >
        {o.l}
      </span>
    );
  }

  const s = norm(status);
  const map = {
    answered: { cls: "cl-badge--success", label: "✓ Answered" },
    completed: { cls: "cl-badge--success", label: "✓ Completed" },
    connected: { cls: "cl-badge--success", label: "✓ Connected" },
    called: { cls: "cl-badge--success", label: "✓ Called" },
    missed: { cls: "cl-badge--danger", label: "✗ Missed" },
    "no-answer": { cls: "cl-badge--danger", label: "✗ No Answer" },
    no_answer: { cls: "cl-badge--danger", label: "✗ No Answer" },
    busy: { cls: "cl-badge--warning", label: "~ Busy" },
    initiated: { cls: "cl-badge--info", label: "→ Initiated" },
    failed: { cls: "cl-badge--danger", label: "! Failed" },
    ringing: { cls: "cl-badge--info", label: "🔔 Ringing" },
    in_progress: { cls: "cl-badge--live", label: "🟢 Live" },
  };

  const m = map[s] || { cls: "cl-badge--default", label: status || "—" };
  return <span className={`cl-badge ${m.cls}`}>{m.label}</span>;
});

// ─── AgentDisplay ─────────────────────────────────────────────────────────────
const AgentDisplay = React.memo(({ call, agentDirectory }) => {
  const info = useMemo(
    () => resolveAgentInfo(call, agentDirectory),
    [call, agentDirectory]
  );

  const isMissed = [
    "missed",
    "no-answer",
    "no_answer",
    "failed",
    "busy",
  ].includes(norm(call.call_status));

  if (!info.label) {
    return <span className="cl-agent cl-agent--none">—</span>;
  }

  let subText = null;
  if (info.name && info.ext) {
    subText = `Ext: ${info.ext}`;
  } else if (!info.name && info.ext) {
    subText = `Ext: ${info.ext}`;
  }

  if (isMissed) {
    return (
      <div className="cl-agent-wrap">
        <div className="cl-agent-missed">
          <span className="cl-agent-missed-icon">📵</span>
          <div className="cl-agent-missed-info">
            <span className="cl-agent-missed-label">Missed by</span>
            <span className="cl-agent-missed-name">{info.label}</span>
          </div>
        </div>
        {subText && <span className="cl-agent-num">{subText}</span>}
      </div>
    );
  }

  return (
    <div className="cl-agent-wrap">
      <span className="cl-agent cl-agent--answered">✓ {info.label}</span>
      {subText && <span className="cl-agent-num">{subText}</span>}
    </div>
  );
});

// ─── CallRoutingBadge ─────────────────────────────────────────────────────────
const CallRoutingBadge = React.memo(({ routing }) => {
  const [expanded, setExpanded] = useState(false);
  if (!routing) return null;

  return (
    <div className="cl-routing">
      <button
        className="cl-routing-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((p) => !p);
        }}
      >
        <span className="cl-routing-icon">🔀</span>
        <span className="cl-routing-label">
          Routed ({routing.totalAttempts} attempts)
        </span>
        <span
          className={`cl-routing-arrow ${
            expanded ? "cl-routing-arrow--open" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="cl-routing-chain">
          {routing.missedAgents.map((agent, idx) => (
            <div key={idx} className="cl-routing-step cl-routing-step--missed">
              <div className="cl-routing-line" />
              <div className="cl-routing-dot cl-routing-dot--missed" />
              <div className="cl-routing-step-content">
                <span className="cl-routing-agent-name">{agent.name}</span>
                {agent.ext ? (
                  <span className="cl-routing-agent-num">
                    Ext: {agent.ext}
                  </span>
                ) : agent.number ? (
                  <span className="cl-routing-agent-num">{agent.number}</span>
                ) : null}
                <span className="cl-routing-step-status">
                  ✗ Did not answer
                </span>
              </div>
            </div>
          ))}

          {routing.answeredBy ? (
            <div className="cl-routing-step cl-routing-step--answered">
              <div className="cl-routing-dot cl-routing-dot--answered" />
              <div className="cl-routing-step-content">
                <span className="cl-routing-agent-name">
                  {routing.answeredBy.name}
                </span>
                {routing.answeredBy.ext ? (
                  <span className="cl-routing-agent-num">
                    Ext: {routing.answeredBy.ext}
                  </span>
                ) : routing.answeredBy.number ? (
                  <span className="cl-routing-agent-num">
                    {routing.answeredBy.number}
                  </span>
                ) : null}
                <span className="cl-routing-step-status">
                  ✓ Answered the call
                </span>
              </div>
            </div>
          ) : (
            <div className="cl-routing-step cl-routing-step--none">
              <div className="cl-routing-dot cl-routing-dot--none" />
              <div className="cl-routing-step-content">
                <span className="cl-routing-step-status">
                  ✗ No one answered
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ─── LiveTimer ────────────────────────────────────────────────────────────────
const LiveTimer = ({ startedAt }) => {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const iv = setInterval(
      () => setSec(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(iv);
  }, [startedAt]);

  return <span className="cl-live-timer">{fmtSec(sec)}</span>;
};

// ─── RecordingPlayer ──────────────────────────────────────────────────────────
const RecordingPlayer = React.memo(({ call }) => {
  const [state, setState] = useState("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);

  const hasRec = !!(
    call.recording_url && String(call.recording_url).startsWith("http")
  );
  const isAnswered = ["answered", "completed", "connected", "called"].includes(
    norm(call.call_status || "")
  );
  const hasDur = Number(call.billsec) > 0;

  if (!hasRec) {
    if (isAnswered && hasDur) {
      return (
        <span className="cl-rec-processing">
          <span className="cl-proc-dot" /> Processing...
        </span>
      );
    }
    return <span className="cl-no-rec">—</span>;
  }

  const handlePlay = () => {
    if (!audioRef.current) return;

    if (state === "playing") {
      audioRef.current.pause();
      setState("paused");
      return;
    }

    if (state === "paused") {
      audioRef.current.play().catch(() => setState("error"));
      setState("playing");
      return;
    }

    setState("loading");
    audioRef.current.src = call.recording_url;
    audioRef.current.load();
    audioRef.current
      .play()
      .then(() => setState("playing"))
      .catch(() => setState("error"));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (state === "error") {
    return (
      <a href={call.recording_url} download className="cl-rec-dl">
        ⬇ Download
      </a>
    );
  }

  return (
    <div className="cl-player">
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => {
          setDuration(audioRef.current?.duration || 0);
          setState("playing");
        }}
        onEnded={() => {
          setState("idle");
          setCurrentTime(0);
        }}
        onError={() => setState("error")}
      />

      <button
        onClick={handlePlay}
        className={`cl-play-btn ${
          state === "playing" ? "cl-play-btn--pause" : ""
        }`}
      >
        {state === "loading" ? (
          <span className="cl-spinner" />
        ) : state === "playing" ? (
          "⏸"
        ) : (
          "▶"
        )}
      </button>

      <div
        className="cl-track"
        onClick={(e) => {
          if (!audioRef.current || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audioRef.current.currentTime =
            ((e.clientX - rect.left) / rect.width) * duration;
        }}
      >
        <div className="cl-progress" style={{ width: `${progress}%` }}>
          <span className="cl-thumb" />
        </div>
      </div>

      <span className="cl-time">
        {state === "idle"
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
        className="cl-vol"
        title="Volume"
      />

      <a
        href={call.recording_url}
        download={`rec-${call.id || call.uuid}.mp3`}
        className="cl-dl"
        onClick={(e) => e.stopPropagation()}
      >
        ⬇
      </a>
    </div>
  );
});

// ─── MiniHistory ──────────────────────────────────────────────────────────────
const MiniHistory = ({ number, agentDirectory, nameMap }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cleanedNum = cleanNum(number);
    const cached = getHistoryCache(cleanedNum);

    if (cached) {
      setCalls(cached);
      setLoading(false);
      return;
    }

    apiJson(`/customer-history/${cleanedNum}`)
      .then((d) => {
        setCalls(d);
        setLoading(false);
        setHistoryCache(cleanedNum, d);
      })
      .catch((e) => {
        console.error("MiniHistory fetch error:", e);
        setLoading(false);
      });
  }, [number]);

  if (loading) {
    return (
      <div className="cl-empty">
        <span className="cl-spinner cl-spinner--dark" /> Loading history...
      </div>
    );
  }

  if (!calls.length)
    return <div className="cl-empty">No previous calls found</div>;

  return (
    <div className="cl-mini-history">
      <p className="cl-mini-history-title">
        Last {calls.length} calls with this customer
      </p>

      {calls.slice(0, 8).map((c, i) => {
        const { date, time } = fmtTime(c);
        const isMissed = norm(c.call_status).includes("miss");
        const agentInfo = resolveAgentInfo(c, agentDirectory);
        // Apply name map for display
        const displayName = resolveDisplayName(c) || c.name;

        return (
          <div
            key={c.id || c.uuid || i}
            className={`cl-hist-item cl-hist-item--dark ${
              isMissed ? "cl-hist-item--missed-dark" : ""
            }`}
          >
            <div className="cl-hist-icon">{isMissed ? "📵" : "📞"}</div>

            <div className="cl-hist-content">
              <div className="cl-hist-badges">
                <Badge direction={c.direction} />
                <Badge status={c.call_status} />
                <span className="cl-mono">{fmtDur(c.billsec)}</span>
              </div>

              {displayName && (
                <div className="cl-hist-agent" style={{ color: "#94a3b8" }}>
                  Customer: <strong>{displayName}</strong>
                </div>
              )}

              <div className="cl-hist-agent" style={{ color: "#94a3b8" }}>
                Agent: <strong>{agentInfo.label || "—"}</strong>
                {agentInfo.ext ? ` (Ext: ${agentInfo.ext})` : ""}
              </div>
            </div>

            <div className="cl-hist-time">
              <div className="cl-hist-date" style={{ color: "#e2e8f0" }}>
                {date}
              </div>
              <div className="cl-mono cl-xs">{time}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── LiveCallModal ────────────────────────────────────────────────────────────
const LiveCallModal = ({
  call,
  startedAt,
  onEnd,
  onClose,
  agentDirectory,
  nameMap,
}) => {
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tab, setTab] = useState("controls");

  const liveAgent = useMemo(
    () => resolveAgentInfo(call, agentDirectory),
    [call, agentDirectory]
  );

  const num =
    norm(call.direction) === "inbound"
      ? call.client_number ||
        call.caller_id_number ||
        call.call_to_number ||
        ""
      : call.call_to_number || call.client_number || "";

  // Use nameMap resolved name
  const displayName = resolveDisplayName(call) || call.name;

  const saveQuickNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);

    try {
      await apiJson("/remarks", {
        method: "POST",
        body: JSON.stringify({
          callId: call.id || call.uuid,
          remark: outcome
            ? `[${outcome.toUpperCase()}] ${note.trim()}`
            : note.trim(),
          outcome,
        }),
      });
    } catch (e) {
      console.error("Save note failed:", e);
    }

    setSavingNote(false);
  };

  return (
    <div
      className="cl-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cl-live-modal">
        <div className="cl-live-modal-header">
          <div className="cl-live-pulse-wrap">
            <span className="cl-live-pulse-ring" />
            <span className="cl-live-pulse-dot" />
          </div>

          <div className="cl-live-modal-info">
            <h3 className="cl-live-modal-name">{displayName || num}</h3>
            <p className="cl-live-modal-num">{num}</p>
            <p className="cl-live-modal-agent">
              Agent:{" "}
              <strong>
                {liveAgent.label || "—"}
                {liveAgent.ext ? ` (Ext: ${liveAgent.ext})` : ""}
              </strong>
            </p>
          </div>

          <div className="cl-live-timer-big">
            <LiveTimer startedAt={startedAt} />
            <span className="cl-live-label">LIVE</span>
          </div>

          <button
            className="cl-modal-close cl-modal-close--dark"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="cl-live-tabs">
          {["controls", "notes", "history"].map((t) => (
            <button
              key={t}
              className={`cl-live-tab ${tab === t ? "cl-live-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "controls"
                ? "🎛 Controls"
                : t === "notes"
                ? "📝 Notes"
                : "📋 History"}
            </button>
          ))}
        </div>

        {tab === "controls" && (
          <div className="cl-live-body">
            <div className="cl-live-controls">
              <button
                className={`cl-live-ctrl-btn ${
                  muted ? "cl-live-ctrl-btn--active" : ""
                }`}
                onClick={() => setMuted((m) => !m)}
              >
                <span className="cl-live-ctrl-icon">{muted ? "🔇" : "🎙"}</span>
                <span>{muted ? "Unmute" : "Mute"}</span>
              </button>

              <button
                className={`cl-live-ctrl-btn ${
                  held ? "cl-live-ctrl-btn--active" : ""
                }`}
                onClick={() => setHeld((h) => !h)}
              >
                <span className="cl-live-ctrl-icon">{held ? "▶" : "⏸"}</span>
                <span>{held ? "Resume" : "Hold"}</span>
              </button>

              <button className="cl-live-ctrl-btn">
                <span className="cl-live-ctrl-icon">🔀</span>
                <span>Transfer</span>
              </button>
              <button className="cl-live-ctrl-btn">
                <span className="cl-live-ctrl-icon">📲</span>
                <span>Keypad</span>
              </button>
              <button className="cl-live-ctrl-btn">
                <span className="cl-live-ctrl-icon">👥</span>
                <span>Conference</span>
              </button>
              <button className="cl-live-ctrl-btn">
                <span className="cl-live-ctrl-icon">🔊</span>
                <span>Speaker</span>
              </button>
            </div>

            <div className="cl-live-outcome-row">
              <label className="cl-label cl-label--dark">Quick Outcome</label>
              <div className="cl-outcome-chips">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.v}
                    className={`cl-outcome-chip ${
                      outcome === o.v ? "cl-outcome-chip--active" : ""
                    }`}
                    style={
                      outcome === o.v
                        ? {
                            background: o.color,
                            color: "#fff",
                            borderColor: o.color,
                          }
                        : { borderColor: `${o.color}60`, color: o.color }
                    }
                    onClick={() => setOutcome(outcome === o.v ? "" : o.v)}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <button className="cl-btn-end-call" onClick={onEnd}>
              <span className="cl-end-icon">📵</span> End Call
            </button>
          </div>
        )}

        {tab === "notes" && (
          <div className="cl-live-body">
            <div className="cl-form-group">
              <label className="cl-label cl-label--dark">Outcome</label>
              <select
                className="cl-input cl-input--dark cl-select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Select...</option>
                {OUTCOMES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>

            <div className="cl-form-group">
              <label className="cl-label cl-label--dark">Quick Notes</label>
              <textarea
                className="cl-input cl-input--dark cl-textarea"
                placeholder="Type notes during the call..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
              />
            </div>

            <div className="cl-modal-actions">
              <button
                className="cl-btn cl-btn--primary"
                onClick={saveQuickNote}
                disabled={savingNote || !note.trim()}
              >
                {savingNote ? (
                  <>
                    <span className="cl-spinner" /> Saving...
                  </>
                ) : (
                  "💾 Save Note"
                )}
              </button>

              <button className="cl-btn-end-call" onClick={onEnd}>
                📵 End Call
              </button>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="cl-live-body">
            <MiniHistory
              number={num}
              agentDirectory={agentDirectory}
              nameMap={nameMap}
            />
            <button
              className="cl-btn-end-call"
              style={{ marginTop: 16 }}
              onClick={onEnd}
            >
              📵 End Call
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── RemarkModal ──────────────────────────────────────────────────────────────
const RemarkModal = ({ data, onClose, onSave }) => {
  const [remark, setRemark] = useState(data?.existingRemark || "");
  const [outcome, setOutcome] = useState(data?.outcome || "");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef();

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 80);
  }, []);

  const submit = async () => {
    if (!remark.trim()) return;
    setSaving(true);

    const text = outcome
      ? `[${outcome.toUpperCase()}] ${remark.trim()}`
      : remark.trim();

    try {
      await apiJson("/remarks", {
        method: "POST",
        body: JSON.stringify({
          callId: data.callId,
          remark: text,
          followUpDate: followUp || null,
          outcome,
        }),
      });
      onSave(data.callId, text, outcome, followUp);
    } catch (e) {
      console.error("Save remark failed:", e);
    }

    setSaving(false);
    onClose();
  };

  return (
    <div
      className="cl-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cl-modal">
        <div className="cl-modal-header">
          <div className="cl-modal-icon">📝</div>
          <div>
            <h3 className="cl-modal-title">Add Remark</h3>
            <p className="cl-modal-sub">{data.name || data.number}</p>
          </div>
          <button className="cl-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cl-modal-body">
          <div className="cl-form-row">
            <div className="cl-form-group">
              <label className="cl-label">Outcome</label>
              <select
                className="cl-input cl-select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Select...</option>
                {OUTCOMES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>

            <div className="cl-form-group">
              <label className="cl-label">Follow-up Date</label>
              <input
                className="cl-input"
                type="datetime-local"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
          </div>

          <div className="cl-form-group">
            <label className="cl-label">Notes</label>
            <textarea
              ref={ref}
              className="cl-input cl-textarea"
              placeholder="Enter notes..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === "Enter" && submit()}
              rows={4}
            />
            <span className="cl-hint">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save
            </span>
          </div>

          <div className="cl-modal-actions">
            <button className="cl-btn cl-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="cl-btn cl-btn--primary"
              onClick={submit}
              disabled={saving || !remark.trim()}
            >
              {saving ? (
                <>
                  <span className="cl-spinner" /> Saving...
                </>
              ) : (
                "💾 Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── HistoryModal ─────────────────────────────────────────────────────────────
const HistoryModal = ({ number, name, onClose, agentDirectory, nameMap }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  // Resolve best name: prefer nameMap, then passed name
  const displayName = lookupName(number) || name;

  useEffect(() => {
    const cleanedNum = cleanNum(number);
    const cached = getHistoryCache(cleanedNum);

    if (cached) {
      setCalls(cached);
      setLoading(false);
      return;
    }

    apiJson(`/customer-history/${cleanedNum}`)
      .then((d) => {
        setCalls(d);
        setLoading(false);
        setHistoryCache(cleanedNum, d);
      })
      .catch((e) => {
        console.error("History fetch error:", e);
        setLoading(false);
      });
  }, [number]);

  const total = calls.length;
  const answered = calls.filter((c) =>
    ["answered", "completed", "connected"].includes(norm(c.call_status))
  ).length;
  const totalDur = calls.reduce((s, c) => s + (Number(c.billsec) || 0), 0);

  return (
    <div
      className="cl-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cl-modal cl-modal--lg">
        <div className="cl-modal-header">
          <div className="cl-modal-icon">📋</div>
          <div>
            <h3 className="cl-modal-title">{displayName || number}</h3>
            <p className="cl-modal-sub">
              {total} calls · {answered} answered · {fmtDur(totalDur)} total
            </p>
          </div>
          <button className="cl-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cl-modal-body cl-modal-body--scroll">
          <div className="cl-hist-stats">
            {[
              { l: "Total", v: total, c: "" },
              { l: "Answered", v: answered, c: "success" },
              { l: "Missed", v: total - answered, c: "danger" },
              { l: "Duration", v: fmtDur(totalDur), c: "info" },
            ].map((s, i) => (
              <div key={i} className={`cl-hist-stat cl-hist-stat--${s.c}`}>
                <span className="cl-hist-stat-val">{s.v}</span>
                <span className="cl-hist-stat-label">{s.l}</span>
              </div>
            ))}
          </div>

          {loading && (
            <div className="cl-empty">
              <span className="cl-spinner" /> Loading...
            </div>
          )}

          {!loading && !calls.length && (
            <div className="cl-empty">No history found</div>
          )}

          {calls.map((c, i) => {
            const { date, time } = fmtTime(c);
            const isMissed = norm(c.call_status).includes("miss");
            const agentInfo = resolveAgentInfo(c, agentDirectory);
            // Show resolved name for each history entry too
            const entryName = resolveDisplayName(c) || displayName;

            return (
              <div
                key={c.id || c.uuid || i}
                className={`cl-hist-item ${
                  isMissed ? "cl-hist-item--missed" : ""
                }`}
              >
                <div className="cl-hist-icon">{isMissed ? "📵" : "📞"}</div>

                <div className="cl-hist-content">
                  <div className="cl-hist-badges">
                    <Badge direction={c.direction} />
                    <Badge status={c.call_status} />
                    <span className="cl-mono">{fmtDur(c.billsec)}</span>
                  </div>

                  {entryName && (
                    <div className="cl-hist-agent">
                      Customer: <strong>{entryName}</strong>
                    </div>
                  )}

                  <div className="cl-hist-agent">
                    Agent: <strong>{agentInfo.label || "—"}</strong>
                    {agentInfo.ext ? ` (Ext: ${agentInfo.ext})` : ""}
                  </div>

                  {c.recording_url?.startsWith("http") && (
                    <div style={{ marginTop: 6 }}>
                      <RecordingPlayer call={c} />
                    </div>
                  )}
                </div>

                <div className="cl-hist-time">
                  <div className="cl-hist-date">{date}</div>
                  <div className="cl-mono cl-xs">{time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── DeleteModal ──────────────────────────────────────────────────────────────
const DeleteModal = ({ data, onClose, onConfirm }) => (
  <div
    className="cl-overlay"
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className="cl-modal cl-modal--sm cl-modal--delete">
      <div className="cl-delete-icon">🗑️</div>
      <h3 className="cl-modal-title">Delete Record?</h3>
      <p className="cl-modal-sub" style={{ textAlign: "center" }}>
        This will permanently delete the record for{" "}
        <strong>{data.name || data.number}</strong>.
      </p>
      <div className="cl-modal-actions" style={{ justifyContent: "center" }}>
        <button className="cl-btn cl-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="cl-btn cl-btn--danger"
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

// ─── EditNameModal ────────────────────────────────────────────────────────────
const EditNameModal = ({ data, onClose, onSave }) => {
  const [name, setName] = useState(data.name || "");
  const [applyToAll, setApplyToAll] = useState(true);

  return (
    <div
      className="cl-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cl-modal cl-modal--sm">
        <div className="cl-modal-header">
          <div className="cl-modal-icon">✏️</div>
          <div>
            <h3 className="cl-modal-title">Edit Name</h3>
            <p className="cl-modal-sub">{data.number}</p>
          </div>
          <button className="cl-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cl-modal-body">
          <div className="cl-form-group">
            <label className="cl-label">Customer Name</label>
            <input
              className="cl-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) =>
                e.key === "Enter" &&
                name.trim() &&
                (onSave(data.id, name.trim(), data.number, applyToAll),
                onClose())
              }
              placeholder="Enter name"
            />
          </div>

          {/* Apply to all numbers toggle */}
          <div className="cl-form-group">
            <label className="cl-apply-all-label">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="cl-apply-all-check"
              />
              <span>Apply name to all calls from this number</span>
              <span className="cl-apply-all-hint">
                ({data.number} and matching numbers)
              </span>
            </label>
          </div>

          <div className="cl-modal-actions">
            <button className="cl-btn cl-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="cl-btn cl-btn--primary"
              onClick={() => {
                if (name.trim()) {
                  onSave(data.id, name.trim(), data.number, applyToAll);
                  onClose();
                }
              }}
            >
              💾 Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ExportModal ──────────────────────────────────────────────────────────────
const ExportModal = ({ agents, onClose }) => {
  const [exDir, setExDir] = useState("all");
  const [exStatus, setExStatus] = useState("all");
  const [exAgent, setExAgent] = useState("all");
  const [exFrom, setExFrom] = useState("");
  const [exTo, setExTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  const agentNames = useMemo(() => {
    const set = new Set();
    agents.forEach((a) => {
      const n = getAgentNameFromMaster(a);
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [agents]);

  const handleDownload = async () => {
    setDownloading(true);

    try {
      const params = new URLSearchParams();
      if (exDir !== "all") params.set("direction", exDir);
      if (exStatus !== "all") params.set("status", exStatus);
      if (exAgent !== "all") params.set("agent", exAgent);
      if (exFrom) params.set("dateFrom", exFrom);
      if (exTo) params.set("dateTo", exTo);

      const resp = await apiFetch(`/export-excel?${params}`);
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
      console.error("Export failed:", e);
      alert("Export failed: " + e.message);
    }

    setDownloading(false);
  };

  return (
    <div
      className="cl-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cl-modal">
        <div className="cl-modal-header">
          <div className="cl-modal-icon">📥</div>
          <div>
            <h3 className="cl-modal-title">Export to Excel</h3>
            <p className="cl-modal-sub">Download filtered call logs</p>
          </div>
          <button className="cl-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cl-modal-body">
          <div className="cl-form-row">
            <div className="cl-form-group">
              <label className="cl-label">Direction</label>
              <select
                className="cl-input cl-select"
                value={exDir}
                onChange={(e) => setExDir(e.target.value)}
              >
                <option value="all">All</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="clicktocall">ClickToCall</option>
              </select>
            </div>

            <div className="cl-form-group">
              <label className="cl-label">Status</label>
              <select
                className="cl-input cl-select"
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

            <div className="cl-form-group">
              <label className="cl-label">Agent</label>
              <select
                className="cl-input cl-select"
                value={exAgent}
                onChange={(e) => setExAgent(e.target.value)}
              >
                <option value="all">All Agents</option>
                {agentNames.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="cl-form-group">
              <label className="cl-label">From Date</label>
              <input
                className="cl-input"
                type="date"
                value={exFrom}
                onChange={(e) => setExFrom(e.target.value)}
              />
            </div>

            <div className="cl-form-group">
              <label className="cl-label">To Date</label>
              <input
                className="cl-input"
                type="date"
                value={exTo}
                onChange={(e) => setExTo(e.target.value)}
              />
            </div>
          </div>

          <div className="cl-modal-actions">
            <button className="cl-btn cl-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="cl-btn cl-btn--primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="cl-spinner" /> Downloading...
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

// ─── CallRow ──────────────────────────────────────────────────────────────────
const CallRow = React.memo(
  ({
    c,
    allCalls,
    agentDirectory,
    activeCall,
    callingRows,
    onCall,
    onRemark,
    onHistory,
    onDelete,
    onEditName,
    onOpenLive,
    nameMap, // receive nameMap for reactivity
  }) => {
    const dir = norm(c.direction);

    const num =
      dir === "inbound"
        ? c.client_number || c.caller_id_number || c.call_to_number || "—"
        : c.call_to_number || c.client_number || "—";

    const key = c.id || c.uuid || num;
    const isActive = activeCall?.key === key;
    const isCalling = callingRows[key];

    const isMissed =
      norm(c.call_status).includes("miss") ||
      norm(c.call_status).includes("fail") ||
      norm(c.call_status) === "no-answer" ||
      norm(c.call_status) === "no_answer" ||
      norm(c.call_status) === "busy";

    const isInbound = dir === "inbound";
    const { date, time } = fmtTime(c);

    // Resolve display name from nameMap first, then fall back to c.name
    // nameMap is passed so React re-renders when it changes
    const displayName = useMemo(() => {
      // nameMap dependency ensures re-render when names change
      return resolveDisplayName(c) || null;
    }, [c, nameMap]);

    const routing = useMemo(
      () => getCallRouting(allCalls, c, agentDirectory),
      [allCalls, c, agentDirectory]
    );

    return (
      <tr
        className={`cl-row ${isActive ? "cl-row--active" : ""} ${
          isMissed ? "cl-row--missed" : ""
        }`}
      >
        <td className="cl-td">
          <div className="cl-customer">
            <div
              className={`cl-avatar ${
                isMissed
                  ? "cl-avatar--missed"
                  : isInbound
                  ? "cl-avatar--in"
                  : "cl-avatar--out"
              }`}
            >
              {isMissed ? "📵" : isInbound ? "↙" : "↗"}
            </div>

            <div className="cl-customer-info">
              <button
                onClick={() =>
                  onHistory({ number: num, name: displayName || c.name })
                }
                className="cl-name-link"
              >
                {displayName || c.name || num}
              </button>
              {(displayName || c.name) && (
                <div className="cl-mono cl-xs">{num}</div>
              )}
            </div>

            <button
              onClick={() =>
                onEditName({
                  id: c.id,
                  number: num,
                  name: displayName || c.name,
                })
              }
              className="cl-edit-btn"
              title="Edit name"
            >
              ✎
            </button>
          </div>
        </td>

        <td className="cl-td">
          <Badge direction={c.direction} />
        </td>

        <td className="cl-td">
          <div className="cl-datetime">
            <span className="cl-date">{date}</span>
            <span className="cl-mono cl-xs">{time}</span>
          </div>
        </td>

        <td className="cl-td">
          <div className="cl-status-cell">
            <Badge status={c.call_status} />
            {c._remark && (
              <div className="cl-remark-tag">
                📝 {c._remark.slice(0, 30)}
                {c._remark.length > 30 ? "..." : ""}
              </div>
            )}
            {c._outcome && <Badge outcome={c._outcome} />}
            <CallRoutingBadge routing={routing} />
          </div>
        </td>

        <td className="cl-td">
          <AgentDisplay call={c} agentDirectory={agentDirectory} />
        </td>

        <td className="cl-td">
          <span className="cl-duration">{fmtDur(c.billsec)}</span>
        </td>

        <td className="cl-td">
          <RecordingPlayer call={c} />
        </td>

        <td className="cl-td">
          <div className="cl-actions">
            {isActive ? (
              <button
                onClick={() =>
                  onOpenLive({ call: c, startedAt: activeCall.startedAt })
                }
                className="cl-btn-end"
              >
                <span className="cl-end-pulse" />
                🟢 Live · <LiveTimer startedAt={activeCall.startedAt} />
              </button>
            ) : (
              <button
                onClick={() => onCall(c)}
                disabled={isCalling || !!activeCall}
                className={`cl-btn-call ${
                  isCalling ? "cl-btn-call--busy" : ""
                }`}
                title={
                  activeCall && !isActive
                    ? "Another call is active"
                    : "Call this customer"
                }
              >
                {isCalling ? (
                  <>
                    <span className="cl-spinner" /> Calling...
                  </>
                ) : (
                  "📞 Call"
                )}
              </button>
            )}

            <button
              onClick={() =>
                onRemark({
                  callId: c.id || c.uuid,
                  number: num,
                  name: displayName || c.name,
                  existingRemark: c._remark,
                  outcome: c._outcome,
                })
              }
              className="cl-icon-btn cl-icon-btn--remark"
              title="Add remark"
            >
              📝
            </button>

            <button
              onClick={() =>
                onHistory({ number: num, name: displayName || c.name })
              }
              className="cl-icon-btn cl-icon-btn--history"
              title="View history"
            >
              📋
            </button>

            <button
              onClick={() =>
                onDelete({
                  id: c.id,
                  number: num,
                  name: displayName || c.name,
                })
              }
              className="cl-icon-btn cl-icon-btn--delete"
              title="Delete"
            >
              🗑
            </button>
          </div>
        </td>
      </tr>
    );
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function CallLogs({ selectedAgent, agents = [], onCallMade }) {
  const [allCalls, setAllCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [serverPage, setServerPage] = useState(1);
  const [totalServerPages, setTotalServerPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [displayPage, setDisplayPage] = useState(1);
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, SEARCH_DEBOUNCE);
  const [fDir, setFDir] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [fDate, setFDate] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState(-1);
  const [activeCall, setActiveCall] = useState(null);
  const [callingRows, setCallingRows] = useState({});
  const [remarkModal, setRemarkModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [editNameModal, setEditNameModal] = useState(null);
  const [exportModal, setExportModal] = useState(false);
  const [liveCallModal, setLiveCallModal] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: "", ok: true });

  // ── nameMap state: triggers re-render of all rows when a name is saved ──
  // We store it as a state so React knows to re-render
  const [nameMap, setNameMap] = useState(() => getNameMap());

  const toastT = useRef();
  const hasFetched = useRef(false);
  const autoRefreshRef = useRef(null);

  const agentDirectory = useMemo(() => buildAgentDirectory(agents), [agents]);

  const showToast = useCallback((msg, ok = true) => {
    setToast({ show: true, msg, ok });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(
      () => setToast((t) => ({ ...t, show: false })),
      3500
    );
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchCalls = useCallback(
    async (forceRefresh = false, pageNum = 1) => {
      if (!forceRefresh && pageNum === 1) {
        const cached = getCache();
        if (cached) {
          setAllCalls(cached.calls);
          setTotalServerPages(cached.totalPages || 1);
          setTotalRecords(cached.totalRecords || cached.calls.length);
          setServerPage(1);
          setCacheInfo({ ts: cached.ts, fromCache: true });
          return;
        }
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(PAGE_SIZE),
        });

        const data = await apiJson(`/call-logs?${params}`);

        let calls;
        let totalPages;
        let totalRecs;

        if (Array.isArray(data)) {
          calls = data;
          totalPages = 1;
          totalRecs = data.length;
        } else {
          calls = data.calls || data.data || [];
          totalPages =
            data.totalPages ||
            Math.ceil((data.total || calls.length) / PAGE_SIZE);
          totalRecs = data.total || calls.length;
        }

        if (pageNum === 1) {
          setAllCalls(calls);
          setCache(calls, {
            totalPages,
            totalRecords: totalRecs,
            currentPage: 1,
          });
        } else {
          setAllCalls(calls);
        }

        setTotalServerPages(totalPages);
        setTotalRecords(totalRecs);
        setServerPage(pageNum);
        setCacheInfo({ ts: Date.now(), fromCache: false });

        if (forceRefresh) showToast("✅ Data refreshed");
      } catch (e) {
        console.error("Fetch calls error:", e);
        showToast("Failed to load calls", false);
      }

      setLoading(false);
    },
    [showToast]
  );

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchCalls(false, 1);
  }, [fetchCalls]);

  // Auto refresh
  useEffect(() => {
    const doAutoRefresh = () => {
      if (document.hidden) return;
      if (activeCall) return;
      const cached = getCache();
      if (cached && Date.now() - cached.ts < CACHE_TTL) return;
      fetchCalls(false, serverPage);
    };

    autoRefreshRef.current = setInterval(doAutoRefresh, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(autoRefreshRef.current);
  }, [fetchCalls, activeCall, serverPage]);

  const handleServerPageChange = useCallback(
    (newPage) => {
      if (
        newPage < 1 ||
        newPage > totalServerPages ||
        newPage === serverPage
      ) {
        return;
      }

      fetchCalls(true, newPage);
      setDisplayPage(1);
    },
    [fetchCalls, totalServerPages, serverPage]
  );

  // ── Filter + Sort ────────────────────────────────────────────────────────
  const filteredCalls = useMemo(() => {
    let r = allCalls;

    if (search) {
      const q = search.toLowerCase();
      r = r.filter((c) => {
        const info = resolveAgentInfo(c, agentDirectory);
        // Also search by resolved name from nameMap
        const resolvedName = resolveDisplayName(c) || "";
        return [
          c.call_to_number,
          c.caller_id_number,
          c.client_number,
          c.name,
          resolvedName,
          c.answered_agent_name,
          c.agent_name,
          c.answered_agent?.name,
          info.name,
          info.label,
          info.number,
          info.ext,
          c.id,
          c.uuid,
        ].some((v) => v && String(v).toLowerCase().includes(q));
      });
    }

    if (fDir) r = r.filter((c) => norm(c.direction) === norm(fDir));
    if (fStatus) r = r.filter((c) => norm(c.call_status) === norm(fStatus));

    if (fAgent) {
      r = r.filter((c) => {
        const info = resolveAgentInfo(c, agentDirectory);
        return (
          info.name === fAgent ||
          c.answered_agent_name === fAgent ||
          c.answered_agent?.name === fAgent
        );
      });
    }

    if (fDate) {
      r = r.filter((c) => {
        const ts = safeTs(c);
        return ts && new Date(ts).toISOString().slice(0, 10) === fDate;
      });
    }

    return [...r].sort((a, b) => {
      let va =
        sortKey === "createdAt"
          ? safeTs(a)
          : sortKey === "billsec"
          ? Number(a[sortKey] || 0)
          : a[sortKey] ?? "";

      let vb =
        sortKey === "createdAt"
          ? safeTs(b)
          : sortKey === "billsec"
          ? Number(b[sortKey] || 0)
          : b[sortKey] ?? "";

      if (va < vb) return -sortDir;
      if (va > vb) return sortDir;
      return 0;
    });
  }, [
    allCalls,
    search,
    fDir,
    fStatus,
    fAgent,
    fDate,
    sortKey,
    sortDir,
    agentDirectory,
    nameMap, // re-filter when names change
  ]);

  useEffect(() => {
    setDisplayPage(1);
  }, [search, fDir, fStatus, fAgent, fDate, sortKey, sortDir]);

  const stats = useMemo(() => {
    const answered = filteredCalls.filter((c) =>
      ["answered", "completed", "connected"].includes(norm(c.call_status))
    ).length;

    const missed = filteredCalls.filter((c) =>
      ["missed", "no_answer", "no-answer", "failed"].includes(
        norm(c.call_status)
      )
    ).length;

    const totalDuration = filteredCalls.reduce(
      (s, c) => s + (Number(c.billsec) || 0),
      0
    );

    return { answered, missed, totalDuration };
  }, [filteredCalls]);

  const uniqueAgents = useMemo(() => {
    const names = new Set();

    agents.forEach((a) => {
      const n = getAgentNameFromMaster(a);
      if (n) names.add(n);
    });

    allCalls.forEach((c) => {
      const info = resolveAgentInfo(c, agentDirectory);
      if (info.name) names.add(info.name);

      if (c.answered_agent_name && isTextName(c.answered_agent_name)) {
        names.add(c.answered_agent_name);
      }

      if (c.answered_agent?.name && isTextName(c.answered_agent.name)) {
        names.add(c.answered_agent.name);
      }
    });

    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allCalls, agents, agentDirectory]);

  const displayPaged = useMemo(
    () =>
      filteredCalls.slice(
        (displayPage - 1) * DISPLAY_SIZE,
        displayPage * DISPLAY_SIZE
      ),
    [filteredCalls, displayPage]
  );

  const displayPages = Math.ceil(filteredCalls.length / DISPLAY_SIZE);

  const handleSort = useCallback((k) => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => d * -1);
        return prev;
      }
      setSortDir(-1);
      return k;
    });
  }, []);

  const updateLocalAndCache = useCallback((updater) => {
    setAllCalls((prev) => {
      const updated = updater(prev);
      const cached = getCache();
      if (cached) {
        setCache(updated, {
          totalPages: cached.totalPages,
          totalRecords: cached.totalRecords,
          currentPage: cached.currentPage,
        });
      }
      return updated;
    });
  }, []);

  const handleCall = useCallback(
    async (c) => {
      if (!selectedAgent) {
        showToast("Select an agent first", false);
        return;
      }

      const dir = norm(c.direction);
      const num =
        dir === "inbound"
          ? (c.client_number || c.caller_id_number || c.call_to_number || "")
              .replace(/^\+91/, "")
              .trim()
          : (c.call_to_number || c.client_number || "")
              .replace(/^\+91/, "")
              .trim();

      const key = c.id || c.uuid || num;
      setCallingRows((p) => ({ ...p, [key]: true }));

      try {
        const d = await apiJson("/call", {
          method: "POST",
          body: JSON.stringify({
            customer: num,
            agentId: selectedAgent,
            name: c.name || "",
            leadId: c.id || c.uuid || "",
          }),
        });

        if (d.success) {
          showToast(`📞 Calling ${c.name || num}...`);
          const startedAt = Date.now();
          setActiveCall({
            key,
            number: num,
            name: c.name || "",
            startedAt,
          });
          setLiveCallModal({ call: c, startedAt });
          onCallMade?.({ ...c, calledAt: startedAt, agentId: selectedAgent });
        } else {
          showToast(d.error || "Call failed", false);
          setCallingRows((p) => {
            const n = { ...p };
            delete n[key];
            return n;
          });
        }
      } catch (e) {
        console.error("Call failed:", e);
        showToast("Network error", false);
        setCallingRows((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
      }
    },
    [selectedAgent, showToast, onCallMade]
  );

  const handleEnd = useCallback(
    (c) => {
      const num =
        c?.call_to_number || c?.caller_id_number || activeCall?.number || "";
      const key = c?.id || c?.uuid || num;

      setActiveCall(null);
      setLiveCallModal(null);
      setCallingRows((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      showToast("Call ended");
      invalidateCache();
    },
    [activeCall, showToast]
  );

  const handleDelete = useCallback(
    async (id) => {
      try {
        await apiFetch(`/call-logs/${id}`, { method: "DELETE" });
      } catch (e) {
        console.error("Delete failed:", e);
      }

      updateLocalAndCache((prev) => prev.filter((c) => c.id !== id));
      invalidateCache();
      showToast("Record deleted");
    },
    [showToast, updateLocalAndCache]
  );

  /**
   * handleEditName
   * - Updates the specific call record's name (single record patch)
   * - If applyToAll=true, also saves to nameMap so ALL calls from
   *   that number show the same name without extra Firebase reads
   */
  const handleEditName = useCallback(
    (id, name, number, applyToAll = true) => {
      // 1. Always update the specific call record locally + DB
      updateLocalAndCache((prev) =>
        prev.map((c) => {
          if (c.id === id) return { ...c, name };
          // If applyToAll, also update matching numbers in memory
          if (applyToAll) {
            const callNums = extractCallNumbers(c);
            const targetNum = cleanNum(number);
            if (targetNum && callNums.includes(targetNum)) {
              return { ...c, name };
            }
          }
          return c;
        })
      );

      // 2. Save to nameMap in localStorage for cross-page persistence
      if (applyToAll && number) {
        updateNameMap(number, name);
        // Sync React state so all rows re-render
        setNameMap(getNameMap());
        // Invalidate history cache for this number so history modal refreshes
        invalidateHistoryCache(number);
      }

      // 3. Single DB write: patch only the clicked record
      apiFetch(`/call-logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }).catch((e) => console.error("Edit name failed:", e));

      showToast(
        applyToAll
          ? `✅ Name saved for all calls from ${number}`
          : "✅ Name updated"
      );
    },
    [showToast, updateLocalAndCache]
  );

  const handleRemarkSave = useCallback(
    (callId, text, outcome) => {
      showToast("✅ Remark saved!");
      updateLocalAndCache((prev) =>
        prev.map((c) =>
          c.id === callId || c.uuid === callId
            ? { ...c, _remark: text, _outcome: outcome }
            : c
        )
      );
    },
    [showToast, updateLocalAndCache]
  );

  const handleOpenLive = useCallback(
    (payload) => setLiveCallModal(payload),
    []
  );
  const handleOpenRemark = useCallback((data) => setRemarkModal(data), []);
  const handleOpenHistory = useCallback((data) => setHistoryModal(data), []);
  const handleOpenDelete = useCallback((data) => setDeleteModal(data), []);
  const handleOpenEditName = useCallback((data) => setEditNameModal(data), []);

  const TH = useCallback(
    ({ k, children }) => (
      <th
        onClick={() => handleSort(k)}
        className={`cl-th ${sortKey === k ? "cl-th--sorted" : ""}`}
      >
        {children}{" "}
        {sortKey === k && <span>{sortDir === 1 ? "↑" : "↓"}</span>}
      </th>
    ),
    [handleSort, sortKey, sortDir]
  );

  const cacheAgeStr = useMemo(() => {
    if (!cacheInfo) return "";
    const ageMins = Math.floor((Date.now() - cacheInfo.ts) / 60000);
    if (ageMins < 1) return "Just now";
    return `${ageMins}m ago`;
  }, [cacheInfo]);

  return (
    <div className="cl-root">
      {toast.show && (
        <div
          className={`cl-toast ${toast.ok ? "cl-toast--ok" : "cl-toast--err"}`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <h2 className="cl-title">
            <span className="cl-title-icon">📞</span> Call Logs
          </h2>

          <div className="cl-summary-badges">
            <span className="cl-sum-badge cl-sum-badge--total">
              Total: {filteredCalls.length}
              {totalRecords > filteredCalls.length && ` / ${totalRecords}`}
            </span>
            <span className="cl-sum-badge cl-sum-badge--success">
              ✓ {stats.answered}
            </span>
            <span className="cl-sum-badge cl-sum-badge--danger">
              ✗ {stats.missed}
            </span>
            <span className="cl-sum-badge cl-sum-badge--info">
              ⏱ {fmtDur(stats.totalDuration)}
            </span>
          </div>
        </div>

        <div className="cl-header-right">
          {cacheInfo && (
            <span className="cl-cache-info">
              {cacheInfo.fromCache ? "📦 Cached" : "🌐 Live"} · {cacheAgeStr}
            </span>
          )}

          <button
            onClick={() => setExportModal(true)}
            className="cl-btn cl-btn--outline"
          >
            📥 Export
          </button>

          <button
            onClick={() => {
              invalidateCache();
              fetchCalls(true, 1);
            }}
            disabled={loading}
            className="cl-btn cl-btn--outline"
            title="Force refresh from server"
          >
            <span className={loading ? "cl-spin" : ""}>🔄</span> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="cl-filters">
        <div className="cl-search-wrap">
          <span className="cl-search-icon">🔍</span>
          <input
            placeholder="Search by name, number, agent..."
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            className="cl-search"
          />
          {searchRaw && (
            <button
              className="cl-search-clear"
              onClick={() => setSearchRaw("")}
            >
              ✕
            </button>
          )}
        </div>

        <select
          className="cl-filter-sel"
          value={fDir}
          onChange={(e) => setFDir(e.target.value)}
        >
          <option value="">All Direction</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
          <option value="clicktocall">ClickToCall</option>
        </select>

        <select
          className="cl-filter-sel"
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="answered">Answered</option>
          <option value="missed">Missed</option>
          <option value="busy">Busy</option>
          <option value="failed">Failed</option>
          <option value="no-answer">No Answer</option>
        </select>

        <select
          className="cl-filter-sel"
          value={fAgent}
          onChange={(e) => setFAgent(e.target.value)}
        >
          <option value="">All Agents</option>
          {uniqueAgents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="cl-filter-sel"
          value={fDate}
          onChange={(e) => setFDate(e.target.value)}
        />

        {(fDir || fStatus || fAgent || fDate || searchRaw) && (
          <button
            className="cl-btn cl-btn--ghost cl-btn--sm"
            onClick={() => {
              setFDir("");
              setFStatus("");
              setFAgent("");
              setFDate("");
              setSearchRaw("");
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Active Call Bar */}
      {activeCall && (
        <div className="cl-active-bar">
          <div className="cl-active-pulse" />
          <span>
            🔴 Active call:{" "}
            <strong>{activeCall.name || activeCall.number}</strong>
          </span>
          <LiveTimer startedAt={activeCall.startedAt} />
          <button
            className="cl-bar-btn"
            onClick={() =>
              setLiveCallModal({
                call: {
                  id: activeCall.key,
                  call_to_number: activeCall.number,
                  name: activeCall.name,
                },
                startedAt: activeCall.startedAt,
              })
            }
          >
            Open Controls
          </button>
          <button
            className="cl-bar-btn cl-bar-btn--end"
            onClick={() => handleEnd({})}
          >
            End Call
          </button>
        </div>
      )}

      {/* Server Pagination */}
      {totalServerPages > 1 && (
        <div className="cl-server-pagination">
          <span className="cl-server-page-info">
            📄 Page {serverPage}/{totalServerPages} ({totalRecords} total)
          </span>
          <div className="cl-server-page-btns">
            <button
              className="cl-page-btn"
              disabled={serverPage <= 1 || loading}
              onClick={() => handleServerPageChange(serverPage - 1)}
            >
              ← Prev
            </button>
            <button
              className="cl-page-btn"
              disabled={serverPage >= totalServerPages || loading}
              onClick={() => handleServerPageChange(serverPage + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="cl-table-wrap">
        <table className="cl-table">
          <thead>
            <tr>
              <TH k="call_to_number">CUSTOMER</TH>
              <TH k="direction">TYPE</TH>
              <TH k="createdAt">DATE & TIME</TH>
              <TH k="call_status">STATUS</TH>
              <TH k="answered_agent_name">AGENT</TH>
              <TH k="billsec">DURATION</TH>
              <th className="cl-th">RECORDING</th>
              <th className="cl-th">ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="cl-table-empty">
                  <span className="cl-spinner cl-spinner--blue" /> Loading...
                </td>
              </tr>
            )}

            {!loading && !displayPaged.length && (
              <tr>
                <td colSpan={8} className="cl-table-empty">
                  <div className="cl-empty-state">
                    <span className="cl-empty-icon">📭</span>
                    <p>No calls found</p>
                    <span className="cl-empty-hint">
                      Try adjusting your filters
                    </span>
                  </div>
                </td>
              </tr>
            )}

            {displayPaged.map((c, i) => (
              <CallRow
                key={c.id || c.uuid || i}
                c={c}
                allCalls={allCalls}
                agentDirectory={agentDirectory}
                activeCall={activeCall}
                callingRows={callingRows}
                onCall={handleCall}
                onRemark={handleOpenRemark}
                onHistory={handleOpenHistory}
                onDelete={handleOpenDelete}
                onEditName={handleOpenEditName}
                onOpenLive={handleOpenLive}
                nameMap={nameMap}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Display Pagination */}
      {displayPages > 1 && (
        <div className="cl-pagination">
          <button
            className="cl-page-btn"
            onClick={() => setDisplayPage(1)}
            disabled={displayPage === 1}
          >
            «
          </button>

          <button
            className="cl-page-btn"
            onClick={() => setDisplayPage((p) => Math.max(1, p - 1))}
            disabled={displayPage === 1}
          >
            ‹
          </button>

          <div className="cl-page-nums">
            {Array.from({ length: Math.min(5, displayPages) }, (_, i) => {
              let p;
              if (displayPages <= 5) p = i + 1;
              else if (displayPage <= 3) p = i + 1;
              else if (displayPage >= displayPages - 2)
                p = displayPages - 4 + i;
              else p = displayPage - 2 + i;

              return (
                <button
                  key={p}
                  onClick={() => setDisplayPage(p)}
                  className={`cl-page-btn ${
                    displayPage === p ? "cl-page-btn--active" : ""
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            className="cl-page-btn"
            onClick={() =>
              setDisplayPage((p) => Math.min(displayPages, p + 1))
            }
            disabled={displayPage === displayPages}
          >
            ›
          </button>

          <button
            className="cl-page-btn"
            onClick={() => setDisplayPage(displayPages)}
            disabled={displayPage === displayPages}
          >
            »
          </button>

          <span className="cl-page-info">
            Showing {(displayPage - 1) * DISPLAY_SIZE + 1}–
            {Math.min(displayPage * DISPLAY_SIZE, filteredCalls.length)} of{" "}
            {filteredCalls.length}
          </span>
        </div>
      )}

      {/* Modals */}
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
          agentDirectory={agentDirectory}
          nameMap={nameMap}
        />
      )}

      {deleteModal && (
        <DeleteModal
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
        <ExportModal agents={agents} onClose={() => setExportModal(false)} />
      )}

      {liveCallModal && (
        <LiveCallModal
          call={liveCallModal.call}
          startedAt={liveCallModal.startedAt}
          onEnd={() => handleEnd(liveCallModal.call)}
          onClose={() => setLiveCallModal(null)}
          agentDirectory={agentDirectory}
          nameMap={nameMap}
        />
      )}

      {/* Inline styles */}
      <style>{`
        .cl-cache-info {
          font-size: 11px;
          color: #64748b;
          padding: 4px 10px;
          background: #f1f5f9;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .cl-server-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .cl-server-page-info {
          color: #92400e;
          font-weight: 500;
        }

        .cl-server-page-btns {
          display: flex;
          gap: 8px;
        }

        .cl-agent-wrap {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .cl-agent--none {
          color: #94a3b8;
          font-style: italic;
        }

        .cl-agent--answered {
          color: #16a34a;
          font-weight: 600;
          font-size: 13px;
        }

        .cl-agent-num {
          font-size: 11px;
          color: #94a3b8;
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .cl-agent-missed {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          background: linear-gradient(135deg, #fef2f2, #fff1f2);
          border: 1px solid #fecaca;
          border-radius: 8px;
          border-left: 3px solid #ef4444;
          min-width: 0;
        }

        .cl-agent-missed-icon {
          font-size: 14px;
          flex-shrink: 0;
        }

        .cl-agent-missed-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }

        .cl-agent-missed-label {
          font-size: 9px;
          color: #ef4444;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .cl-agent-missed-name {
          font-size: 12px;
          font-weight: 600;
          color: #dc2626;
          word-break: break-word;
        }

        .cl-routing-agent-num {
          font-size: 10px;
          color: #94a3b8;
          font-family: monospace;
        }

        /* Edit name modal enhancements */
        .cl-apply-all-label {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
          color: #374151;
          line-height: 1.4;
          padding: 10px 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          margin-top: 2px;
        }

        .cl-apply-all-check {
          margin-top: 2px;
          flex-shrink: 0;
          accent-color: #16a34a;
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .cl-apply-all-hint {
          display: block;
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}