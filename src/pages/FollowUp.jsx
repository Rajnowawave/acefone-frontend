import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  Timestamp,
  getDocs,
  increment,
  writeBatch,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { Bar, Pie, Doughnut, Line, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  Filler,
  LineElement,
  RadialLinearScale,
} from "chart.js";
import { useNavigate } from "react-router-dom";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Contact.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler
);

// ─── Constants ────────────────────────────────────────────────────────────────
const METHODS = ["Call", "WhatsApp", "Site Visit", "Email", "Video Call", "SMS"];
const OUTCOMES = [
  "Connected","Interested","Not Reachable","Switched Off","Busy",
  "Call Later","No Response","Wrong Number","Follow Up Done",
  "Not Interested","Will Visit Site","Visited Site",
];
const BOOKING_STATUSES = ["Not Booked", "Interested", "Follow Up", "Booked", "Cancelled"];
const FILTERS = ["All", "Booked", "Interested", "Follow Up", "Followed Up", "Not Followed Up", "Overdue", "Today's Follow-ups"];
const SORT_OPTIONS = [
  { label: "Next Follow-up (Earliest)", value: "nextFollowUpAsc" },
  { label: "Next Follow-up (Latest)", value: "nextFollowUpDesc" },
  { label: "Lead Score (Highest)", value: "leadScoreDesc" },
  { label: "Creation Date (Newest)", value: "creationDesc" },
  { label: "Creation Date (Oldest)", value: "creationAsc" },
  { label: "Last Activity (Recent)", value: "lastActivityDesc" },
];

const WHATSAPP_TEMPLATES = [
  { label: "Greeting", text: "Hello {name}! 👋 Thank you for visiting our property. We'd love to help you find your dream home. When would be a good time to connect?" },
  { label: "Follow-up", text: "Hi {name}! 🏠 Just checking in regarding your visit. Have you had a chance to think about our property? We have some exciting updates!" },
  { label: "Special Offer", text: "Dear {name}, 🎉 We have an exclusive offer just for you! Limited period special pricing on your preferred property. Call us today!" },
  { label: "Site Visit", text: "Hello {name}! 📅 We'd like to invite you for a site visit. Our team is ready to give you a complete walkthrough. Interested?" },
  { label: "Booking Reminder", text: "Hi {name}, 🔔 Your booking process is pending. Don't miss out on this property! Let's finalize it today. Call us at your earliest convenience." },
];

const KEYBOARD_SHORTCUTS = [
  { key: "Alt+S", action: "Toggle Stats/Analytics" },
  { key: "Alt+C", action: "Toggle Calendar View" },
  { key: "Alt+B", action: "Toggle Bulk Actions" },
  { key: "Alt+E", action: "Export Data" },
  { key: "Alt+K", action: "Toggle Kanban View" },
  { key: "Escape", action: "Close expanded/modals" },
  { key: "/", action: "Focus Search" },
  { key: "Alt+D", action: "Toggle Dark Mode" },
  { key: "Alt+L", action: "Toggle Leaderboard" },
];

const LEAD_SCORE_WEIGHTS = {
  bookingStatus: { Booked: 100, Interested: 70, "Follow Up": 50, "Not Booked": 20, Cancelled: 0 },
  followUpCount: { base: 5, max: 30 },
  recency: { within7: 20, within30: 10, older: 0 },
  outcome: {
    "Interested": 15, "Connected": 10, "Will Visit Site": 12, "Visited Site": 20,
    "Follow Up Done": 8, "Call Later": 5, "Not Interested": -10,
  },
};

const countryFlagMap = {
  "+91": "🇮🇳", "+1": "🇺🇸", "+44": "🇬🇧", "+971": "🇦🇪",
  "+966": "🇸🇦", "+974": "🇶🇦", "+968": "🇴🇲", "+973": "🇧🇭",
  "+965": "🇰🇼", "+61": "🇦🇺", "+64": "🇳🇿", "+65": "🇸🇬",
  "+60": "🇲🇾", "+49": "🇩🇪", "+33": "🇫🇷", "+39": "🇮🇹",
  "+34": "🇪🇸", "+81": "🇯🇵", "+82": "🇰🇷", "+86": "🇨🇳",
  "+852": "🇭🇰", "+27": "🇿🇦", "+254": "🇰🇪", "+234": "🇳🇬",
  "+55": "🇧🇷", "+52": "🇲🇽", "+92": "🇵🇰", "+880": "🇧🇩",
  "+94": "🇱🇰", "+977": "🇳🇵", "+63": "🇵🇭", "+66": "🇹🇭",
  "+84": "🇻🇳", "+62": "🇮🇩", "+7": "🇷🇺",
};

const getCountryFlag = (countryCode) => countryFlagMap[countryCode] || "🌍";

const CHART_COLORS = {
  primary: [
    'rgba(54, 162, 235, 0.8)', 'rgba(75, 192, 192, 0.8)',
    'rgba(255, 99, 132, 0.8)', 'rgba(255, 159, 64, 0.8)',
    'rgba(153, 102, 255, 0.8)', 'rgba(255, 205, 86, 0.8)',
    'rgba(201, 203, 207, 0.8)', 'rgba(255, 99, 255, 0.8)',
  ],
  booking: {
    'Booked': 'rgba(46, 184, 92, 0.85)',
    'Interested': 'rgba(54, 162, 235, 0.85)',
    'Follow Up': 'rgba(255, 159, 64, 0.85)',
    'Not Booked': 'rgba(255, 99, 132, 0.85)',
    'Cancelled': 'rgba(156, 156, 156, 0.85)',
  },
};

// ─── Utility Functions ─────────────────────────────────────────────────────────
const getDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp?.toDate && typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp?.seconds !== undefined) return new Date(timestamp.seconds * 1000);
  if (timestamp instanceof Date) return timestamp;
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? null : d;
};

const pad = (n) => String(n).padStart(2, "0");
const toInputDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toInputTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00`);
};
const formatDateToYMD = (timestamp) => {
  if (!timestamp) return null;
  const d = getDateFromTimestamp(timestamp);
  if (!d) return null;
  return toInputDate(d);
};
const formatShort = (ts) => {
  if (!ts) return "-";
  const d = getDateFromTimestamp(ts);
  if (!d) return "-";
  return `${toInputDate(d)} ${toInputTime(d)}`;
};
const formatDetailedDate = (ts) => {
  if (!ts) return "-";
  const d = getDateFromTimestamp(ts);
  if (!d) return "-";
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};
const formatTimeAgo = (ts) => {
  if (!ts) return "-";
  const now = new Date();
  const date = getDateFromTimestamp(ts);
  if (!date) return "-";
  const seconds = Math.floor((now - date) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
  return "just now";
};
const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
};
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const getMonthName = (month) => ['January','February','March','April','May','June','July','August','September','October','November','December'][month];

const showToast = (message, type = "success") => {
  if (type === "success") toast.success(message);
  else if (type === "error") toast.error(message);
  else if (type === "warning") toast.warn(message);
  else toast.info(message);
};

// ─── Lead Score Calculator ─────────────────────────────────────────────────────
const calculateLeadScore = (visit) => {
  let score = 0;
  const status = visit.bookingStatus || "Not Booked";
  score += LEAD_SCORE_WEIGHTS.bookingStatus[status] || 0;
  const fuCount = visit.followUpCount || 0;
  score += Math.min(fuCount * LEAD_SCORE_WEIGHTS.followUpCount.base, LEAD_SCORE_WEIGHTS.followUpCount.max);
  if (visit.lastFollowUp?.at) {
    const fuDate = getDateFromTimestamp(visit.lastFollowUp.at);
    if (fuDate) {
      const diffDays = Math.floor((new Date() - fuDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) score += LEAD_SCORE_WEIGHTS.recency.within7;
      else if (diffDays <= 30) score += LEAD_SCORE_WEIGHTS.recency.within30;
    }
    const outcome = visit.lastFollowUp.outcome;
    score += LEAD_SCORE_WEIGHTS.outcome[outcome] || 0;
  }
  if (visit.nextFollowUpAt) {
    const next = getDateFromTimestamp(visit.nextFollowUpAt);
    if (next && next < new Date()) score -= 10; // overdue penalty
  }
  return Math.max(0, Math.min(score, 100));
};

const getScoreColor = (score) => {
  if (score >= 80) return '#27694f';
  if (score >= 60) return '#2471a3';
  if (score >= 40) return '#b5621e';
  return '#c0392b';
};

const getScoreLabel = (score) => {
  if (score >= 80) return 'Hot 🔥';
  if (score >= 60) return 'Warm ☀️';
  if (score >= 40) return 'Lukewarm 🌤️';
  return 'Cold ❄️';
};

// ─── Call Utilities ────────────────────────────────────────────────────────────
const callVisitorUtil = (phone, countryCode = "+91") => {
  if (!phone) return;
  window.location.href = `tel:${countryCode}${phone}`.replace(/\s+/g, "");
};

const whatsappVisitorUtil = (phone, name, countryCode = "+91", template = null) => {
  if (!phone) return;
  const cleanCode = countryCode.replace("+", "");
  const fullNumber = `${cleanCode}${phone}`.replace(/\s+/g, "");
  let message = template
    ? template.replace("{name}", name || "")
    : encodeURIComponent(`Hello ${name || ""}! Thank you for visiting our property. How can I help you today?`);
  if (template) message = encodeURIComponent(message);
  window.open(`https://wa.me/${fullNumber}?text=${message}`, "_blank");
};

const copyToClipboardUtil = async (phone, countryCode = "+91") => {
  if (!phone) return;
  const fullNumber = `${countryCode} ${phone}`;
  try {
    await navigator.clipboard.writeText(fullNumber);
    showToast("Phone number copied!", "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = fullNumber;
    ta.style.position = "fixed";
    ta.style.left = "-999999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); showToast("Phone number copied!", "success"); }
    catch { showToast("Failed to copy", "error"); }
    document.body.removeChild(ta);
  }
};

// ─── AI Follow-up Suggestion Hook ─────────────────────────────────────────────
const useAISuggestion = () => {
  const [suggestion, setSuggestion] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const getAISuggestion = async (visit, history) => {
    setLoadingAI(true);
    setSuggestion(null);

    try {
      const visitSummary = {
        name: visit.visitor?.name || "Unknown",
        status: visit.bookingStatus || "Unknown",
        followUpCount: visit.followUpCount || 0,
        lastOutcome: visit.lastFollowUp?.outcome || "None",
        lastRemarks: visit.lastFollowUp?.remarks || "None",
        nextFollowUp: visit.nextFollowUpAt
          ? formatDetailedDate(visit.nextFollowUpAt)
          : "Not set",
        history: (history || []).slice(0, 5).map((h) => ({
          method: h.method || "Unknown",
          outcome: h.outcome || "Unknown",
          remarks: h.remarks?.slice(0, 100) || "",
        })),
      };

      const response = await fetch(
        "",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "",
            "HTTP-Referer": "",
            "X-Title": "Site Visit"
          },
          body: JSON.stringify({
            model: "minimax/minimax-m2.5:free",
            max_tokens: 1000,
            temperature: 0.4,
            messages: [
              {
                role: "user",
                content: `
You are an expert real estate sales coach.

Analyze this lead data and return STRICT VALID JSON only.
No markdown.
No explanation.
No code block.

Lead Data:
${JSON.stringify(visitSummary)}

Return exactly this format:

{
  "priority": "High|Medium|Low",
  "recommendedAction": "brief action text",
  "bestTime": "suggested time to call",
  "talkingPoints": ["point 1", "point 2", "point 3"],
  "suggestedMethod": "Call|WhatsApp|Email|Site Visit",
  "suggestedOutcome": "expected outcome",
  "warningFlags": ["flag if any"],
  "motivationalNote": "one line encouragement",
  "sampleOpener": "sample conversation opener"
}
                `.trim()
              }
            ]
          })
        }
      );

      const raw = await response.text();
      // console.log("RAW RESPONSE:", raw);

      if (!response.ok) {
        throw new Error(raw);
      }

      const data = JSON.parse(raw);

      const text =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        "";

      // console.log("AI TEXT:", text);

      const clean = text.replace(/```json|```/gi, "").trim();

      if (!clean) {
        throw new Error("Empty AI response");
      }

      let parsed;

      try {
        parsed = JSON.parse(clean);
      } catch (jsonError) {
        console.warn("Invalid JSON from AI. Using fallback.");

        parsed = {
          priority: "Medium",
          recommendedAction: clean,
          bestTime: "Tomorrow 11:00 AM",
          talkingPoints: [
            "Reconnect politely",
            "Ask interest level",
            "Offer site visit"
          ],
          suggestedMethod: "Call",
          suggestedOutcome: "Lead re-engagement",
          warningFlags: [],
          motivationalNote: "Consistency converts leads.",
          sampleOpener:
            "Hello sir, just following up regarding your property inquiry."
        };
      }

      setSuggestion(parsed);

    } catch (err) {
      console.error("AI suggestion error:", err);
      showToast("Could not fetch AI suggestion", "warning");
    } finally {
      setLoadingAI(false);
    }
  };

  return {
    suggestion,
    loadingAI,
    getAISuggestion,
    clearSuggestion: () => setSuggestion(null)
  };
};

// ─── Voice Notes Hook ─────────────────────────────────────────────────────────
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
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
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

  const formatTime = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

  return { isRecording, audioBlob, audioUrl, recordingTime, startRecording, stopRecording, clearRecording, formatTime };
};

// ─── Main Component ───────────────────────────────────────────────────────────
function Contact() {
  const notesTextareaRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const { suggestion, loadingAI, getAISuggestion, clearSuggestion } = useAISuggestion();
  const voiceRecorder = useVoiceRecorder();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [allVisits, setAllVisits] = useState([]);
  const [visits, setVisits] = useState([]);
  const [salesExecutives, setSalesExecutives] = useState([]);
  const [executiveCounts, setExecutiveCounts] = useState({});
  const [selectedExecutive, setSelectedExecutive] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [savingFor, setSavingFor] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [analyticsView, setAnalyticsView] = useState("overview");
  const [sortOption, setSortOption] = useState("leadScoreDesc");
  const [bulkSelections, setBulkSelections] = useState({});
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewMode, setViewMode] = useState(localStorage.getItem("fuViewMode") || "list");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVisit, setDeletingVisit] = useState(null);
  const [editForm, setEditForm] = useState({
    visitorName: "", visitorPhone: "", countryCode: "+91",
    agentName: "", bookingStatus: "Not Booked", visitDate: "", visitTime: ""
  });

  const [darkMode, setDarkMode] = useState(localStorage.getItem("fuDarkMode") === "true");
  const [compactView, setCompactView] = useState(localStorage.getItem("fuCompactView") === "true");
  const [showFilters, setShowFilters] = useState(false);

  const [followUpHistory, setFollowUpHistory] = useState({});
  const [loadingHistory, setLoadingHistory] = useState({});
  const [showHistory, setShowHistory] = useState({});
  const [notesEditMode, setNotesEditMode] = useState({});
  const [notes, setNotes] = useState({});
  const [quickFilters, setQuickFilters] = useState({
    onlyBooked: false, onlyInterested: false, todayFollowUps: false, overdueFollowUps: false, hotLeads: false,
  });

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [upcomingFollowUps, setUpcomingFollowUps] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [notification, setNotification] = useState(null);

  // NEW STATES
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWhatsAppTemplates, setShowWhatsAppTemplates] = useState(null); // visit object
  const [showAISuggestion, setShowAISuggestion] = useState(null); // visit id
  const [aiSuggestionVisit, setAiSuggestionVisit] = useState(null);
  const [showVoiceNote, setShowVoiceNote] = useState(null); // visit id
  const [voiceNotes, setVoiceNotes] = useState({}); // visitId -> {url, duration}
  const [kanbanData, setKanbanData] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [showTimeline, setShowTimeline] = useState(null); // visit id
  const [globalSearch, setGlobalSearch] = useState(false);
  const [searchHistory, setSearchHistory] = useState(JSON.parse(localStorage.getItem("fuSearchHistory") || "[]"));
  const [reminders, setReminders] = useState(JSON.parse(localStorage.getItem("fuReminders") || "[]"));
  const [showReminderModal, setShowReminderModal] = useState(null);
  const [reminderForm, setReminderForm] = useState({ date: toInputDate(), time: toInputTime(), note: "" });
  const [showTagModal, setShowTagModal] = useState(null);
  const [tags, setTags] = useState({});
  const [tagInput, setTagInput] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [activityFeed, setActivityFeed] = useState([]);
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  const defaultFormState = {
    method: "Call", outcome: "", remarks: "", bookingStatus: "Not Booked",
    nextDate: toInputDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    nextTime: toInputTime(), noNext: false,
  };
  const [form, setForm] = useState(defaultFormState);
  const [bulkForm, setBulkForm] = useState({
    method: "Call", outcome: "Follow Up Done", remarks: "Bulk follow-up processed",
    nextDate: toInputDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), nextTime: toInputTime(),
  });

  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportScope, setExportScope] = useState("filtered");
  const [editingFollowUpId, setEditingFollowUpId] = useState(null);
  const [editFollowUpForm, setEditFollowUpForm] = useState({});

  // ── Effects ──
  useEffect(() => {
    localStorage.setItem("fuDarkMode", darkMode);
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => { localStorage.setItem("fuCompactView", compactView); }, [compactView]);
  useEffect(() => { localStorage.setItem("fuViewMode", viewMode); }, [viewMode]);
  useEffect(() => { setCurrentPage(1); }, [filter, search, selectedExecutive, selectedDate, sortOption, quickFilters]);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission().then(perm => setNotificationPermission(perm));
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') { e.target.blur(); setExpanded(null); }
        return;
      }
      if (e.key === '/' && !e.altKey) { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (!e.altKey) return;
      switch (e.key) {
        case 's': case 'S': e.preventDefault(); setShowStats(p => !p); break;
        case 'c': case 'C': e.preventDefault(); setViewMode(p => p === 'calendar' ? 'list' : 'calendar'); break;
        case 'b': case 'B': e.preventDefault(); setShowBulkActions(p => !p); break;
        case 'e': case 'E': e.preventDefault(); setShowExportOptions(true); break;
        case 'k': case 'K': e.preventDefault(); setViewMode(p => p === 'kanban' ? 'list' : 'kanban'); break;
        case 'd': case 'D': e.preventDefault(); setDarkMode(p => !p); break;
        case 'l': case 'L': e.preventDefault(); setShowLeaderboard(p => !p); break;
      }
      if (e.key === 'Escape') { setExpanded(null); setShowEditModal(false); setShowDeleteConfirm(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check reminders every minute
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const due = reminders.filter(r => !r.dismissed && new Date(`${r.date}T${r.time}`) <= now);
      due.forEach(r => {
        if (notificationPermission === 'granted') {
          new Notification(`Follow-up Reminder: ${r.visitorName}`, {
            body: r.note || "Time for your scheduled follow-up!",
            icon: '/favicon.ico',
          });
        }
        showToast(`⏰ Reminder: ${r.visitorName} - ${r.note || 'Follow-up due!'}`, "info");
        setReminders(prev => {
          const updated = prev.map(rem => rem.id === r.id ? { ...rem, dismissed: true } : rem);
          localStorage.setItem("fuReminders", JSON.stringify(updated));
          return updated;
        });
      });
    };
    const interval = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(interval);
  }, [reminders, notificationPermission]);

  // ── Firebase: Load ALL visits ──
  useEffect(() => {
    const base = collection(db, "siteVisits");
    const allVisitsQuery = query(base, orderBy("createdAt", "desc"), limit(5000));
    const unsub = onSnapshot(allVisitsQuery, (snap) => {
      try {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllVisits(rows);
        const execSet = new Set();
        const counts = {};
        rows.forEach(visit => {
          const agentName = visit.agent?.name?.trim();
          if (agentName) { execSet.add(agentName); counts[agentName] = (counts[agentName] || 0) + 1; }
        });
        setSalesExecutives([...execSet].sort());
        setExecutiveCounts(counts);

        // Build activity feed from recent visits
        const recentActivity = rows
          .filter(v => v.lastFollowUp?.at)
          .sort((a, b) => {
            const ta = getDateFromTimestamp(a.lastFollowUp.at)?.getTime() || 0;
            const tb = getDateFromTimestamp(b.lastFollowUp.at)?.getTime() || 0;
            return tb - ta;
          })
          .slice(0, 20)
          .map(v => ({
            id: v.id,
            name: v.visitor?.name,
            agent: v.agent?.name,
            outcome: v.lastFollowUp?.outcome,
            method: v.lastFollowUp?.method,
            at: v.lastFollowUp?.at,
            bookingStatus: v.bookingStatus,
          }));
        setActivityFeed(recentActivity);

      } catch (error) { console.error("Error processing all visits:", error); }
    }, (error) => console.error("Error loading all visits:", error));
    return unsub;
  }, []);

  // ── Firebase: Load filtered visits ──
  useEffect(() => {
    setLoading(true);
    const base = collection(db, "siteVisits");
    let qRef = selectedExecutive
      ? query(base, where("agent.name", "==", selectedExecutive), orderBy("createdAt", "desc"), limit(1000))
      : query(base, orderBy("createdAt", "desc"), limit(5000));

    const unsub = onSnapshot(qRef, (snap) => {
      try {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setVisits(rows);
        setLoading(false);
        const today = new Date();
        const todayFUs = rows.filter(v => {
          if (!v.nextFollowUpAt) return false;
          const d = getDateFromTimestamp(v.nextFollowUpAt);
          return d && isSameDay(d, today);
        });
        if (todayFUs.length > 0) {
          setNotification(prev => prev || {
            type: 'info',
            message: `You have ${todayFUs.length} follow-up${todayFUs.length > 1 ? 's' : ''} scheduled for today`,
            action: () => { setFilter("Today's Follow-ups"); setNotification(null); }
          });
        }

        // Build kanban data
        const kb = { "Not Booked": [], "Interested": [], "Follow Up": [], "Booked": [], "Cancelled": [] };
        rows.forEach(v => {
          const status = v.bookingStatus || "Not Booked";
          if (kb[status]) kb[status].push(v);
        });
        setKanbanData(kb);

      } catch (error) { console.error("Error:", error); setLoading(false); }
    }, (error) => { console.error("Error:", error); setLoading(false); });
    return unsub;
  }, [selectedExecutive]);

  useEffect(() => {
    const now = new Date();
    const upcoming = visits
      .filter(v => v.nextFollowUpAt && getDateFromTimestamp(v.nextFollowUpAt) > now)
      .sort((a, b) => getDateFromTimestamp(a.nextFollowUpAt) - getDateFromTimestamp(b.nextFollowUpAt))
      .slice(0, 10);
    setUpcomingFollowUps(upcoming);
  }, [visits]);

  // ── Data Loaders ──
  const loadNotesFromFirebase = async (visitId) => {
    try {
      const visitDoc = await getDoc(doc(db, "siteVisits", visitId));
      if (visitDoc.exists()) setNotes(prev => ({ ...prev, [visitId]: visitDoc.data().notes || "" }));
    } catch (error) { console.error("Error loading notes:", error); }
  };

  const loadFollowUpHistory = async (visitId) => {
    if (followUpHistory[visitId]) return;
    setLoadingHistory(prev => ({ ...prev, [visitId]: true }));
    try {
      const followUpsRef = collection(db, "siteVisits", visitId, "followUps");
      const snapshot = await getDocs(query(followUpsRef, orderBy("createdAt", "desc")));
      const followUps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFollowUpHistory(prev => ({ ...prev, [visitId]: followUps }));
      const visitDoc = await getDoc(doc(db, "siteVisits", visitId));
      const visitData = visitDoc.data();
      if (visitData?.notes) setNotes(prev => ({ ...prev, [visitId]: visitData.notes }));
      setLoadingHistory(prev => ({ ...prev, [visitId]: false }));
    } catch (error) {
      console.error("Error loading history:", error);
      showToast("Failed to load follow-up history", "error");
      setLoadingHistory(prev => ({ ...prev, [visitId]: false }));
    }
  };

  // ── Edit Visit ──
  const startEditVisit = (visit) => {
    setEditingVisit(visit);
    const visitDateObj = getDateFromTimestamp(visit.visitAt || visit.createdAt);
    setEditForm({
      visitorName: visit.visitor?.name || "",
      visitorPhone: visit.visitor?.phone || "",
      countryCode: visit.visitor?.countryCode || "+91",
      agentName: visit.agent?.name || "",
      bookingStatus: visit.bookingStatus || "Not Booked",
      visitDate: visitDateObj ? toInputDate(visitDateObj) : toInputDate(),
      visitTime: visitDateObj ? toInputTime(visitDateObj) : toInputTime(),
    });
    setShowEditModal(true);
  };

  const saveEditVisit = async () => {
    if (!editForm.visitorName.trim()) { showToast("Please enter visitor name", "error"); return; }
    if (!editForm.visitorPhone.trim()) { showToast("Please enter phone number", "error"); return; }
    if (!editForm.agentName.trim()) { showToast("Please enter agent name", "error"); return; }
    const visitDateTime = parseDateTime(editForm.visitDate, editForm.visitTime);
    if (!visitDateTime) { showToast("Please enter valid visit date and time", "error"); return; }
    try {
      setSavingFor(editingVisit.id);
      await updateDoc(doc(db, "siteVisits", editingVisit.id), {
        visitor: { name: editForm.visitorName.trim(), phone: editForm.visitorPhone.trim(), countryCode: editForm.countryCode },
        agent: { name: editForm.agentName.trim() },
        bookingStatus: editForm.bookingStatus,
        visitAt: Timestamp.fromDate(visitDateTime),
        updatedAt: serverTimestamp(),
      });
      showToast("Visit updated successfully!", "success");
      setShowEditModal(false);
      setEditingVisit(null);
    } catch (error) { console.error("Error:", error); showToast("Failed to update visit", "error"); }
    finally { setSavingFor(null); }
  };

  const startDeleteVisit = (visit) => { setDeletingVisit(visit); setShowDeleteConfirm(true); };

  const confirmDeleteVisit = async () => {
    if (!deletingVisit) return;
    try {
      setSavingFor(deletingVisit.id);
      const followUpsRef = collection(db, "siteVisits", deletingVisit.id, "followUps");
      const followUpsSnapshot = await getDocs(followUpsRef);
      const batch = writeBatch(db);
      followUpsSnapshot.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, "siteVisits", deletingVisit.id));
      await batch.commit();
      showToast("Visit deleted successfully!", "success");
      setShowDeleteConfirm(false);
      setDeletingVisit(null);
      setFollowUpHistory(prev => { const n = { ...prev }; delete n[deletingVisit.id]; return n; });
      setNotes(prev => { const n = { ...prev }; delete n[deletingVisit.id]; return n; });
    } catch (error) { console.error("Error:", error); showToast("Failed to delete visit", "error"); }
    finally { setSavingFor(null); }
  };

  // ── Calendar Data ──
  const calendarData = useMemo(() => {
    const visitsPerDay = {}, followUpsPerDay = {}, bookingsPerDay = {}, visitsByDate = {};
    allVisits.forEach(visit => {
      const visitDate = getDateFromTimestamp(visit.visitAt || visit.createdAt);
      if (visitDate) {
        const dateStr = toInputDate(visitDate);
        visitsPerDay[dateStr] = (visitsPerDay[dateStr] || 0) + 1;
        if (!visitsByDate[dateStr]) visitsByDate[dateStr] = [];
        visitsByDate[dateStr].push(visit.id);
      }
      if (visit.lastFollowUp?.at) {
        const followUpDate = getDateFromTimestamp(visit.lastFollowUp.at);
        if (followUpDate) followUpsPerDay[toInputDate(followUpDate)] = (followUpsPerDay[toInputDate(followUpDate)] || 0) + 1;
      }
      if (visit.bookingStatus === "Booked") {
        const bookingDate = getDateFromTimestamp(visit.lastFollowUp?.at || visit.visitAt || visit.createdAt);
        if (bookingDate) bookingsPerDay[toInputDate(bookingDate)] = (bookingsPerDay[toInputDate(bookingDate)] || 0) + 1;
      }
    });
    return { visitsPerDay, followUpsPerDay, bookingsPerDay, visitsByDate };
  }, [allVisits]);

  // ── Executive Stats ──
  const executiveStats = useMemo(() => {
    const stats = {};
    salesExecutives.forEach(exec => {
      stats[exec] = {
        total: 0, followed: 0, booked: 0, interested: 0, followUpStatus: 0,
        notBooked: 0, conversionRate: 0, followUpRate: 0, outcomes: {}, methods: {},
        dailyStats: {}, recentActivity: 0, avgLeadScore: 0, hotLeads: 0,
      };
    });
    allVisits.forEach(visit => {
      const execName = visit.agent?.name;
      if (!execName || !stats[execName]) return;
      const s = stats[execName];
      s.total++;
      const fuCount = visit.followUpCount || 0;
      if (fuCount > 0) s.followed++;
      const bookingStatus = visit.bookingStatus || "Not Booked";
      switch (bookingStatus) {
        case "Booked": s.booked++; break;
        case "Interested": s.interested++; break;
        case "Follow Up": s.followUpStatus++; break;
        default: s.notBooked++;
      }
      const score = calculateLeadScore(visit);
      s.avgLeadScore = (s.avgLeadScore * (s.total - 1) + score) / s.total;
      if (score >= 80) s.hotLeads++;
      if (visit.lastFollowUp) {
        const outcome = visit.lastFollowUp.outcome;
        const method = visit.lastFollowUp.method;
        if (outcome) s.outcomes[outcome] = (s.outcomes[outcome] || 0) + 1;
        if (method) s.methods[method] = (s.methods[method] || 0) + 1;
        const followUpDate = getDateFromTimestamp(visit.lastFollowUp.at);
        if (followUpDate && Math.ceil(Math.abs(new Date() - followUpDate) / (1000 * 60 * 60 * 24)) <= 7) s.recentActivity++;
      }
    });
    Object.keys(stats).forEach(exec => {
      const s = stats[exec];
      if (s.total > 0) { s.conversionRate = (s.booked / s.total) * 100; s.followUpRate = (s.followed / s.total) * 100; }
    });
    return stats;
  }, [allVisits, salesExecutives]);

  // ── Leaderboard ──
  const leaderboard = useMemo(() => {
    return salesExecutives
      .filter(exec => executiveStats[exec] && executiveStats[exec].total > 0)
      .map(exec => {
        const s = executiveStats[exec];
        const performanceScore = (s.booked * 40) + (s.interested * 20) + (s.followed * 10) + (s.recentActivity * 15) + Math.round(s.avgLeadScore * 0.5);
        return { exec, ...s, performanceScore };
      })
      .sort((a, b) => b.performanceScore - a.performanceScore);
  }, [executiveStats, salesExecutives]);

  // ── Chart Data ──
  const chartData = useMemo(() => {
    const activeExecutives = salesExecutives.filter(exec => executiveStats[exec]?.total > 0);
    if (!activeExecutives.length) return { booking: { labels: [], datasets: [] }, followUp: { labels: [], datasets: [] }, visits: { labels: [], datasets: [] }, outcomes: { labels: [], datasets: [] }, methods: { labels: [], datasets: [] }, activityTrend: { labels: [], datasets: [] }, radar: { labels: [], datasets: [] } };

    const bookingLabels = ["Booked", "Interested", "Follow Up", "Not Booked"];
    const bookingData = {
      labels: activeExecutives,
      datasets: bookingLabels.map(label => ({
        label, data: activeExecutives.map(exec => {
          const s = executiveStats[exec];
          return label === "Booked" ? s.booked : label === "Interested" ? s.interested : label === "Follow Up" ? s.followUpStatus : s.notBooked;
        }),
        backgroundColor: CHART_COLORS.booking[label], borderColor: CHART_COLORS.booking[label]?.replace('0.85', '1'), borderWidth: 1,
      })),
    };

    const followUpData = {
      labels: activeExecutives,
      datasets: [
        { label: 'Follow-up Rate (%)', data: activeExecutives.map(exec => Number((executiveStats[exec]?.followUpRate || 0).toFixed(1))), backgroundColor: 'rgba(75, 192, 192, 0.8)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2 },
        { label: 'Conversion Rate (%)', data: activeExecutives.map(exec => Number((executiveStats[exec]?.conversionRate || 0).toFixed(1))), backgroundColor: 'rgba(255, 99, 132, 0.8)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2 },
      ],
    };

    const visitsData = {
      labels: activeExecutives,
      datasets: [
        { label: 'Total Visits', data: activeExecutives.map(exec => executiveStats[exec]?.total || 0), backgroundColor: 'rgba(54, 162, 235, 0.8)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 2 },
        { label: 'Followed Up', data: activeExecutives.map(exec => executiveStats[exec]?.followed || 0), backgroundColor: 'rgba(75, 192, 192, 0.8)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2 },
        { label: '🔥 Hot Leads', data: activeExecutives.map(exec => executiveStats[exec]?.hotLeads || 0), backgroundColor: 'rgba(255, 99, 132, 0.8)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2 },
      ],
    };

    const allOutcomes = [...new Set(Object.values(executiveStats).flatMap(s => Object.keys(s.outcomes || {})))].slice(0, 6);
    const outcomesData = {
      labels: allOutcomes,
      datasets: activeExecutives.map((exec, i) => ({
        label: exec, data: allOutcomes.map(o => executiveStats[exec]?.outcomes[o] || 0),
        backgroundColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length],
        borderColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length].replace('0.8', '1'), borderWidth: 1,
      })),
    };

    const allMethods = [...new Set(Object.values(executiveStats).flatMap(s => Object.keys(s.methods || {})))];
    const methodsData = {
      labels: allMethods,
      datasets: activeExecutives.map((exec, i) => ({
        label: exec, data: allMethods.map(m => executiveStats[exec]?.methods[m] || 0),
        backgroundColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length],
        borderColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length].replace('0.8', '1'), borderWidth: 1,
      })),
    };

    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return toInputDate(d);
    });
    const activityTrendData = {
      labels: last30Days.map(d => d.slice(5)),
      datasets: [
        { label: 'New Visits', data: last30Days.map(d => calendarData.visitsPerDay[d] || 0), borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.1)', borderWidth: 2, fill: true, tension: 0.4 },
        { label: 'Follow-ups Done', data: last30Days.map(d => calendarData.followUpsPerDay[d] || 0), borderColor: 'rgba(75, 192, 192, 1)', backgroundColor: 'rgba(75, 192, 192, 0.1)', borderWidth: 2, fill: true, tension: 0.4 },
        { label: 'Bookings', data: last30Days.map(d => calendarData.bookingsPerDay[d] || 0), borderColor: 'rgba(46, 184, 92, 1)', backgroundColor: 'rgba(46, 184, 92, 0.1)', borderWidth: 2, fill: true, tension: 0.4 },
      ],
    };

    // Radar for executive performance
    const radarData = activeExecutives.length > 0 ? {
      labels: ['Conversion', 'Follow-up Rate', 'Hot Leads', 'Recent Activity', 'Avg Score'],
      datasets: activeExecutives.slice(0, 5).map((exec, i) => {
        const s = executiveStats[exec];
        return {
          label: exec,
          data: [
            s.conversionRate, s.followUpRate,
            Math.min((s.hotLeads / (s.total || 1)) * 100, 100),
            Math.min(s.recentActivity * 10, 100),
            s.avgLeadScore,
          ],
          borderColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length].replace('0.8', '1'),
          backgroundColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length].replace('0.8', '0.15'),
          borderWidth: 2, pointBackgroundColor: CHART_COLORS.primary[i % CHART_COLORS.primary.length].replace('0.8', '1'),
        };
      }),
    } : { labels: [], datasets: [] };

    return { booking: bookingData, followUp: followUpData, visits: visitsData, outcomes: outcomesData, methods: methodsData, activityTrend: activityTrendData, radar: radarData };
  }, [executiveStats, salesExecutives, allVisits, calendarData]);

  // ── Filtered + Scored Visits ──
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let rows = visits.filter((v) => {
      const name = v.visitor?.name?.toLowerCase() || "";
      const phone = v.visitor?.phone || "";
      const agent = v.agent?.name?.toLowerCase() || "";
      const remarks = v.lastFollowUp?.remarks?.toLowerCase() || "";
      const tagList = (tags[v.id] || []).join(" ").toLowerCase();

      if (quickFilters.onlyBooked && v.bookingStatus !== "Booked") return false;
      if (quickFilters.onlyInterested && v.bookingStatus !== "Interested") return false;
      if (quickFilters.hotLeads && calculateLeadScore(v) < 80) return false;
      if (quickFilters.todayFollowUps) {
        const fd = getDateFromTimestamp(v.nextFollowUpAt);
        if (!fd || !isSameDay(fd, today)) return false;
      }
      if (quickFilters.overdueFollowUps) {
        const fd = getDateFromTimestamp(v.nextFollowUpAt);
        if (!fd || fd >= today) return false;
      }

      let matchesDate = true;
      if (selectedDate) {
        const visitDate = formatDateToYMD(v.visitAt || v.createdAt);
        const nextFU = v.nextFollowUpAt ? formatDateToYMD(v.nextFollowUpAt) : null;
        const lastFU = v.lastFollowUp?.at ? formatDateToYMD(v.lastFollowUp.at) : null;
        matchesDate = visitDate === selectedDate || nextFU === selectedDate || lastFU === selectedDate;
      }

      const hit = !term || name.includes(term) || phone.includes(term) || agent.includes(term) || remarks.includes(term) || tagList.includes(term);
      if (!hit || !matchesDate) return false;

      switch (filter) {
        case "Booked": return v.bookingStatus === "Booked";
        case "Interested": return v.bookingStatus === "Interested";
        case "Follow Up": return v.bookingStatus === "Follow Up";
        case "Followed Up": return v.followUpCount && v.followUpCount > 0;
        case "Not Followed Up": return !v.followUpCount || v.followUpCount === 0;
        case "Overdue": { const nf = getDateFromTimestamp(v.nextFollowUpAt); return nf && nf < today; }
        case "Today's Follow-ups": { const fd = getDateFromTimestamp(v.nextFollowUpAt); return fd && isSameDay(fd, today); }
        default: return true;
      }
    });

    rows = rows.sort((a, b) => {
      if (sortOption === "leadScoreDesc") return calculateLeadScore(b) - calculateLeadScore(a);
      if (sortOption === "nextFollowUpAsc") {
        const na = a.nextFollowUpAt ? getDateFromTimestamp(a.nextFollowUpAt)?.getTime() || Infinity : Infinity;
        const nb = b.nextFollowUpAt ? getDateFromTimestamp(b.nextFollowUpAt)?.getTime() || Infinity : Infinity;
        if (isFinite(na) && isFinite(nb)) return na - nb;
        if (isFinite(na)) return -1;
        if (isFinite(nb)) return 1;
        return 0;
      }
      if (sortOption === "nextFollowUpDesc") return (getDateFromTimestamp(b.nextFollowUpAt)?.getTime() || 0) - (getDateFromTimestamp(a.nextFollowUpAt)?.getTime() || 0);
      if (sortOption === "creationDesc") return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      if (sortOption === "creationAsc") return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      if (sortOption === "lastActivityDesc") return (b.lastFollowUp?.at?.seconds || b.createdAt?.seconds || 0) - (a.lastFollowUp?.at?.seconds || a.createdAt?.seconds || 0);
      return 0;
    });
    return rows;
  }, [visits, search, filter, selectedDate, sortOption, quickFilters, tags]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filtered.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (pageNumber) => { setCurrentPage(Math.max(1, Math.min(pageNumber, totalPages))); window.scrollTo(0, 0); };

  // ── Bulk Actions ──
  const toggleBulkSelection = useCallback((id) => setBulkSelections(prev => ({ ...prev, [id]: !prev[id] })), []);
  const selectAllVisible = useCallback(() => { const s = {}; currentItems.forEach(v => { s[v.id] = true; }); setBulkSelections(s); }, [currentItems]);
  const clearAllSelections = useCallback(() => setBulkSelections({}), []);
  const selectedCount = useMemo(() => Object.values(bulkSelections).filter(Boolean).length, [bulkSelections]);

  const processBulkFollowUps = async () => {
    if (selectedCount === 0) { showToast("No records selected", "warning"); return; }
    if (!bulkForm.outcome) { showToast("Please select an outcome", "error"); return; }
    if (!bulkForm.remarks.trim()) { showToast("Please enter remarks", "error"); return; }
    const nextAt = parseDateTime(bulkForm.nextDate, bulkForm.nextTime);
    if (!nextAt) { showToast("Please select a valid next follow-up date", "error"); return; }
    const selectedIds = Object.keys(bulkSelections).filter(id => bulkSelections[id]);
    const selectedVisits = visits.filter(v => selectedIds.includes(v.id));
    try {
      setLoading(true);
      const batch = writeBatch(db);
      const nextTimestamp = Timestamp.fromDate(nextAt);
      for (const visit of selectedVisits) {
        const followUpRef = doc(collection(db, "siteVisits", visit.id, "followUps"));
        batch.set(followUpRef, {
          method: bulkForm.method, outcome: bulkForm.outcome, remarks: bulkForm.remarks.trim(),
          createdAt: serverTimestamp(), createdBy: visit.agent?.name || "Agent",
          nextFollowUpAt: nextTimestamp, visitorPhone: visit.visitor?.phone || "",
          visitorName: visit.visitor?.name || "", visitRefId: visit.id, isBulk: true,
        });
        batch.update(doc(db, "siteVisits", visit.id), {
          lastFollowUp: { method: bulkForm.method, outcome: bulkForm.outcome, remarks: bulkForm.remarks.trim(), at: serverTimestamp(), by: visit.agent?.name || "Agent", nextFollowUpAt: nextTimestamp, isBulk: true },
          nextFollowUpAt: nextTimestamp, followUpCount: increment(1),
        });
      }
      await batch.commit();
      showToast(`Successfully updated ${selectedCount} follow-ups`, "success");
      setBulkSelections({});
      setShowBulkActions(false);
    } catch (error) { console.error("Error:", error); showToast("Failed to process bulk follow-ups", "error"); }
    finally { setLoading(false); }
  };

  // ── Edit Follow-up ──
  const startEditFollowUp = (followUp, visitId) => {
    setEditingFollowUpId(followUp.id);
    let nextDate = toInputDate(), nextTime = toInputTime();
    if (followUp.nextFollowUpAt) { const d = getDateFromTimestamp(followUp.nextFollowUpAt); if (d) { nextDate = toInputDate(d); nextTime = toInputTime(d); } }
    setEditFollowUpForm({ visitId, method: followUp.method || "Call", outcome: followUp.outcome || "", remarks: followUp.remarks || "", bookingStatus: followUp.newBookingStatus || "Not Booked", nextDate, nextTime, noNext: !followUp.nextFollowUpAt });
  };

  const saveEditedFollowUp = async (followUpId, visitId) => {
    const ed = editFollowUpForm;
    if (!ed.outcome) { showToast("Please select an outcome", "warning"); return; }
    if (!ed.remarks.trim()) { showToast("Please enter remarks", "warning"); return; }
    let nextAt = null;
    if (!ed.noNext) { const dt = parseDateTime(ed.nextDate, ed.nextTime); if (!dt) { showToast("Please select valid date and time", "warning"); return; } nextAt = Timestamp.fromDate(dt); }
    try {
      setSavingFor(followUpId);
      await updateDoc(doc(db, "siteVisits", visitId, "followUps", followUpId), {
        method: ed.method, outcome: ed.outcome, remarks: ed.remarks.trim(),
        bookingStatus: ed.bookingStatus, nextFollowUpAt: nextAt || null, updatedAt: serverTimestamp(),
      });
      const visitHistory = followUpHistory[visitId] || [];
      const isLatest = visitHistory[0]?.id === followUpId;
      if (isLatest) {
        await updateDoc(doc(db, "siteVisits", visitId), {
          lastFollowUp: { method: ed.method, outcome: ed.outcome, remarks: ed.remarks.trim(), at: serverTimestamp(), bookingStatusSnapshot: ed.bookingStatus, nextFollowUpAt: nextAt || null },
          nextFollowUpAt: nextAt || null, bookingStatus: ed.bookingStatus,
        });
      }
      showToast("Follow-up updated successfully!", "success");
      setEditingFollowUpId(null);
      setEditFollowUpForm({});
      setFollowUpHistory(prev => { const n = { ...prev }; delete n[visitId]; return n; });
      loadFollowUpHistory(visitId);
    } catch (error) { console.error("Error:", error); showToast("Failed to update follow-up", "error"); }
    finally { setSavingFor(null); }
  };

  // ── Notes ──
  const saveNotes = async (visitId, noteText) => {
    try {
      await updateDoc(doc(db, "siteVisits", visitId), { notes: noteText, notesUpdatedAt: serverTimestamp() });
      setNotes(prev => ({ ...prev, [visitId]: noteText }));
      setNotesEditMode(prev => ({ ...prev, [visitId]: false }));
      showToast("Notes saved!", "success");
    } catch { showToast("Failed to save notes", "error"); }
  };

  // ── Follow-up Form ──
  const openForm = (v) => {
    setExpanded(v.id === expanded ? null : v.id);
    if (v.id !== expanded) loadFollowUpHistory(v.id);
    const nextDefault = new Date();
    nextDefault.setDate(nextDefault.getDate() + 1);
    nextDefault.setHours(10, 0, 0, 0);
    setForm({ method: "Call", outcome: "", remarks: "", bookingStatus: v.bookingStatus || "Not Booked", nextDate: toInputDate(nextDefault), nextTime: toInputTime(nextDefault), noNext: false });
  };

  const toggleHistory = (visitId) => {
    setShowHistory(prev => ({ ...prev, [visitId]: !prev[visitId] }));
    if (!followUpHistory[visitId]) loadFollowUpHistory(visitId);
  };

  const handleAddFollowUp = async (visit) => {
    const id = visit.id;
    const { method, outcome, remarks, bookingStatus, nextDate, nextTime, noNext } = form;
    if (!outcome) { showToast("Please select an outcome", "warning"); return; }
    if (!remarks.trim()) { showToast("Please write short remarks", "warning"); return; }
    let nextAt = null;
    if (!noNext) { const dt = parseDateTime(nextDate, nextTime); if (!dt) { showToast("Please select a valid follow-up date", "warning"); return; } nextAt = Timestamp.fromDate(dt); }
    const payload = { method, outcome, remarks: remarks.trim(), newBookingStatus: bookingStatus, createdAt: serverTimestamp(), createdBy: visit.agent?.name || "Agent", nextFollowUpAt: nextAt || null, visitorPhone: visit.visitor?.phone || "", visitorName: visit.visitor?.name || "", visitRefId: id };
    if (voiceRecorder.audioBlob) {
      // Store audio reference (in real app, upload to storage)
      const reader = new FileReader();
      reader.onload = (e) => {
        setVoiceNotes(prev => ({ ...prev, [id]: { url: e.target.result, duration: voiceRecorder.recordingTime } }));
      };
      reader.readAsDataURL(voiceRecorder.audioBlob);
      voiceRecorder.clearRecording();
    }
    try {
      setSavingFor(id);
      await addDoc(collection(db, "siteVisits", id, "followUps"), payload);
      await updateDoc(doc(db, "siteVisits", id), {
        lastFollowUp: { method, outcome, remarks: remarks.trim(), at: serverTimestamp(), by: visit.agent?.name || "Agent", bookingStatusSnapshot: bookingStatus, nextFollowUpAt: nextAt || null },
        nextFollowUpAt: nextAt || null, followUpCount: increment(1), bookingStatus,
      });
      showToast("Follow-up saved successfully!", "success");
      setExpanded(null);
      setFollowUpHistory(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) { showToast("Error saving follow-up.", "error"); console.error(e); }
    finally { setSavingFor(null); }
  };

  // ── Reminders ──
  const addReminder = (visit) => {
    const reminder = {
      id: Date.now(),
      visitId: visit.id,
      visitorName: visit.visitor?.name || "Unknown",
      phone: visit.visitor?.phone,
      date: reminderForm.date,
      time: reminderForm.time,
      note: reminderForm.note,
      dismissed: false,
    };
    const updated = [...reminders, reminder];
    setReminders(updated);
    localStorage.setItem("fuReminders", JSON.stringify(updated));
    setShowReminderModal(null);
    setReminderForm({ date: toInputDate(), time: toInputTime(), note: "" });
    showToast("Reminder set! You'll be notified at the scheduled time.", "success");
  };

  // ── Tags ──
  const addTag = (visitId) => {
    if (!tagInput.trim()) return;
    const updated = { ...tags, [visitId]: [...(tags[visitId] || []), tagInput.trim()] };
    setTags(updated);
    localStorage.setItem("fuTags", JSON.stringify(updated));
    setTagInput("");
  };

  const removeTag = (visitId, tag) => {
    const updated = { ...tags, [visitId]: (tags[visitId] || []).filter(t => t !== tag) };
    setTags(updated);
    localStorage.setItem("fuTags", JSON.stringify(updated));
  };

  // ── Export ──
  const exportData = () => {
    try {
      const dataToExport = exportScope === "filtered" ? filtered : visits;
      const formattedData = dataToExport.map(v => ({
        "Visitor Name": v.visitor?.name || "",
        "Phone": v.visitor?.phone || "",
        "Country Code": v.visitor?.countryCode || "+91",
        "Executive": v.agent?.name || "",
        "Visit Date": formatDetailedDate(v.visitAt || v.createdAt),
        "Booking Status": v.bookingStatus || "Not Booked",
        "Lead Score": calculateLeadScore(v),
        "Lead Priority": getScoreLabel(calculateLeadScore(v)),
        "Follow-up Count": v.followUpCount || 0,
        "Last Follow-up Date": v.lastFollowUp?.at ? formatDetailedDate(v.lastFollowUp.at) : "",
        "Last Method": v.lastFollowUp?.method || "",
        "Last Outcome": v.lastFollowUp?.outcome || "",
        "Last Remarks": v.lastFollowUp?.remarks || "",
        "Next Follow-up": v.nextFollowUpAt ? formatDetailedDate(v.nextFollowUpAt) : "",
        "Tags": (tags[v.id] || []).join(", "),
        "Notes": v.notes || "",
      }));
      if (exportFormat === "excel") {
        const ws = XLSX.utils.json_to_sheet(formattedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Follow-ups");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `follow-ups-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        const ws = XLSX.utils.json_to_sheet(formattedData);
        saveAs(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `follow-ups-${new Date().toISOString().slice(0, 10)}.csv`);
      }
      showToast(`Exported ${formattedData.length} records`, "success");
      setShowExportOptions(false);
    } catch (error) { console.error(error); showToast("Failed to export", "error"); }
  };

  // ── Badge Classes ──
  const badgeClass = (status) => {
    switch (status) {
      case "Booked": return "badge booked";
      case "Interested": return "badge interested";
      case "Follow Up": return "badge follow";
      case "Cancelled": return "badge cancelled";
      default: return "badge notbooked";
    }
  };
  const followupClass = (v) => v.followUpCount && v.followUpCount > 0 ? "followed-up" : "not-followed";
  const getOutcomeBadgeClass = (outcome) => {
    const l = outcome?.toLowerCase() || "";
    if (l.includes("connected") || l.includes("interested")) return "outcome-success";
    if (l.includes("call later") || l.includes("follow")) return "outcome-warning";
    if (l.includes("not reachable") || l.includes("wrong")) return "outcome-danger";
    if (l.includes("visited site") || l.includes("will visit")) return "outcome-primary";
    return "outcome-default";
  };

  // ── Calendar ──
  const prevMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  const handleDateClick = (dateStr) => { setSelectedDate(selectedDate === dateStr ? null : dateStr); if (dateStr !== selectedDate) setViewMode("list"); };
  const resetDateFilter = () => setSelectedDate(null);

  // ── Chart Options ──
  const baseChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, padding: 15, font: { size: 12 }, color: darkMode ? '#e0e0e0' : '#333' } },
      tooltip: { backgroundColor: darkMode ? 'rgba(40,40,40,0.9)' : 'rgba(0,0,0,0.8)', titleColor: '#fff', bodyColor: '#fff', cornerRadius: 6, displayColors: true, padding: 10 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 }, color: darkMode ? '#bbb' : '#666' } },
      y: { beginAtZero: true, grid: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, ticks: { font: { size: 11 }, color: darkMode ? '#bbb' : '#666' } },
    },
  };

  const radarOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { color: darkMode ? '#e0e0e0' : '#333', boxWidth: 12 } } },
    scales: { r: { beginAtZero: true, max: 100, ticks: { color: darkMode ? '#bbb' : '#666', font: { size: 10 } }, grid: { color: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }, pointLabels: { color: darkMode ? '#e0e0e0' : '#333', font: { size: 11 } } } },
  };

  // ── Render Helpers ──
  const renderNotification = () => !notification ? null : (
    <div className="fu-notification">
      <div className="fu-notification-content">
        <div className="fu-notification-icon info">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
        </div>
        <div className="fu-notification-message">{notification.message}</div>
        <div className="fu-notification-actions">
          <button onClick={notification.action}>View</button>
          <button onClick={() => setNotification(null)}>Dismiss</button>
        </div>
      </div>
    </div>
  );

  const renderLeaderboard = () => {
    if (!showLeaderboard) return null;
    const medals = ['🥇', '🥈', '🥉'];
    return (
      <div className="fu-leaderboard-panel">
        <div className="fu-leaderboard-header">
          <h3>🏆 Performance Leaderboard</h3>
          <button onClick={() => setShowLeaderboard(false)} className="fu-modal-close" style={{position:'static'}}>×</button>
        </div>
        <div className="fu-leaderboard-list">
          {leaderboard.map((exec, i) => (
            <div key={exec.exec} className={`fu-leaderboard-item ${i < 3 ? 'top-' + (i + 1) : ''}`}>
              <div className="fu-lb-rank">{i < 3 ? medals[i] : `#${i + 1}`}</div>
              <div className="fu-lb-info">
                <div className="fu-lb-name">{exec.exec}</div>
                <div className="fu-lb-stats">
                  <span>📊 {exec.total} leads</span>
                  <span>✅ {exec.booked} booked</span>
                  <span>🔥 {exec.hotLeads} hot</span>
                  <span>⚡ {exec.recentActivity} recent</span>
                </div>
              </div>
              <div className="fu-lb-score">
                <div className="fu-lb-score-val">{exec.performanceScore}</div>
                <div className="fu-lb-score-label">pts</div>
              </div>
              <div className="fu-lb-bars">
                <div className="fu-lb-bar-wrap">
                  <div className="fu-lb-bar-fill" style={{ width: `${exec.conversionRate.toFixed(0)}%`, background: 'linear-gradient(90deg, #27694f, #2d7a5c)' }}></div>
                  <span>{exec.conversionRate.toFixed(1)}% conv.</span>
                </div>
                <div className="fu-lb-bar-wrap">
                  <div className="fu-lb-bar-fill" style={{ width: `${exec.followUpRate.toFixed(0)}%`, background: 'linear-gradient(90deg, #2471a3, #3d8bc9)' }}></div>
                  <span>{exec.followUpRate.toFixed(1)}% f/u rate</span>
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
          <button onClick={() => setShowActivityFeed(false)} className="fu-modal-close" style={{position:'static'}}>×</button>
        </div>
        <div className="fu-activity-list">
          {activityFeed.length === 0 ? (
            <div className="fu-activity-empty">No recent activity</div>
          ) : activityFeed.map((item, i) => (
            <div key={item.id + i} className="fu-activity-item">
              <div className="fu-activity-dot" style={{ background: getScoreColor(50) }}></div>
              <div className="fu-activity-content">
                <div className="fu-activity-title">
                  <strong>{item.name || "Unknown"}</strong>
                  <span className={`fu-outcome-badge ${getOutcomeBadgeClass(item.outcome)}`}>{item.outcome}</span>
                  <span className={badgeClass(item.bookingStatus)}>{item.bookingStatus}</span>
                </div>
                <div className="fu-activity-meta">
                  <span>👤 {item.agent}</span>
                  <span>📞 {item.method}</span>
                  <span>🕐 {formatTimeAgo(item.at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderWhatsAppTemplates = () => {
    if (!showWhatsAppTemplates) return null;
    const visit = showWhatsAppTemplates;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal">
          <div className="fu-modal-header">
            <h3>💬 WhatsApp Templates</h3>
            <button className="fu-modal-close" onClick={() => setShowWhatsAppTemplates(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <p style={{ fontSize: '0.8rem', color: 'var(--fu-text-muted)', marginBottom: '14px' }}>
              Sending to: <strong>{visit.visitor?.name}</strong> ({visit.visitor?.countryCode} {visit.visitor?.phone})
            </p>
            <div className="fu-template-list">
              {WHATSAPP_TEMPLATES.map((tpl, i) => (
                <div key={i} className="fu-template-item" onClick={() => { whatsappVisitorUtil(visit.visitor?.phone, visit.visitor?.name, visit.visitor?.countryCode, tpl.text); setShowWhatsAppTemplates(null); }}>
                  <div className="fu-template-label">{tpl.label}</div>
                  <div className="fu-template-preview">{tpl.text.replace('{name}', visit.visitor?.name || '').slice(0, 100)}...</div>
                </div>
              ))}
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowWhatsAppTemplates(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const renderAISuggestion = () => {
    if (!showAISuggestion) return null;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal fu-ai-modal">
          <div className="fu-modal-header">
            <h3>🤖 AI Follow-up Strategy</h3>
            <button className="fu-modal-close" onClick={() => { setShowAISuggestion(null); clearSuggestion(); }}>×</button>
          </div>
          <div className="fu-modal-body">
            {loadingAI ? (
              <div className="fu-ai-loading">
                <div className="fu-ai-spinner"></div>
                <p>Analyzing lead data and generating strategy...</p>
              </div>
            ) : suggestion ? (
              <div className="fu-ai-content">
                <div className="fu-ai-header-row">
                  <div className={`fu-ai-priority priority-${suggestion.priority?.toLowerCase()}`}>{suggestion.priority} Priority</div>
                  <div className="fu-ai-method">Recommended: <strong>{suggestion.suggestedMethod}</strong></div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">💡 Recommended Action</div>
                  <div className="fu-ai-value">{suggestion.recommendedAction}</div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">⏰ Best Time to Reach</div>
                  <div className="fu-ai-value">{suggestion.bestTime}</div>
                </div>
                <div className="fu-ai-action">
                  <div className="fu-ai-label">💬 Sample Opener</div>
                  <div className="fu-ai-value fu-ai-opener">"{suggestion.sampleOpener}"</div>
                </div>
                <div className="fu-ai-section">
                  <div className="fu-ai-label">📋 Talking Points</div>
                  <ul className="fu-ai-list">
                    {suggestion.talkingPoints?.map((point, i) => <li key={i}>{point}</li>)}
                  </ul>
                </div>
                {suggestion.warningFlags?.length > 0 && (
                  <div className="fu-ai-section fu-ai-warnings">
                    <div className="fu-ai-label">⚠️ Warning Flags</div>
                    <ul className="fu-ai-list warning">
                      {suggestion.warningFlags.map((flag, i) => <li key={i}>{flag}</li>)}
                    </ul>
                  </div>
                )}
                <div className="fu-ai-motivation">
                  <span>💪</span> {suggestion.motivationalNote}
                </div>
              </div>
            ) : (
              <div className="fu-ai-empty">Click "Get Strategy" to generate AI-powered follow-up suggestions.</div>
            )}
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => { setShowAISuggestion(null); clearSuggestion(); }}>Close</button>
            <button className="fu-btn primary" onClick={() => getAISuggestion(aiSuggestionVisit, followUpHistory[aiSuggestionVisit?.id])} disabled={loadingAI}>
              {loadingAI ? "Analyzing..." : "🤖 Get Strategy"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderVoiceNote = (visitId) => {
    if (showVoiceNote !== visitId) return null;
    return (
      <div className="fu-voice-panel">
        <div className="fu-voice-header">
          <h4>🎙️ Voice Note</h4>
          <button onClick={() => setShowVoiceNote(null)}>×</button>
        </div>
        {voiceNotes[visitId] && (
          <div className="fu-voice-playback">
            <audio controls src={voiceNotes[visitId].url} style={{ width: '100%' }} />
            <span className="fu-voice-duration">Duration: {voiceRecorder.formatTime(voiceNotes[visitId].duration || 0)}</span>
          </div>
        )}
        <div className="fu-voice-recorder">
          {voiceRecorder.isRecording ? (
            <div className="fu-voice-recording">
              <div className="fu-voice-dot"></div>
              <span>Recording: {voiceRecorder.formatTime(voiceRecorder.recordingTime)}</span>
              <button className="fu-btn danger" onClick={voiceRecorder.stopRecording}>Stop</button>
            </div>
          ) : voiceRecorder.audioUrl ? (
            <div className="fu-voice-preview">
              <audio controls src={voiceRecorder.audioUrl} style={{ width: '100%' }} />
              <div className="fu-voice-actions">
                <button className="fu-btn ghost" onClick={voiceRecorder.clearRecording}>Discard</button>
                <button className="fu-btn primary" onClick={() => {
                  setVoiceNotes(prev => ({ ...prev, [visitId]: { url: voiceRecorder.audioUrl, duration: voiceRecorder.recordingTime } }));
                  voiceRecorder.clearRecording();
                  setShowVoiceNote(null);
                  showToast("Voice note saved!", "success");
                }}>Save Note</button>
              </div>
            </div>
          ) : (
            <button className="fu-btn primary" onClick={voiceRecorder.startRecording}>
              🎙️ Start Recording
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTimeline = (visitId) => {
    if (showTimeline !== visitId) return null;
    const history = followUpHistory[visitId] || [];
    const visit = visits.find(v => v.id === visitId);
    if (!visit) return null;
    const events = [
      { type: 'visit', date: getDateFromTimestamp(visit.visitAt || visit.createdAt), label: 'Site Visit Registered', detail: `By ${visit.agent?.name || 'Unknown'}`, color: 'var(--fu-navy)' },
      ...history.map(fu => ({
        type: 'followup', date: getDateFromTimestamp(fu.createdAt), label: `Follow-up: ${fu.outcome}`,
        detail: `${fu.method} • ${fu.remarks?.slice(0, 60) || ''}`, color: getScoreColor(50),
      })),
    ].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    return (
      <div className="fu-timeline-panel">
        <div className="fu-timeline-header">
          <h4>📅 Activity Timeline</h4>
          <button onClick={() => setShowTimeline(null)}>×</button>
        </div>
        <div className="fu-timeline">
          {events.map((event, i) => (
            <div key={i} className="fu-timeline-item">
              <div className="fu-timeline-dot" style={{ background: event.color }}></div>
              <div className="fu-timeline-content">
                <div className="fu-timeline-label">{event.label}</div>
                <div className="fu-timeline-detail">{event.detail}</div>
                <div className="fu-timeline-date">{event.date ? formatDetailedDate(event.date) : '-'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderKanban = () => {
  if (viewMode !== 'kanban') return null;

  const columns = ["Not Booked", "Interested", "Follow Up", "Booked", "Cancelled"];

  const columnColors = {
    "Not Booked": "var(--fu-red)",
    "Interested": "var(--fu-blue)",
    "Follow Up": "var(--fu-amber)",
    "Booked": "var(--fu-green)",
    "Cancelled": "var(--fu-text-muted)"
  };

  const handleDragStart = (e, visit) => {
    setDraggedItem(visit);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, column) => {
    e.preventDefault();
    setDragOverColumn(column);
  };

  const handleDrop = async (e, column) => {
    e.preventDefault();

    if (!draggedItem || draggedItem.bookingStatus === column) {
      setDraggedItem(null);
      setDragOverColumn(null);
      return;
    }

    try {
      await updateDoc(doc(db, "siteVisits", draggedItem.id), {
        bookingStatus: column,
        updatedAt: serverTimestamp()
      });
      showToast(`Moved to ${column}`, "success");
    } catch (error) {
      showToast("Failed to move", "error");
    }

    setDraggedItem(null);
    setDragOverColumn(null);
  };

  return (
    <div className="fu-kanban">
      {columns.map((col) => {
        const colVisits = (kanbanData[col] || []).filter((v) => {
          if (!selectedExecutive) return true;
          return v.agent?.name === selectedExecutive;
        });

        return (
          <div
            key={col}
            className={`fu-kanban-col ${dragOverColumn === col ? "drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, col)}
            onDrop={(e) => handleDrop(e, col)}
            onDragLeave={() => setDragOverColumn(null)}
          >
            <div
              className="fu-kanban-col-header"
              style={{ borderTopColor: columnColors[col] }}
            >
              <span className="fu-kanban-col-title">{col}</span>
              <span className="fu-kanban-col-count">{colVisits.length}</span>
            </div>

            <div className="fu-kanban-cards">
              {colVisits.length === 0 ? (
                <div className="fu-kanban-empty">No leads</div>
              ) : (
                colVisits.map((visit) => {
                  const score = calculateLeadScore(visit);

                  return (
                    <div
                      key={visit.id}
                      className="fu-kanban-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, visit)}
                    >
                      <div className="fu-kanban-card-name">
                        {visit.visitor?.name || "Unknown"}
                      </div>

                      <div className="fu-kanban-card-agent">
                        👤 {visit.agent?.name || "Unassigned"}
                      </div>

                      {visit.visitor?.phone && (
                        <div className="fu-kanban-card-phone">
                          📱 {visit.visitor?.countryCode || ""} {visit.visitor?.phone}
                        </div>
                      )}

                      {visit.project?.name && (
                        <div className="fu-kanban-card-project">
                          🏠 {visit.project?.name}
                        </div>
                      )}

                      <div className="fu-kanban-card-footer">
                        <div
                          className="fu-kanban-score"
                          style={{ color: getScoreColor(score) }}
                        >
                          ● {score} pts
                        </div>

                        <div className="fu-kanban-card-actions">
                          <button
                            type="button"
                            onClick={() =>
                              callVisitorUtil(
                                visit.visitor?.phone,
                                visit.visitor?.countryCode
                              )
                            }
                            title="Call"
                          >
                            📞
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowWhatsAppTemplates(visit);
                            }}
                            title="WhatsApp"
                          >
                            💬
                          </button>
                        </div>
                      </div>

                      {visit.nextFollowUpAt && (
                        <div className="fu-kanban-next">
                          📅 {formatDetailedDate(visit.nextFollowUpAt)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

  const renderTagModal = () => {
    if (!showTagModal) return null;
    const visitId = showTagModal;
    const visitTags = tags[visitId] || [];
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal" style={{ maxWidth: 380 }}>
          <div className="fu-modal-header">
            <h3>🏷️ Manage Tags</h3>
            <button className="fu-modal-close" onClick={() => setShowTagModal(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-tag-current">
              {visitTags.length === 0 ? <span className="fu-tags-empty">No tags added yet</span> : visitTags.map(tag => (
                <span key={tag} className="fu-tag-chip">{tag}<button onClick={() => removeTag(visitId, tag)}>×</button></span>
              ))}
            </div>
            <div className="fu-tag-input-row">
              <input type="text" placeholder="Add a tag..." value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag(visitId)} />
              <button className="fu-btn primary" onClick={() => addTag(visitId)}>Add</button>
            </div>
            <div className="fu-tag-suggestions">
              {["VIP", "Hot Lead", "NRI", "Investor", "End User", "Budget Buyer", "Callback", "Serious"].map(t => (
                <button key={t} className="fu-tag-suggest" onClick={() => { setTagInput(t); }}>{t}</button>
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
    if (!showReminderModal) return null;
    const visit = showReminderModal;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal" style={{ maxWidth: 400 }}>
          <div className="fu-modal-header">
            <h3>⏰ Set Reminder</h3>
            <button className="fu-modal-close" onClick={() => setShowReminderModal(null)}>×</button>
          </div>
          <div className="fu-modal-body">
            <p style={{ fontSize: '0.8rem', color: 'var(--fu-text-muted)', marginBottom: '14px' }}>For: <strong>{visit.visitor?.name}</strong></p>
            <div className="fu-form-row">
              <div className="fu-field"><label>Date</label><input type="date" value={reminderForm.date} onChange={e => setReminderForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="fu-field"><label>Time</label><input type="time" value={reminderForm.time} onChange={e => setReminderForm(p => ({ ...p, time: e.target.value }))} /></div>
            </div>
            <div className="fu-field"><label>Note</label><input type="text" placeholder="Reminder note..." value={reminderForm.note} onChange={e => setReminderForm(p => ({ ...p, note: e.target.value }))} /></div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowReminderModal(null)}>Cancel</button>
            <button className="fu-btn primary" onClick={() => addReminder(visit)}>Set Reminder</button>
          </div>
        </div>
      </div>
    );
  };

  const renderShortcutsModal = () => {
    if (!showShortcuts) return null;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal" style={{ maxWidth: 440 }}>
          <div className="fu-modal-header">
            <h3>⌨️ Keyboard Shortcuts</h3>
            <button className="fu-modal-close" onClick={() => setShowShortcuts(false)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-shortcuts-list">
              {KEYBOARD_SHORTCUTS.map((s, i) => (
                <div key={i} className="fu-shortcut-item">
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

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = getMonthName(month);
    const today = new Date();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`e${i}`} className="calendar-day empty"></div>);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = toInputDate(date);
      const isToday = isSameDay(date, today);
      const isSelected = dateStr === selectedDate;
      const visitCount = calendarData.visitsPerDay[dateStr] || 0;
      const followUpCount = calendarData.followUpsPerDay[dateStr] || 0;
      const bookingCount = calendarData.bookingsPerDay[dateStr] || 0;
      const scheduled = allVisits.filter(v => { const d = getDateFromTimestamp(v.nextFollowUpAt); return d && toInputDate(d) === dateStr; }).length;
      let dayClass = "calendar-day";
      if (isToday) dayClass += " today";
      if (isSelected) dayClass += " selected";
      if (visitCount > 0) dayClass += " has-visits";
      if (followUpCount > 0 || scheduled > 0) dayClass += " has-followups";
      days.push(
        <div key={`d${day}`} className={dayClass} onClick={() => handleDateClick(dateStr)} tabIndex={0} role="button" aria-label={`${day} ${monthName} ${year}`} aria-pressed={isSelected}>
          <div className="day-number">{day}</div>
          {(visitCount > 0 || followUpCount > 0 || scheduled > 0 || bookingCount > 0) && (
            <div className="day-visits-info">
              {visitCount > 0 && <div className="visit-count">{visitCount}v</div>}
              {followUpCount > 0 && <div className="followup-count">{followUpCount}f</div>}
              {scheduled > 0 && <div className="scheduled-count">{scheduled}s</div>}
              {bookingCount > 0 && <div className="booking-count">{bookingCount}b</div>}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="calendar-container">
        <div className="calendar-header">
          <div className="calendar-nav">
            <button onClick={prevMonth} className="calendar-nav-btn" aria-label="Prev">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" /></svg>
            </button>
            <h3>{monthName} {year}</h3>
            <button onClick={nextMonth} className="calendar-nav-btn" aria-label="Next">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
            </button>
          </div>
          <button onClick={() => setCalendarDate(new Date())} className="today-btn">Today</button>
        </div>
        <div className="calendar-legend">
          <span className="legend-item"><span className="legend-dot visits"></span>Visits</span>
          <span className="legend-item"><span className="legend-dot followups"></span>Done</span>
          <span className="legend-item"><span className="legend-dot scheduled"></span>Scheduled</span>
          <span className="legend-item"><span className="legend-dot booked"></span>Bookings</span>
        </div>
        <div className="calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}</div>
        <div className="calendar-grid">{days}</div>
        {selectedDate && (
          <div className="selected-date-info">
            <div className="selected-date-header">
              <h3>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
              <button onClick={resetDateFilter} className="clear-date-btn">Clear</button>
            </div>
            <div className="selected-date-stats">
              {[
                { label: "Visits", value: calendarData.visitsPerDay[selectedDate] || 0 },
                { label: "Follow-ups Done", value: calendarData.followUpsPerDay[selectedDate] || 0 },
                { label: "Scheduled", value: allVisits.filter(v => { const d = getDateFromTimestamp(v.nextFollowUpAt); return d && toInputDate(d) === selectedDate; }).length },
                { label: "Bookings", value: calendarData.bookingsPerDay[selectedDate] || 0 },
              ].map(s => (
                <div key={s.label} className="stat-item"><span className="stat-label">{s.label}:</span><span className="stat-value">{s.value}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUpcomingFollowUps = () => {
    if (upcomingFollowUps.length === 0) return (
      <div className="upcoming-empty">
        <div className="empty-icon">📅</div>
        <p>No upcoming follow-ups scheduled</p>
        <p className="empty-suggestion">Add follow-ups to leads to see them here</p>
      </div>
    );
    return (
      <div className="upcoming-list">
        {upcomingFollowUps.map(visit => {
          const nextDate = visit.nextFollowUpAt ? getDateFromTimestamp(visit.nextFollowUpAt) : null;
          const diffDays = nextDate ? Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
          return (
            <div key={visit.id} className="upcoming-item">
              <div className="upcoming-header">
                <span className="upcoming-name">{visit.visitor?.name || "Unknown"}</span>
                <span className={badgeClass(visit.bookingStatus)}>{visit.bookingStatus || "Not Booked"}</span>
              </div>
              <div className="upcoming-time">
                <span className="upcoming-date">{formatDetailedDate(visit.nextFollowUpAt)}</span>
                <span className={`upcoming-days ${diffDays <= 0 ? 'urgent' : diffDays <= 1 ? 'soon' : ''}`}>
                  {diffDays <= 0 ? "Today" : diffDays === 1 ? "Tomorrow" : `In ${diffDays} days`}
                </span>
              </div>
              <div className="upcoming-actions">
                <button className="upcoming-btn call" onClick={() => callVisitorUtil(visit.visitor?.phone, visit.visitor?.countryCode)}>📞</button>
                <button className="upcoming-btn whatsapp" onClick={() => setShowWhatsAppTemplates(visit)}>💬</button>
                <button className="upcoming-btn follow" onClick={() => { setExpanded(visit.id); setViewMode("list"); }}>Follow Up</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderEditModal = () => {
    if (!showEditModal) return null;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal fu-edit-modal">
          <div className="fu-modal-header">
            <h3>Edit Visit Information</h3>
            <button className="fu-modal-close" onClick={() => setShowEditModal(false)}>×</button>
          </div>
          <div className="fu-modal-body">
            <div className="fu-form-row">
              <div className="fu-field"><label>Visitor Name *</label><input type="text" value={editForm.visitorName} onChange={(e) => setEditForm(p => ({ ...p, visitorName: e.target.value }))} placeholder="Visitor name" /></div>
              <div className="fu-field"><label>Agent Name *</label><input type="text" value={editForm.agentName} onChange={(e) => setEditForm(p => ({ ...p, agentName: e.target.value }))} placeholder="Agent name" /></div>
            </div>
            <div className="fu-form-row">
              <div className="fu-field"><label>Country Code</label>
                <select value={editForm.countryCode} onChange={(e) => setEditForm(p => ({ ...p, countryCode: e.target.value }))}>
                  {Object.entries(countryFlagMap).map(([code, flag]) => <option key={code} value={code}>{flag} {code}</option>)}
                </select>
              </div>
              <div className="fu-field"><label>Phone Number *</label><input type="text" value={editForm.visitorPhone} onChange={(e) => setEditForm(p => ({ ...p, visitorPhone: e.target.value }))} placeholder="Phone number" /></div>
            </div>
            <div className="fu-form-row">
              <div className="fu-field"><label>Visit Date *</label><input type="date" value={editForm.visitDate} onChange={(e) => setEditForm(p => ({ ...p, visitDate: e.target.value }))} /></div>
              <div className="fu-field"><label>Visit Time *</label><input type="time" value={editForm.visitTime} onChange={(e) => setEditForm(p => ({ ...p, visitTime: e.target.value }))} /></div>
            </div>
            <div className="fu-form-row">
              <div className="fu-field"><label>Booking Status</label>
                <select value={editForm.bookingStatus} onChange={(e) => setEditForm(p => ({ ...p, bookingStatus: e.target.value }))}>
                  {BOOKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="fu-btn primary" onClick={saveEditVisit} disabled={savingFor === editingVisit?.id}>{savingFor === editingVisit?.id ? "Saving..." : "Save Changes"}</button>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteConfirm = () => {
    if (!showDeleteConfirm) return null;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal fu-confirm-modal">
          <div className="fu-modal-header"><h3>Confirm Deletion</h3></div>
          <div className="fu-modal-body">
            <div className="fu-confirm-content">
              <div className="fu-confirm-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#c0392b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z"/></svg></div>
              <div className="fu-confirm-text">
                <p>Are you sure you want to delete this visit?</p>
                <p><strong>Visitor:</strong> {deletingVisit?.visitor?.name}</p>
                <p><strong>Phone:</strong> {deletingVisit?.visitor?.phone}</p>
                <p><strong>Agent:</strong> {deletingVisit?.agent?.name}</p>
                <div className="fu-warning-text">⚠️ This action cannot be undone. All follow-up history will also be permanently deleted.</div>
              </div>
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => { setShowDeleteConfirm(false); setDeletingVisit(null); }}>Cancel</button>
            <button className="fu-btn danger" onClick={confirmDeleteVisit} disabled={savingFor === deletingVisit?.id}>{savingFor === deletingVisit?.id ? "Deleting..." : "Delete Visit"}</button>
          </div>
        </div>
      </div>
    );
  };

  const renderExportOptions = () => {
    if (!showExportOptions) return null;
    return (
      <div className="fu-modal-overlay">
        <div className="fu-modal">
          <div className="fu-modal-header"><h3>Export Follow-up Data</h3><button className="fu-modal-close" onClick={() => setShowExportOptions(false)}>×</button></div>
          <div className="fu-modal-body">
            <div className="fu-form-group">
              <label>Export Format</label>
              <div className="fu-radio-group">
                <label className="fu-radio"><input type="radio" name="exportFormat" value="excel" checked={exportFormat === "excel"} onChange={() => setExportFormat("excel")} /><span className="fu-radio-text">Excel (.xlsx) — Recommended</span></label>
                <label className="fu-radio"><input type="radio" name="exportFormat" value="csv" checked={exportFormat === "csv"} onChange={() => setExportFormat("csv")} /><span className="fu-radio-text">CSV</span></label>
              </div>
            </div>
            <div className="fu-form-group">
              <label>Export Scope</label>
              <div className="fu-radio-group">
                <label className="fu-radio"><input type="radio" name="exportScope" value="filtered" checked={exportScope === "filtered"} onChange={() => setExportScope("filtered")} /><span className="fu-radio-text">Currently Filtered Records ({filtered.length})</span></label>
                <label className="fu-radio"><input type="radio" name="exportScope" value="all" checked={exportScope === "all"} onChange={() => setExportScope("all")} /><span className="fu-radio-text">All Records ({visits.length})</span></label>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fu-text-muted)', padding: '10px', background: 'var(--fu-bg-section)', borderRadius: 'var(--fu-radius-md)', marginTop: '8px' }}>
              ✨ Export includes Lead Score, Tags, and Notes columns.
            </div>
          </div>
          <div className="fu-modal-footer">
            <button className="fu-btn ghost" onClick={() => setShowExportOptions(false)}>Cancel</button>
            <button className="fu-btn primary" onClick={exportData}>Export Data</button>
          </div>
        </div>
      </div>
    );
  };

  const renderBulkActionsForm = () => {
    if (!showBulkActions) return null;
    return (
      <div className="fu-bulk-panel">
        <div className="fu-bulk-header">
          <h3>Bulk Follow-up Actions</h3>
          <div className="fu-bulk-selection-info">
            <span>{selectedCount} records selected</span>
            <div className="fu-bulk-selection-actions">
              <button className="fu-btn-text" onClick={selectAllVisible}>Select All Visible</button>
              <button className="fu-btn-text" onClick={clearAllSelections}>Clear</button>
            </div>
          </div>
          <button className="fu-bulk-close" onClick={() => { setShowBulkActions(false); setBulkSelections({}); }}>×</button>
        </div>
        <div className="fu-bulk-form">
          <div className="fu-form-row">
            <div className="fu-field"><label>Method</label><select value={bulkForm.method} onChange={(e) => setBulkForm(p => ({ ...p, method: e.target.value }))}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div className="fu-field"><label>Outcome</label><select value={bulkForm.outcome} onChange={(e) => setBulkForm(p => ({ ...p, outcome: e.target.value }))}><option value="">Select Outcome</option>{OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          </div>
          <div className="fu-form-row">
            <div className="fu-field"><label>Next Follow-up Date</label><input type="date" value={bulkForm.nextDate} onChange={(e) => setBulkForm(p => ({ ...p, nextDate: e.target.value }))} /></div>
            <div className="fu-field"><label>Next Follow-up Time</label><input type="time" value={bulkForm.nextTime} onChange={(e) => setBulkForm(p => ({ ...p, nextTime: e.target.value }))} /></div>
          </div>
          <div className="fu-form-row"><div className="fu-field fu-wide"><label>Remarks</label><textarea rows={2} value={bulkForm.remarks} onChange={(e) => setBulkForm(p => ({ ...p, remarks: e.target.value }))} /></div></div>
          <div className="fu-bulk-actions">
            <button className="fu-btn primary" disabled={selectedCount === 0 || loading || !bulkForm.outcome || !bulkForm.remarks.trim()} onClick={processBulkFollowUps}>
              {loading ? "Processing..." : `Process ${selectedCount} Follow-ups`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (filtered.length === 0) return null;
    const maxPageButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    if (endPage === totalPages) startPage = Math.max(1, endPage - maxPageButtons + 1);
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);
    return (
      <div className="fu-pagination">
        <div className="fu-pagination-options">
          <label>Rows:</label>
          <input type="number" min="1" value={itemsPerPage} onChange={(e) => { const v = Number(e.target.value); if (v > 0) { setItemsPerPage(v); setCurrentPage(1); } }} />
        </div>
        <div className="fu-pagination-info">Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filtered.length)} of {filtered.length}</div>
        <div className="fu-pagination-controls">
          <button className="fu-pagination-btn" onClick={() => goToPage(1)} disabled={currentPage === 1}>First</button>
          <button className="fu-pagination-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Prev</button>
          {pageNumbers.map(n => <button key={n} className={`fu-pagination-page ${currentPage === n ? 'active' : ''}`} onClick={() => goToPage(n)}>{n}</button>)}
          <button className="fu-pagination-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
          <button className="fu-pagination-btn" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>Last</button>
        </div>
      </div>
    );
  };

  // ── Loading ──
  if (loading && visits.length === 0) {
    return (
      <div className={`loading-container ${darkMode ? "dark-mode" : ""}`}>
        <div className="loading-box">
          <div className="loading-icon">
            <div className="pulse-ring"></div>
            <div className="pulse-ring"></div>
            <div className="pulse-ring"></div>
            <svg className="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="loading-text"><h3>Loading Dashboard</h3><p>Fetching your follow-up data...</p></div>
          <div className="progress-bar"><div className="progress-fill"></div></div>
        </div>
      </div>
    );
  }

  // ── Summary Stats ──
  const totalVisits = visits.length;
  const totalBooked = visits.filter(v => v.bookingStatus === "Booked").length;
  const totalInterested = visits.filter(v => v.bookingStatus === "Interested").length;
  const totalOverdue = visits.filter(v => { const d = getDateFromTimestamp(v.nextFollowUpAt); return d && d < new Date(); }).length;
  const totalHot = visits.filter(v => calculateLeadScore(v) >= 80).length;
  const totalFollowedUp = visits.filter(v => v.followUpCount > 0).length;

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={`fu-container ${darkMode ? 'dark-mode' : ''} ${compactView ? 'compact-view' : ''}`}>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover />

      {/* Modals */}
      {renderNotification()}
      {renderEditModal()}
      {renderDeleteConfirm()}
      {renderExportOptions()}
      {renderWhatsAppTemplates()}
      {renderAISuggestion()}
      {renderShortcutsModal()}
      {renderTagModal()}
      {renderReminderModal()}

      {/* ── HEADER ── */}
      <header className="fu-header">
        <div className="fu-header-main">
          <div className="fu-header-title">
            <h1>Follow-ups Dashboard</h1>
            <p>Manage calls, track leads, and analyze performance • <button className="fu-shortcuts-hint" onClick={() => setShowShortcuts(true)}>⌨️ Shortcuts</button></p>
          </div>
          <div className="fu-actions">
            <div className="fu-action-buttons">
              <button className={`fu-action-btn ${showBulkActions ? 'active' : ''}`} onClick={() => setShowBulkActions(p => !p)} title="Alt+B">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z" /></svg>
                <span>Bulk</span>
              </button>
              <button className="fu-action-btn" onClick={() => setShowExportOptions(true)} title="Alt+E">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" /></svg>
                <span>Export</span>
              </button>
              <button className={`fu-action-btn ${showStats ? 'active' : ''}`} onClick={() => setShowStats(!showStats)} title="Alt+S">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.1h-15V5h15v14.1zm0-16.1h-15c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
                <span>{showStats ? "Hide Stats" : "Analytics"}</span>
              </button>
              <button className={`fu-action-btn ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')} title="Alt+C">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" /></svg>
                <span>Calendar</span>
              </button>
              <button className={`fu-action-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')} title="Alt+K">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                <span>Kanban</span>
              </button>
              <button className={`fu-action-btn ${showLeaderboard ? 'active' : ''}`} onClick={() => setShowLeaderboard(p => !p)} title="Alt+L">
                🏆 <span>Leaderboard</span>
              </button>
              <button className={`fu-action-btn ${showActivityFeed ? 'active' : ''}`} onClick={() => setShowActivityFeed(p => !p)}>
                📡 <span>Feed</span>
              </button>
              <button className="fu-action-btn" onClick={() => setCompactView(!compactView)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M4 15h16v-2H4v2zm0 4h16v-2H4v2zm0-8h16V9H4v2zm0-6v2h16V5H4z" /></svg>
                <span>{compactView ? "Expanded" : "Compact"}</span>
              </button>
              <button className="fu-action-btn" onClick={() => setDarkMode(!darkMode)} title="Alt+D">
                <span>{darkMode ? "☀️" : "🌙"}</span>
                <span>{darkMode ? "Light" : "Dark"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="fu-kpi-strip">
          <div className="fu-kpi-item">
            <span className="fu-kpi-val">{totalVisits}</span>
            <span className="fu-kpi-label">Total Leads</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val" style={{ color: 'var(--fu-green)' }}>{totalBooked}</span>
            <span className="fu-kpi-label">Booked</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val" style={{ color: 'var(--fu-blue)' }}>{totalInterested}</span>
            <span className="fu-kpi-label">Interested</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val" style={{ color: '#c0392b' }}>{totalHot}</span>
            <span className="fu-kpi-label">🔥 Hot Leads</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val" style={{ color: 'var(--fu-amber)' }}>{totalOverdue}</span>
            <span className="fu-kpi-label">⚠️ Overdue</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val">{totalFollowedUp}</span>
            <span className="fu-kpi-label">Followed Up</span>
          </div>
          <div className="fu-kpi-divider"></div>
          <div className="fu-kpi-item">
            <span className="fu-kpi-val">{totalVisits > 0 ? ((totalBooked / totalVisits) * 100).toFixed(1) : 0}%</span>
            <span className="fu-kpi-label">Conversion</span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="fu-search-filters">
          <div className="fu-search-box">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
            <input ref={searchInputRef} className="fu-search-input" placeholder='Search name, phone, agent, remarks, tags... (Press / to focus)' value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="fu-search-clear" onClick={() => setSearch("")}>×</button>}
          </div>
          <div className="fu-filters-main">
            <div className="fu-filter-group">
              <button className="fu-filter-toggle" onClick={() => setShowFilters(!showFilters)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                <span>Filters</span>
                {(filter !== "All" || selectedDate || Object.values(quickFilters).some(Boolean)) && <span className="fu-filter-badge">Active</span>}
              </button>
              <div className="fu-sort-select">
                <label>Sort:</label>
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="fu-filters-panel">
            <div className="fu-filter-section">
              <h4>Status Filter</h4>
              <div className="fu-filter-pills">{FILTERS.map(f => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
            </div>
            <div className="fu-filter-section">
              <h4>Quick Filters</h4>
              <div className="fu-checkbox-filters">
                {[
                  { key: 'onlyBooked', label: '✅ Only Booked' },
                  { key: 'onlyInterested', label: '🔵 Only Interested' },
                  { key: 'hotLeads', label: '🔥 Hot Leads (80+ score)' },
                  { key: 'todayFollowUps', label: "📌 Today's Follow-ups" },
                  { key: 'overdueFollowUps', label: '⚠️ Overdue Follow-ups' },
                ].map(({ key, label }) => (
                  <label key={key} className="fu-checkbox">
                    <input type="checkbox" checked={quickFilters[key]} onChange={() => setQuickFilters(p => ({ ...p, [key]: !p[key] }))} />
                    <span className="fu-checkbox-text">{label}</span>
                  </label>
                ))}
              </div>
              {(filter !== "All" || selectedDate || Object.values(quickFilters).some(Boolean)) && (
                <button className="fu-clear-filters" onClick={() => { setFilter("All"); setSelectedDate(null); setQuickFilters({ onlyBooked: false, onlyInterested: false, todayFollowUps: false, overdueFollowUps: false, hotLeads: false }); }}>
                  Clear All Filters
                </button>
              )}
            </div>
            {selectedDate && (
              <div className="fu-filter-section">
                <h4>Selected Date</h4>
                <div className="fu-selected-date">
                  <span>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  <button onClick={resetDateFilter}>Clear</button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Active Reminders Banner */}
      {reminders.filter(r => !r.dismissed).length > 0 && (
        <div className="fu-reminders-banner">
          <span>⏰ {reminders.filter(r => !r.dismissed).length} active reminder{reminders.filter(r => !r.dismissed).length > 1 ? 's' : ''} set</span>
          <button onClick={() => setReminders(prev => { const u = prev.map(r => ({ ...r, dismissed: true })); localStorage.setItem("fuReminders", JSON.stringify(u)); return u; })}>Dismiss All</button>
        </div>
      )}

      {/* Executive Selector */}
      <div className="fu-executive-selector">
        <div className="fu-exec-header">
          <h3>Sales Executive Filter</h3>
          {selectedExecutive && <button className="fu-clear-exec" onClick={() => setSelectedExecutive("")}>Clear</button>}
        </div>
        <div className="fu-executive-pills">
          <button className={selectedExecutive === "" ? "active" : ""} onClick={() => setSelectedExecutive("")}>All Executives ({allVisits.length})</button>
          {salesExecutives.length > 0 ? salesExecutives.map(exec => (
            <button key={exec} className={selectedExecutive === exec ? "active" : ""} onClick={() => setSelectedExecutive(exec)}>
              {exec} ({executiveCounts[exec] || 0})
              {executiveStats[exec] && executiveStats[exec].hotLeads > 0 && <span style={{ marginLeft: 4, fontSize: '0.6rem' }}>🔥{executiveStats[exec].hotLeads}</span>}
            </button>
          )) : <div className="fu-no-executives">{loading ? "Loading..." : "No executives found."}</div>}
        </div>
      </div>

      {/* Leaderboard */}
      {renderLeaderboard()}

      {/* Activity Feed */}
      {renderActivityFeed()}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="fu-calendar-layout">
          <div className="fu-calendar-main">{renderCalendar()}</div>
          <div className="fu-upcoming-panel">
            <div className="fu-upcoming-header">
              <h3>Upcoming Follow-ups</h3>
              <button className={`fu-upcoming-toggle ${filter === "Today's Follow-ups" ? 'active' : ''}`} onClick={() => setFilter(filter === "Today's Follow-ups" ? "All" : "Today's Follow-ups")}>
                {filter === "Today's Follow-ups" ? "Show All" : "Today's"}
              </button>
            </div>
            {renderUpcomingFollowUps()}
          </div>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="fu-kanban-page">
          <div className="fu-kanban-page-header">
            <h2 className="fu-kanban-page-title">Kanban Board</h2>
            <span className="fu-kanban-page-subtitle">Drag cards to change status</span>
          </div>

          <div className="fu-kanban-page-body">
            {renderKanban()}
          </div>
        </div>
      )}

      {/* Analytics Panel */}
      {showStats && (
        <div className="fu-analytics-panel">
          <div className="fu-analytics-tabs">
            {["overview", "booking", "followup", "detailed", "trends", "radar"].map(tab => (
              <button key={tab} className={analyticsView === tab ? "active" : ""} onClick={() => setAnalyticsView(tab)}>
                {tab === 'radar' ? '🕸️ Radar' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="fu-analytics-content">
            {analyticsView === "overview" && (
              <>
                <div className="fu-analytics-summary">
                  <div className="fu-analytics-cards">
                    {salesExecutives.filter(exec => executiveStats[exec]?.total > 0).map(exec => {
                      const stats = executiveStats[exec];
                      return (
                        <div key={exec} className={`fu-analytics-card ${selectedExecutive === exec ? 'selected' : ''}`} onClick={() => setSelectedExecutive(selectedExecutive === exec ? "" : exec)}>
                          <h3>{exec}</h3>
                          <div className="fu-analytics-metrics">
                            <div className="fu-metric"><span className="fu-metric-value">{stats.total}</span><span className="fu-metric-label">Total</span></div>
                            <div className="fu-metric"><span className="fu-metric-value">{stats.booked}</span><span className="fu-metric-label">Booked</span></div>
                            <div className="fu-metric"><span className="fu-metric-value" style={{ color: '#c0392b' }}>{stats.hotLeads}</span><span className="fu-metric-label">🔥 Hot</span></div>
                          </div>
                          <div className="fu-performance-bars">
                            <div className="fu-performance-item"><span>Follow-up Rate</span><div className="fu-progress-container"><div className="fu-progress-bar follow" style={{ width: `${Math.min(stats.followUpRate, 100)}%` }}></div><span>{stats.followUpRate.toFixed(1)}%</span></div></div>
                            <div className="fu-performance-item"><span>Conversion Rate</span><div className="fu-progress-container"><div className="fu-progress-bar convert" style={{ width: `${Math.min(stats.conversionRate, 100)}%` }}></div><span>{stats.conversionRate.toFixed(1)}%</span></div></div>
                            <div className="fu-performance-item"><span>Avg Lead Score</span><div className="fu-progress-container"><div className="fu-progress-bar" style={{ width: `${Math.min(stats.avgLeadScore, 100)}%`, background: getScoreColor(stats.avgLeadScore) }}></div><span style={{ color: getScoreColor(stats.avgLeadScore) }}>{stats.avgLeadScore.toFixed(0)}/100</span></div></div>
                          </div>
                          <div className="fu-analytics-card-footer"><span className="fu-recent-activity">{stats.recentActivity} activities in last 7 days</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {chartData.visits.datasets.length > 0 && (
                  <div className="fu-chart-container">
                    <div className="fu-chart"><h3>Performance Overview</h3><div className="fu-chart-wrapper"><Bar options={baseChartOptions} data={chartData.visits} /></div></div>
                    <div className="fu-chart"><h3>Activity Trend (30 Days)</h3><div className="fu-chart-wrapper"><Line options={baseChartOptions} data={chartData.activityTrend} /></div></div>
                  </div>
                )}
              </>
            )}
            {analyticsView === "booking" && chartData.booking.datasets.length > 0 && (
              <div className="fu-chart-container">
                <div className="fu-chart booking-chart"><h3>Booking Status Distribution</h3><div className="fu-chart-wrapper"><Bar options={{ ...baseChartOptions, scales: { x: { stacked: true, ...baseChartOptions.scales.x }, y: { stacked: true, ...baseChartOptions.scales.y } } }} data={chartData.booking} /></div></div>
              </div>
            )}
            {analyticsView === "followup" && chartData.followUp.datasets.length > 0 && (
              <div className="fu-chart-container">
                <div className="fu-chart"><h3>Follow-up & Conversion Rates</h3><div className="fu-chart-wrapper"><Bar options={baseChartOptions} data={chartData.followUp} /></div></div>
              </div>
            )}
            {analyticsView === "detailed" && (
              <div className="fu-chart-container">
                {chartData.outcomes.datasets.length > 0 && <div className="fu-chart"><h3>Outcomes by Executive</h3><div className="fu-chart-wrapper"><Bar options={baseChartOptions} data={chartData.outcomes} /></div></div>}
                {chartData.methods.datasets.length > 0 && <div className="fu-chart"><h3>Methods Used</h3><div className="fu-chart-wrapper"><Bar options={baseChartOptions} data={chartData.methods} /></div></div>}
              </div>
            )}
            {analyticsView === "trends" && chartData.activityTrend.datasets.length > 0 && (
              <div className="fu-chart-container">
                <div className="fu-chart fu-chart-wide"><h3>Activity Trend (Last 30 Days)</h3><div className="fu-chart-wrapper"><Line options={baseChartOptions} data={chartData.activityTrend} /></div></div>
              </div>
            )}
            {analyticsView === "radar" && chartData.radar.datasets.length > 0 && (
              <div className="fu-chart-container">
                <div className="fu-chart fu-chart-wide"><h3>🕸️ Executive Performance Radar</h3><div className="fu-chart-wrapper" style={{ height: 360 }}><Radar options={radarOptions} data={chartData.radar} /></div></div>
              </div>
            )}
          </div>
        </div>
      )}

      {renderBulkActionsForm()}

      {/* List Header */}
      <div className="fu-list-header">
        <div className="fu-list-info">
          <span className="fu-record-count">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''} found
            {selectedExecutive && ` for ${selectedExecutive}`}
            {selectedDate && ` on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </span>
          {(filter !== "All" || search || selectedDate || Object.values(quickFilters).some(Boolean)) && (
            <button className="fu-clear-all-filters" onClick={() => { setFilter("All"); setSearch(""); setSelectedDate(null); setQuickFilters({ onlyBooked: false, onlyInterested: false, todayFollowUps: false, overdueFollowUps: false, hotLeads: false }); }}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Visits List */}
      {filtered.length === 0 ? (
        <div className="fu-empty-state">
          <div className="fu-empty-icon">📋</div>
          <h3>No Records Found</h3>
          <p>No follow-up records match your current filters.</p>
          <button className="fu-btn primary" onClick={() => { setFilter("All"); setSearch(""); setSelectedDate(null); setSelectedExecutive(""); }}>Clear All Filters</button>
        </div>
      ) : (
        <div className="fu-visits-list">
          {viewMode !== 'kanban' && viewMode !== 'calendar' && currentItems.map((visit) => {
            const isExpanded = expanded === visit.id;
            const rawVisitDate = visit.visitAt || visit.createdAt;
            const nextFollowUpDate = visit.nextFollowUpAt ? getDateFromTimestamp(visit.nextFollowUpAt) : null;
            const today = new Date();
            const isOverdue = nextFollowUpDate && nextFollowUpDate < today;
            const isToday = nextFollowUpDate && isSameDay(nextFollowUpDate, today);
            const leadScore = calculateLeadScore(visit);
            const visitTags = tags[visit.id] || [];

            return (
              <div
                key={visit.id}
                id={`visit-${visit.id}`}
                className={`fu-visit-card ${followupClass(visit)} ${isExpanded ? 'expanded' : ''} ${isOverdue ? 'overdue' : ''} ${isToday ? 'today-followup' : ''}`}
              >
                {showBulkActions && (
                  <div className="fu-bulk-checkbox">
                    <input type="checkbox" checked={!!bulkSelections[visit.id]} onChange={() => toggleBulkSelection(visit.id)} id={`bulk-${visit.id}`} />
                    <label htmlFor={`bulk-${visit.id}`}></label>
                  </div>
                )}

                {/* Lead Score Bar */}
                <div className="fu-score-bar" style={{ '--score-width': `${leadScore}%`, '--score-color': getScoreColor(leadScore) }}></div>

                <div className="fu-visit-main" onClick={() => !showBulkActions && openForm(visit)}>
                  <div className="fu-visit-info">
                    <div className="fu-visitor-details">
                      <div className="fu-visitor-name-row">
                        <h3 className="fu-visitor-name">{visit.visitor?.name || "Unknown Visitor"}</h3>
                        <div className="fu-lead-score-badge" style={{ background: getScoreColor(leadScore) + '15', color: getScoreColor(leadScore), borderColor: getScoreColor(leadScore) + '40' }}>
                          ● {leadScore} — {getScoreLabel(leadScore)}
                        </div>
                      </div>
                      <div className="fu-visitor-contact">
                        <span className="fu-phone-display">
                          {getCountryFlag(visit.visitor?.countryCode)}{visit.visitor?.countryCode || "+91"} {visit.visitor?.phone || "-"}
                        </span>
                      </div>
                      <div className="fu-visit-meta">
                        <span className="fu-agent">👤 {visit.agent?.name || "Unknown"}</span>
                        <span className="fu-visit-date">📅 {formatDetailedDate(rawVisitDate)}</span>
                        <span className="fu-followup-count">🔄 {visit.followUpCount || 0} follow-up{visit.followUpCount !== 1 ? 's' : ''}</span>
                        {visitTags.length > 0 && (
                          <span className="fu-visit-tags">
                            {visitTags.slice(0, 3).map(tag => <span key={tag} className="fu-tag-small">{tag}</span>)}
                            {visitTags.length > 3 && <span className="fu-tag-small">+{visitTags.length - 3}</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="fu-status-section">
                      <span className={badgeClass(visit.bookingStatus)}>{visit.bookingStatus || "Not Booked"}</span>
                      {isOverdue && !isToday && <span className="fu-overdue-badge">⚠️ Overdue</span>}
                      {isToday && <span className="fu-today-badge">📌 Today</span>}
                    </div>
                  </div>

                  <div className="fu-visit-actions-row">
                    {visit.lastFollowUp && (
                      <div className="fu-last-followup">
                        <span className="fu-last-label">Last:</span>
                        <span className={`fu-outcome-badge ${getOutcomeBadgeClass(visit.lastFollowUp.outcome)}`}>{visit.lastFollowUp.outcome}</span>
                        <span className="fu-last-method">{visit.lastFollowUp.method}</span>
                        <span className="fu-last-time">{formatTimeAgo(visit.lastFollowUp.at)}</span>
                      </div>
                    )}
                    {nextFollowUpDate && (
                      <div className={`fu-next-followup ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}`}>
                        <span className="fu-next-label">Next:</span>
                        <span className="fu-next-date">{formatDetailedDate(visit.nextFollowUpAt)}</span>
                      </div>
                    )}
                    {voiceNotes[visit.id] && (
                      <div className="fu-voice-indicator">🎙️ Voice note recorded</div>
                    )}

                    <div className="fu-quick-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="fu-quick-btn call" onClick={() => callVisitorUtil(visit.visitor?.phone, visit.visitor?.countryCode)} title="Call">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                      </button>
                      <button className="fu-quick-btn whatsapp" onClick={() => setShowWhatsAppTemplates(visit)} title="WhatsApp Templates">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375c-.99-1.576-1.516-3.391-1.516-5.26 0-5.445 4.455-9.885 9.942-9.885 2.654 0 5.145 1.035 7.021 2.91 1.875 1.859 2.909 4.35 2.909 6.99-.004 5.444-4.46 9.885-9.935 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.746.943 3.71 1.444 5.71 1.447h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" /></svg>
                      </button>
                      <button className="fu-quick-btn copy" onClick={() => copyToClipboardUtil(visit.visitor?.phone, visit.visitor?.countryCode)} title="Copy Number">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
                      </button>
                      <button className="fu-quick-btn history" onClick={() => toggleHistory(visit.id)} title="Follow-up History">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" /></svg>
                      </button>
                      {/* AI Suggestion */}
                      <button className="fu-quick-btn ai-btn" onClick={() => { setShowAISuggestion(visit.id); setAiSuggestionVisit(visit); clearSuggestion(); }} title="AI Strategy">
                        🤖
                      </button>
                      {/* Timeline */}
                      <button className="fu-quick-btn" onClick={(e) => { e.stopPropagation(); setShowTimeline(showTimeline === visit.id ? null : visit.id); if (!followUpHistory[visit.id]) loadFollowUpHistory(visit.id); }} title="Timeline" style={{ fontSize: '14px' }}>
                        📅
                      </button>
                      {/* Voice Note */}
                      <button className="fu-quick-btn" onClick={(e) => { e.stopPropagation(); setShowVoiceNote(showVoiceNote === visit.id ? null : visit.id); }} title="Voice Note" style={{ fontSize: '14px', background: voiceNotes[visit.id] ? 'rgba(39,105,79,0.08)' : undefined }}>
                        🎙️
                      </button>
                      {/* Tag */}
                      <button className="fu-quick-btn" onClick={(e) => { e.stopPropagation(); setShowTagModal(visit.id); }} title="Tags" style={{ fontSize: '14px' }}>
                        🏷️
                      </button>
                      {/* Reminder */}
                      <button className="fu-quick-btn" onClick={(e) => { e.stopPropagation(); setShowReminderModal(visit); }} title="Set Reminder" style={{ fontSize: '14px' }}>
                        ⏰
                      </button>
                      <button className="fu-quick-btn edit" onClick={() => startEditVisit(visit)} title="Edit Visit">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Timeline Panel */}
                {renderTimeline(visit.id)}

                {/* Voice Note Panel */}
                {renderVoiceNote(visit.id)}

                {/* Follow-up History */}
                {showHistory[visit.id] && (
                  <div className="fu-history-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="fu-history-header">
                      <h4>Follow-up History ({followUpHistory[visit.id]?.length || 0})</h4>
                      <button className="fu-history-close" onClick={() => setShowHistory(prev => ({ ...prev, [visit.id]: false }))}>×</button>
                    </div>
                    {loadingHistory[visit.id] ? (
                      <div className="fu-history-loading">Loading history...</div>
                    ) : followUpHistory[visit.id]?.length === 0 ? (
                      <div className="fu-history-empty">No follow-up history yet</div>
                    ) : (
                      <div className="fu-history-list">
                        {followUpHistory[visit.id]?.map((fu, index) => (
                          <div key={fu.id} className="fu-history-item">
                            {editingFollowUpId === fu.id ? (
                              <div className="fu-history-edit-form">
                                <div className="fu-form-row">
                                  <div className="fu-field"><label>Method</label><select value={editFollowUpForm.method} onChange={(e) => setEditFollowUpForm(p => ({ ...p, method: e.target.value }))}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                  <div className="fu-field"><label>Outcome</label><select value={editFollowUpForm.outcome} onChange={(e) => setEditFollowUpForm(p => ({ ...p, outcome: e.target.value }))}><option value="">Select Outcome</option>{OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                                </div>
                                <div className="fu-form-row"><div className="fu-field fu-wide"><label>Remarks</label><textarea rows={2} value={editFollowUpForm.remarks} onChange={(e) => setEditFollowUpForm(p => ({ ...p, remarks: e.target.value }))} /></div></div>
                                <div className="fu-form-row">
                                  <div className="fu-field"><label>Next Date</label><input type="date" value={editFollowUpForm.nextDate} onChange={(e) => setEditFollowUpForm(p => ({ ...p, nextDate: e.target.value }))} disabled={editFollowUpForm.noNext} /></div>
                                  <div className="fu-field"><label>Next Time</label><input type="time" value={editFollowUpForm.nextTime} onChange={(e) => setEditFollowUpForm(p => ({ ...p, nextTime: e.target.value }))} disabled={editFollowUpForm.noNext} /></div>
                                </div>
                                <label className="fu-checkbox"><input type="checkbox" checked={editFollowUpForm.noNext} onChange={(e) => setEditFollowUpForm(p => ({ ...p, noNext: e.target.checked }))} /><span className="fu-checkbox-text">No next follow-up</span></label>
                                <div className="fu-history-edit-actions">
                                  <button className="fu-btn primary" onClick={() => saveEditedFollowUp(fu.id, visit.id)} disabled={savingFor === fu.id}>{savingFor === fu.id ? "Saving..." : "Save"}</button>
                                  <button className="fu-btn ghost" onClick={() => { setEditingFollowUpId(null); setEditFollowUpForm({}); }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="fu-history-item-header">
                                  <span className="fu-history-index">#{followUpHistory[visit.id].length - index}</span>
                                  <span className={`fu-outcome-badge ${getOutcomeBadgeClass(fu.outcome)}`}>{fu.outcome}</span>
                                  <span className="fu-history-method">{fu.method}</span>
                                  <span className="fu-history-time">{formatDetailedDate(fu.createdAt)}</span>
                                  <button className="fu-history-edit-btn" onClick={() => startEditFollowUp(fu, visit.id)} title="Edit">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                                  </button>
                                </div>
                                <div className="fu-history-remarks">{fu.remarks}</div>
                                {fu.nextFollowUpAt && <div className="fu-history-next">Next: {formatDetailedDate(fu.nextFollowUpAt)}</div>}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Notes */}
                    <div className="fu-notes-section">
                      <div className="fu-notes-header">
                        <h4>Notes</h4>
                        <button className="fu-notes-edit-btn" onClick={() => { setNotesEditMode(prev => ({ ...prev, [visit.id]: !prev[visit.id] })); if (!notes[visit.id]) loadNotesFromFirebase(visit.id); }}>
                          {notesEditMode[visit.id] ? "Cancel" : "Edit Notes"}
                        </button>
                      </div>
                      {notesEditMode[visit.id] ? (
                        <div className="fu-notes-editor">
                          <textarea ref={notesTextareaRef} rows={4} value={notes[visit.id] || ""} onChange={(e) => setNotes(prev => ({ ...prev, [visit.id]: e.target.value }))} placeholder="Add notes about this visitor..." />
                          <button className="fu-btn primary" onClick={() => saveNotes(visit.id, notes[visit.id] || "")}>Save Notes</button>
                        </div>
                      ) : (
                        <div className="fu-notes-display">
                          {notes[visit.id] || visit.notes ? <p>{notes[visit.id] || visit.notes}</p> : <p className="fu-notes-empty">No notes added yet.</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Follow-up Form */}
                {isExpanded && (
                  <div className="fu-form-panel" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <h4>Add Follow-up</h4>
                      <button className="fu-btn ghost" style={{ fontSize: '0.72rem', padding: '5px 10px' }} onClick={() => { setShowAISuggestion(visit.id); setAiSuggestionVisit(visit); clearSuggestion(); }}>
                        🤖 AI Strategy
                      </button>
                    </div>
                    <div className="fu-form-row">
                      <div className="fu-field"><label>Method</label><select value={form.method} onChange={(e) => setForm(p => ({ ...p, method: e.target.value }))}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                      <div className="fu-field"><label>Outcome *</label><select value={form.outcome} onChange={(e) => setForm(p => ({ ...p, outcome: e.target.value }))}><option value="">Select Outcome</option>{OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                      <div className="fu-field"><label>Booking Status</label><select value={form.bookingStatus} onChange={(e) => setForm(p => ({ ...p, bookingStatus: e.target.value }))}>{BOOKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    </div>
                    <div className="fu-form-row"><div className="fu-field fu-wide"><label>Remarks *</label><textarea rows={3} placeholder="Write short remarks about this follow-up..." value={form.remarks} onChange={(e) => setForm(p => ({ ...p, remarks: e.target.value }))} /></div></div>
                    {!form.noNext && (
                      <div className="fu-form-row">
                        <div className="fu-field"><label>Next Follow-up Date</label><input type="date" value={form.nextDate} onChange={(e) => setForm(p => ({ ...p, nextDate: e.target.value }))} /></div>
                        <div className="fu-field"><label>Next Follow-up Time</label><input type="time" value={form.nextTime} onChange={(e) => setForm(p => ({ ...p, nextTime: e.target.value }))} /></div>
                      </div>
                    )}
                    <div className="fu-form-row">
                      <label className="fu-checkbox"><input type="checkbox" checked={form.noNext} onChange={(e) => setForm(p => ({ ...p, noNext: e.target.checked }))} /><span className="fu-checkbox-text">No next follow-up needed</span></label>
                    </div>

                    {/* Voice Note in form */}
                    {voiceRecorder.audioUrl && (
                      <div className="fu-voice-attached">
                        <span>🎙️ Voice note attached ({voiceRecorder.formatTime(voiceRecorder.recordingTime)})</span>
                        <button className="fu-btn-text" onClick={voiceRecorder.clearRecording}>Remove</button>
                      </div>
                    )}

                    <div className="fu-form-actions">
                      <button className="fu-btn primary" onClick={() => handleAddFollowUp(visit)} disabled={savingFor === visit.id}>{savingFor === visit.id ? "Saving..." : "Save Follow-up"}</button>
                      <button className="fu-btn ghost" onClick={() => setExpanded(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode !== 'kanban' && viewMode !== 'calendar' && renderPagination()}
    </div>
  );
}

export default Contact;