import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./FollowUps.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ─── Constants ───────────────────────────────────────────────────────────────
const METHODS = ["Call", "WhatsApp", "Site Visit", "Email", "Video Call", "SMS"];
const OUTCOMES = [
  "Connected", "Interested", "Not Reachable", "Switched Off", "Busy",
  "Call Later", "No Response", "Wrong Number", "Follow Up Done",
  "Not Interested", "Will Visit Site", "Visited Site",
];
const BOOKING_STATUSES = ["Not Booked", "Interested", "Follow Up", "Booked", "Cancelled"];
const SORT_OPTIONS = [
  { label: "Latest First", value: "latest" },
  { label: "Oldest First", value: "oldest" },
  { label: "Name A-Z", value: "nameAsc" },
  { label: "Name Z-A", value: "nameDesc" },
  { label: "Lead Score (Highest)", value: "scoreDesc" },
];
const KEYBOARD_SHORTCUTS = [
  { key: "Alt+S", action: "Toggle Analytics" },
  { key: "Alt+C", action: "Toggle Calendar" },
  { key: "Alt+K", action: "Toggle Kanban" },
  { key: "Alt+E", action: "Export Data" },
  { key: "Alt+D", action: "Toggle Dark Mode" },
  { key: "Alt+B", action: "Toggle Bulk Actions" },
  { key: "Alt+L", action: "Toggle Leaderboard" },
  { key: "Alt+R", action: "Refresh Data" },
  { key: "/", action: "Focus Search" },
  { key: "Escape", action: "Close panels" },
];
const WHATSAPP_TEMPLATES = [
  { label: "Greeting", text: "Hello {name}! 👋 Thank you for connecting. We'd love to help you. When would be a good time?" },
  { label: "Follow-up", text: "Hi {name}! 🏠 Just checking in. Have you had a chance to think about our discussion? We have some updates!" },
  { label: "Special Offer", text: "Dear {name}, 🎉 We have an exclusive offer just for you! Limited period pricing. Call us today!" },
  { label: "Site Visit", text: "Hello {name}! 📅 We'd like to invite you for a site visit. Our team is ready for a complete walkthrough." },
  { label: "Booking Reminder", text: "Hi {name}, 🔔 Your booking is pending. Don't miss out! Let's finalize today." },
];

// ─── Cache Configuration ─────────────────────────────────────────────────────
const CACHE_KEY = "followups_cache";
const CACHE_TTL = 60 * 1000;
const PAGE_LIMIT = 50;

// ─── NAME MAP — localStorage { last10digits → name } ─────────────────────────
// Shared with CallLogs component (same key) so names sync across both pages
const NAME_MAP_KEY = "cl_name_map_v1";

const _getNameMap = () => {
  try {
    const raw = localStorage.getItem(NAME_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const _setNameMap = (map) => {
  try { localStorage.setItem(NAME_MAP_KEY, JSON.stringify(map)); } catch { /* noop */ }
};

// Extract the last 10 digits from any phone string
const _cleanNum10 = (n = "") => String(n).replace(/\D/g, "").slice(-10);

// Save name for a number (and all variants) in the shared map
const persistNameForNumber = (number, name) => {
  const key = _cleanNum10(number);
  if (!key || key.length < 6) return;
  const map = _getNameMap();
  if (name && name.trim()) {
    map[key] = name.trim();
  } else {
    delete map[key];
  }
  _setNameMap(map);
};

// Look up a saved name by any phone variant
const lookupSavedName = (number) => {
  if (!number) return null;
  const map = _getNameMap();
  const key = _cleanNum10(String(number));
  return map[key] || null;
};

// Given a call record, return the best display name:
// 1. nameMap (localStorage) — zero Firebase reads
// 2. call.name field
// 3. phone number fallback
const resolveCallDisplayName = (callRecord) => {
  if (!callRecord) return null;
  // Try all number fields from the call record
  const candidates = [
    callRecord.client_number,
    callRecord.caller_id_number,
    callRecord.call_to_number,
    callRecord.from_number,
    callRecord.to_number,
    callRecord.phone,
    callRecord.mobile,
    callRecord.number,
  ];
  for (const num of candidates) {
    const saved = lookupSavedName(num);
    if (saved) return saved;
  }
  // Fall back to whatever name is on the record
  if (callRecord.name && String(callRecord.name).trim()) {
    return String(callRecord.name).trim();
  }
  return null;
};

// ─── Cache Utilities ──────────────────────────────────────────────────────────
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp, cursor } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return { data, cursor };
  } catch { return null; }
};

const writeCache = (data, cursor = null) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data, cursor, timestamp: Date.now(),
    }));
  } catch { /* quota exceeded — skip */ }
};

const invalidateCache = () => {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const norm = (s = "") => String(s).toLowerCase().trim();
const cleanNum = (n = "") => String(n).replace(/\D/g, "").slice(-10);
const toInputDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toInputTime = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const showToast = (msg, type = "success") => {
  if (type === "success") toast.success(msg);
  else if (type === "error") toast.error(msg);
  else if (type === "warning") toast.warn(msg);
  else toast.info(msg);
};

const safeTs = (c) => {
  if (!c?.createdAt) return 0;
  if (c.createdAt?._seconds) return c.createdAt._seconds * 1000;
  const t = new Date(c.createdAt).getTime();
  return isNaN(t) ? 0 : t;
};

const fmtTimeAgo = (c) => {
  const t = typeof c === "number" ? c : safeTs(c);
  if (!t) return "-";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const fmtDateTime = (c) => {
  const t = typeof c === "number" ? c : safeTs(c);
  if (!t) return "-";
  return new Date(t).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

const fmtDuration = (seconds) => {
  const s = Number(seconds || 0);
  if (!s) return "—";
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
};

const isSameDay = (d1, d2) =>
  d1 && d2 &&
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const getDisplayNumber = (c) =>
  norm(c.direction) === "inbound"
    ? c.client_number || c.caller_id_number || c.call_to_number || ""
    : c.call_to_number || c.client_number || "";

/**
 * getDisplayName — resolves the best available name.
 * Priority: nameMap (localStorage) → call.name → phone number
 * Zero extra Firebase reads.
 */
const getDisplayName = (c) => {
  const saved = resolveCallDisplayName(c);
  if (saved) return saved;
  const num = getDisplayNumber(c);
  return num || "Unknown";
};

const getStatusColor = (status) => {
  const s = norm(status);
  if (["answered", "completed", "connected"].includes(s)) return "#16a34a";
  if (["missed", "no-answer", "no_answer", "failed"].includes(s)) return "#dc2626";
  if (s === "busy") return "#d97706";
  return "#64748b";
};

const isMissedCall = (c) =>
  ["missed", "no-answer", "no_answer", "failed"].includes(norm(c.call_status));

const isAnsweredCall = (c) =>
  ["answered", "completed", "connected"].includes(norm(c.call_status));

// ─── Lead Score ───────────────────────────────────────────────────────────────
const calcCallScore = (c, localData) => {
  let s = 20;
  if (isAnsweredCall(c)) s += 25;
  if (isMissedCall(c)) s -= 10;
  if (norm(c.call_status) === "busy") s += 5;
  const dur = Number(c.duration || c.call_duration || 0);
  if (dur > 300) s += 20;
  else if (dur > 120) s += 15;
  else if (dur > 30) s += 10;
  else if (dur > 0) s += 5;
  const ld = localData[c._uid];
  if (ld) {
    const bs = ld.bookingStatus || "Not Booked";
    if (bs === "Booked") s += 30;
    else if (bs === "Interested") s += 20;
    else if (bs === "Follow Up") s += 10;
    if (ld.followUpCount > 0) s += Math.min(ld.followUpCount * 3, 15);
    if (ld.outcome === "Interested") s += 10;
    else if (ld.outcome === "Connected") s += 5;
    else if (ld.outcome === "Not Interested") s -= 15;
  }
  return Math.max(0, Math.min(s, 100));
};

const scoreColor = (s) =>
  s >= 80 ? "#16a34a" : s >= 60 ? "#2563eb" : s >= 40 ? "#d97706" : "#dc2626";
const scoreLabel = (s) =>
  s >= 80 ? "Hot 🔥" : s >= 60 ? "Warm ☀️" : s >= 40 ? "Lukewarm 🌤️" : "Cold ❄️";

// ─── Communication Utilities ──────────────────────────────────────────────────
const callVisitor = (phone, countryCode = "+91") => {
  if (!phone) return;
  window.location.href = `tel:${countryCode}${phone}`.replace(/\s+/g, "");
};

const whatsappVisitor = (phone, name, countryCode = "+91", template = null) => {
  if (!phone) return;
  const cleanCode = countryCode.replace("+", "");
  const fullNumber = `${cleanCode}${phone}`.replace(/\s+/g, "");
  const message = template
    ? encodeURIComponent(template.replace("{name}", name || ""))
    : encodeURIComponent(`Hello ${name || ""}! Thank you for connecting with us.`);
  window.open(`https://wa.me/${fullNumber}?text=${message}`, "_blank");
};

const copyPhone = async (phone, countryCode = "+91") => {
  if (!phone) return;
  try {
    await navigator.clipboard.writeText(`${countryCode} ${phone}`);
    showToast("Phone number copied!", "success");
  } catch { showToast("Failed to copy", "error"); }
};

// ─── AI Suggestion Hook ───────────────────────────────────────────────────────
const useAISuggestion = () => {
  const [suggestion, setSuggestion] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const getAISuggestion = async (callData, localData) => {
    setLoadingAI(true);
    setSuggestion(null);
    try {
      const summary = {
        name: getDisplayName(callData),
        phone: getDisplayNumber(callData),
        status: callData.call_status || "Unknown",
        direction: callData.direction || "Unknown",
        duration: fmtDuration(callData.duration || callData.call_duration || 0),
        agent: callData.answered_agent_name || "Unknown",
        bookingStatus: localData?.bookingStatus || "Not Booked",
        followUpCount: localData?.followUpCount || 0,
        lastOutcome: localData?.outcome || "None",
        lastRemarks: localData?.remarks || "None",
      };
      const response = await fetch("", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "",
          "HTTP-Referer": "",
          "X-Title": "Site Visit",
        },
        body: JSON.stringify({
          model: "minimax/minimax-m2.5:free",
          max_tokens: 1000,
          temperature: 0.4,
          messages: [{
            role: "user",
            content: `You are an expert real estate sales coach.\nAnalyze this lead data and return STRICT VALID JSON only.\nNo markdown. No explanation. No code block.\n\nLead Data:\n${JSON.stringify(summary)}\n\nReturn exactly this format:\n{\n  "priority": "High|Medium|Low",\n  "recommendedAction": "brief action text",\n  "bestTime": "suggested time to call",\n  "talkingPoints": ["point 1","point 2","point 3"],\n  "suggestedMethod": "Call|WhatsApp|Email|Site Visit",\n  "suggestedOutcome": "expected outcome",\n  "warningFlags": ["flag if any"],\n  "motivationalNote": "one line encouragement",\n  "sampleOpener": "sample conversation opener"\n}`,
          }],
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(raw);
      const data = JSON.parse(raw);
      const text = data?.choices?.[0]?.message?.content || "";
      const clean = text.replace(/```json|```/gi, "").trim();
      if (!clean) throw new Error("Empty");
      let parsed;
      try { parsed = JSON.parse(clean); }
      catch {
        parsed = {
          priority: "Medium",
          recommendedAction: clean,
          bestTime: "Tomorrow 11:00 AM",
          talkingPoints: ["Reconnect politely", "Ask interest level", "Offer site visit"],
          suggestedMethod: "Call",
          suggestedOutcome: "Lead re-engagement",
          warningFlags: [],
          motivationalNote: "Consistency converts leads.",
          sampleOpener: "Hello, just following up regarding your inquiry.",
        };
      }
      setSuggestion(parsed);
    } catch (err) {
      console.error("AI error:", err);
      showToast("Could not fetch AI suggestion", "warning");
    } finally {
      setLoadingAI(false);
    }
  };

  return { suggestion, loadingAI, getAISuggestion, clearSuggestion: () => setSuggestion(null) };
};

// ─── Voice Recorder Hook ──────────────────────────────────────────────────────
const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      showToast("Microphone access denied", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const fmtTime = (secs) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;

  return {
    isRecording, audioBlob, audioUrl, recordingTime,
    startRecording, stopRecording, clearRecording, fmtTime,
  };
};

// ─── CAT CONFIG ───────────────────────────────────────────────────────────────
const CAT_CFG = {
  missed:   { color: "#dc2626", bg: "#dc262614", icon: "🚨", label: "Missed" },
  answered: { color: "#16a34a", bg: "#16a34a14", icon: "✅", label: "Answered" },
  busy:     { color: "#d97706", bg: "#d9770614", icon: "⏰", label: "Busy" },
  inbound:  { color: "#2563eb", bg: "#2563eb14", icon: "↙️", label: "Inbound" },
  outbound: { color: "#7c3aed", bg: "#7c3aed14", icon: "↗️", label: "Outbound" },
  other:    { color: "#64748b", bg: "#64748b14", icon: "📞", label: "Other" },
};

const categorizeCall = (c) => {
  if (isMissedCall(c)) return "missed";
  if (isAnsweredCall(c)) return "answered";
  if (norm(c.call_status) === "busy") return "busy";
  return "other";
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIZED DATA FETCHING HOOK
// ═══════════════════════════════════════════════════════════════════════════════
const useCallLogs = () => {
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const cursorRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(async ({
    page = 1,
    cursor = null,
    useCache = true,
    append = false,
  } = {}) => {
    if (document.hidden) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (useCache && page === 1 && !append) {
      const cached = readCache();
      if (cached) {
        setCallLogs(cached.data);
        cursorRef.current = cached.cursor;
        setLoading(false);
        isFetchingRef.current = false;
        return;
      }
    }

    append ? setIsFetchingMore(true) : setLoading(true);

    try {
      const params = new URLSearchParams({ page, limit: PAGE_LIMIT });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${API}/call-logs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const newData = Array.isArray(json) ? json : (json.data ?? []);
      const nextCursor = json.nextCursor ?? null;
      const more = Array.isArray(json)
        ? newData.length === PAGE_LIMIT
        : (json.hasMore ?? false);

      cursorRef.current = nextCursor;
      setHasMore(more);

      if (append) {
        setCallLogs((prev) => {
          const existingIds = new Set(prev.map((c) => c._id || c.id || c._uid));
          const fresh = newData.filter((c) => !existingIds.has(c._id || c.id));
          return [...prev, ...fresh];
        });
      } else {
        setCallLogs(newData);
        writeCache(newData, nextCursor);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      showToast("Could not load call logs", "error");
    } finally {
      append ? setIsFetchingMore(false) : setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPage({ page: 1, useCache: true });
  }, [fetchPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      invalidateCache();
      fetchPage({ page: 1, useCache: false });
    }, CACHE_TTL);
    return () => clearInterval(interval);
  }, [fetchPage]);

  const refresh = useCallback(() => {
    invalidateCache();
    cursorRef.current = null;
    setCurrentPage(1);
    setHasMore(true);
    fetchPage({ page: 1, useCache: false });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isFetchingMore || isFetchingRef.current) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchPage({
      page: nextPage,
      cursor: cursorRef.current,
      useCache: false,
      append: true,
    });
  }, [hasMore, isFetchingMore, currentPage, fetchPage]);

  return { callLogs, loading, isFetchingMore, hasMore, refresh, loadMore };
};

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT NAME MODAL
// ═══════════════════════════════════════════════════════════════════════════════
const EditNameModal = ({ data, onClose, onSave }) => {
  const [name, setName] = useState(data.currentName || "");
  const [applyToAll, setApplyToAll] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), data.number, applyToAll);
    onClose();
  };

  return (
    <div
      className="fu-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fu-modal" style={{ maxWidth: 400 }}>
        <div className="fu-modal-header">
          <h3>✏️ Edit Customer Name</h3>
          <button className="fu-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="fu-modal-body">
          <p style={{ fontSize: "0.82rem", color: "var(--fu-muted)", marginBottom: 12 }}>
            Number: <strong>{data.number}</strong>
          </p>
          <div className="fu-field">
            <label>Customer Name</label>
            <input
              ref={inputRef}
              type="text"
              placeholder="Enter name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          {/* Apply-to-all toggle */}
          <div className="fu-field" style={{ marginTop: 10 }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
                padding: "10px 12px",
                background: "rgba(22,163,74,0.06)",
                border: "1px solid rgba(22,163,74,0.25)",
                borderRadius: 8,
                fontSize: "0.83rem",
                lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                style={{ marginTop: 2, accentColor: "#16a34a", flexShrink: 0 }}
              />
              <span>
                Apply to <strong>all calls</strong> from this number
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--fu-muted)", marginTop: 2 }}>
                  ({data.number}) — zero extra server reads
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="fu-modal-footer">
          <button className="fu-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="fu-btn primary"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            💾 Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FollowUps() {
  const searchRef = useRef(null);
  const { suggestion, loadingAI, getAISuggestion, clearSuggestion } = useAISuggestion();
  const voiceRecorder = useVoiceRecorder();

  const { callLogs, loading, isFetchingMore, hasMore, refresh, loadMore } = useCallLogs();

  // ── nameMap state — triggers re-render of all cards when a name is saved ──
  // Initialised from localStorage so it's instant (no API call)
  const [nameMap, setNameMap] = useState(() => _getNameMap());

  // ── UI State ──
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("fu_dark") === "true");
  const [compactView, setCompactView] = useState(() => localStorage.getItem("fu_compact") === "true");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("fu_viewMode") || "list");
  const [showStats, setShowStats] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showWATemplates, setShowWATemplates] = useState(null);
  const [showAIModal, setShowAIModal] = useState(null);
  const [aiCallData, setAiCallData] = useState(null);
  const [showVoiceNote, setShowVoiceNote] = useState(null);
  const [voiceNotes, setVoiceNotes] = useState({});
  const [showTimeline, setShowTimeline] = useState(null);
  const [showTagModal, setShowTagModal] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [showReminder, setShowReminder] = useState(null);
  const [notification, setNotification] = useState(null);
  const [calDate, setCalDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calSelItems, setCalSelItems] = useState(null);
  const [bulkSel, setBulkSel] = useState({});

  // ── Edit Name Modal state ──
  const [editNameModal, setEditNameModal] = useState(null);
  // { currentName, number, uid }

  // ── Local persistent data ──
  const [localData, setLocalData] = useState(() =>
    JSON.parse(localStorage.getItem("fu_localData") || "{}")
  );
  const [tags, setTags] = useState(() =>
    JSON.parse(localStorage.getItem("fu_tags") || "{}")
  );
  const [completedIds, setCompletedIds] = useState(() =>
    new Set(JSON.parse(localStorage.getItem("fu_done") || "[]"))
  );
  const [snoozed, setSnoozed] = useState(() =>
    JSON.parse(localStorage.getItem("fu_snooze") || "{}")
  );
  const [reminders, setReminders] = useState(() =>
    JSON.parse(localStorage.getItem("fu_reminders") || "[]")
  );
  const [reminderForm, setReminderForm] = useState({
    date: toInputDate(), time: toInputTime(), note: "",
  });
  const [notifPerm, setNotifPerm] = useState("default");

  const defaultForm = {
    method: "Call", outcome: "", remarks: "",
    bookingStatus: "Not Booked",
    nextDate: toInputDate(new Date(Date.now() + 86400000)),
    nextTime: "10:00", noNext: false,
  };
  const [form, setForm] = useState(defaultForm);
  const [bulkForm, setBulkForm] = useState({
    method: "Call", outcome: "Follow Up Done",
    remarks: "Bulk follow-up processed",
    nextDate: toInputDate(new Date(Date.now() + 86400000)),
    nextTime: "10:00",
  });

  // ── Persist preferences ──
  useEffect(() => {
    localStorage.setItem("fu_dark", darkMode);
    document.body.classList.toggle("fu-dark", darkMode);
  }, [darkMode]);
  useEffect(() => { localStorage.setItem("fu_compact", compactView); }, [compactView]);
  useEffect(() => { localStorage.setItem("fu_viewMode", viewMode); }, [viewMode]);
  useEffect(() => {
    localStorage.setItem("fu_done", JSON.stringify([...completedIds]));
  }, [completedIds]);
  useEffect(() => { localStorage.setItem("fu_snooze", JSON.stringify(snoozed)); }, [snoozed]);
  useEffect(() => { localStorage.setItem("fu_tags", JSON.stringify(tags)); }, [tags]);
  useEffect(() => { localStorage.setItem("fu_localData", JSON.stringify(localData)); }, [localData]);
  useEffect(() => { setPage(1); }, [filter, search, sortBy]);

  // ── Notifications ──
  useEffect(() => {
    if ("Notification" in window)
      Notification.requestPermission().then((p) => setNotifPerm(p));
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const due = reminders.filter(
        (r) => !r.dismissed && new Date(`${r.date}T${r.time}`) <= now
      );
      due.forEach((r) => {
        if (notifPerm === "granted")
          new Notification(`Follow-up Reminder: ${r.name}`, {
            body: r.note || "Time for your scheduled follow-up!",
          });
        showToast(`⏰ Reminder: ${r.name} - ${r.note || "Follow-up due!"}`, "info");
        setReminders((prev) => {
          const u = prev.map((rem) =>
            rem.id === r.id ? { ...rem, dismissed: true } : rem
          );
          localStorage.setItem("fu_reminders", JSON.stringify(u));
          return u;
        });
      });
    };
    const interval = setInterval(check, 60000);
    check();
    return () => clearInterval(interval);
  }, [reminders, notifPerm]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") { e.target.blur(); setExpanded(null); }
        return;
      }
      if (e.key === "/" && !e.altKey) {
        e.preventDefault(); searchRef.current?.focus(); return;
      }
      if (!e.altKey) return;
      switch (e.key) {
        case "s": case "S": e.preventDefault(); setShowStats((p) => !p); break;
        case "c": case "C": e.preventDefault(); setViewMode((p) => p === "calendar" ? "list" : "calendar"); break;
        case "k": case "K": e.preventDefault(); setViewMode((p) => p === "kanban" ? "list" : "kanban"); break;
        case "e": case "E": e.preventDefault(); setShowExport(true); break;
        case "d": case "D": e.preventDefault(); setDarkMode((p) => !p); break;
        case "b": case "B": e.preventDefault(); setShowBulk((p) => !p); break;
        case "l": case "L": e.preventDefault(); setShowLeaderboard((p) => !p); break;
        case "r": case "R": e.preventDefault(); refresh(); break;
        default: break;
      }
      if (e.key === "Escape") {
        setExpanded(null); setShowExport(false); setShowShortcuts(false);
        setEditNameModal(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── Enrich logs with stable UIDs + resolved display name ──────────────────
  // nameMap is a dependency so all cards re-render when any name is saved
  const enrichedLogs = useMemo(() =>
    callLogs.map((c, i) => {
      const num = getDisplayNumber(c);
      const uid = `${num}-${safeTs(c)}-${i}`;

      // resolveCallDisplayName reads from the same nameMap object in memory
      // so this recalculates instantly when nameMap state changes
      const savedName = resolveCallDisplayName({ ...c, _nameMapHint: nameMap });
      const displayName = savedName || (c.name && c.name.trim()) || num || "Unknown";

      return {
        ...c,
        _uid: uid,
        _num: num,
        _name: displayName,     // ← resolved name used everywhere
        _ts: safeTs(c),
        _savedName: savedName,  // track if name came from nameMap
      };
    }),
  [callLogs, nameMap]); // re-run when nameMap changes

  // ── Counts ──
  const counts = useMemo(() => ({
    total: enrichedLogs.length,
    answered: enrichedLogs.filter(isAnsweredCall).length,
    missed: enrichedLogs.filter(isMissedCall).length,
    inbound: enrichedLogs.filter((c) => norm(c.direction) === "inbound").length,
    outbound: enrichedLogs.filter((c) => norm(c.direction) === "outbound").length,
    busy: enrichedLogs.filter((c) => norm(c.call_status) === "busy").length,
    completed: enrichedLogs.filter((c) => completedIds.has(c._uid)).length,
  }), [enrichedLogs, completedIds]);

  // ── Filtered + Sorted ──
  const filtered = useMemo(() => {
    let rows = [...enrichedLogs];

    if (filter === "missed") rows = rows.filter(isMissedCall);
    else if (filter === "answered") rows = rows.filter(isAnsweredCall);
    else if (filter === "inbound") rows = rows.filter((c) => norm(c.direction) === "inbound");
    else if (filter === "outbound") rows = rows.filter((c) => norm(c.direction) === "outbound");
    else if (filter === "busy") rows = rows.filter((c) => norm(c.call_status) === "busy");
    else if (filter === "completed") rows = rows.filter((c) => completedIds.has(c._uid));

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) =>
        // _name already includes saved name so search works on it too
        c._name.toLowerCase().includes(q) ||
        c._num.includes(q) ||
        (c.answered_agent_name || "").toLowerCase().includes(q) ||
        (c.call_status || "").toLowerCase().includes(q) ||
        (tags[c._uid] || []).join(" ").toLowerCase().includes(q) ||
        (localData[c._uid]?.remarks || "").toLowerCase().includes(q)
      );
    }

    if (selectedDate) {
      rows = rows.filter((c) => c._ts && toInputDate(new Date(c._ts)) === selectedDate);
    }

    rows = rows.map((c) => ({
      ...c,
      _cat: categorizeCall(c),
      _score: calcCallScore(c, localData),
      _isDone: completedIds.has(c._uid),
      _localData: localData[c._uid] || null,
    }));

    switch (sortBy) {
      case "latest":    rows.sort((a, b) => b._ts - a._ts); break;
      case "oldest":    rows.sort((a, b) => a._ts - b._ts); break;
      case "nameAsc":   rows.sort((a, b) => a._name.localeCompare(b._name)); break;
      case "nameDesc":  rows.sort((a, b) => b._name.localeCompare(a._name)); break;
      case "scoreDesc": rows.sort((a, b) => b._score - a._score); break;
      default: break;
    }

    return rows;
  }, [enrichedLogs, filter, search, sortBy, selectedDate, localData, completedIds, tags]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  // ── Local data helpers ──
  const updateLocalData = useCallback((uid, updates) => {
    setLocalData((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] || {}), ...updates },
    }));
  }, []);

  const markComplete = useCallback((uid) => {
    setCompletedIds((prev) => {
      const n = new Set(prev);
      n.has(uid) ? n.delete(uid) : n.add(uid);
      return n;
    });
    showToast(completedIds.has(uid) ? "Reopened!" : "Marked complete!", "success");
  }, [completedIds]);

  const snoozeItem = useCallback((uid, hours) => {
    setSnoozed((prev) => ({
      ...prev,
      [uid]: new Date(Date.now() + hours * 3600000).toISOString(),
    }));
    showToast(`Snoozed for ${hours}h`, "success");
  }, []);

  const addTag = (uid) => {
    if (!tagInput.trim()) return;
    setTags((prev) => ({ ...prev, [uid]: [...(prev[uid] || []), tagInput.trim()] }));
    setTagInput("");
  };

  const removeTag = (uid, tag) =>
    setTags((prev) => ({ ...prev, [uid]: (prev[uid] || []).filter((t) => t !== tag) }));

  const addReminder = (callItem) => {
    const r = {
      id: Date.now(), uid: callItem._uid,
      name: callItem._name, phone: callItem._num,
      date: reminderForm.date, time: reminderForm.time,
      note: reminderForm.note, dismissed: false,
    };
    const updated = [...reminders, r];
    setReminders(updated);
    localStorage.setItem("fu_reminders", JSON.stringify(updated));
    setShowReminder(null);
    setReminderForm({ date: toInputDate(), time: toInputTime(), note: "" });
    showToast("Reminder set!", "success");
  };

  // ── SAVE NAME for a number ────────────────────────────────────────────────
  // Called from EditNameModal — ONE localStorage write, zero Firebase reads.
  // All cards with the same number re-render via nameMap state change.
  const handleSaveName = useCallback((name, number, applyToAll) => {
    if (applyToAll && number) {
      // Persist to shared localStorage map
      persistNameForNumber(number, name);
      // Sync React state → triggers re-render of ALL enrichedLogs
      setNameMap(_getNameMap());
    }
    showToast(
      applyToAll
        ? `✅ "${name}" saved for all calls from ${cleanNum(number)}`
        : `✅ Name saved`,
      "success"
    );
  }, []);

  // ── Save Follow-up ──
  const handleSaveFollowUp = (callItem) => {
    const { method, outcome, remarks, bookingStatus } = form;
    if (!outcome) { showToast("Please select outcome", "warning"); return; }
    if (!remarks.trim()) { showToast("Please write remarks", "warning"); return; }

    const existing = localData[callItem._uid] || {};
    const history = existing.history || [];
    history.unshift({
      method, outcome, remarks: remarks.trim(), bookingStatus,
      createdAt: Date.now(), agent: callItem.answered_agent_name || "Agent",
    });

    updateLocalData(callItem._uid, {
      bookingStatus, outcome, remarks: remarks.trim(), method,
      followUpCount: (existing.followUpCount || 0) + 1,
      history, lastFollowUpAt: Date.now(),
    });

    if (voiceRecorder.audioBlob) {
      const reader = new FileReader();
      reader.onload = (e) =>
        setVoiceNotes((prev) => ({
          ...prev,
          [callItem._uid]: { url: e.target.result, duration: voiceRecorder.recordingTime },
        }));
      reader.readAsDataURL(voiceRecorder.audioBlob);
      voiceRecorder.clearRecording();
    }

    showToast("Follow-up saved!", "success");
    setExpanded(null);
    setForm(defaultForm);
  };

  // ── Bulk follow-ups ──
  const processBulkFollowUps = () => {
    const ids = Object.keys(bulkSel).filter((id) => bulkSel[id]);
    if (!ids.length) { showToast("No records selected", "warning"); return; }
    if (!bulkForm.outcome) { showToast("Select outcome", "error"); return; }
    if (!bulkForm.remarks.trim()) { showToast("Enter remarks", "error"); return; }

    ids.forEach((uid) => {
      const existing = localData[uid] || {};
      const history = existing.history || [];
      history.unshift({
        method: bulkForm.method, outcome: bulkForm.outcome,
        remarks: bulkForm.remarks.trim(), bookingStatus: existing.bookingStatus || "Not Booked",
        createdAt: Date.now(), agent: "Bulk", isBulk: true,
      });
      updateLocalData(uid, {
        outcome: bulkForm.outcome, remarks: bulkForm.remarks.trim(),
        method: bulkForm.method,
        followUpCount: (existing.followUpCount || 0) + 1,
        history, lastFollowUpAt: Date.now(),
      });
    });

    showToast(`${ids.length} follow-ups updated!`, "success");
    setBulkSel({});
    setShowBulk(false);
  };

  const selectedCount = useMemo(
    () => Object.values(bulkSel).filter(Boolean).length,
    [bulkSel]
  );

  // ── Export ──
  const exportData = () => {
    try {
      const rows = filtered.map((c) => ({
        Direction: c.direction || "",
        Name: c._name,
        Number: c._num,
        Status: c.call_status || "",
        Agent: c.answered_agent_name || c.agent_name || "",
        Duration: fmtDuration(c.duration || c.call_duration || 0),
        DateTime: fmtDateTime(c),
        LeadScore: c._score,
        BookingStatus: c._localData?.bookingStatus || "Not Booked",
        LastOutcome: c._localData?.outcome || "",
        LastRemarks: c._localData?.remarks || "",
        FollowUpCount: c._localData?.followUpCount || 0,
        Tags: (tags[c._uid] || []).join(", "),
      }));
      if (exportFormat === "excel") {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Call Logs");
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        saveAs(
          new Blob([buf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `followups-${toInputDate()}.xlsx`
        );
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        saveAs(
          new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }),
          `followups-${toInputDate()}.csv`
        );
      }
      showToast(`Exported ${rows.length} records`, "success");
      setShowExport(false);
    } catch { showToast("Export failed", "error"); }
  };

  // ── Agent stats ──
  const agentStats = useMemo(() => {
    const s = {};
    enrichedLogs.forEach((c) => {
      const agent = c.answered_agent_name || c.agent_name || "";
      if (!agent.trim()) return;
      if (!s[agent]) s[agent] = { total: 0, answered: 0, missed: 0, totalDuration: 0 };
      s[agent].total++;
      if (isAnsweredCall(c)) s[agent].answered++;
      if (isMissedCall(c)) s[agent].missed++;
      s[agent].totalDuration += Number(c.duration || c.call_duration || 0);
    });
    return s;
  }, [enrichedLogs]);

  const leaderboard = useMemo(() =>
    Object.entries(agentStats)
      .map(([name, stats]) => ({
        name, ...stats,
        answerRate: stats.total > 0 ? (stats.answered / stats.total * 100) : 0,
        performanceScore: (stats.answered * 10) + Math.floor(stats.totalDuration / 60),
      }))
      .sort((a, b) => b.performanceScore - a.performanceScore),
  [agentStats]);

  // ── Calendar data ──
  const calData = useMemo(() => {
    const m = {};
    enrichedLogs.forEach((c) => {
      if (!c._ts) return;
      const k = toInputDate(new Date(c._ts));
      if (!m[k]) m[k] = [];
      m[k].push(c);
    });
    return m;
  }, [enrichedLogs]);

  // ── Activity feed ──
  const activityFeed = useMemo(() =>
    enrichedLogs.slice(0, 20).map((c) => ({
      uid: c._uid, name: c._name,
      agent: c.answered_agent_name || c.agent_name || "",
      status: c.call_status || "",
      direction: c.direction || "",
      ts: c._ts,
    })),
  [enrichedLogs]);

  // ── Badge helpers ──
  const badgeClass = (status) => {
    switch (status) {
      case "Booked":    return "fu-badge-status booked";
      case "Interested": return "fu-badge-status interested";
      case "Follow Up": return "fu-badge-status follow";
      case "Cancelled": return "fu-badge-status cancelled";
      default:          return "fu-badge-status notbooked";
    }
  };

  const outcomeBadgeClass = (o) => {
    const l = (o || "").toLowerCase();
    if (l.includes("connected") || l.includes("interested")) return "fu-outcome-badge success";
    if (l.includes("call later") || l.includes("follow")) return "fu-outcome-badge warning";
    if (l.includes("not reachable") || l.includes("wrong")) return "fu-outcome-badge danger";
    if (l.includes("visited") || l.includes("will visit")) return "fu-outcome-badge primary";
    return "fu-outcome-badge default";
  };

  // ═══ RENDER SECTIONS ═══════════════════════════════════════════════════════

  const renderAnalytics = () => {
    if (!showStats) return null;
    const byStatus = {};
    ["answered", "missed", "busy", "other"].forEach((s) => {
      byStatus[s] = enrichedLogs.filter((c) => categorizeCall(c) === s).length;
    });
    const byDirection = { inbound: counts.inbound, outbound: counts.outbound };
    const topAgents = Object.entries(agentStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    return (
      <div className="fu-analytics">
        <div className="fu-analytics-header">
          <h3>📊 Analytics Overview</h3>
          <button className="fu-close-btn" onClick={() => setShowStats(false)}>✕</button>
        </div>
        <div className="fu-analytics-grid">
          <div className="fu-analytics-card">
            <h4>Call Status Distribution</h4>
            {Object.entries(byStatus).map(([s, cnt]) => {
              const pct = enrichedLogs.length ? Math.round(cnt / enrichedLogs.length * 100) : 0;
              const cfg = CAT_CFG[s] || CAT_CFG.other;
              return (
                <div key={s} className="fu-chart-bar-row">
                  <span className="fu-chart-bar-label">{cfg.icon} {cfg.label}</span>
                  <div className="fu-chart-bar-track">
                    <div className="fu-chart-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                  </div>
                  <span className="fu-chart-bar-cnt">{cnt} ({pct}%)</span>
                </div>
              );
            })}
          </div>

          <div className="fu-analytics-card">
            <h4>Direction Distribution</h4>
            {Object.entries(byDirection).map(([d, cnt]) => {
              const pct = enrichedLogs.length ? Math.round(cnt / enrichedLogs.length * 100) : 0;
              return (
                <div key={d} className="fu-chart-bar-row">
                  <span className="fu-chart-bar-label">
                    {d === "inbound" ? "↙️ Inbound" : "↗️ Outbound"}
                  </span>
                  <div className="fu-chart-bar-track">
                    <div className="fu-chart-bar-fill"
                      style={{ width: `${pct}%`, background: d === "inbound" ? "#2563eb" : "#d97706" }} />
                  </div>
                  <span className="fu-chart-bar-cnt">{cnt} ({pct}%)</span>
                </div>
              );
            })}
          </div>

          <div className="fu-analytics-card fu-analytics-card--full">
            <h4>Agent Performance</h4>
            <div className="fu-agent-grid">
              {topAgents.map(([name, stats], i) => {
                const medals = ["🥇", "🥈", "🥉"];
                const pct = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
                return (
                  <div key={name} className="fu-agent-card">
                    <div className="fu-agent-rank">{i < 3 ? medals[i] : `#${i + 1}`}</div>
                    <div className="fu-agent-name">{name}</div>
                    <div className="fu-agent-stats">
                      <span>📊 {stats.total}</span>
                      <span>✅ {stats.answered}</span>
                      <span>🎯 {pct}%</span>
                    </div>
                    <div className="fu-agent-bar-track">
                      <div className="fu-agent-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    if (!showLeaderboard) return null;
    const medals = ["🥇", "🥈", "🥉"];
    return (
      <div className="fu-leaderboard-panel">
        <div className="fu-leaderboard-header">
          <h3>🏆 Performance Leaderboard</h3>
          <button onClick={() => setShowLeaderboard(false)} className="fu-close-btn">×</button>
        </div>
        <div className="fu-leaderboard-list">
          {leaderboard.map((exec, i) => (
            <div key={exec.name} className={`fu-leaderboard-item ${i < 3 ? "top-" + (i + 1) : ""}`}>
              <div className="fu-lb-rank">{i < 3 ? medals[i] : `#${i + 1}`}</div>
              <div className="fu-lb-info">
                <div className="fu-lb-name">{exec.name}</div>
                <div className="fu-lb-stats">
                  <span>📊 {exec.total} calls</span>
                  <span>✅ {exec.answered} answered</span>
                  <span>📵 {exec.missed} missed</span>
                  <span>⏱ {fmtDuration(exec.totalDuration)}</span>
                </div>
              </div>
              <div className="fu-lb-score">
                <div className="fu-lb-score-val">{exec.performanceScore}</div>
                <div className="fu-lb-score-label">pts</div>
              </div>
              <div className="fu-lb-bars">
                <div className="fu-lb-bar-wrap">
                  <div className="fu-lb-bar-fill"
                    style={{
                      width: `${exec.answerRate.toFixed(0)}%`,
                      background: "linear-gradient(90deg,#16a34a,#22c55e)",
                    }} />
                  <span>{exec.answerRate.toFixed(1)}% answer</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderActivityFeed = () => {
    if (!showActivityFeed) return null;
    return (
      <div className="fu-activity-feed">
        <div className="fu-activity-header">
          <h3>📡 Live Activity Feed</h3>
          <button onClick={() => setShowActivityFeed(false)} className="fu-close-btn">×</button>
        </div>
        <div className="fu-activity-list">
          {activityFeed.length === 0
            ? <div className="fu-activity-empty">No recent activity</div>
            : activityFeed.map((item, i) => (
              <div key={item.uid + i} className="fu-activity-item">
                <div className="fu-activity-dot" style={{ background: getStatusColor(item.status) }} />
                <div className="fu-activity-content">
                  <div className="fu-activity-title">
                    <strong>{item.name}</strong>
                    <span className="fu-cl-status-pill"
                      style={{
                        color: getStatusColor(item.status),
                        background: getStatusColor(item.status) + "18",
                        borderColor: getStatusColor(item.status) + "40",
                        padding: "2px 8px", fontSize: "0.68rem",
                      }}>
                      {item.status}
                    </span>
                  </div>
                  <div className="fu-activity-meta">
                    <span>👤 {item.agent || "—"}</span>
                    <span>{item.direction === "inbound" ? "↙️ In" : "↗️ Out"}</span>
                    <span>🕐 {fmtTimeAgo(item.ts)}</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    if (viewMode !== "calendar") return null;
    const year = calDate.getFullYear(), month = calDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];

    return (
      <div className="fu-calendar-wrap">
        <div className="fu-cal-nav">
          <button className="fu-cal-nav-btn" onClick={() => setCalDate(new Date(year, month - 1, 1))}>‹</button>
          <span className="fu-cal-month-label">{monthNames[month]} {year}</span>
          <button className="fu-cal-nav-btn" onClick={() => setCalDate(new Date(year, month + 1, 1))}>›</button>
          <button className="fu-cal-nav-btn fu-cal-today-btn"
            onClick={() => { setCalDate(new Date()); setSelectedDate(null); }}>Today</button>
          {selectedDate && (
            <button className="fu-btn-sm ghost"
              onClick={() => { setSelectedDate(null); setCalSelItems(null); }}>✕ Clear</button>
          )}
        </div>
        <div className="fu-cal-grid">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="fu-cal-day-hdr">{d}</div>
          ))}
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="fu-cal-cell fu-cal-cell--empty" />;
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const dayItems = calData[dateStr] || [];
            const isToday = isSameDay(new Date(year, month, day), new Date());
            const isSel = selectedDate === dateStr;
            return (
              <div key={idx}
                className={`fu-cal-cell ${isToday ? "fu-cal-cell--today" : ""} ${dayItems.length ? "fu-cal-cell--has" : ""} ${isSel ? "fu-cal-cell--selected" : ""}`}
                onClick={() => {
                  if (isSel) { setSelectedDate(null); setCalSelItems(null); }
                  else { setSelectedDate(dateStr); setCalSelItems(dayItems); }
                }}>
                <span className="fu-cal-day-num">{day}</span>
                {dayItems.length > 0 && (
                  <div className="fu-cal-events">
                    {dayItems.slice(0, 3).map((c, j) => {
                      const cfg = CAT_CFG[categorizeCall(c)] || CAT_CFG.other;
                      return (
                        <div key={j} className="fu-cal-event"
                          style={{
                            background: cfg.color + "18",
                            color: cfg.color,
                            borderLeft: `3px solid ${cfg.color}`,
                          }}>
                          <span className="fu-cal-ev-name">{c._name.slice(0, 10)}</span>
                        </div>
                      );
                    })}
                    {dayItems.length > 3 && <span className="fu-cal-more">+{dayItems.length - 3}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedDate && calSelItems && (
          <div className="fu-cal-selected-list">
            <h4 className="fu-cal-sel-title">
              📅 Calls on {selectedDate} ({calSelItems.length})
            </h4>
            {calSelItems.map((c, i) => {
              const cfg = CAT_CFG[categorizeCall(c)] || CAT_CFG.other;
              return (
                <div key={i} className="fu-mini-card" style={{ borderLeftColor: cfg.color }}>
                  <div className="fu-mini-card-top">
                    <span className="fu-mini-name">{c._name}</span>
                    <span className="fu-cl-status-pill"
                      style={{
                        color: cfg.color, background: cfg.color + "18",
                        borderColor: cfg.color + "40",
                        fontSize: "0.68rem", padding: "2px 8px",
                      }}>
                      {c.call_status}
                    </span>
                  </div>
                  <div className="fu-mini-meta">
                    <span>📞 {c._num}</span>
                    <span>👤 {c.answered_agent_name || "—"}</span>
                    <span>{fmtDuration(c.duration || c.call_duration || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const kanbanCols = ["missed", "answered", "busy", "other"];
  const kanbanLabels = {
    missed: "📵 Missed", answered: "✅ Answered",
    busy: "⏰ Busy", other: "📞 Other",
  };

  const renderKanban = () => {
    if (viewMode !== "kanban") return null;
    return (
      <div className="fu-kanban">
        {kanbanCols.map((col) => {
          const colItems = filtered.filter((c) => c._cat === col);
          const cfg = CAT_CFG[col] || CAT_CFG.other;
          return (
            <div key={col} className="fu-kanban-col">
              <div className="fu-kanban-col-hdr" style={{ borderTopColor: cfg.color }}>
                <span style={{ color: cfg.color }}>{kanbanLabels[col]}</span>
                <span className="fu-kanban-count"
                  style={{ background: cfg.color + "20", color: cfg.color }}>
                  {colItems.length}
                </span>
              </div>
              <div className="fu-kanban-col-body">
                {colItems.length === 0 && <div className="fu-kanban-empty">No calls</div>}
                {colItems.slice(0, 20).map((c) => {
                  const score = c._score;
                  return (
                    <div key={c._uid}
                      className={`fu-kanban-card ${c._isDone ? "fu-kanban-card--done" : ""}`}
                      style={{ borderLeftColor: cfg.color }}>
                      <div className="fu-kc-score-bar"
                        style={{ "--sw": `${score}%`, "--sc": scoreColor(score) }} />
                      <div className="fu-kc-top">
                        <span className="fu-kc-name">{c._name}</span>
                        <span className="fu-kc-score-badge"
                          style={{ background: scoreColor(score) + "18", color: scoreColor(score) }}>
                          {score}
                        </span>
                      </div>
                      <div className="fu-kc-phone">{c._num}</div>
                      <div className="fu-kc-agent">👤 {c.answered_agent_name || "—"}</div>
                      <div className="fu-kc-next" style={{ color: cfg.color }}>{fmtDateTime(c)}</div>
                      {c._localData?.remarks && (
                        <div className="fu-kc-remark">{c._localData.remarks.slice(0, 60)}</div>
                      )}
                      <div className="fu-kc-actions">
                        <button className="fu-kc-btn"
                          onClick={() => callVisitor(cleanNum(c._num))} title="Call">📞</button>
                        <button className="fu-kc-btn"
                          onClick={() => setShowWATemplates(c)} title="WhatsApp">💬</button>
                        <button className="fu-kc-btn"
                          onClick={() => markComplete(c._uid)}
                          title={c._isDone ? "Reopen" : "Done"}>
                          {c._isDone ? "↩" : "✓"}
                        </button>
                        {/* Edit name button in kanban */}
                        <button className="fu-kc-btn"
                          title="Edit Name"
                          onClick={() => setEditNameModal({
                            currentName: c._name,
                            number: c._num,
                            uid: c._uid,
                          })}>✎</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ═══ MODALS ════════════════════════════════════════════════════════════════

  const renderAIModal = () => {
    if (!showAIModal) return null;
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && (setShowAIModal(null), clearSuggestion())}>
        <div className="fu-modal fu-ai-modal">
          <div className="fu-modal-header">
            <h3>🤖 AI Follow-up Strategy</h3>
            <button className="fu-modal-close"
              onClick={() => { setShowAIModal(null); clearSuggestion(); }}>×</button>
          </div>
          <div className="fu-modal-body">
            {loadingAI ? (
              <div className="fu-ai-loading">
                <div className="fu-ai-spinner" /><p>Analyzing lead data...</p>
              </div>
            ) : suggestion ? (
              <div className="fu-ai-content">
                <div className="fu-ai-header-row">
                  <div className={`fu-ai-priority priority-${suggestion.priority?.toLowerCase()}`}>
                    {suggestion.priority} Priority
                  </div>
                  <div className="fu-ai-method">
                    Recommended: <strong>{suggestion.suggestedMethod}</strong>
                  </div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">💡 Recommended Action</div>
                  <div className="fu-ai-value">{suggestion.recommendedAction}</div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">⏰ Best Time</div>
                  <div className="fu-ai-value">{suggestion.bestTime}</div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">💬 Sample Opener</div>
                  <div className="fu-ai-value fu-ai-opener">"{suggestion.sampleOpener}"</div>
                </div>
                <div className="fu-ai-section">
                  <div className="fu-ai-label">📋 Talking Points</div>
                  <ul className="fu-ai-list">
                    {suggestion.talkingPoints?.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
                {suggestion.warningFlags?.length > 0 && (
                  <div className="fu-ai-section fu-ai-warnings">
                    <div className="fu-ai-label">⚠️ Warning Flags</div>
                    <ul className="fu-ai-list warning">
                      {suggestion.warningFlags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
                <div className="fu-ai-motivation">
                  <span>💪</span> {suggestion.motivationalNote}
                </div>
              </div>
            ) : (
              <div className="fu-ai-empty">
                Click "Get Strategy" to generate AI-powered suggestions.
              </div>
            )}
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost"
              onClick={() => { setShowAIModal(null); clearSuggestion(); }}>Close</button>
            <button className="fu-btn primary"
              onClick={() => getAISuggestion(aiCallData, localData[aiCallData?._uid])}
              disabled={loadingAI}>
              {loadingAI ? "Analyzing..." : "🤖 Get Strategy"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWAModal = () => {
    if (!showWATemplates) return null;
    const c = showWATemplates;
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && setShowWATemplates(null)}>
        <div className="fu-modal">
          <div className="fu-modal-header">
            <h3>💬 WhatsApp Templates</h3>
            <button className="fu-modal-close" onClick={() => setShowWATemplates(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <p style={{ fontSize: "0.8rem", color: "var(--fu-muted)", marginBottom: 14 }}>
              Sending to: <strong>{c._name}</strong> ({c._num})
            </p>
            <div className="fu-template-list">
              {WHATSAPP_TEMPLATES.map((tpl, i) => (
                <div key={i} className="fu-template-item"
                  onClick={() => {
                    whatsappVisitor(cleanNum(c._num), c._name, "+91", tpl.text);
                    setShowWATemplates(null);
                  }}>
                  <div className="fu-template-label">{tpl.label}</div>
                  <div className="fu-template-preview">
                    {tpl.text.replace("{name}", c._name).slice(0, 100)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowWATemplates(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const renderTagModal = () => {
    if (!showTagModal) return null;
    const uid = showTagModal;
    const visitTags = tags[uid] || [];
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && setShowTagModal(null)}>
        <div className="fu-modal" style={{ maxWidth: 380 }}>
          <div className="fu-modal-header">
            <h3>🏷️ Manage Tags</h3>
            <button className="fu-modal-close" onClick={() => setShowTagModal(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-tag-current">
              {visitTags.length === 0
                ? <span className="fu-tags-empty">No tags yet</span>
                : visitTags.map((tag) => (
                  <span key={tag} className="fu-tag-chip">
                    {tag}
                    <button onClick={() => removeTag(uid, tag)}>×</button>
                  </span>
                ))}
            </div>
            <div className="fu-tag-input-row">
              <input type="text" placeholder="Add a tag..."
                value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag(uid)} />
              <button className="fu-btn primary" onClick={() => addTag(uid)}>Add</button>
            </div>
            <div className="fu-tag-suggestions">
              {["VIP","Hot Lead","NRI","Investor","End User","Budget Buyer","Callback","Serious"]
                .map((t) => (
                  <button key={t} className="fu-tag-suggest" onClick={() => setTagInput(t)}>{t}</button>
                ))}
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowTagModal(null)}>Done</button>
          </div>
        </div>
      </div>
    );
  };

  const renderReminderModal = () => {
    if (!showReminder) return null;
    const c = showReminder;
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && setShowReminder(null)}>
        <div className="fu-modal" style={{ maxWidth: 400 }}>
          <div className="fu-modal-header">
            <h3>⏰ Set Reminder</h3>
            <button className="fu-modal-close" onClick={() => setShowReminder(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <p style={{ fontSize: "0.8rem", color: "var(--fu-muted)", marginBottom: 14 }}>
              For: <strong>{c._name}</strong>
            </p>
            <div className="fu-form-row">
              <div className="fu-field">
                <label>Date</label>
                <input type="date" value={reminderForm.date}
                  onChange={(e) => setReminderForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="fu-field">
                <label>Time</label>
                <input type="time" value={reminderForm.time}
                  onChange={(e) => setReminderForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="fu-field">
              <label>Note</label>
              <input type="text" placeholder="Reminder note..."
                value={reminderForm.note}
                onChange={(e) => setReminderForm((p) => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowReminder(null)}>Cancel</button>
            <button className="fu-btn primary" onClick={() => addReminder(c)}>Set Reminder</button>
          </div>
        </div>
      </div>
    );
  };

  const renderShortcutsModal = () => {
    if (!showShortcuts) return null;
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && setShowShortcuts(false)}>
        <div className="fu-modal" style={{ maxWidth: 440 }}>
          <div className="fu-modal-header">
            <h3>⌨️ Keyboard Shortcuts</h3>
            <button className="fu-modal-close" onClick={() => setShowShortcuts(false)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-shortcuts-grid">
              {KEYBOARD_SHORTCUTS.map((s) => (
                <div key={s.key} className="fu-shortcut-item">
                  <kbd className="fu-kbd">{s.key}</kbd>
                  <span>{s.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderExportModal = () => {
    if (!showExport) return null;
    return (
      <div className="fu-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && setShowExport(false)}>
        <div className="fu-modal">
          <div className="fu-modal-header">
            <h3>📥 Export Data</h3>
            <button className="fu-modal-close" onClick={() => setShowExport(false)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-field">
              <label>Format</label>
              <div className="fu-radio-group">
                {["excel", "csv"].map((f) => (
                  <label key={f} className="fu-radio">
                    <input type="radio" checked={exportFormat === f}
                      onChange={() => setExportFormat(f)} />
                    <span>{f === "excel" ? "📊 Excel (.xlsx)" : "📄 CSV (.csv)"}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="fu-export-info">
              Will export <strong>{filtered.length}</strong> records with
              Lead Score, Tags, and Follow-up data.
            </p>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowExport(false)}>Cancel</button>
            <button className="fu-btn primary" onClick={exportData}>📥 Export Now</button>
          </div>
        </div>
      </div>
    );
  };

  // ═══ CALL CARD ═════════════════════════════════════════════════════════════
  const CallCard = ({ c }) => {
    const [showSnooze, setShowSnooze] = useState(false);
    const isExpanded = expanded === c._uid;
    const score = c._score;
    const cfg = CAT_CFG[c._cat] || CAT_CFG.other;
    const isDone = c._isDone;
    const ld = c._localData || {};
    const callTags = tags[c._uid] || [];
    const history = ld.history || [];
    const stColor = getStatusColor(c.call_status);

    return (
      <div className={`fu-visit-card
        ${isDone ? "fu-done" : ""}
        ${isMissedCall(c) ? "fu-overdue" : ""}
        ${isExpanded ? "fu-expanded-card" : ""}`}>
        <div className="fu-score-bar"
          style={{ "--score-width": `${score}%`, "--score-color": scoreColor(score) }} />

        {showBulk && (
          <div className="fu-bulk-check">
            <input type="checkbox" checked={!!bulkSel[c._uid]}
              onChange={() => setBulkSel((p) => ({ ...p, [c._uid]: !p[c._uid] }))}
              id={`bk-${c._uid}`} />
            <label htmlFor={`bk-${c._uid}`} />
          </div>
        )}

        <div className="fu-card-main"
          onClick={() => !showBulk && setExpanded(isExpanded ? null : c._uid)}>
          <div className="fu-card-info">
            <div className="fu-visitor-name-row">
              {/* Name with edit button */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <h3 className={`fu-visitor-name ${isDone ? "fu-done-text" : ""}`}>
                  {c._name}
                </h3>
                {/* ✎ Edit name button — stops card expansion on click */}
                <button
                  title="Edit customer name"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--fu-muted)",
                    padding: "2px 4px",
                    borderRadius: 4,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditNameModal({
                      currentName: c._name,
                      number: c._num,
                      uid: c._uid,
                    });
                  }}
                >
                  ✎
                </button>
              </div>
              <div className="fu-lead-score"
                style={{
                  background: scoreColor(score) + "15",
                  color: scoreColor(score),
                  borderColor: scoreColor(score) + "40",
                }}>
                ● {score} — {scoreLabel(score)}
              </div>
            </div>

            <div className="fu-visitor-contact">
              <span className="fu-phone">📞 {c._num || "—"}</span>
              <span className="fu-cl-dir-badge" style={{
                display: "inline-flex", marginLeft: 8,
                background: cfg.color + "18", color: cfg.color,
                padding: "2px 8px", borderRadius: 12,
                fontSize: "0.7rem", fontWeight: 600, gap: 4,
              }}>
                {cfg.icon} {c.direction === "inbound" ? "Inbound" : "Outbound"}
              </span>
            </div>

            <div className="fu-card-meta">
              <span>👤 {c.answered_agent_name || c.agent_name || "—"}</span>
              <span>⏱ {fmtDuration(c.duration || c.call_duration || 0)}</span>
              <span style={{ color: stColor }}>{cfg.icon} {c.call_status || "—"}</span>
              <span>🕐 {fmtTimeAgo(c)}</span>
              {ld.followUpCount > 0 && (
                <span>🔄 {ld.followUpCount} follow-up{ld.followUpCount !== 1 ? "s" : ""}</span>
              )}
              {callTags.length > 0 && (
                <span className="fu-visit-tags">
                  {callTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="fu-tag-small">{tag}</span>
                  ))}
                  {callTags.length > 3 && (
                    <span className="fu-tag-small">+{callTags.length - 3}</span>
                  )}
                </span>
              )}
            </div>

            {ld.outcome && (
              <div className="fu-last-fu-row">
                <span className="fu-last-label">Last F/U:</span>
                <span className={outcomeBadgeClass(ld.outcome)}>{ld.outcome}</span>
                <span className="fu-method-tag">{ld.method}</span>
                {ld.lastFollowUpAt && (
                  <span className="fu-ago">{fmtTimeAgo(ld.lastFollowUpAt)}</span>
                )}
                {ld.remarks && !isExpanded && (
                  <span className="fu-remark-preview">
                    — {ld.remarks.length > 50 ? ld.remarks.slice(0, 50) + "…" : ld.remarks}
                  </span>
                )}
              </div>
            )}

            {voiceNotes[c._uid] && (
              <div className="fu-voice-indicator">🎙️ Voice note recorded</div>
            )}
          </div>

          <div className="fu-card-right" onClick={(e) => e.stopPropagation()}>
            <span className={badgeClass(ld.bookingStatus || "Not Booked")}>
              {ld.bookingStatus || "Not Booked"}
            </span>
            <div className="fu-quick-actions">
              <button className={`fu-check-btn ${isDone ? "fu-check-done" : ""}`}
                onClick={() => markComplete(c._uid)}
                title={isDone ? "Reopen" : "Done"}>{isDone ? "✓" : ""}</button>
              <button className="fu-action-icon"
                onClick={() => callVisitor(cleanNum(c._num))} title="Call">📞</button>
              <button className="fu-action-icon"
                onClick={() => setShowWATemplates(c)} title="WhatsApp">💬</button>
              <button className="fu-action-icon"
                onClick={() => copyPhone(cleanNum(c._num))} title="Copy">📋</button>
              <button className="fu-action-icon" title="Snooze"
                onClick={(e) => { e.stopPropagation(); setShowSnooze(!showSnooze); }}>💤</button>
              <button className="fu-action-icon" title="AI Strategy"
                onClick={() => { setShowAIModal(c._uid); setAiCallData(c); clearSuggestion(); }}>🤖</button>
              <button className="fu-action-icon" title="Voice Note"
                style={{ background: voiceNotes[c._uid] ? "rgba(22,163,74,0.1)" : undefined }}
                onClick={() => setShowVoiceNote(showVoiceNote === c._uid ? null : c._uid)}>🎙️</button>
              <button className="fu-action-icon" title="Tags"
                onClick={() => setShowTagModal(c._uid)}>🏷️</button>
              <button className="fu-action-icon" title="Reminder"
                onClick={() => setShowReminder(c)}>⏰</button>
              <button className="fu-action-icon" title="Timeline"
                onClick={() => setShowTimeline(showTimeline === c._uid ? null : c._uid)}>📅</button>
              <button className="fu-action-icon" title="Add Follow-up"
                onClick={() => setExpanded(isExpanded ? null : c._uid)}>
                {isExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>
        </div>

        {showSnooze && (
          <div className="fu-snooze-bar" onClick={(e) => e.stopPropagation()}>
            <span className="fu-snooze-label">Snooze for:</span>
            {[
              { l: "1h", h: 1 }, { l: "3h", h: 3 },
              { l: "Tomorrow", h: 24 }, { l: "3 days", h: 72 }, { l: "1 week", h: 168 },
            ].map((s) => (
              <button key={s.l} className="fu-snooze-btn"
                onClick={() => { snoozeItem(c._uid, s.h); setShowSnooze(false); }}>
                {s.l}
              </button>
            ))}
            <button className="fu-snooze-cancel" onClick={() => setShowSnooze(false)}>✕</button>
          </div>
        )}

        {showTimeline === c._uid && (
          <div className="fu-timeline-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fu-timeline-header">
              <h4>📅 Activity Timeline</h4>
              <button onClick={() => setShowTimeline(null)}>×</button>
            </div>
            <div className="fu-timeline">
              <div className="fu-timeline-item">
                <div className="fu-timeline-dot" style={{ background: stColor }} />
                <div className="fu-timeline-content">
                  <div className="fu-timeline-label">
                    Call: {c.call_status} ({c.direction})
                  </div>
                  <div className="fu-timeline-detail">
                    Agent: {c.answered_agent_name || "—"} •{" "}
                    Duration: {fmtDuration(c.duration || c.call_duration || 0)}
                  </div>
                  <div className="fu-timeline-date">{fmtDateTime(c)}</div>
                </div>
              </div>
              {history.map((fu, i) => (
                <div key={i} className="fu-timeline-item">
                  <div className="fu-timeline-dot" style={{ background: scoreColor(50) }} />
                  <div className="fu-timeline-content">
                    <div className="fu-timeline-label">Follow-up: {fu.outcome}</div>
                    <div className="fu-timeline-detail">
                      {fu.method} • {(fu.remarks || "").slice(0, 80)}
                    </div>
                    <div className="fu-timeline-date">{fmtTimeAgo(fu.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showVoiceNote === c._uid && (
          <div className="fu-voice-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fu-voice-header">
              <h4>🎙️ Voice Note</h4>
              <button onClick={() => setShowVoiceNote(null)}>×</button>
            </div>
            {voiceNotes[c._uid] && (
              <div className="fu-voice-playback">
                <audio controls src={voiceNotes[c._uid].url} style={{ width: "100%" }} />
                <span className="fu-voice-duration">
                  Duration: {voiceRecorder.fmtTime(voiceNotes[c._uid].duration || 0)}
                </span>
              </div>
            )}
            <div className="fu-voice-recorder">
              {voiceRecorder.isRecording ? (
                <div className="fu-voice-recording">
                  <div className="fu-voice-dot" />
                  <span>Recording: {voiceRecorder.fmtTime(voiceRecorder.recordingTime)}</span>
                  <button className="fu-btn danger" onClick={voiceRecorder.stopRecording}>Stop</button>
                </div>
              ) : voiceRecorder.audioUrl ? (
                <div className="fu-voice-preview">
                  <audio controls src={voiceRecorder.audioUrl} style={{ width: "100%" }} />
                  <div className="fu-voice-actions">
                    <button className="fu-btn ghost" onClick={voiceRecorder.clearRecording}>Discard</button>
                    <button className="fu-btn primary" onClick={() => {
                      setVoiceNotes((prev) => ({
                        ...prev,
                        [c._uid]: { url: voiceRecorder.audioUrl, duration: voiceRecorder.recordingTime },
                      }));
                      voiceRecorder.clearRecording();
                      setShowVoiceNote(null);
                      showToast("Voice note saved!", "success");
                    }}>Save</button>
                  </div>
                </div>
              ) : (
                <button className="fu-btn primary" onClick={voiceRecorder.startRecording}>
                  🎙️ Start Recording
                </button>
              )}
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="fu-form-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fu-form-header">
              <h4>➕ Add Follow-up — {c._name}</h4>
              <button className="fu-btn ghost"
                style={{ fontSize: "0.72rem", padding: "5px 10px" }}
                onClick={() => { setShowAIModal(c._uid); setAiCallData(c); clearSuggestion(); }}>
                🤖 AI Strategy
              </button>
            </div>
            <div className="fu-form-row">
              <div className="fu-field">
                <label>Method</label>
                <select value={form.method}
                  onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="fu-field">
                <label>Outcome *</label>
                <select value={form.outcome}
                  onChange={(e) => setForm((p) => ({ ...p, outcome: e.target.value }))}>
                  <option value="">Select Outcome</option>
                  {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="fu-field">
                <label>Booking Status</label>
                <select value={form.bookingStatus}
                  onChange={(e) => setForm((p) => ({ ...p, bookingStatus: e.target.value }))}>
                  {BOOKING_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="fu-form-row">
              <div className="fu-field fu-field--wide">
                <label>Remarks *</label>
                <textarea rows={3} placeholder="Write remarks..."
                  value={form.remarks}
                  onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
              </div>
            </div>
            {voiceRecorder.audioUrl && (
              <div className="fu-voice-attached">
                <span>🎙️ Voice note attached ({voiceRecorder.fmtTime(voiceRecorder.recordingTime)})</span>
                <button className="fu-btn-text" onClick={voiceRecorder.clearRecording}>Remove</button>
              </div>
            )}
            <div className="fu-form-actions">
              <button className="fu-btn primary" onClick={() => handleSaveFollowUp(c)}>
                💾 Save Follow-up
              </button>
              <button className="fu-btn ghost" onClick={() => setExpanded(null)}>Cancel</button>
            </div>

            {history.length > 0 && (
              <div className="fu-history-panel" style={{ marginTop: 12 }}>
                <div className="fu-history-header">
                  <h4>📋 Follow-up History ({history.length})</h4>
                </div>
                {history.map((fu, i) => (
                  <div key={i} className="fu-history-item">
                    <div className="fu-history-item-top">
                      <span className="fu-history-index">#{history.length - i}</span>
                      <span className={outcomeBadgeClass(fu.outcome)}>{fu.outcome}</span>
                      <span className="fu-method-tag">{fu.method}</span>
                      <span className="fu-ago">{fmtTimeAgo(fu.createdAt)}</span>
                    </div>
                    {fu.remarks && <div className="fu-history-remarks">📝 {fu.remarks}</div>}
                    {fu.bookingStatus && (
                      <div className="fu-history-status">
                        Status → <strong>{fu.bookingStatus}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════
  return (
    <div className={`fu-root ${darkMode ? "fu-dark" : ""} ${compactView ? "fu-compact" : ""}`}>
      <ToastContainer position="top-right" autoClose={3000} theme={darkMode ? "dark" : "light"} />

      {renderAIModal()}
      {renderWAModal()}
      {renderTagModal()}
      {renderReminderModal()}
      {renderShortcutsModal()}
      {renderExportModal()}

      {/* Edit Name Modal */}
      {editNameModal && (
        <EditNameModal
          data={editNameModal}
          onClose={() => setEditNameModal(null)}
          onSave={handleSaveName}
        />
      )}

      {notification && (
        <div className="fu-notification">
          <div className="fu-notif-content">
            <span className="fu-notif-icon">ℹ️</span>
            <span>{notification.message}</span>
            {notification.action && (
              <button className="fu-notif-action" onClick={notification.action}>View</button>
            )}
            <button className="fu-notif-dismiss" onClick={() => setNotification(null)}>✕</button>
          </div>
        </div>
      )}

      {reminders.filter((r) => !r.dismissed).length > 0 && (
        <div className="fu-reminders-banner">
          <span>
            ⏰ {reminders.filter((r) => !r.dismissed).length} active reminder
            {reminders.filter((r) => !r.dismissed).length > 1 ? "s" : ""}
          </span>
          <button onClick={() => setReminders((prev) => {
            const u = prev.map((r) => ({ ...r, dismissed: true }));
            localStorage.setItem("fu_reminders", JSON.stringify(u));
            return u;
          })}>Dismiss All</button>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <header className="fu-header">
        <div className="fu-header-main">
          <div className="fu-header-title">
            <h1>📅 Follow-up Manager</h1>
            <p>
              Track calls, manage leads, analyze performance •{" "}
              <button className="fu-shortcuts-link" onClick={() => setShowShortcuts(true)}>
                ⌨️ Shortcuts
              </button>
            </p>
          </div>
          <div className="fu-header-actions">
            <button className="fu-action-btn active">📅 <span>Follow-ups</span></button>
            <button className="fu-action-btn" onClick={refresh} title="Alt+R">
              🔄 <span>Refresh</span>
            </button>
            <button className={`fu-action-btn ${showBulk ? "active" : ""}`}
              onClick={() => setShowBulk((p) => !p)} title="Alt+B">
              ☑️ <span>Bulk</span>
            </button>
            <button className="fu-action-btn" onClick={() => setShowExport(true)} title="Alt+E">
              📥 <span>Export</span>
            </button>
            <button className={`fu-action-btn ${showStats ? "active" : ""}`}
              onClick={() => setShowStats((p) => !p)} title="Alt+S">
              📊 <span>{showStats ? "Hide" : "Analytics"}</span>
            </button>
            <button className={`fu-action-btn ${viewMode === "calendar" ? "active" : ""}`}
              onClick={() => setViewMode((p) => p === "calendar" ? "list" : "calendar")}
              title="Alt+C">
              🗓 <span>Calendar</span>
            </button>
            <button className={`fu-action-btn ${viewMode === "kanban" ? "active" : ""}`}
              onClick={() => setViewMode((p) => p === "kanban" ? "list" : "kanban")}
              title="Alt+K">
              ▦ <span>Kanban</span>
            </button>
            <button className={`fu-action-btn ${showLeaderboard ? "active" : ""}`}
              onClick={() => setShowLeaderboard((p) => !p)} title="Alt+L">
              🏆 <span>Leaderboard</span>
            </button>
            <button className={`fu-action-btn ${showActivityFeed ? "active" : ""}`}
              onClick={() => setShowActivityFeed((p) => !p)}>
              📡 <span>Feed</span>
            </button>
            <button className="fu-action-btn" onClick={() => setCompactView((p) => !p)}>
              ☰ <span>{compactView ? "Expanded" : "Compact"}</span>
            </button>
            <button className="fu-action-btn" onClick={() => setDarkMode((p) => !p)} title="Alt+D">
              {darkMode ? "☀️" : "🌙"} <span>{darkMode ? "Light" : "Dark"}</span>
            </button>
          </div>
        </div>

        <div className="fu-kpi-strip">
          {[
            { label: "Total Calls",  val: counts.total,     color: "var(--fu-primary)" },
            { label: "Answered",     val: counts.answered,  color: "#16a34a" },
            { label: "Missed",       val: counts.missed,    color: "#dc2626" },
            { label: "Inbound",      val: counts.inbound,   color: "#2563eb" },
            { label: "Outbound",     val: counts.outbound,  color: "#d97706" },
            { label: "Busy",         val: counts.busy,      color: "#7c3aed" },
            { label: "Done",         val: counts.completed, color: "#64748b" },
          ].map((k, i) => (
            <React.Fragment key={k.label}>
              {i > 0 && <div className="fu-kpi-divider" />}
              <div className="fu-kpi-item">
                <span className="fu-kpi-val" style={{ color: k.color }}>{k.val}</span>
                <span className="fu-kpi-label">{k.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ═══ STATUS TABS ═══ */}
      <div className="fu-status-tabs">
        {[
          { key: "all",       icon: "📊", label: "All",      val: counts.total,     color: "#6366f1" },
          { key: "missed",    icon: "🚨", label: "Missed",   val: counts.missed,    color: "#dc2626" },
          { key: "answered",  icon: "✅", label: "Answered", val: counts.answered,  color: "#16a34a" },
          { key: "inbound",   icon: "↙️", label: "Inbound",  val: counts.inbound,   color: "#2563eb" },
          { key: "outbound",  icon: "↗️", label: "Outbound", val: counts.outbound,  color: "#d97706" },
          { key: "busy",      icon: "⏰", label: "Busy",     val: counts.busy,      color: "#7c3aed" },
          { key: "completed", icon: "✅", label: "Done",     val: counts.completed, color: "#64748b" },
        ].map((t) => (
          <button key={t.key}
            className={`fu-status-tab ${filter === t.key ? "fu-status-tab--active" : ""}`}
            style={{ "--tab-color": t.color }}
            onClick={() => setFilter(t.key)}>
            <span className="fu-tab-icon">{t.icon}</span>
            <span className="fu-tab-val">{t.val}</span>
            <span className="fu-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {renderAnalytics()}
      {renderLeaderboard()}
      {renderActivityFeed()}

      {/* ═══ TOOLBAR ═══ */}
      <div className="fu-toolbar">
        <div className="fu-toolbar-left">
          <div className="fu-search-box">
            <span className="fu-search-icon">🔍</span>
            <input ref={searchRef} className="fu-search-input"
              placeholder="Search name, phone, agent, tags... ( / to focus)"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button className="fu-search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
          <select className="fu-sel" value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {(filter !== "all" || search || selectedDate) && (
            <button className="fu-btn-sm ghost"
              onClick={() => { setFilter("all"); setSearch(""); setSelectedDate(null); setCalSelItems(null); }}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <div className="fu-toolbar-right">
          <span className="fu-result-count">{filtered.length} results</span>
          <div className="fu-view-btns">
            {[{ id: "list", icon: "☰" }, { id: "kanban", icon: "▦" }, { id: "calendar", icon: "📅" }]
              .map((v) => (
                <button key={v.id}
                  className={`fu-view-btn ${viewMode === v.id ? "fu-view-btn--active" : ""}`}
                  onClick={() => setViewMode(v.id)} title={v.id}>{v.icon}</button>
              ))}
          </div>
          <select className="fu-sel fu-per-page" value={perPage}
            onChange={(e) => { setPerPage(+e.target.value); setPage(1); }}>
            {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>

      {/* ═══ BULK ACTIONS ═══ */}
      {showBulk && (
        <div className="fu-bulk-bar">
          <div className="fu-bulk-top">
            <div className="fu-bulk-info">
              <strong>{selectedCount}</strong> selected
              <button className="fu-btn-sm" onClick={() => {
                const s = {};
                pageItems.forEach((c) => { s[c._uid] = true; });
                setBulkSel(s);
              }}>Select Page</button>
              <button className="fu-btn-sm ghost" onClick={() => setBulkSel({})}>Clear</button>
            </div>
          </div>
          {selectedCount > 0 && (
            <div className="fu-bulk-form">
              <div className="fu-bulk-form-row">
                <div className="fu-field">
                  <label>Method</label>
                  <select value={bulkForm.method}
                    onChange={(e) => setBulkForm((p) => ({ ...p, method: e.target.value }))}>
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="fu-field">
                  <label>Outcome *</label>
                  <select value={bulkForm.outcome}
                    onChange={(e) => setBulkForm((p) => ({ ...p, outcome: e.target.value }))}>
                    <option value="">Select</option>
                    {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="fu-field fu-field--wide">
                  <label>Remarks</label>
                  <input type="text" value={bulkForm.remarks}
                    onChange={(e) => setBulkForm((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Bulk remarks..." />
                </div>
              </div>
              <button className="fu-btn primary" onClick={processBulkFollowUps}>
                💾 Update {selectedCount} Follow-ups
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      {loading && (
        <div className="fu-loading">
          <div className="fu-loading-ring" />
          <p>Loading call logs...</p>
        </div>
      )}

      {!loading && viewMode === "calendar" && renderCalendar()}
      {!loading && viewMode === "kanban" && renderKanban()}

      {!loading && viewMode === "list" && (
        <div className="fu-list">
          {filtered.length === 0 && (
            <div className="fu-empty">
              <div className="fu-empty-icon">📭</div>
              <h3>No Calls Found</h3>
              <p>No call logs match your current filters.</p>
              <button className="fu-btn primary"
                onClick={() => { setFilter("all"); setSearch(""); }}>Show All</button>
            </div>
          )}
          {pageItems.map((c) => <CallCard key={c._uid} c={c} />)}
        </div>
      )}

      {/* Load More */}
      {!loading && viewMode === "list" && hasMore && !search && filter === "all" && (
        <div className="fu-load-more-wrap">
          <button className="fu-btn primary" onClick={loadMore} disabled={isFetchingMore}>
            {isFetchingMore ? "Loading…" : `⬇ Load More (${callLogs.length} loaded)`}
          </button>
        </div>
      )}

      {/* Client-side pagination */}
      {!loading && viewMode === "list" && totalPages > 1 && (
        <div className="fu-pagination">
          <button className="fu-page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="fu-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p;
            if (totalPages <= 7) p = i + 1;
            else if (page <= 4) p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else p = page - 3 + i;
            return (
              <button key={p}
                className={`fu-page-btn ${page === p ? "fu-page-btn--active" : ""}`}
                onClick={() => setPage(p)}>{p}</button>
            );
          })}
          <button className="fu-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>›</button>
          <button className="fu-page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          <span className="fu-page-info">
            Page {page} of {totalPages} • {filtered.length} calls
          </span>
        </div>
      )}
    </div>
  );
}