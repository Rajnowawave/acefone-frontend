// Dialer.jsx — Fixed: Real call status polling + Working remarks
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./Dialer.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ─── Cache Config ────────────────────────────────────────────────
const CACHE_KEYS = {
  RECENT: "dialer_recent_cache",
  CONTACTS: "dialer_contacts_cache",
};
const CACHE_TTL = {
  RECENT: 60_000,
  CONTACTS: 300_000,
};

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return { data, ts };
  } catch { return null; }
};

const writeCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { }
};

const isCacheFresh = (ts, ttl) => ts && Date.now() - ts < ttl;

// ─── Session Persistence ─────────────────────────────────────────
const SESSION_KEY = "dialer_call_session";

const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const writeSession = (data) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { }
};

const clearSession = () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { }
};

// ─── Agents ─────────────────────────────────────────────────────
const AGENTS = [
  { id: "0502190850001", name: "Neelam",          number: "919251651958" },
  { id: "0502190850002", name: "Bhavika",         number: "919251651956" },
  { id: "0502190850003", name: "Tushar Bhandari", number: "917976630010" },
  { id: "0502190850004", name: "Vikash Singhvi",  number: "919509805201" },
  { id: "0502190850005", name: "Amit Sharma",     number: "918094121221" },
];

// ─── Call statuses that mean the call is over ────────────────────
const ENDED_STATUSES = [
  "completed", "failed", "busy", "no-answer", "no_answer",
  "canceled", "cancelled", "disconnected", "ended", "hung_up", "hung-up",
];

// ─── Utilities ───────────────────────────────────────────────────
const cleanNum = (n = "") => String(n).replace(/\D/g, "");

const fmtPhone = (num) => {
  const d = cleanNum(num);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `+${d.slice(0, d.length - 10)} ${d.slice(-10, -7)} ${d.slice(-7, -4)} ${d.slice(-4)}`;
};

const fmtSec = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtTimeAgo = (ts) => {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const DTMF_TONES = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

const DIAL_LETTERS = {
  "1": "", "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO",
  "7": "PQRS", "8": "TUV", "9": "WXYZ", "*": "", "0": "+", "#": "",
};

const AVATAR_COLORS = [
  "#EBF5FF", "#F0FFF4", "#FAF5FF", "#FFFFF0", "#FFF5F5",
  "#E6FFFA", "#FEFCBF", "#FED7E2", "#C6F6D5", "#BEE3F8",
];

let audioCtx = null;
const playDTMF = (key) => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = DTMF_TONES[key];
    if (!freqs) return;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    freqs.forEach((f) => {
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, audioCtx.currentTime);
      osc.connect(gain);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.12);
    });
  } catch { }
};

// ─── LiveTimer ───────────────────────────────────────────────────
const LiveTimer = ({ startedAt }) => {
  const [sec, setSec] = useState(
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  );
  useEffect(() => {
    const iv = setInterval(() => setSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return <span className="dl-timer">{fmtSec(sec)}</span>;
};

// ─── StatusDot ───────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const color =
    status === "online" ? "#22c55e" :
    status === "busy"   ? "#f59e0b" :
    status === "dnd"    ? "#ef4444" : "#94a3b8";
  return <span className="dl-contact-status" style={{ background: color }} />;
};

// ─── ContactItem ─────────────────────────────────────────────────
const ContactItem = React.memo(({ contact, onCall, onSelect, onEdit, onDelete, isSelected }) => {
  const initials = (contact.name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className={`dl-contact ${isSelected ? "dl-contact--selected" : ""}`} onClick={() => onSelect(contact)}>
      <div className="dl-contact-avatar" style={{ background: contact.color || AVATAR_COLORS[0] }}>
        <span className="dl-contact-initials">{initials}</span>
        <StatusDot status={contact.status} />
      </div>
      <div className="dl-contact-info">
        <span className="dl-contact-name">{contact.name || "Unknown"}</span>
        <span className="dl-contact-number">{fmtPhone(contact.number)}</span>
        {contact.lastCall && <span className="dl-contact-last">{fmtTimeAgo(contact.lastCall)}</span>}
      </div>
      <div className="dl-contact-actions">
        <button className="dl-icon-btn dl-icon-btn--call" onClick={(e) => { e.stopPropagation(); onCall(contact); }} title="Call">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.64A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
        </button>
        <button className="dl-icon-btn dl-icon-btn--edit" onClick={(e) => { e.stopPropagation(); onEdit(contact); }} title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button className="dl-icon-btn dl-icon-btn--delete" onClick={(e) => { e.stopPropagation(); onDelete(contact); }} title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  );
});

// ─── RecentCallItem ──────────────────────────────────────────────
const RecentCallItem = React.memo(({ call, onCall }) => {
  const isMissed = ["missed", "no-answer", "no_answer", "failed"].includes((call.call_status || "").toLowerCase());
  const isInbound = (call.direction || "").toLowerCase() === "inbound";
  const num = isInbound
    ? call.client_number || call.caller_id_number || call.call_to_number || ""
    : call.call_to_number || call.client_number || "";
  const ts = call.createdAt?._seconds
    ? call.createdAt._seconds * 1000
    : new Date(call.createdAt).getTime();

  const OUTCOME_COLORS = {
    interested:     "#16a34a",
    not_interested: "#dc2626",
    callback:       "#d97706",
    no_answer:      "#64748b",
    converted:      "#7c3aed",
    follow_up:      "#2563eb",
  };

  return (
    <div className={`dl-recent ${isMissed ? "dl-recent--missed" : ""}`}>
      <div className={`dl-recent-icon ${isMissed ? "dl-recent-icon--missed" : isInbound ? "dl-recent-icon--in" : "dl-recent-icon--out"}`}>
        {isMissed ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : isInbound ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 19 19 12"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>
        )}
      </div>
      <div className="dl-recent-info">
        <span className="dl-recent-name">{call.name || fmtPhone(num)}</span>
        <span className="dl-recent-meta">{call.answered_agent_name || "—"} · {fmtTimeAgo(ts)}</span>
        {/* Show remark & outcome if present */}
        {call.remark && (
          <span className="dl-recent-remark">
            {call.outcome && (
              <span className="dl-recent-outcome-tag"
                style={{ background: (OUTCOME_COLORS[call.outcome] || "#64748b") + "22", color: OUTCOME_COLORS[call.outcome] || "#64748b" }}>
                {call.outcome.replace(/_/g, " ")}
              </span>
            )}
            {call.remark}
          </span>
        )}
      </div>
      <button className="dl-icon-btn dl-icon-btn--call" onClick={() => onCall({ number: num, name: call.name })} title="Call back">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.64A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
      </button>
    </div>
  );
});

// ─── ContactModal ────────────────────────────────────────────────
const ContactModal = ({ contact, onClose, onSave }) => {
  const isEdit = !!contact?.id;
  const [name, setName]       = useState(contact?.name    || "");
  const [number, setNumber]   = useState(contact?.number  || "");
  const [email, setEmail]     = useState(contact?.email   || "");
  const [company, setCompany] = useState(contact?.company || "");
  const [color, setColor]     = useState(contact?.color   || AVATAR_COLORS[0]);
  const [saving, setSaving]   = useState(false);
  const nameRef = useRef();

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 100); }, []);

  const handleSave = async () => {
    if (!name.trim() || cleanNum(number).length < 3) return;
    setSaving(true);
    const payload = { name: name.trim(), number: cleanNum(number), email: email.trim(), company: company.trim(), color };
    try {
      const endpoint = isEdit ? `${API}/contacts/${contact.id}` : `${API}/contacts`;
      await fetch(endpoint, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch { }
    const saved = { id: contact?.id || `local-${Date.now()}`, ...payload, status: contact?.status || "offline", lastCall: contact?.lastCall || null };
    onSave(saved);
    setSaving(false);
    onClose();
  };

  return (
    <div className="dl-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dl-modal">
        <div className="dl-modal-header">
          <span className="dl-modal-title">{isEdit ? "Edit Contact" : "New Contact"}</span>
          <button className="dl-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="dl-modal-body">
          {[
            { label: "Full Name *",    value: name,    onChange: setName,    type: "text",  placeholder: "e.g. Rajesh Kumar", ref: nameRef },
            { label: "Phone Number *", value: number,  onChange: setNumber,  type: "tel",   placeholder: "+91 XXXXX XXXXX" },
            { label: "Email",          value: email,   onChange: setEmail,   type: "email", placeholder: "email@example.com" },
            { label: "Company",        value: company, onChange: setCompany, type: "text",  placeholder: "Company name" },
          ].map(({ label, value, onChange, type, placeholder, ref }) => (
            <div className="dl-field" key={label}>
              <label className="dl-field-label">{label}</label>
              <input ref={ref} className="dl-field-input" type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
            </div>
          ))}
          <div className="dl-field">
            <label className="dl-field-label">Avatar Color</label>
            <div className="dl-color-row">
              {AVATAR_COLORS.map((c) => (
                <button key={c} className={`dl-color-dot ${color === c ? "active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="dl-modal-footer">
          <button className="dl-btn dl-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="dl-btn dl-btn--primary" onClick={handleSave} disabled={saving || !name.trim() || cleanNum(number).length < 3}>
            {saving ? "Saving…" : isEdit ? "Update Contact" : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── QuickNoteModal ──────────────────────────────────────────────
const OUTCOMES = [
  { v: "interested",     l: "Interested",    color: "#16a34a" },
  { v: "not_interested", l: "Not Interested", color: "#dc2626" },
  { v: "callback",       l: "Callback",       color: "#d97706" },
  { v: "no_answer",      l: "No Answer",      color: "#64748b" },
  { v: "converted",      l: "Converted",      color: "#7c3aed" },
  { v: "follow_up",      l: "Follow Up",      color: "#2563eb" },
];

const QuickNoteModal = ({ callData, onClose, onSave }) => {
  const [note, setNote]       = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const ref = useRef();

  useEffect(() => { setTimeout(() => ref.current?.focus(), 80); }, []);

  const submit = async () => {
    if (!note.trim()) { setError("Please add a note before saving."); return; }
    setError("");
    setSaving(true);

    const remarkText = outcome
      ? `[${outcome.toUpperCase()}] ${note.trim()}`
      : note.trim();

    try {
      const res = await fetch(`${API}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId:  callData.callId  || "",
          number:  callData.number  || "",
          name:    callData.name    || "",
          remark:  remarkText,
          outcome: outcome || "",
        }),
      });
      if (!res.ok) throw new Error("API error");
      onSave?.(note.trim(), outcome);
    } catch {
      // Even if API fails, pass note to parent so it shows in UI
      onSave?.(note.trim(), outcome);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div className="dl-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dl-modal">
        <div className="dl-modal-header">
          <span className="dl-modal-title">Post-Call Note</span>
          <button className="dl-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="dl-modal-body">
          <div className="dl-note-who">
            <span className="dl-note-who-name">{callData.name || fmtPhone(callData.number)}</span>
            <span className="dl-note-who-num">{fmtPhone(callData.number)}</span>
            {callData.callId && (
              <span className="dl-note-callid">Call ID: {callData.callId}</span>
            )}
          </div>
          <div className="dl-field">
            <label className="dl-field-label">Call Outcome</label>
            <div className="dl-outcome-grid">
              {OUTCOMES.map((o) => (
                <button key={o.v}
                  className={`dl-outcome-chip ${outcome === o.v ? "active" : ""}`}
                  style={outcome === o.v
                    ? { background: o.color, color: "#fff", borderColor: o.color }
                    : { borderColor: o.color + "44", color: o.color }}
                  onClick={() => setOutcome(outcome === o.v ? "" : o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="dl-field">
            <label className="dl-field-label">Notes *</label>
            <textarea
              ref={ref}
              className="dl-field-textarea"
              placeholder="Add call notes… (Ctrl+Enter to save)"
              value={note}
              onChange={(e) => { setNote(e.target.value); if (error) setError(""); }}
              onKeyDown={(e) => e.ctrlKey && e.key === "Enter" && submit()}
              rows={4}
            />
            {error && <span className="dl-field-error">{error}</span>}
          </div>
        </div>
        <div className="dl-modal-footer">
          <button className="dl-btn dl-btn--ghost" onClick={() => { onSave?.("", ""); onClose(); }}>Skip</button>
          <button className="dl-btn dl-btn--primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MAIN DIALER COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function Dialer({ onCallMade }) {

  // ── Restore session on mount ───────────────────────────────────
  const session = readSession();

  const [selectedAgent, setSelectedAgent]     = useState(session?.selectedAgent || AGENTS[0]?.id || null);
  const [number, setNumber]                   = useState(session?.number || "");
  const [callState, setCallState]             = useState(session?.callState || "idle");
  const [callStartedAt, setCallStartedAt]     = useState(session?.callStartedAt || null);
  const [connectedAt, setConnectedAt]         = useState(session?.connectedAt || null);
  const [muted, setMuted]                     = useState(session?.muted || false);
  const [held, setHeld]                       = useState(session?.held || false);
  const [speakerOn, setSpeakerOn]             = useState(session?.speakerOn || false);
  const [showKeypad, setShowKeypad]           = useState(false);
  const [activeTab, setActiveTab]             = useState("recent");
  const [recentCalls, setRecentCalls]         = useState([]);
  const [contacts, setContacts]               = useState([]);
  const [searchContacts, setSearchContacts]   = useState("");
  const [selectedContact, setSelectedContact] = useState(session?.selectedContact || null);
  const [quickNote, setQuickNote]             = useState(session?.quickNote || null);
  const [toast, setToast]                     = useState({ show: false, msg: "", ok: true });
  const [currentCallData, setCurrentCallData] = useState(session?.currentCallData || null);
  const [volume, setVolume]                   = useState(80);
  const [contactModal, setContactModal]       = useState(null);
  const [recentLoading, setRecentLoading]     = useState(false);

  const inputRef         = useRef();
  const toastT           = useRef();
  const didFetchRecent   = useRef(false);
  const didFetchContacts = useRef(false);
  const pollRef          = useRef(null);   // setInterval id for call status polling
  const endedRef         = useRef(false);  // prevents double-trigger of end-call flow
  const currentCallDataRef = useRef(currentCallData);

  useEffect(() => { currentCallDataRef.current = currentCallData; }, [currentCallData]);

  const currentAgent = useMemo(() => AGENTS.find((a) => a.id === selectedAgent) || null, [selectedAgent]);

  // ── Persist session ────────────────────────────────────────────
  useEffect(() => {
    if (callState === "idle" && !quickNote) { clearSession(); return; }
    writeSession({ callState, number, callStartedAt, connectedAt, muted, held, speakerOn, selectedAgent, selectedContact, currentCallData, quickNote });
  }, [callState, number, callStartedAt, connectedAt, muted, held, speakerOn, selectedAgent, selectedContact, currentCallData, quickNote]);

  // ── Toast ──────────────────────────────────────────────────────
  const showToast = useCallback((msg, ok = true) => {
    setToast({ show: true, msg, ok });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3500);
  }, []);

  // ── fetchRecent ────────────────────────────────────────────────
  const fetchRecent = useCallback(async (force = false) => {
    if (document.hidden) return;
    const cached = readCache(CACHE_KEYS.RECENT);
    if (!force && cached && isCacheFresh(cached.ts, CACHE_TTL.RECENT)) {
      setRecentCalls(cached.data);
      return;
    }
    setRecentLoading(true);
    try {
      const data = await fetch(`${API}/call-logs?limit=30`).then((r) => r.json());
      const list = Array.isArray(data) ? data : [];
      setRecentCalls(list);
      writeCache(CACHE_KEYS.RECENT, list);
    } catch {
      if (cached?.data) setRecentCalls(cached.data);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  // ── Shared end-call logic ──────────────────────────────────────
  const triggerCallEnd = useCallback((cd) => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearInterval(pollRef.current);
    setCallState("ended");
    setConnectedAt(null);
    showToast("Call ended");
    if (cd) {
      setTimeout(() => {
        setQuickNote({ number: cd.number, name: cd.name, callId: cd.callId || "" });
      }, 500);
    }
    fetchRecent(true);
  }, [showToast, fetchRecent]);

  // ── Poll backend for real call status (detects portal-side hangup) ──
  const startPolling = useCallback((callId, cdRef) => {
    clearInterval(pollRef.current);
    endedRef.current = false;

    pollRef.current = setInterval(async () => {
      try {
        let status = null;

        // Primary: dedicated status endpoint
        const res = await fetch(`${API}/call-status/${callId}`);
        if (res.ok) {
          const data = await res.json();
          status = (data.status || data.call_status || "").toLowerCase();
        } else {
          // Fallback: scan recent call-logs for this callId
          const logsRes = await fetch(`${API}/call-logs?limit=10`);
          if (logsRes.ok) {
            const logs = await logsRes.json();
            const match = Array.isArray(logs)
              ? logs.find((l) =>
                  l.id === callId || l.callId === callId ||
                  l.call_sid === callId || l.callSid === callId)
              : null;
            if (match) status = (match.call_status || "").toLowerCase();
          }
        }

        if (status && ENDED_STATUSES.includes(status)) {
          triggerCallEnd(cdRef.current);
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 3000); // check every 3 seconds
  }, [triggerCallEnd]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── fetchContacts ──────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    if (document.hidden) return;
    const cached = readCache(CACHE_KEYS.CONTACTS);
    if (cached?.data?.length) setContacts(cached.data);
    if (cached && isCacheFresh(cached.ts, CACHE_TTL.CONTACTS)) return;
    try {
      const data = await fetch(`${API}/contacts`).then((r) => r.json());
      if (Array.isArray(data) && data.length > 0) {
        setContacts(data);
        writeCache(CACHE_KEYS.CONTACTS, data);
        return;
      }
    } catch { }
    if (!cached?.data?.length) {
      setContacts([]);
      writeCache(CACHE_KEYS.CONTACTS, []);
    }
  }, []);

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    if (!didFetchRecent.current)   { didFetchRecent.current = true;   fetchRecent(); }
    if (!didFetchContacts.current) { didFetchContacts.current = true; fetchContacts(); }

    if (session?.callState === "connected") {
      showToast("Welcome back — call still active");
      if (session?.currentCallData?.callId) {
        startPolling(session.currentCallData.callId, currentCallDataRef);
      }
    } else if (session?.callState === "ended" && session?.quickNote) {
      showToast("Please fill in the post-call note");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (callState !== "idle" && callState !== "ended") return;
      if (/^[0-9*#]$/.test(e.key)) handleDialPress(e.key);
      else if (e.key === "Backspace") setNumber((n) => n.slice(0, -1));
      else if (e.key === "Enter" && number.length >= 3) handleCall();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [number, callState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dial press ────────────────────────────────────────────────
  const handleDialPress = (key) => {
    playDTMF(key);
    if (callState === "connected") { showToast(`DTMF: ${key}`); return; }
    setNumber((n) => (n.length >= 15 ? n : n + key));
  };

  // ── Initiate call ─────────────────────────────────────────────
  const handleCall = async (contactOverride) => {
    const dialNum  = contactOverride?.number || number;
    const dialName = contactOverride?.name   || selectedContact?.name || "";
    if (!dialNum || cleanNum(dialNum).length < 3) { showToast("Enter a valid number", false); return; }
    if (!selectedAgent)                           { showToast("Select an agent — go to Agents tab", false); return; }
    if (callState !== "idle" && callState !== "ended") { showToast("A call is already active", false); return; }

    endedRef.current = false;
    setCallState("dialing");
    setCallStartedAt(Date.now());
    setMuted(false); setHeld(false);

    const initCallData = { number: cleanNum(dialNum), name: dialName, callId: "" };
    setCurrentCallData(initCallData);
    currentCallDataRef.current = initCallData;

    try {
      const resp = await fetch(`${API}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: cleanNum(dialNum), agentId: selectedAgent, name: dialName }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        showToast(data.error || "Call failed", false);
        setCallState("idle"); setCallStartedAt(null);
        return;
      }

      // Extract callId — support multiple field names from different backends
      const callId = data.callId || data.call_id || data.callSid || data.call_sid || data.id || "";
      const fullCallData = { number: cleanNum(dialNum), name: dialName, callId };
      setCurrentCallData(fullCallData);
      currentCallDataRef.current = fullCallData;

      setCallState("connected");
      setConnectedAt(Date.now());
      showToast(`Connected — ${dialName || fmtPhone(dialNum)}`);
      onCallMade?.({ number: cleanNum(dialNum), name: dialName, agentId: selectedAgent, callId });

      // Start polling to detect when call is cut from portal side
      startPolling(callId || "__noid__", currentCallDataRef);

    } catch {
      // Optimistic connect on network error
      setCallState("connected");
      setConnectedAt(Date.now());
      showToast(`Connected — ${dialName || fmtPhone(dialNum)}`);
      onCallMade?.({ number: cleanNum(dialNum), name: dialName, agentId: selectedAgent });
    }
  };

  // ── End call (manual button) ──────────────────────────────────
  const handleEndCall = async () => {
    const cd = currentCallDataRef.current;
    // Tell backend to hang up
    if (cd?.callId) {
      try {
        await fetch(`${API}/call/${cd.callId}/end`, { method: "POST" });
      } catch { }
    }
    triggerCallEnd(cd);
  };

  // ── Reset to idle ─────────────────────────────────────────────
  const handleNewCall = useCallback(() => {
    clearInterval(pollRef.current);
    endedRef.current = false;
    setCallState("idle");
    setNumber("");
    setCallStartedAt(null);
    setConnectedAt(null);
    setCurrentCallData(null);
    currentCallDataRef.current = null;
    setSelectedContact(null);
    setMuted(false);
    setHeld(false);
    setQuickNote(null);
    clearSession();
  }, []);

  // ── Save note — updates recentCalls list immediately ──────────
  const handleSaveNote = useCallback((note, outcome) => {
    const cd = currentCallDataRef.current;
    if (note) {
      setRecentCalls((prev) => {
        // Try to find matching entry by callId or number
        let found = false;
        const updated = prev.map((call) => {
          const byId  = cd?.callId && (call.id === cd.callId || call.callId === cd.callId || call.call_sid === cd.callId);
          const byNum = !byId && cleanNum(call.call_to_number || call.client_number || "") === cleanNum(cd?.number || "");
          if (byId || byNum) { found = true; return { ...call, remark: note, outcome }; }
          return call;
        });
        // If no matching entry yet (call just ended), prepend a synthetic one
        if (!found && cd) {
          return [{
            id: cd.callId || `local-${Date.now()}`,
            call_to_number: cd.number,
            name: cd.name,
            direction: "outbound",
            call_status: "completed",
            createdAt: new Date().toISOString(),
            remark: note,
            outcome,
          }, ...updated];
        }
        return updated;
      });
      // Invalidate cache so next reload fetches fresh data with remark
      writeCache(CACHE_KEYS.RECENT, []);
      showToast("Note saved ✓");
    } else {
      showToast("Note skipped");
    }
    handleNewCall();
  }, [showToast, handleNewCall]);

  const handleSaveContact = (saved) => {
    setContacts((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = { ...prev[idx], ...saved }; return u; }
      return [saved, ...prev];
    });
    const cached = readCache(CACHE_KEYS.CONTACTS);
    if (cached) writeCache(CACHE_KEYS.CONTACTS, []);
    showToast(contactModal?.id ? "Contact updated" : "Contact saved");
    setContactModal(null);
  };

  const handleDeleteContact = (contact) => {
    if (!window.confirm(`Delete "${contact.name}"?`)) return;
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    try { fetch(`${API}/contacts/${contact.id}`, { method: "DELETE" }); } catch { }
    writeCache(CACHE_KEYS.CONTACTS, []);
    showToast("Contact deleted");
    if (selectedContact?.id === contact.id) setSelectedContact(null);
  };

  const filteredContacts = useMemo(() => {
    if (!searchContacts) return contacts;
    const q = searchContacts.toLowerCase();
    return contacts.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.number || "").includes(q));
  }, [contacts, searchContacts]);

  const filteredRecent = useMemo(() => {
    if (!searchContacts) return recentCalls.slice(0, 30);
    const q = searchContacts.toLowerCase();
    return recentCalls.filter((c) => {
      const num = c.call_to_number || c.caller_id_number || "";
      return (c.name || "").toLowerCase().includes(q) || num.includes(q);
    }).slice(0, 30);
  }, [recentCalls, searchContacts]);

  const isCallActive   = ["dialing", "ringing", "connected"].includes(callState);
  const displayNumber  = currentCallData?.number || number;
  const displayName    = currentCallData?.name   || selectedContact?.name || "";
  const matchedContact = number && !selectedContact ? contacts.find((c) => cleanNum(c.number).includes(number)) : null;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="dl-root">

      {toast.show && (
        <div className={`dl-toast ${toast.ok ? "dl-toast--ok" : "dl-toast--err"}`}>{toast.msg}</div>
      )}

      <div className="dl-container">

        {/* ═══ SIDEBAR ═══ */}
        <aside className="dl-sidebar">
          <div className="dl-sidebar-fixed">
            <div className="dl-sidebar-header">
              <div className="dl-sidebar-brand">
                <div className="dl-brand-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.64A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                </div>
                <span className="dl-brand-name">CloudDial</span>
              </div>
              <div className="dl-sidebar-tabs">
                {[{ key: "recent", label: "Recent" }, { key: "contacts", label: "Contacts" }, { key: "agents", label: "Agents" }].map((t) => (
                  <button key={t.key}
                    className={`dl-sidebar-tab ${activeTab === t.key ? "dl-sidebar-tab--active" : ""}`}
                    onClick={() => { setActiveTab(t.key); setSearchContacts(""); }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {(activeTab === "contacts" || activeTab === "recent") && (
              <div className="dl-sidebar-search">
                <svg className="dl-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="dl-search-input"
                  placeholder={activeTab === "contacts" ? "Search contacts…" : "Search calls…"}
                  value={searchContacts} onChange={(e) => setSearchContacts(e.target.value)} />
                {searchContacts && <button className="dl-search-clear" onClick={() => setSearchContacts("")}>✕</button>}
              </div>
            )}

            <div className="dl-list-meta">
              {activeTab === "recent"   && <span>{recentLoading ? "Loading…" : `${filteredRecent.length} recent calls`}</span>}
              {activeTab === "contacts" && <span>{filteredContacts.length} contacts</span>}
              {activeTab === "agents"   && <span>Select agent for outbound calls</span>}
            </div>
          </div>

          <div className="dl-sidebar-list">
            {activeTab === "recent" && (
              filteredRecent.length === 0
                ? <div className="dl-empty"><div className="dl-empty-icon">📭</div><span>{recentLoading ? "Fetching calls…" : "No recent calls"}</span></div>
                : filteredRecent.map((c, i) => (
                    <RecentCallItem key={c.id || i} call={c}
                      onCall={(data) => { setNumber(cleanNum(data.number)); setSelectedContact(data); handleCall(data); }} />
                  ))
            )}

            {activeTab === "contacts" && (
              filteredContacts.length === 0
                ? <div className="dl-empty"><div className="dl-empty-icon">👤</div><span>{searchContacts ? "No contacts found" : "No contacts yet"}</span></div>
                : filteredContacts.map((c) => (
                    <ContactItem key={c.id} contact={c}
                      onCall={(ct) => { setNumber(cleanNum(ct.number)); setSelectedContact(ct); handleCall(ct); }}
                      onSelect={(ct) => { setSelectedContact(ct); setNumber(cleanNum(ct.number)); }}
                      onEdit={(ct) => setContactModal(ct)}
                      onDelete={(ct) => handleDeleteContact(ct)}
                      isSelected={selectedContact?.id === c.id} />
                  ))
            )}

            {activeTab === "agents" && AGENTS.map((agent) => {
              const isSel = selectedAgent === agent.id;
              return (
                <div key={agent.id}
                  className={`dl-agent-item ${isSel ? "dl-agent-item--selected" : ""}`}
                  onClick={() => { setSelectedAgent(agent.id); showToast(`Agent: ${agent.name}`); }}>
                  <div className="dl-agent-avatar">{agent.name[0].toUpperCase()}</div>
                  <div className="dl-agent-info">
                    <span className="dl-agent-name">{agent.name}{isSel && <span className="dl-agent-active-tag">Active</span>}</span>
                    <span className="dl-agent-ext">{fmtPhone(agent.number)}</span>
                    <span className="dl-agent-ext" style={{ opacity: 0.6 }}>ID: {agent.id}</span>
                  </div>
                  <span className={`dl-agent-badge ${isSel ? "dl-agent-badge--active" : ""}`}>
                    {isSel ? "Selected" : "Select"}
                  </span>
                </div>
              );
            })}
          </div>

          {activeTab === "contacts" && (
            <div className="dl-sidebar-footer">
              <button className="dl-add-btn" onClick={() => setContactModal({})}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Contact
              </button>
            </div>
          )}
        </aside>

        {/* ═══ MAIN PANEL ═══ */}
        <main className="dl-main">

          {/* ── Active Call ── */}
          {isCallActive && (
            <div className="dl-call-screen">
              <div className="dl-call-glow" />

              <div className={`dl-call-badge dl-call-badge--${callState}`}>
                <span className={`dl-badge-dot dl-badge-dot--${callState}`} />
                {callState === "dialing" ? "Dialing…" : callState === "ringing" ? "Ringing…" : "Connected"}
              </div>

              {currentAgent && (
                <div className="dl-call-via">
                  via <strong>{currentAgent.name}</strong> · {fmtPhone(currentAgent.number)}
                </div>
              )}

              <div className={`dl-call-avatar-wrap ${callState === "ringing" ? "dl-call-avatar-wrap--ringing" : ""}`}>
                <div className="dl-ring dl-ring--1" />
                <div className="dl-ring dl-ring--2" />
                <div className="dl-call-avatar-inner">
                  {displayName ? displayName[0].toUpperCase() : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.64A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                  )}
                </div>
              </div>

              <div className="dl-call-info">
                {displayName && <h2 className="dl-call-name">{displayName}</h2>}
                <p className="dl-call-num">{fmtPhone(displayNumber)}</p>
                {connectedAt && <div className="dl-call-timer-wrap"><LiveTimer startedAt={connectedAt} /></div>}
              </div>

              {callState === "connected" && (
                <>
                  <div className="dl-ctrl-grid">
                    {[
                      { icon: muted ? "🔇" : "🎙", label: muted ? "Unmute" : "Mute",    active: muted,     onClick: () => setMuted(!muted) },
                      { icon: held  ? "▶"  : "⏸", label: held  ? "Resume" : "Hold",    active: held,      onClick: () => setHeld(!held) },
                      { icon: "🔊",                 label: "Speaker",                    active: speakerOn, onClick: () => setSpeakerOn(!speakerOn) },
                      { icon: "⌨️",                 label: "Keypad",                     active: showKeypad,onClick: () => setShowKeypad(!showKeypad) },
                      { icon: "🔀",                 label: "Transfer",                   active: false,     onClick: () => showToast("Transfer — coming soon") },
                      { icon: "👥",                 label: "Add Call",                   active: false,     onClick: () => showToast("Conference — coming soon") },
                    ].map(({ icon, label, active, onClick }) => (
                      <button key={label} className={`dl-ctrl-btn ${active ? "dl-ctrl-btn--on" : ""}`} onClick={onClick}>
                        <span className="dl-ctrl-icon">{icon}</span>
                        <span className="dl-ctrl-label">{label}</span>
                      </button>
                    ))}
                  </div>

                  {showKeypad && (
                    <div className="dl-dtmf-pad">
                      {["1","2","3","4","5","6","7","8","9","*","0","#"].map((k) => (
                        <button key={k} className="dl-dtmf-key" onClick={() => handleDialPress(k)}>
                          <span className="dl-dtmf-num">{k}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="dl-volume-row">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>
                    <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="dl-volume-slider" />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
                    <span className="dl-volume-val">{volume}%</span>
                  </div>
                </>
              )}

              <button className="dl-end-btn" onClick={handleEndCall}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.71 16.67C21.64 14.6 18.83 13.5 16 13.5c-2.83 0-5.64 1.1-7.71 3.17-.38.38-.38 1.02 0 1.4l2.63 2.63c.38.38 1.02.38 1.4 0 .81-.81 1.8-1.3 2.87-1.45.36-.05.73-.08 1.07-.08s.72.03 1.07.08c1.07.15 2.06.64 2.87 1.45.38.38 1.02.38 1.4 0l2.63-2.63c.39-.38.39-1.02.01-1.4z"/></svg>
                End Call
              </button>
            </div>
          )}

          {/* ── Call Ended ── */}
          {callState === "ended" && (
            <div className="dl-ended-screen">
              <div className="dl-ended-check">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 className="dl-ended-title">Call Ended</h3>
              {currentCallData && <p className="dl-ended-sub">{currentCallData.name || fmtPhone(currentCallData.number)}</p>}
              {currentCallData && !quickNote && (
                <button className="dl-btn dl-btn--ghost" style={{ marginBottom: 12 }}
                  onClick={() => setQuickNote({ number: currentCallData.number, name: currentCallData.name, callId: currentCallData.callId || "" })}>
                  Add Call Note
                </button>
              )}
              <button className="dl-btn dl-btn--primary dl-btn--lg" onClick={handleNewCall}>New Call</button>
            </div>
          )}

          {/* ── Idle Dialer ── */}
          {callState === "idle" && (
            <div className="dl-idle-screen">
              <div className="dl-display">
                <div className="dl-display-inner">
                  <input ref={inputRef} className="dl-num-input"
                    value={fmtPhone(number)}
                    onChange={(e) => setNumber(cleanNum(e.target.value))}
                    placeholder="Enter number…" type="tel" />
                  {number && (
                    <button className="dl-num-clear" onClick={() => setNumber("")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
                {selectedContact && <div className="dl-display-tag">{selectedContact.name}</div>}
                {matchedContact  && <div className="dl-display-hint">📇 {matchedContact.name}</div>}
              </div>

              <div className="dl-keypad">
                {["1","2","3","4","5","6","7","8","9","*","0","#"].map((k) => (
                  <button key={k} className="dl-key" onClick={() => handleDialPress(k)} onMouseDown={(e) => e.preventDefault()}>
                    <span className="dl-key-num">{k}</span>
                    {DIAL_LETTERS[k] && <span className="dl-key-sub">{DIAL_LETTERS[k]}</span>}
                  </button>
                ))}
              </div>

              <div className="dl-action-row">
                <button className="dl-aux-btn" onClick={() => setNumber((n) => n.slice(0, -1))} disabled={!number} title="Backspace">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                </button>
                <button className="dl-call-fab" onClick={() => handleCall()} disabled={!number || cleanNum(number).length < 3}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>
                </button>
                <button className="dl-aux-btn" title="Paste"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      const nums = cleanNum(text);
                      if (nums) { setNumber(nums); showToast("Number pasted"); }
                    } catch { showToast("Cannot access clipboard", false); }
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>

              <div className="dl-agent-pill-wrap">
                <span className="dl-field-label">Calling via</span>
                {currentAgent ? (
                  <div className="dl-agent-pill">
                    <div className="dl-agent-pill-dot" />
                    <span>{currentAgent.name} · {fmtPhone(currentAgent.number)}</span>
                  </div>
                ) : (
                  <div className="dl-agent-pill dl-agent-pill--warn">
                    <span>⚠ No agent selected — go to Agents tab</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {quickNote && (
        <QuickNoteModal
          callData={quickNote}
          onClose={() => { setQuickNote(null); handleNewCall(); }}
          onSave={handleSaveNote}
        />
      )}
      {contactModal !== null && (
        <ContactModal contact={contactModal} onClose={() => setContactModal(null)} onSave={handleSaveContact} />
      )}
    </div>
  );
}