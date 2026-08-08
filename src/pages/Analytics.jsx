import React, { useEffect, useState, useMemo, useRef } from "react";
import { db } from "../firebase";
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
  addDoc, where, limit, writeBatch,
} from "firebase/firestore";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import SearchableCountryDropdown from "./SearchableCountryDropdown";
import "./Analytics.css";

const pad = (n) => String(n).padStart(2, "0");

const countryFlagMap = {
  "+91":"🇮🇳","+1":"🇺🇸","+44":"🇬🇧","+971":"🇦🇪","+966":"🇸🇦",
  "+974":"🇶🇦","+968":"🇴🇲","+973":"🇧🇭","+965":"🇰🇼","+61":"🇦🇺",
  "+64":"🇳🇿","+65":"🇸🇬","+60":"🇲🇾","+49":"🇩🇪","+33":"🇫🇷",
  "+39":"🇮🇹","+34":"🇪🇸","+81":"🇯🇵","+82":"🇰🇷","+86":"🇨🇳",
  "+92":"🇵🇰","+880":"🇧🇩","+94":"🇱🇰","+977":"🇳🇵",
};
const getCountryFlag = (code) => countryFlagMap[code] || "🌍";

const LEAD_STATUSES = ["Hot", "Cold", "Warm"];
const SALES_EXECUTIVE_OPTIONS = ["Tushar Bhandari", "Bhavika", "Amit Sharma", "Vikas"];
const VISITOR_IDENTITIES = ["New Visitor", "Old Visitor", "Existing Customer (already invested in project)", "Channel Partner"];
const BOOKING_STATUSES = ["Not Booked", "Booked"];
const PROPERTY_LAYOUTS = ["1 BHK","2 BHK","3 BHK","4 BHK","PentHouse","Commercial"];
const PROPERTY_TYPES = ["Apartment","Villa","Plot"];
const PURPOSES = ["For Residence","For Investment"];
const PROPERTY_STATUSES_LIST = ["Under Construction","Ready to use"];
const CAMPAIGN_SOURCES = ["Newspaper","Social Media","Friend/Family","Online Search","Hoardings","Real Estate Portal","Other"];

/* ══════════════════════════════════════════════════════════════
   BROKER SEARCHABLE DROPDOWN COMPONENT
══════════════════════════════════════════════════════════════ */
function BrokerDropdown({ brokers, value, onChange, placeholder = "Search broker..." }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    if (!query.trim()) { setFiltered(brokers); return; }
    const q = query.toLowerCase();
    setFiltered(brokers.filter(b =>
      b.brokerName?.toLowerCase().includes(q) ||
      b.phone?.includes(q)
    ));
  }, [query, brokers]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (broker) => {
    setQuery(broker.brokerName);
    setOpen(false);
    onChange({ name: broker.brokerName, phone: broker.phone, countryCode: broker.countryCode || "+91" });
  };

  const handleClear = () => {
    setQuery("");
    onChange({ name: "", phone: "", countryCode: "+91" });
  };

  return (
    <div className="broker-dd-wrap" ref={wrapRef}>
      <div className="broker-dd-input-row">
        <span className="broker-dd-icon">🤝</span>
        <input
          type="text"
          className="broker-dd-input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {query && (
          <button type="button" className="broker-dd-clear" onClick={handleClear}>✕</button>
        )}
        <span className="broker-dd-caret" onClick={() => setOpen(o => !o)}>▾</span>
      </div>
      {open && (
        <div className="broker-dd-menu">
          {filtered.length === 0 ? (
            <div className="broker-dd-empty">No brokers found</div>
          ) : (
            filtered.map(b => (
              <div
                key={b.id}
                className={`broker-dd-item ${b.brokerName === value ? "selected" : ""}`}
                onMouseDown={() => handleSelect(b)}
              >
                <div className="broker-dd-avatar">{(b.brokerName || "?")[0].toUpperCase()}</div>
                <div className="broker-dd-info">
                  <span className="broker-dd-name">{b.brokerName}</span>
                  <span className="broker-dd-phone">{b.countryCode || "+91"} {b.phone}</span>
                </div>
                {b.brokerName === value && <span className="broker-dd-check">✓</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYTICS COMPONENT
══════════════════════════════════════════════════════════════ */
function Analytics() {
  const { user, loading: authLoading } = useAuth();

  const [visits, setVisits] = useState([]);
  const [filteredVisits, setFilteredVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkInLogs, setCheckInLogs] = useState([]);
  const [visitorCounts, setVisitorCounts] = useState({});
  const [brokers, setBrokers] = useState([]);

  const [editingVisit, setEditingVisit] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [originalVisitData, setOriginalVisitData] = useState(null);

  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [adminEditingVisit, setAdminEditingVisit] = useState(null);

  const [editHistory, setEditHistory] = useState([]);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showVisitorHistory, setShowVisitorHistory] = useState(false);
  const [selectedVisitorHistory, setSelectedVisitorHistory] = useState(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadErrors, setUploadErrors] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // ── Excel Report Modal State ──
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState("full");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportExecutive, setReportExecutive] = useState("all");
  const [reportLeadStatus, setReportLeadStatus] = useState("all");
  const [reportBookingStatus, setReportBookingStatus] = useState("all");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [customRows, setCustomRows] = useState("");
  const [isCustom, setIsCustom] = useState(false);

  const [filters, setFilters] = useState({
    status:"all", leadQuality:"all", executive:"all",
    dateFrom:"", dateTo:"", visitType:"all", visitorIdentity:"all",
  });

  const [stats, setStats] = useState({
    totalVisits:0, totalBooked:0, totalInterested:0, notBooked:0,
    hotLeads:0, warmLeads:0, coldLeads:0, conversionRate:0,
    avgVisitsPerDay:0, topExecutive:"", topPropertyType:"",
    totalCheckIns:0, todayCheckIns:0, firstTimeVisits:0, returningVisits:0,
  });

  const isAdminUser = () => {
    if (!user?.email) return false;
    const email = user.email.toLowerCase();
    return (
      ["admin@yourcompany.com","superadmin@yourcompany.com","manager@yourcompany.com"].includes(email) ||
      email.includes("admin")
    );
  };

  const getUserInfo = () => ({
    uid: user?.uid || "anonymous",
    email: user?.email || "anonymous@system.com",
    displayName: user?.displayName || user?.email || "Unknown User",
  });

  // ── Fetch visits ──
  useEffect(() => {
    if (!authLoading && user) {
      const q = query(collection(db, "siteVisits"), orderBy("visitAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setVisits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, () => setLoading(false));
      return () => unsub();
    } else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  // ── Fetch check-in logs ──
  useEffect(() => {
    if (!authLoading && user) {
      const q = query(collection(db, "userVisitLogs"), orderBy("checkedInAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setCheckInLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      return () => unsub();
    }
  }, [user, authLoading]);

  // ── Fetch brokers ──
  useEffect(() => {
    if (!authLoading && user) {
      const q = query(collection(db, "brokers"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setBrokers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      return () => unsub();
    }
  }, [user, authLoading]);

  useEffect(() => {
    const counts = {};
    visits.forEach((v) => {
      const phone = v.visitor?.phone;
      if (phone) {
        if (!counts[phone]) counts[phone] = { count:1, name:v.visitor?.name, visitDates:[v.visitAt] };
        else { counts[phone].count++; counts[phone].visitDates.push(v.visitAt); }
      }
    });
    setVisitorCounts(counts);
  }, [visits]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatDate = (ts) => {
    if (!ts) return "N/A";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  };
  const formatTime = (ts) => {
    if (!ts) return "N/A";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
  };
  const formatDateTime = (ts) => {
    if (!ts) return "N/A";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  };

  const getDateStr = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  const getMonthStr = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { month:"short", year:"numeric" });
  };
  const getWeekStr = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  };
  const getHourStr = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const h = d.getHours();
    if (h < 6) return "12AM-6AM"; if (h < 9) return "6AM-9AM";
    if (h < 12) return "9AM-12PM"; if (h < 15) return "12PM-3PM";
    if (h < 18) return "3PM-6PM"; if (h < 21) return "6PM-9PM";
    return "9PM-12AM";
  };

  const calculateStats = (data) => {
    const total = data.length;
    const booked = data.filter((v) => v.bookingStatus === "Booked").length;
    const interested = data.filter((v) => v.bookingStatus === "Interested").length;
    const notBooked = data.filter((v) => v.bookingStatus === "Not Booked").length;
    const hot = data.filter((v) => v.leadQuality === "Hot").length;
    const warm = data.filter((v) => v.leadQuality === "Warm").length;
    const cold = data.filter((v) => v.leadQuality === "Cold").length;
    const firstTimeVisits = data.filter((v) => !v.isReturningVisit).length;
    const returningVisits = data.filter((v) => v.isReturningVisit === true).length;
    const execMap = {};
    data.forEach((v) => { if (v.agent?.name) execMap[v.agent.name] = (execMap[v.agent.name]||0)+1; });
    const topExecutive = Object.entries(execMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
    const propMap = {};
    data.forEach((v) => v.propertyLayout?.forEach((t) => { propMap[t]=(propMap[t]||0)+1; }));
    const topPropertyType = Object.entries(propMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
    const uniqueDates = [...new Set(data.map((v) => {
      const d = v.visitAt?.toDate ? v.visitAt.toDate() : new Date(v.visitAt);
      return d.toDateString();
    }))];
    const avgVisitsPerDay = uniqueDates.length > 0 ? (total/uniqueDates.length).toFixed(1) : 0;
    const today = new Date().toDateString();
    const todayCheckIns = checkInLogs.filter((log) => {
      const d = log.checkedInAt?.toDate ? log.checkedInAt.toDate() : new Date(log.timestamp);
      return d.toDateString() === today;
    }).length;
    setStats({ totalVisits:total, totalBooked:booked, totalInterested:interested, notBooked,
      hotLeads:hot, warmLeads:warm, coldLeads:cold,
      conversionRate: total>0 ? ((booked/total)*100).toFixed(1) : 0,
      avgVisitsPerDay, topExecutive, topPropertyType,
      totalCheckIns:checkInLogs.length, todayCheckIns, firstTimeVisits, returningVisits });
  };

  const performSearch = (list, term) => {
    if (!term.trim()) return list;
    const s = term.toLowerCase().trim();
    return list.filter((v) =>
      v.visitor?.name?.toLowerCase().includes(s) ||
      v.visitor?.phone?.includes(term.trim()) ||
      v.visitor?.email?.toLowerCase().includes(s) ||
      v.visitor?.location?.toLowerCase().includes(s) ||
      v.agent?.name?.toLowerCase().includes(s) ||
      v.propertyLayout?.some((t) => t.toLowerCase().includes(s)) ||
      v.channelPartner?.name?.toLowerCase().includes(s) ||
      v.leadQuality?.toLowerCase().includes(s) ||
      v.bookingStatus?.toLowerCase().includes(s) ||
      v.remarks?.toLowerCase().includes(s) ||
      v.visitorIdentity?.toLowerCase().includes(s)
    );
  };

  useEffect(() => {
    let filtered = [...visits];
    if (searchTerm.trim()) filtered = performSearch(filtered, searchTerm);
    if (filters.status !== "all") filtered = filtered.filter((v) => v.bookingStatus === filters.status);
    if (filters.leadQuality !== "all") filtered = filtered.filter((v) => v.leadQuality === filters.leadQuality);
    if (filters.executive !== "all") filtered = filtered.filter((v) => v.agent?.name === filters.executive);
    if (filters.visitorIdentity !== "all") filtered = filtered.filter((v) => v.visitorIdentity === filters.visitorIdentity);
    if (filters.visitType === "first") filtered = filtered.filter((v) => !v.isReturningVisit);
    else if (filters.visitType === "returning") filtered = filtered.filter((v) => v.isReturningVisit === true);
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date("1900-01-01");
      const to = filters.dateTo ? new Date(filters.dateTo+"T23:59:59") : new Date("2100-12-31");
      filtered = filtered.filter((v) => {
        const d = v.visitAt?.toDate ? v.visitAt.toDate() : new Date(v.visitAt);
        return d >= from && d <= to;
      });
    }
    setFilteredVisits(filtered);
    calculateStats(filtered);
  }, [filters, visits, searchTerm, checkInLogs]);

  useEffect(() => { setCurrentPage(1); }, [filters, searchTerm]);

  const updateFilter = (key, val) => setFilters((p) => ({ ...p, [key]:val }));
  const clearAllFilters = () => {
    setFilters({ status:"all", leadQuality:"all", executive:"all", dateFrom:"", dateTo:"", visitType:"all", visitorIdentity:"all" });
    setSearchTerm(""); setShowSuggestions(false);
  };

  const generateSuggestions = (term) => {
    if (!term || term.length < 2) { setSearchSuggestions([]); return; }
    const s = term.toLowerCase();
    const map = new Map();
    visits.forEach((v) => {
      const name = v.visitor?.name || "";
      const phone = v.visitor?.phone || "";
      const email = v.visitor?.email || "";
      if (name.toLowerCase().includes(s))
        map.set("n:"+name, { type:"name", value:name, phone, name, visitCount:visitorCounts[phone]?.count||1 });
      if (phone.includes(term.trim()))
        map.set("p:"+phone, { type:"phone", value:phone, name, visitCount:visitorCounts[phone]?.count||1 });
      if (email && email.toLowerCase().includes(s))
        map.set("e:"+email, { type:"email", value:email, name, phone, visitCount:visitorCounts[phone]?.count||1 });
    });
    setSearchSuggestions(Array.from(map.values()).slice(0, 8));
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    generateSuggestions(val);
    setShowSuggestions(val.length >= 2);
  };

  const totalRows = filteredVisits.length;
  const totalPages = Math.max(1, Math.ceil(totalRows/rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage-1)*rowsPerPage;
  const paginatedVisits = useMemo(
    () => filteredVisits.slice(startIndex, startIndex+rowsPerPage),
    [filteredVisits, startIndex, rowsPerPage]
  );

  const handleRowsChange = (e) => {
    const val = e.target.value;
    if (val === "custom") { setIsCustom(true); return; }
    setIsCustom(false); setCustomRows("");
    setRowsPerPage(Number(val)); setCurrentPage(1);
  };

  const viewVisitorHistory = (phone, name) => {
    const sorted = visits
      .filter((v) => v.visitor?.phone === phone)
      .sort((a,b) => {
        const da = a.visitAt?.toDate ? a.visitAt.toDate() : new Date(a.visitAt);
        const db2 = b.visitAt?.toDate ? b.visitAt.toDate() : new Date(b.visitAt);
        return db2 - da;
      });
    const ciLogs = checkInLogs.filter((l) => l.phone === phone);
    setSelectedVisitorHistory({ name, phone, visits:sorted, checkIns:ciLogs });
    setShowVisitorHistory(true);
  };

  const getChanges = (original, updated) => {
    const changes = {};
    const paths = {
      "visitor.name":"Visitor Name","visitor.phone":"Phone","visitor.countryCode":"Country Code",
      "visitor.email":"Email","visitor.location":"Location","agent.name":"Sales Executive",
      "channelPartner.name":"Channel Partner","channelPartner.phone":"Channel Partner Phone",
      propertyLayout:"Property Layout",propertyTypes:"Property Types",
      purpose:"Purpose",propertyStatus:"Property Status",
      campaignSource:"Campaign Source",leadQuality:"Lead Status",
      bookingStatus:"Booking Status",remarks:"Remarks",visitorIdentity:"Visitor Identity",
      "salesPortal.interestedLayout":"Interested Layout",
      "salesPortal.interestedPropertyTypes":"Interested Types",
      "salesPortal.interestedPurpose":"Interested Purpose",
    };
    const get = (obj, path) => path.split(".").reduce((o,k)=>o?.[k], obj);
    const fmt = (v) => v==null?"N/A":Array.isArray(v)?v.join(", "):String(v);
    Object.entries(paths).forEach(([path,label]) => {
      const from = fmt(get(original,path));
      const to = fmt(get(updated,path));
      if (from !== to) changes[label] = { from, to };
    });
    return changes;
  };

  const logEditActivity = async (visitId, original, updated, action="UPDATE") => {
    try {
      const changes = action !== "DELETE" ? getChanges(original, updated) : {};
      await addDoc(collection(db, "editAuditLogs"), {
        visitId, action, changes,
        changesCount: Object.keys(changes).length,
        editedBy: getUserInfo(),
        editedAt: serverTimestamp(),
        originalData: original,
        updatedData: action === "DELETE" ? {} : updated,
        visitorName: original?.visitor?.name || "Unknown",
        visitorPhone: original?.visitor?.phone || "Unknown",
      });
    } catch(e) { console.error("Audit log error:", e); }
  };

  const fetchEditHistory = async (visitId) => {
    setHistoryLoading(true);
    try {
      let history = [];
      try {
        const q = query(collection(db,"editAuditLogs"), where("visitId","==",visitId), orderBy("editedAt","desc"), limit(50));
        const snap = await getDocs(q);
        history = snap.docs.map((d) => ({ id:d.id, ...d.data() }));
      } catch {
        const q2 = query(collection(db,"editAuditLogs"), where("visitId","==",visitId), limit(50));
        const snap2 = await getDocs(q2);
        history = snap2.docs
          .map((d) => ({ id:d.id, ...d.data() }))
          .sort((a,b)=>(b.editedAt?.toDate?.()?.getTime()||0)-(a.editedAt?.toDate?.()?.getTime()||0));
      }
      setEditHistory(history);
      setShowEditHistory(true);
    } catch(e) { alert("Error loading history: "+e.message); }
    finally { setHistoryLoading(false); }
  };

  // ── Sales Edit ──
  const handleEdit = (visit) => {
    const visitDate = visit.visitAt?.toDate ? visit.visitAt.toDate() : new Date(visit.visitAt);
    setOriginalVisitData({
      visitorName: visit.visitor?.name || "",
      phone: visit.visitor?.phone || "",
      countryCode: visit.visitor?.countryCode || "+91",
      email: visit.visitor?.email || "",
      location: visit.visitor?.location || "",
      visitDate: visitDate.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),
      visitTime: visit.visitTime || visitDate.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}),
      propertyLayout: visit.propertyLayout || [],
      propertyTypes: visit.propertyTypes || [],
      purpose: visit.purpose || [],
      propertyStatus: visit.propertyStatus || [],
      campaignSource: visit.campaignSource || [],
    });
    setEditingVisit({
      id: visit.id,
      visitorIdentity: visit.visitorIdentity || "New Visitor",
      channelPartner: visit.channelPartner?.name || "",
      channelPartnerPhone: visit.channelPartner?.phone || "",
      channelPartnerCountryCode: visit.channelPartner?.countryCode || "+91",
      interestedLayout: visit.salesPortal?.interestedLayout || visit.propertyLayout || [],
      interestedPropertyTypes: visit.salesPortal?.interestedPropertyTypes || visit.propertyTypes || [],
      interestedPurpose: visit.salesPortal?.interestedPurpose || visit.purpose || [],
      leadQuality: visit.leadQuality || "",
      salesExecutive: visit.agent?.name || "",
      bookingStatus: visit.bookingStatus || "Not Booked",
      remarks: visit.remarks || "",
    });
    setShowEditModal(true);
  };

  // ── Admin Edit ──
  const handleAdminEdit = (visit) => {
    const visitDate = visit.visitAt?.toDate ? visit.visitAt.toDate() : new Date(visit.visitAt);
    setAdminEditingVisit({
      id: visit.id,
      originalPhone: visit.visitor?.phone || "",
      visitorName: visit.visitor?.name || "",
      phone: visit.visitor?.phone || "",
      countryCode: visit.visitor?.countryCode || "+91",
      email: visit.visitor?.email || "",
      location: visit.visitor?.location || "",
      visitDate: visitDate.toISOString().split("T")[0],
      visitTime: visit.visitTime || visitDate.toLocaleTimeString("en-GB",{hour12:false}).slice(0,5),
      propertyLayout: visit.propertyLayout || [],
      propertyTypes: visit.propertyTypes || [],
      purpose: visit.purpose || [],
      propertyStatus: visit.propertyStatus || [],
      campaignSource: visit.campaignSource || [],
      visitorIdentity: visit.visitorIdentity || "New Visitor",
      channelPartner: visit.channelPartner?.name || "",
      channelPartnerPhone: visit.channelPartner?.phone || "",
      channelPartnerCountryCode: visit.channelPartner?.countryCode || "+91",
      interestedLayout: visit.salesPortal?.interestedLayout || visit.propertyLayout || [],
      interestedPropertyTypes: visit.salesPortal?.interestedPropertyTypes || visit.propertyTypes || [],
      interestedPurpose: visit.salesPortal?.interestedPurpose || visit.purpose || [],
      leadQuality: visit.leadQuality || "",
      salesExecutive: visit.agent?.name || "",
      bookingStatus: visit.bookingStatus || "Not Booked",
      remarks: visit.remarks || "",
      isReturningVisit: visit.isReturningVisit || false,
    });
    setShowAdminEditModal(true);
  };

  const salesValidation = Yup.object({
    visitorIdentity: Yup.string().required("Required"),
    salesExecutive: Yup.string().required("Required"),
    leadQuality: Yup.string().required("Required"),
    bookingStatus: Yup.string().required("Required"),
    interestedLayout: Yup.array().min(1,"Select at least one"),
  });

  const adminValidation = Yup.object({
    visitorName: Yup.string().required("Required"),
    phone: Yup.string().matches(/^[0-9]+$/,"Numbers only").min(7).max(20).required("Required"),
    email: Yup.string().email("Invalid email").nullable(),
    visitDate: Yup.date().required("Required"),
    visitTime: Yup.string().required("Required"),
    salesExecutive: Yup.string().required("Required"),
    propertyLayout: Yup.array().min(1,"Select at least one layout"),
    leadQuality: Yup.string().required("Required"),
    bookingStatus: Yup.string().required("Required"),
    interestedLayout: Yup.array().min(1,"Select at least one interested layout"),
  });

  const handleSalesUpdate = async (values, { setSubmitting }) => {
    try {
      setSubmitting(true);
      const original = visits.find((v) => v.id === values.id);
      if (!original) throw new Error("Not found");
      const updated = {
        visitorIdentity: values.visitorIdentity,
        channelPartner: {
          name: values.channelPartner?.trim() || "",
          phone: values.channelPartnerPhone?.trim() || "",
          countryCode: values.channelPartnerCountryCode || "+91"
        },
        salesPortal: {
          interestedLayout: values.interestedLayout || [],
          interestedPropertyTypes: values.interestedPropertyTypes || [],
          interestedPurpose: values.interestedPurpose || []
        },
        agent: { name: values.salesExecutive },
        leadQuality: values.leadQuality,
        bookingStatus: values.bookingStatus,
        remarks: values.remarks?.trim() || "",
        lastModified: serverTimestamp(),
        lastModifiedBy: getUserInfo(),
      };
      await updateDoc(doc(db,"siteVisits",values.id), updated);
      await logEditActivity(values.id, original, {...original,...updated});
      setShowEditModal(false); setEditingVisit(null); setOriginalVisitData(null);
    } catch(e) { alert("Error: "+e.message); }
    finally { setSubmitting(false); }
  };

  const handleAdminUpdate = async (values, { setSubmitting }) => {
    try {
      setSubmitting(true);
      const visitDateTime = new Date(`${values.visitDate}T${values.visitTime}:00`);
      const original = visits.find((v) => v.id === values.id);
      if (!original) throw new Error("Not found");
      const updatedData = {
        visitor: {
          name: values.visitorName.trim(),
          phone: values.phone.trim(),
          countryCode: values.countryCode || "+91",
          email: values.email?.trim() || "",
          location: values.location?.trim() || ""
        },
        propertyLayout: values.propertyLayout || [],
        propertyTypes: values.propertyTypes || [],
        purpose: values.purpose || [],
        propertyStatus: values.propertyStatus || [],
        campaignSource: values.campaignSource || [],
        visitAt: visitDateTime,
        visitTime: values.visitTime,
        isReturningVisit: values.isReturningVisit || false,
        visitorIdentity: values.visitorIdentity,
        channelPartner: {
          name: values.channelPartner?.trim() || "",
          phone: values.channelPartnerPhone?.trim() || "",
          countryCode: values.channelPartnerCountryCode || "+91"
        },
        salesPortal: {
          interestedLayout: values.interestedLayout || [],
          interestedPropertyTypes: values.interestedPropertyTypes || [],
          interestedPurpose: values.interestedPurpose || []
        },
        agent: { name: values.salesExecutive },
        leadQuality: values.leadQuality,
        bookingStatus: values.bookingStatus,
        remarks: values.remarks?.trim() || "",
        lastModified: serverTimestamp(),
        lastModifiedBy: getUserInfo(),
      };
      await updateDoc(doc(db,"siteVisits",values.id), updatedData);
      const phoneToSync = values.originalPhone || values.phone.trim();
      const otherVisits = visits.filter(v => v.visitor?.phone === phoneToSync && v.id !== values.id);
      let syncCount = 0;
      for (const other of otherVisits) {
        const needsUpdate =
          other.visitor?.name !== values.visitorName.trim() ||
          other.visitor?.email !== (values.email?.trim() || "") ||
          other.visitor?.location !== (values.location?.trim() || "");
        if (needsUpdate) {
          try {
            await updateDoc(doc(db,"siteVisits",other.id), {
              "visitor.name": values.visitorName.trim(),
              "visitor.email": values.email?.trim() || "",
              "visitor.location": values.location?.trim() || "",
              "visitor.countryCode": values.countryCode || "+91",
              lastModified: serverTimestamp(),
              lastModifiedBy: getUserInfo(),
            });
            syncCount++;
          } catch(err) { console.error("Sync error:", err); }
        }
      }
      await logEditActivity(values.id, original, {...original,...updatedData});
      setShowAdminEditModal(false);
      setAdminEditingVisit(null);
      if (syncCount > 0) alert(`Updated! Auto-synced ${syncCount} other record(s) with same phone.`);
    } catch(e) { alert("Error: "+e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!isAdminUser()) { alert("Admin only"); return; }
    if (!window.confirm("Delete permanently?")) return;
    try {
      const original = visits.find((v) => v.id === id);
      await deleteDoc(doc(db,"siteVisits",id));
      if (original) await logEditActivity(id, original, {}, "DELETE");
    } catch(e) { alert("Error: "+e.message); }
  };

  const toggleArr = (arr, item) => {
    const a = [...(arr||[])];
    const i = a.indexOf(item);
    if (i===-1) a.push(item); else a.splice(i,1);
    return a;
  };

  /* ═══════════════════════════════════════════════════════════
     EXCEL STYLE HELPERS
     ═══════════════════════════════════════════════════════════ */
  const applyHeaderStyle = (ws, range, bgColor = "1e3a5f", fontColor = "FFFFFF") => {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: fontColor }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: bgColor } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "CCCCCC" } },
          bottom: { style: "thin", color: { rgb: "CCCCCC" } },
          left: { style: "thin", color: { rgb: "CCCCCC" } },
          right: { style: "thin", color: { rgb: "CCCCCC" } },
        },
      };
    }
  };

  const applyRowStyle = (ws, rowIdx, colCount, isAlt = false) => {
    const bg = isAlt ? "F0F4FF" : "FFFFFF";
    for (let C = 0; C < colCount; C++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: C });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };
      ws[addr].s = {
        fill: { patternType: "solid", fgColor: { rgb: bg } },
        alignment: { vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
    }
  };

  const setColWidths = (ws, widths) => {
    ws["!cols"] = widths.map(w => ({ wch: w }));
  };

  /* ═══════════════════════════════════════════════════════════
     GET FILTERED DATA FOR REPORT
     ═══════════════════════════════════════════════════════════ */
  const getReportData = () => {
    let data = [...visits];
    if (reportDateFrom) {
      const from = new Date(reportDateFrom);
      data = data.filter(v => {
        const d = v.visitAt?.toDate ? v.visitAt.toDate() : new Date(v.visitAt);
        return d >= from;
      });
    }
    if (reportDateTo) {
      const to = new Date(reportDateTo + "T23:59:59");
      data = data.filter(v => {
        const d = v.visitAt?.toDate ? v.visitAt.toDate() : new Date(v.visitAt);
        return d <= to;
      });
    }
    if (reportExecutive !== "all") data = data.filter(v => v.agent?.name === reportExecutive);
    if (reportLeadStatus !== "all") data = data.filter(v => v.leadQuality === reportLeadStatus);
    if (reportBookingStatus !== "all") data = data.filter(v => v.bookingStatus === reportBookingStatus);
    return data;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 1 — ALL VISITS (MASTER DATA)
     ═══════════════════════════════════════════════════════════ */
  const buildAllVisitsSheet = (data) => {
    const headers = [
      "S.No","Visit Date","Visit Time","Day","Month","Time Slot",
      "Visit Type","Visitor Identity","Visitor Name","Country Code","Phone","Email","City / Address",
      "Property Layout Shown","Property Types Shown","Purpose Shown","Property Status","Campaign Source",
      "Interested Layout","Interested Types","Interested Purpose",
      "Sales Executive","Lead Status","Booking Status",
      "Channel Partner","Channel Partner Phone",
      "Remarks","Total Visits (Same Phone)","Last Modified","Modified By"
    ];
    const rows = data.map((v, i) => [
      i + 1,
      formatDate(v.visitAt),
      formatTime(v.visitAt),
      getWeekStr(v.visitAt),
      getMonthStr(v.visitAt),
      getHourStr(v.visitAt),
      v.isReturningVisit ? "Returning" : "First Time",
      v.visitorIdentity || "",
      v.visitor?.name || "",
      v.visitor?.countryCode || "+91",
      v.visitor?.phone || "",
      v.visitor?.email || "",
      v.visitor?.location || "",
      (v.propertyLayout || []).join(", "),
      (v.propertyTypes || []).join(", "),
      (v.purpose || []).join(", "),
      (v.propertyStatus || []).join(", "),
      (v.campaignSource || []).join(", "),
      (v.salesPortal?.interestedLayout || []).join(", "),
      (v.salesPortal?.interestedPropertyTypes || []).join(", "),
      (v.salesPortal?.interestedPurpose || []).join(", "),
      v.agent?.name || "",
      v.leadQuality || "",
      v.bookingStatus || "",
      v.channelPartner?.name || "",
      v.channelPartner?.phone || "",
      v.remarks || "",
      v.visitor?.phone ? visitorCounts[v.visitor.phone]?.count || 1 : 1,
      v.lastModified ? formatDate(v.lastModified) : "N/A",
      v.lastModifiedBy?.email || "N/A",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [5,14,10,8,12,12,12,22,20,12,14,24,18,22,18,18,18,20,22,18,18,18,10,14,18,16,30,12,14,20]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 2 — DASHBOARD SUMMARY
     ═══════════════════════════════════════════════════════════ */
  const buildDashboardSheet = (data) => {
    const total = data.length;
    const booked = data.filter(v => v.bookingStatus === "Booked").length;
    const notBooked = data.filter(v => v.bookingStatus === "Not Booked").length;
    const interested = data.filter(v => v.bookingStatus === "Interested").length;
    const hot = data.filter(v => v.leadQuality === "Hot").length;
    const warm = data.filter(v => v.leadQuality === "Warm").length;
    const cold = data.filter(v => v.leadQuality === "Cold").length;
    const firstTime = data.filter(v => !v.isReturningVisit).length;
    const returning = data.filter(v => v.isReturningVisit === true).length;
    const convRate = total > 0 ? ((booked / total) * 100).toFixed(1) : 0;

    const rows = [
      ["SITE VISIT ANALYTICS — DASHBOARD SUMMARY", "", ""],
      ["", "", ""],
      ["Report Generated On:", new Date().toLocaleString("en-IN"), ""],
      ["Generated By:", user?.email || "Unknown", ""],
      ["Report Period:", reportDateFrom && reportDateTo ? `${reportDateFrom} to ${reportDateTo}` : "All Time", ""],
      ["Total Records:", total, ""],
      ["", "", ""],
      ["━━━ VISIT OVERVIEW ━━━", "", ""],
      ["Metric", "Count", "Percentage"],
      ["Total Site Visits", total, "100%"],
      ["First Time Visits", firstTime, total > 0 ? ((firstTime / total) * 100).toFixed(1) + "%" : "0%"],
      ["Returning Visits", returning, total > 0 ? ((returning / total) * 100).toFixed(1) + "%" : "0%"],
      ["", "", ""],
      ["━━━ BOOKING STATUS ━━━", "", ""],
      ["Metric", "Count", "Percentage"],
      ["Booked", booked, total > 0 ? ((booked / total) * 100).toFixed(1) + "%" : "0%"],
      ["Not Booked", notBooked, total > 0 ? ((notBooked / total) * 100).toFixed(1) + "%" : "0%"],
      ["Interested", interested, total > 0 ? ((interested / total) * 100).toFixed(1) + "%" : "0%"],
      ["Conversion Rate", convRate + "%", ""],
      ["", "", ""],
      ["━━━ LEAD QUALITY ━━━", "", ""],
      ["Lead Status", "Count", "Percentage"],
      ["Hot Leads", hot, total > 0 ? ((hot / total) * 100).toFixed(1) + "%" : "0%"],
      ["Warm Leads", warm, total > 0 ? ((warm / total) * 100).toFixed(1) + "%" : "0%"],
      ["Cold Leads", cold, total > 0 ? ((cold / total) * 100).toFixed(1) + "%" : "0%"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    setColWidths(ws, [40, 20, 20]);
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 3 — EXECUTIVE PERFORMANCE
     ═══════════════════════════════════════════════════════════ */
  const buildExecutiveSheet = (data) => {
    const execMap = {};
    data.forEach(v => {
      const name = v.agent?.name || "Unassigned";
      if (!execMap[name]) {
        execMap[name] = { total: 0, booked: 0, hot: 0, warm: 0, cold: 0, firstTime: 0, returning: 0 };
      }
      execMap[name].total++;
      if (v.bookingStatus === "Booked") execMap[name].booked++;
      if (v.leadQuality === "Hot") execMap[name].hot++;
      if (v.leadQuality === "Warm") execMap[name].warm++;
      if (v.leadQuality === "Cold") execMap[name].cold++;
      if (!v.isReturningVisit) execMap[name].firstTime++;
      if (v.isReturningVisit) execMap[name].returning++;
    });

    const headers = [
      "Sales Executive","Total Visits","Booked","Not Booked",
      "Conversion Rate","Hot Leads","Warm Leads","Cold Leads",
      "First Time Visits","Returning Visits","Performance Score"
    ];

    const sorted = Object.entries(execMap).sort((a, b) => b[1].total - a[1].total);
    const rows = sorted.map(([name, e]) => {
      const notBooked = e.total - e.booked;
      const convRate = e.total > 0 ? ((e.booked / e.total) * 100).toFixed(1) : 0;
      const score = ((e.booked * 3) + (e.hot * 2) + (e.warm * 1)).toFixed(0);
      return [name, e.total, e.booked, notBooked, convRate + "%", e.hot, e.warm, e.cold, e.firstTime, e.returning, score];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [22, 14, 10, 12, 16, 12, 12, 12, 16, 16, 16]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "065F46", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 4 — DAILY VISIT REPORT
     ═══════════════════════════════════════════════════════════ */
  const buildDailySheet = (data) => {
    const dailyMap = {};
    data.forEach(v => {
      const ds = getDateStr(v.visitAt);
      if (!ds) return;
      if (!dailyMap[ds]) {
        dailyMap[ds] = { date: ds, day: getWeekStr(v.visitAt), total: 0, booked: 0, hot: 0, warm: 0, cold: 0, firstTime: 0, returning: 0 };
      }
      dailyMap[ds].total++;
      if (v.bookingStatus === "Booked") dailyMap[ds].booked++;
      if (v.leadQuality === "Hot") dailyMap[ds].hot++;
      if (v.leadQuality === "Warm") dailyMap[ds].warm++;
      if (v.leadQuality === "Cold") dailyMap[ds].cold++;
      if (!v.isReturningVisit) dailyMap[ds].firstTime++;
      if (v.isReturningVisit) dailyMap[ds].returning++;
    });

    const headers = ["Date","Day","Total Visits","Booked","Conversion Rate","Hot","Warm","Cold","First Time","Returning"];
    const sorted = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    const rows = sorted.map(d => [
      d.date, d.day, d.total, d.booked,
      d.total > 0 ? ((d.booked / d.total) * 100).toFixed(1) + "%" : "0%",
      d.hot, d.warm, d.cold, d.firstTime, d.returning
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [14, 10, 14, 10, 16, 8, 8, 8, 12, 12]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "1D4ED8", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 5 — MONTHLY REPORT
     ═══════════════════════════════════════════════════════════ */
  const buildMonthlySheet = (data) => {
    const monthMap = {};
    data.forEach(v => {
      const ms = getMonthStr(v.visitAt);
      if (!ms) return;
      if (!monthMap[ms]) {
        monthMap[ms] = { month: ms, total: 0, booked: 0, hot: 0, warm: 0, cold: 0, firstTime: 0, returning: 0 };
      }
      monthMap[ms].total++;
      if (v.bookingStatus === "Booked") monthMap[ms].booked++;
      if (v.leadQuality === "Hot") monthMap[ms].hot++;
      if (v.leadQuality === "Warm") monthMap[ms].warm++;
      if (v.leadQuality === "Cold") monthMap[ms].cold++;
      if (!v.isReturningVisit) monthMap[ms].firstTime++;
      if (v.isReturningVisit) monthMap[ms].returning++;
    });

    const headers = ["Month","Total Visits","Booked","Not Booked","Conversion Rate","Hot","Warm","Cold","First Time","Returning","Avg Per Day"];
    const rows = Object.values(monthMap).map(m => {
      const notBooked = m.total - m.booked;
      const convRate = m.total > 0 ? ((m.booked / m.total) * 100).toFixed(1) : 0;
      // Approx days in month
      const avgPerDay = (m.total / 30).toFixed(1);
      return [m.month, m.total, m.booked, notBooked, convRate + "%", m.hot, m.warm, m.cold, m.firstTime, m.returning, avgPerDay];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [14, 14, 10, 12, 16, 8, 8, 8, 12, 12, 12]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "7C3AED", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 6 — PROPERTY LAYOUT ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildPropertySheet = (data) => {
    const layoutMap = {};
    const interestedMap = {};
    data.forEach(v => {
      (v.propertyLayout || []).forEach(l => {
        if (!layoutMap[l]) layoutMap[l] = { shown: 0, booked: 0, hot: 0 };
        layoutMap[l].shown++;
        if (v.bookingStatus === "Booked") layoutMap[l].booked++;
        if (v.leadQuality === "Hot") layoutMap[l].hot++;
      });
      (v.salesPortal?.interestedLayout || []).forEach(l => {
        interestedMap[l] = (interestedMap[l] || 0) + 1;
      });
    });

    const headers = ["Property Layout","Times Shown","Times Interested","Booked","Hot Leads","Interest Rate","Booking Rate"];
    const rows = PROPERTY_LAYOUTS.map(l => {
      const shown = layoutMap[l]?.shown || 0;
      const interested = interestedMap[l] || 0;
      const booked = layoutMap[l]?.booked || 0;
      const hot = layoutMap[l]?.hot || 0;
      return [
        l, shown, interested, booked, hot,
        shown > 0 ? ((interested / shown) * 100).toFixed(1) + "%" : "0%",
        shown > 0 ? ((booked / shown) * 100).toFixed(1) + "%" : "0%"
      ];
    }).filter(r => r[1] > 0 || r[2] > 0);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [18, 14, 16, 10, 12, 14, 14]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "B45309", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 7 — CAMPAIGN SOURCE ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildCampaignSheet = (data) => {
    const srcMap = {};
    data.forEach(v => {
      (v.campaignSource || ["Unknown"]).forEach(src => {
        if (!srcMap[src]) srcMap[src] = { total: 0, booked: 0, hot: 0, warm: 0, cold: 0 };
        srcMap[src].total++;
        if (v.bookingStatus === "Booked") srcMap[src].booked++;
        if (v.leadQuality === "Hot") srcMap[src].hot++;
        if (v.leadQuality === "Warm") srcMap[src].warm++;
        if (v.leadQuality === "Cold") srcMap[src].cold++;
      });
    });

    const headers = ["Campaign Source","Total Leads","Booked","Conversion Rate","Hot","Warm","Cold","ROI Score"];
    const sorted = Object.entries(srcMap).sort((a, b) => b[1].total - a[1].total);
    const rows = sorted.map(([src, s]) => {
      const convRate = s.total > 0 ? ((s.booked / s.total) * 100).toFixed(1) : 0;
      const roi = ((s.booked * 3) + (s.hot * 2) + (s.warm * 1)).toFixed(0);
      return [src, s.total, s.booked, convRate + "%", s.hot, s.warm, s.cold, roi];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [22, 14, 10, 16, 8, 8, 8, 12]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "0F766E", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 8 — VISITOR IDENTITY ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildVisitorIdentitySheet = (data) => {
    const idMap = {};
    data.forEach(v => {
      const id = v.visitorIdentity || "Unknown";
      if (!idMap[id]) idMap[id] = { total: 0, booked: 0, hot: 0, warm: 0, cold: 0 };
      idMap[id].total++;
      if (v.bookingStatus === "Booked") idMap[id].booked++;
      if (v.leadQuality === "Hot") idMap[id].hot++;
      if (v.leadQuality === "Warm") idMap[id].warm++;
      if (v.leadQuality === "Cold") idMap[id].cold++;
    });

    const headers = ["Visitor Identity","Total","Booked","Conversion Rate","Hot","Warm","Cold"];
    const sorted = Object.entries(idMap).sort((a, b) => b[1].total - a[1].total);
    const rows = sorted.map(([id, d]) => {
      const convRate = d.total > 0 ? ((d.booked / d.total) * 100).toFixed(1) : 0;
      return [id, d.total, d.booked, convRate + "%", d.hot, d.warm, d.cold];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [36, 10, 10, 16, 8, 8, 8]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "BE123C", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 9 — HOT LEADS ONLY
     ═══════════════════════════════════════════════════════════ */
  const buildHotLeadsSheet = (data) => {
    const hotData = data.filter(v => v.leadQuality === "Hot");
    const headers = [
      "S.No","Visit Date","Visitor Name","Phone","Email","City",
      "Sales Executive","Booking Status","Interested Layout","Interested Purpose","Remarks","Visit Count"
    ];
    const rows = hotData.map((v, i) => [
      i + 1,
      formatDate(v.visitAt),
      v.visitor?.name || "",
      v.visitor?.phone || "",
      v.visitor?.email || "",
      v.visitor?.location || "",
      v.agent?.name || "",
      v.bookingStatus || "",
      (v.salesPortal?.interestedLayout || []).join(", "),
      (v.salesPortal?.interestedPurpose || []).join(", "),
      v.remarks || "",
      v.visitor?.phone ? visitorCounts[v.visitor.phone]?.count || 1 : 1,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [5, 14, 20, 14, 24, 16, 18, 14, 22, 18, 30, 12]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "DC2626", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 10 — BOOKED VISITORS
     ═══════════════════════════════════════════════════════════ */
  const buildBookedSheet = (data) => {
    const bookedData = data.filter(v => v.bookingStatus === "Booked");
    const headers = [
      "S.No","Booking Date","Visitor Name","Phone","Email","City",
      "Sales Executive","Lead Status","Layout Booked","Purpose","Channel Partner","Remarks"
    ];
    const rows = bookedData.map((v, i) => [
      i + 1,
      formatDate(v.visitAt),
      v.visitor?.name || "",
      v.visitor?.phone || "",
      v.visitor?.email || "",
      v.visitor?.location || "",
      v.agent?.name || "",
      v.leadQuality || "",
      (v.salesPortal?.interestedLayout || v.propertyLayout || []).join(", "),
      (v.salesPortal?.interestedPurpose || v.purpose || []).join(", "),
      v.channelPartner?.name || "",
      v.remarks || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [5, 14, 20, 14, 24, 16, 18, 12, 22, 18, 18, 30]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "065F46", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 11 — CHANNEL PARTNER / BROKER REPORT
     ═══════════════════════════════════════════════════════════ */
  const buildBrokerSheet = (data) => {
    const brokerMap = {};
    data.forEach(v => {
      const name = v.channelPartner?.name?.trim();
      if (!name) return;
      const key = name;
      if (!brokerMap[key]) {
        brokerMap[key] = {
          name,
          phone: v.channelPartner?.phone || "",
          total: 0, booked: 0, hot: 0, warm: 0, cold: 0,
        };
      }
      brokerMap[key].total++;
      if (v.bookingStatus === "Booked") brokerMap[key].booked++;
      if (v.leadQuality === "Hot") brokerMap[key].hot++;
      if (v.leadQuality === "Warm") brokerMap[key].warm++;
      if (v.leadQuality === "Cold") brokerMap[key].cold++;
    });

    const headers = ["Channel Partner","Phone","Total Referrals","Booked","Conversion Rate","Hot","Warm","Cold","Commission Score"];
    const sorted = Object.values(brokerMap).sort((a, b) => b.booked - a.booked);
    const rows = sorted.map(b => {
      const convRate = b.total > 0 ? ((b.booked / b.total) * 100).toFixed(1) : 0;
      const score = ((b.booked * 5) + (b.hot * 2) + (b.warm * 1)).toFixed(0);
      return [b.name, b.phone, b.total, b.booked, convRate + "%", b.hot, b.warm, b.cold, score];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [22, 16, 16, 10, 16, 8, 8, 8, 16]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "92400E", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 12 — REPEAT VISITORS
     ═══════════════════════════════════════════════════════════ */
  const buildRepeatVisitorsSheet = (data) => {
    const phoneMap = {};
    data.forEach(v => {
      const phone = v.visitor?.phone;
      if (!phone) return;
      if (!phoneMap[phone]) {
        phoneMap[phone] = {
          name: v.visitor?.name || "",
          phone,
          email: v.visitor?.email || "",
          city: v.visitor?.location || "",
          visits: [],
        };
      }
      phoneMap[phone].visits.push(v);
    });

    const repeats = Object.values(phoneMap).filter(p => p.visits.length > 1).sort((a, b) => b.visits.length - a.visits.length);

    const headers = ["Visitor Name","Phone","Email","City","Total Visits","First Visit","Last Visit","Current Lead","Current Status","Executives Handled"];
    const rows = repeats.map(p => {
      const sorted = p.visits.sort((a, b) => {
        const da = a.visitAt?.toDate ? a.visitAt.toDate() : new Date(a.visitAt);
        const db2 = b.visitAt?.toDate ? b.visitAt.toDate() : new Date(b.visitAt);
        return da - db2;
      });
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const execs = [...new Set(p.visits.map(v => v.agent?.name).filter(Boolean))].join(", ");
      return [
        p.name, p.phone, p.email, p.city,
        p.visits.length,
        formatDate(first.visitAt),
        formatDate(last.visitAt),
        last.leadQuality || "",
        last.bookingStatus || "",
        execs,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [20, 14, 24, 16, 12, 14, 14, 12, 14, 24]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "1E40AF", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 13 — TIME SLOT ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildTimeSlotSheet = (data) => {
    const slots = ["12AM-6AM","6AM-9AM","9AM-12PM","12PM-3PM","3PM-6PM","6PM-9PM","9PM-12AM"];
    const slotMap = {};
    slots.forEach(s => slotMap[s] = { slot: s, total: 0, booked: 0, hot: 0, warm: 0, cold: 0 });

    data.forEach(v => {
      const slot = getHourStr(v.visitAt);
      if (slotMap[slot]) {
        slotMap[slot].total++;
        if (v.bookingStatus === "Booked") slotMap[slot].booked++;
        if (v.leadQuality === "Hot") slotMap[slot].hot++;
        if (v.leadQuality === "Warm") slotMap[slot].warm++;
        if (v.leadQuality === "Cold") slotMap[slot].cold++;
      }
    });

    const headers = ["Time Slot","Total Visits","Booked","Conversion Rate","Hot","Warm","Cold","Peak Hours?"];
    const allTotals = Object.values(slotMap).map(s => s.total);
    const maxTotal = Math.max(...allTotals);
    const rows = slots.map(s => {
      const d = slotMap[s];
      const convRate = d.total > 0 ? ((d.booked / d.total) * 100).toFixed(1) : 0;
      return [d.slot, d.total, d.booked, convRate + "%", d.hot, d.warm, d.cold, d.total === maxTotal && d.total > 0 ? "⭐ Peak" : ""];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [14, 14, 10, 16, 8, 8, 8, 14]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "0E7490", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 14 — DAY OF WEEK ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildDayOfWeekSheet = (data) => {
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const dayMap = {};
    days.forEach(d => dayMap[d] = { day: d, total: 0, booked: 0, hot: 0, warm: 0, cold: 0 });

    data.forEach(v => {
      const day = getWeekStr(v.visitAt);
      if (dayMap[day]) {
        dayMap[day].total++;
        if (v.bookingStatus === "Booked") dayMap[day].booked++;
        if (v.leadQuality === "Hot") dayMap[day].hot++;
        if (v.leadQuality === "Warm") dayMap[day].warm++;
        if (v.leadQuality === "Cold") dayMap[day].cold++;
      }
    });

    const headers = ["Day","Total Visits","Booked","Conversion Rate","Hot","Warm","Cold","Best Day?"];
    const allTotals = Object.values(dayMap).map(d => d.total);
    const maxTotal = Math.max(...allTotals);
    const rows = days.map(d => {
      const e = dayMap[d];
      const convRate = e.total > 0 ? ((e.booked / e.total) * 100).toFixed(1) : 0;
      return [e.day, e.total, e.booked, convRate + "%", e.hot, e.warm, e.cold, e.total === maxTotal && e.total > 0 ? "⭐ Best" : ""];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    setColWidths(ws, [10, 14, 10, 16, 8, 8, 8, 12]);
    applyHeaderStyle(ws, { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, "4338CA", "FFFFFF");
    rows.forEach((_, i) => applyRowStyle(ws, i + 1, headers.length, i % 2 === 1));
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     SHEET 15 — PURPOSE & PROPERTY TYPE ANALYSIS
     ═══════════════════════════════════════════════════════════ */
  const buildPurposeSheet = (data) => {
    const purposeMap = {};
    const typeMap = {};

    data.forEach(v => {
      (v.purpose || []).forEach(p => {
        if (!purposeMap[p]) purposeMap[p] = { total: 0, booked: 0, hot: 0 };
        purposeMap[p].total++;
        if (v.bookingStatus === "Booked") purposeMap[p].booked++;
        if (v.leadQuality === "Hot") purposeMap[p].hot++;
      });
      (v.propertyTypes || []).forEach(t => {
        if (!typeMap[t]) typeMap[t] = { total: 0, booked: 0, hot: 0 };
        typeMap[t].total++;
        if (v.bookingStatus === "Booked") typeMap[t].booked++;
        if (v.leadQuality === "Hot") typeMap[t].hot++;
      });
    });

    const rows = [
      ["PURPOSE ANALYSIS", "", "", ""],
      ["Purpose", "Total", "Booked", "Hot Leads"],
      ...Object.entries(purposeMap).map(([p, d]) => [p, d.total, d.booked, d.hot]),
      ["", "", "", ""],
      ["PROPERTY TYPE ANALYSIS", "", "", ""],
      ["Property Type", "Total", "Booked", "Hot Leads"],
      ...Object.entries(typeMap).map(([t, d]) => [t, d.total, d.booked, d.hot]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    setColWidths(ws, [36, 12, 12, 12]);
    return ws;
  };

  /* ═══════════════════════════════════════════════════════════
     MAIN EXPORT FUNCTION
     ═══════════════════════════════════════════════════════════ */
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const data = filteredVisits;

    const mainData = data.map((v, i) => ({
      "S.No": i+1,
      "Visit Date": formatDate(v.visitAt),
      "Visit Time": formatTime(v.visitAt),
      "Date (YYYY-MM-DD)": getDateStr(v.visitAt),
      "Month": getMonthStr(v.visitAt),
      "Day of Week": getWeekStr(v.visitAt),
      "Time Slot": getHourStr(v.visitAt),
      "Visit Type": v.isReturningVisit ? "Returning" : "First Time",
      "Visitor Identity": v.visitorIdentity || "",
      "Visitor Name": v.visitor?.name || "",
      "Country Code": v.visitor?.countryCode || "+91",
      "Phone": v.visitor?.phone || "",
      "Email": v.visitor?.email || "",
      "City / Address": v.visitor?.location || "",
      "Property Layout": (v.propertyLayout||[]).join(", "),
      "Property Types": (v.propertyTypes||[]).join(", "),
      "Purpose": (v.purpose||[]).join(", "),
      "Property Status": (v.propertyStatus||[]).join(", "),
      "Campaign Source": (v.campaignSource||[]).join(", "),
      "Interested Layout": (v.salesPortal?.interestedLayout||[]).join(", "),
      "Interested Types": (v.salesPortal?.interestedPropertyTypes||[]).join(", "),
      "Interested Purpose": (v.salesPortal?.interestedPurpose||[]).join(", "),
      "Sales Executive": v.agent?.name || "",
      "Lead Status": v.leadQuality || "",
      "Booking Status": v.bookingStatus || "",
      "Channel Partner": v.channelPartner?.name || "",
      "Channel Partner Phone": v.channelPartner?.phone || "",
      "Remarks": v.remarks || "",
      "Total Visits by Phone": v.visitor?.phone ? visitorCounts[v.visitor.phone]?.count||1 : 1,
      "Last Modified": v.lastModified ? formatDate(v.lastModified) : "N/A",
      "Modified By": v.lastModifiedBy?.email || "N/A",
    }));

    const ws1 = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, ws1, "All Visits");

    const summaryData = [
      ["SITE VISIT ANALYTICS DASHBOARD","",""],
      ["Generated on:", new Date().toLocaleString("en-IN"),""],
      ["Generated by:", user?.email || "Unknown",""],
      ["","",""],
      ["KEY METRICS","Value","Details"],
      ["Total Visits", stats.totalVisits, `${stats.avgVisitsPerDay} visits/day avg`],
      ["First Time Visits", stats.firstTimeVisits, ""],
      ["Returning Visits", stats.returningVisits, ""],
      ["","",""],
      ["BOOKING STATUS","Count","Percentage"],
      ["Booked", stats.totalBooked, `${stats.conversionRate}%`],
      ["Not Booked", stats.notBooked, ""],
      ["","",""],
      ["LEAD QUALITY","Count",""],
      ["Hot Leads", stats.hotLeads, ""],
      ["Warm Leads", stats.warmLeads, ""],
      ["Cold Leads", stats.coldLeads, ""],
      ["","",""],
      ["Conversion Rate", `${stats.conversionRate}%`, ""],
      ["Top Executive", stats.topExecutive, ""],
      ["Top Property Type", stats.topPropertyType, ""],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Dashboard");

    XLSX.writeFile(wb, `Site-Visit-Analytics-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  /* ═══════════════════════════════════════════════════════════
     FULL ADVANCED REPORT EXPORT
     ═══════════════════════════════════════════════════════════ */
  const generateFullReport = async () => {
    setIsGeneratingReport(true);
    try {
      const data = getReportData();
      if (data.length === 0) {
        alert("No data found for the selected filters.");
        setIsGeneratingReport(false);
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1 — All Visits
      XLSX.utils.book_append_sheet(wb, buildAllVisitsSheet(data), "All Visits");

      // Sheet 2 — Dashboard Summary
      XLSX.utils.book_append_sheet(wb, buildDashboardSheet(data), "Dashboard");

      // Sheet 3 — Executive Performance
      XLSX.utils.book_append_sheet(wb, buildExecutiveSheet(data), "Executive Performance");

      // Sheet 4 — Daily Report
      XLSX.utils.book_append_sheet(wb, buildDailySheet(data), "Daily Report");

      // Sheet 5 — Monthly Report
      XLSX.utils.book_append_sheet(wb, buildMonthlySheet(data), "Monthly Report");

      // Sheet 6 — Property Layout
      XLSX.utils.book_append_sheet(wb, buildPropertySheet(data), "Property Analysis");

      // Sheet 7 — Campaign Source
      XLSX.utils.book_append_sheet(wb, buildCampaignSheet(data), "Campaign Source");

      // Sheet 8 — Visitor Identity
      XLSX.utils.book_append_sheet(wb, buildVisitorIdentitySheet(data), "Visitor Identity");

      // Sheet 9 — Hot Leads
      XLSX.utils.book_append_sheet(wb, buildHotLeadsSheet(data), "Hot Leads");

      // Sheet 10 — Booked Visitors
      XLSX.utils.book_append_sheet(wb, buildBookedSheet(data), "Booked Visitors");

      // Sheet 11 — Channel Partners
      XLSX.utils.book_append_sheet(wb, buildBrokerSheet(data), "Channel Partners");

      // Sheet 12 — Repeat Visitors
      XLSX.utils.book_append_sheet(wb, buildRepeatVisitorsSheet(data), "Repeat Visitors");

      // Sheet 13 — Time Slot Analysis
      XLSX.utils.book_append_sheet(wb, buildTimeSlotSheet(data), "Time Slot Analysis");

      // Sheet 14 — Day of Week
      XLSX.utils.book_append_sheet(wb, buildDayOfWeekSheet(data), "Day of Week");

      // Sheet 15 — Purpose & Property Type
      XLSX.utils.book_append_sheet(wb, buildPurposeSheet(data), "Purpose Analysis");

      const dateLabel = reportDateFrom && reportDateTo
        ? `${reportDateFrom}_to_${reportDateTo}`
        : new Date().toISOString().split("T")[0];

      XLSX.writeFile(wb, `Site-Visit-Full-Report-${dateLabel}.xlsx`);
      setShowReportModal(false);
    } catch (e) {
      alert("Error generating report: " + e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     EXCEL IMPORT
     ═══════════════════════════════════════════════════════════ */
  const downloadExcelTemplate = () => {
    const template = [{
      "Visit Date":"2024-01-15","Visit Time":"10:30","Visitor Name":"John Doe",
      Phone:"9876543210","Country Code":"+91",Email:"john@example.com",
      "City / Address":"Mumbai","Property Layout":"2 BHK, 3 BHK",
      "Property Types":"Apartment","Purpose":"For Residence",
      "Property Status":"Under Construction","Campaign Source":"Online Search",
      "Visitor Identity":"New Visitor","Sales Executive":"Tushar Bhandari",
      "Lead Status":"Hot","Channel Partner":"","Channel Partner Phone":"",
      "Booking Status":"Not Booked",Remarks:"",
    }];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws1, "Data");
    XLSX.writeFile(wb, "site-visits-import-template.xlsx");
  };

  const parseExcelDate = (v) => {
    if (!v) return new Date();
    if (v instanceof Date) return v;
    if (typeof v === "string") { const d = new Date(v); if (!isNaN(d)) return d; }
    if (typeof v === "number") return new Date((v-25569)*86400*1000);
    return new Date();
  };

  const validatePhone = (phone) => {
    if (!phone) return null;
    const c = String(phone).replace(/\D/g,"");
    if (c.length === 10) return c;
    if (c.length === 11 && c.startsWith("0")) return c.slice(1);
    if (c.length === 12 && c.startsWith("91")) return c.slice(2);
    return null;
  };

  const transformRow = (row, idx) => {
    const errors = [];
    if (!row["Visitor Name"]?.trim()) errors.push(`Row ${idx+2}: Visitor Name required`);
    const phone = validatePhone(row["Phone"]);
    if (!phone) errors.push(`Row ${idx+2}: Valid phone required`);
    let visitDate = parseExcelDate(row["Visit Date"]);
    let visitTime = row["Visit Time"] || "10:00";
    if (typeof visitTime === "number") {
      const h = Math.floor(visitTime*24), m = Math.floor((visitTime*24-h)*60);
      visitTime = `${pad(h)}:${pad(m)}`;
    }
    const [hh,mm] = (visitTime+"").split(":");
    visitDate.setHours(parseInt(hh)||10, parseInt(mm)||0, 0, 0);
    return {
      errors,
      data: errors.length === 0 ? {
        visitor: { name:row["Visitor Name"].trim(), phone, email:row["Email"]?.trim()||"", location:row["City / Address"]?.trim()||"", countryCode:row["Country Code"]?.trim()||"+91" },
        agent: { name:row["Sales Executive"]?.trim()||"" },
        propertyLayout: row["Property Layout"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
        propertyTypes: row["Property Types"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
        purpose: row["Purpose"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
        propertyStatus: row["Property Status"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
        campaignSource: row["Campaign Source"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
        channelPartner: { name:row["Channel Partner"]?.trim()||"", phone:validatePhone(row["Channel Partner Phone"])||"", countryCode:"+91" },
        visitorIdentity: row["Visitor Identity"]||"New Visitor",
        leadQuality: row["Lead Status"]||"Cold",
        bookingStatus: row["Booking Status"]||"Not Booked",
        remarks: row["Remarks"]?.trim()||"",
        visitAt:visitDate, visitTime,
        createdAt:serverTimestamp(), createdBy:getUserInfo(),
        importedFromExcel:true, isFirstVisit:true,
      } : null,
    };
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { alert("Please upload Excel file"); return; }
    setUploadStatus("Reading..."); setUploadErrors([]); setPreviewData([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type:"array", cellDates:true });
        const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("data")) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
        if (!rows.length) { setUploadStatus("No data"); return; }
        setUploadStatus(`Found ${rows.length} rows. Validating...`);
        const valid=[], errs=[];
        rows.forEach((row,i) => { const {errors,data}=transformRow(row,i); errs.push(...errors); if(data) valid.push(data); });
        setUploadErrors(errs); setPreviewData(valid);
        setUploadStatus(valid.length>0?`${valid.length} valid rows`:"No valid data");
        if (valid.length>0) setShowUploadModal(true);
      } catch(err) { setUploadStatus("Error: "+err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const importToFirebase = async () => {
    if (!previewData.length) return;
    setIsUploading(true); setUploadProgress(0);
    try {
      let done=0;
      for (let i=0; i<previewData.length; i+=100) {
        const chunk=previewData.slice(i,i+100);
        const batch=writeBatch(db);
        chunk.forEach((d) => batch.set(doc(collection(db,"siteVisits")),d));
        await batch.commit();
        done+=chunk.length;
        setUploadProgress((done/previewData.length)*100);
        setUploadStatus(`Imported ${done} of ${previewData.length}`);
      }
      setShowUploadModal(false); setPreviewData([]);
      if (fileInputRef.current) fileInputRef.current.value="";
      alert(`Imported ${previewData.length} records!`);
    } catch(e) { setUploadStatus("Error: "+e.message); }
    finally { setIsUploading(false); setUploadProgress(0); }
  };

  // ─── Render guards ───
  if (authLoading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Authenticating...</p></div>;
  if (!user) return <div className="av-auth-screen"><div className="av-auth-card"><div className="av-auth-icon">🔒</div><h2>Login Required</h2><p>Please log in.</p><button onClick={()=>window.location.href="/login"} className="av-auth-btn">Login</button></div></div>;
  if (loading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Loading...</p></div>;

  const PageNumbers = () => {
    const pages=[];
    let start,end;
    if (totalPages<=7){start=1;end=totalPages;}
    else if(safePage<=4){start=1;end=7;}
    else if(safePage>=totalPages-3){start=totalPages-6;end=totalPages;}
    else{start=safePage-3;end=safePage+3;}
    for(let p=start;p<=end;p++) pages.push(<button key={p} className={`av-pg-num ${safePage===p?"active":""}`} onClick={()=>setCurrentPage(p)}>{p}</button>);
    return <>{pages}</>;
  };

  const PaginationBar = () => (
    <div className="av-pagination">
      <button className="av-pg-btn" onClick={()=>setCurrentPage(1)} disabled={safePage===1}>«</button>
      <button className="av-pg-btn" onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={safePage===1}>‹</button>
      <div className="av-pg-nums"><PageNumbers /></div>
      <button className="av-pg-btn" onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages}>›</button>
      <button className="av-pg-btn" onClick={()=>setCurrentPage(totalPages)} disabled={safePage===totalPages}>»</button>
    </div>
  );

  const ROField = ({label,value,icon}) => (
    <div className="av-ro-field">
      <div className="av-ro-label">{icon} {label}</div>
      <div className="av-ro-value">{value||"N/A"}</div>
    </div>
  );

  const ROCheckboxGroup = ({label,options,selected,icon}) => (
    <div className="av-ro-field av-ro-full">
      <div className="av-ro-label">{icon} {label}</div>
      <div className="av-ro-chips">
        {options.map(opt=>(
          <span key={opt} className={`av-ro-chip ${selected?.includes(opt)?"av-chip-on":"av-chip-off"}`}>
            {selected?.includes(opt)?"☑":"☐"} {opt}
          </span>
        ))}
      </div>
    </div>
  );

  const FormCheckboxGroup = ({ label, icon, options, values, fieldName, setFieldValue, error }) => (
    <div className="av-sp-field av-sp-full">
      <label className="av-sp-label">{icon && <span>{icon} </span>}{label}</label>
      <div className="av-sp-cb-grid">
        {options.map(t => (
          <label key={t} className={`av-sp-cb-item ${values[fieldName]?.includes(t) ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={values[fieldName]?.includes(t) || false}
              onChange={() => setFieldValue(fieldName, toggleArr(values[fieldName], t))}
            />
            <span className="av-sp-cb-mark">{values[fieldName]?.includes(t) ? "✓" : ""}</span>
            {t}
          </label>
        ))}
      </div>
      {error && <div className="av-err">{error}</div>}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════ JSX ═══ */
  return (
    <div className="av-container">
      {/* ── Header ── */}
      <div className="av-header">
        <div className="av-header-inner">
          <div className="av-header-left">
            <h1 className="av-title">📊 Site Visit Analytics</h1>
            <p className="av-subtitle">Comprehensive lead & visit management dashboard</p>
          </div>
          <div className="av-header-right">
            <div className="av-user-chip">
              <div className="av-user-avatar">{(user.email||"?")[0].toUpperCase()}</div>
              <div className="av-user-info">
                <span className="av-user-email">{user.email}</span>
                {isAdminUser() && <span className="av-admin-tag">Admin</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="av-content">
        {/* ── Stats ── */}
        <div className="av-stats-row">
          {[
            {icon:"👥",label:"Total Visits",val:stats.totalVisits,sub:`${stats.avgVisitsPerDay}/day`,color:"#3b82f6"},
            {icon:"🆕",label:"First Time",val:stats.firstTimeVisits,sub:"New visitors",color:"#8b5cf6"},
            {icon:"🔄",label:"Returning",val:stats.returningVisits,sub:"Repeat visits",color:"#06b6d4"},
            {icon:"✅",label:"Booked",val:stats.totalBooked,sub:`${stats.conversionRate}% rate`,color:"#10b981"},
            {icon:"⭐",label:"Interested",val:stats.totalInterested,sub:"Potential leads",color:"#f59e0b"},
            {icon:"❌",label:"Not Booked",val:stats.notBooked,sub:"Follow up",color:"#ef4444"},
          ].map(s=>(
            <div key={s.label} className="av-stat-card" style={{"--accent":s.color}}>
              <div className="av-stat-icon" style={{color:s.color}}>{s.icon}</div>
              <div className="av-stat-body">
                <div className="av-stat-label">{s.label}</div>
                <div className="av-stat-value" style={{color:s.color}}>{s.val}</div>
                <div className="av-stat-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="av-lead-row">
          {[
            {icon:"🔥",label:"Hot",val:stats.hotLeads,color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
            {icon:"⚡",label:"Warm",val:stats.warmLeads,color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"},
            {icon:"❄️",label:"Cold",val:stats.coldLeads,color:"#3b82f6",bg:"#eff6ff",border:"#bfdbfe"},
            {icon:"🔔",label:"Check-Ins",val:stats.totalCheckIns,color:"#6b7280",bg:"#f9fafb",border:"#e5e7eb",sub:`${stats.todayCheckIns} today`},
          ].map(l=>(
            <div key={l.label} className="av-lead-chip" style={{background:l.bg,borderColor:l.border}}>
              <span className="av-lead-icon">{l.icon}</span>
              <div>
                <div className="av-lead-val" style={{color:l.color}}>{l.val}</div>
                <div className="av-lead-lbl">{l.label}</div>
                {l.sub && <div className="av-lead-sub">{l.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="av-filters-card">
          <div className="av-filters-top">
            <h3 className="av-filters-title">🔍 Search & Filters</h3>
            <div className="av-filters-right">
              <div className="av-search-wrap" ref={searchRef}>
                <span className="av-search-ico">🔍</span>
                <input
                  type="text"
                  className="av-search-input"
                  placeholder="Search name, phone, email..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => searchTerm.length >= 2 && setShowSuggestions(true)}
                />
                {searchTerm && (
                  <button className="av-search-clear" onClick={() => { setSearchTerm(""); setShowSuggestions(false); }}>✕</button>
                )}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="av-suggestions">
                    {searchSuggestions.map((s,i) => (
                      <div key={i} className="av-sug-item" onClick={() => { setSearchTerm(s.value); setShowSuggestions(false); if(s.phone) viewVisitorHistory(s.phone, s.name||s.value); }}>
                        <span className="av-sug-icon">{s.type==="name"?"👤":s.type==="phone"?"📞":"✉️"}</span>
                        <span className="av-sug-val">{s.value}</span>
                        {s.visitCount > 1 && <span className="av-sug-badge">{s.visitCount}×</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="av-btn av-btn-ghost" onClick={clearAllFilters}>🔄 Clear</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{display:"none"}} />
              <button className="av-btn av-btn-info" onClick={() => fileInputRef.current?.click()}>📤 Import</button>
              <button className="av-btn av-btn-purple" onClick={downloadExcelTemplate}>📥 Template</button>
              <button className="av-btn av-btn-success" onClick={exportToExcel}>📊 Quick Export</button>
              <button className="av-btn av-btn-primary" onClick={() => setShowReportModal(true)}>📈 Full Report</button>
            </div>
          </div>
          <div className="av-filters-grid">
            {[
              {label:"Identity",key:"visitorIdentity",opts:[{v:"all",l:"All"},...VISITOR_IDENTITIES.map(v=>({v,l:v}))]},
              {label:"Type",key:"visitType",opts:[{v:"all",l:"All"},{v:"first",l:"🆕 First"},{v:"returning",l:"🔄 Returning"}]},
              {label:"Status",key:"status",opts:[{v:"all",l:"All"},{v:"Booked",l:"✅ Booked"},{v:"Interested",l:"⭐ Interested"},{v:"Not Booked",l:"❌ Not Booked"}]},
              {label:"Lead",key:"leadQuality",opts:[{v:"all",l:"All"},...LEAD_STATUSES.map(l=>({v:l,l}))]},
              {label:"Executive",key:"executive",opts:[{v:"all",l:"All"},...SALES_EXECUTIVE_OPTIONS.map(e=>({v:e,l:e}))]},
            ].map(f=>(
              <div key={f.key} className="av-filter-item">
                <label className="av-filter-label">{f.label}</label>
                <select className="av-filter-select" value={filters[f.key]} onChange={e=>updateFilter(f.key,e.target.value)}>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div className="av-filter-item">
              <label className="av-filter-label">From</label>
              <input type="date" className="av-filter-select" value={filters.dateFrom} onChange={e=>updateFilter("dateFrom",e.target.value)} />
            </div>
            <div className="av-filter-item">
              <label className="av-filter-label">To</label>
              <input type="date" className="av-filter-select" value={filters.dateTo} onChange={e=>updateFilter("dateTo",e.target.value)} />
            </div>
          </div>
          <div className="av-filter-summary">
            Showing <strong>{filteredVisits.length}</strong> of <strong>{visits.length}</strong> visits
          </div>
        </div>

        {/* ── Table ── */}
        <div className="av-table-card">
          <div className="av-table-top">
            <h3 className="av-table-title">📋 Visit Records</h3>
            <div className="av-table-controls">
              <div className="av-rows-wrap">
                <span>Show</span>
                <select className="av-rows-sel" value={isCustom?"custom":rowsPerPage} onChange={handleRowsChange}>
                  {[5,10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
                  <option value="custom">Custom</option>
                </select>
                {isCustom && (
                  <input
                    type="number" min="1" placeholder="#"
                    className="av-custom-rows" value={customRows}
                    onChange={e=>{setCustomRows(e.target.value);if(e.target.value&&Number(e.target.value)>0){setRowsPerPage(Number(e.target.value));setCurrentPage(1);}}}
                  />
                )}
                <span>entries</span>
              </div>
              <PaginationBar />
            </div>
          </div>

          <div className="av-table-wrap">
            <table className="av-table">
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Date</th><th>Visitor</th>
                  <th>Contact</th><th>Property</th><th>Executive</th>
                  <th>Lead</th><th>Status</th><th>Check-Ins</th>
                  <th>Remarks</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedVisits.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="av-empty">
                      <div className="av-empty-inner">
                        <span>🔍</span>
                        <p>{searchTerm ? `No results for "${searchTerm}"` : "No visits found"}</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedVisits.map((visit, idx) => {
                  const isReturning = visit.visitor?.phone && visitorCounts[visit.visitor.phone]?.count > 1;
                  const isRetVisit = visit.isReturningVisit === true;
                  const visitCheckIns = checkInLogs.filter(l => l.originalVisitRef === visit.id || l.phone === visit.visitor?.phone);
                  return (
                    <tr key={visit.id} className={isRetVisit ? "av-row-returning" : ""}>
                      <td className="av-td-num">{startIndex + idx + 1}</td>
                      <td>
                        <div className="av-type-cell">
                          <span className={`av-type-badge ${isRetVisit ? "returning" : "first"}`}>
                            {isRetVisit ? "🔄" : "🆕"} {isRetVisit ? "Return" : "First"}
                          </span>
                          {visit.visitorIdentity && <span className="av-identity-chip">{visit.visitorIdentity}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="av-date">{formatDate(visit.visitAt)}</div>
                        <div className="av-time">{formatTime(visit.visitAt)}</div>
                      </td>
                      <td>
                        <div className="av-visitor-name" onClick={() => visit.visitor?.phone && viewVisitorHistory(visit.visitor.phone, visit.visitor.name)} title="View history">
                          {visit.visitor?.name || "N/A"}
                          {isReturning && <span className="av-repeat-badge">{visitorCounts[visit.visitor.phone].count}×</span>}
                        </div>
                        {visit.visitor?.email && <div className="av-visitor-sub">✉️ {visit.visitor.email}</div>}
                        {visit.visitor?.location && <div className="av-visitor-sub">📍 {visit.visitor.location}</div>}
                      </td>
                      <td>
                        <div className="av-phone-row">
                          <span>{getCountryFlag(visit.visitor?.countryCode || "+91")}</span>
                          <span className="av-cc">{visit.visitor?.countryCode || "+91"}</span>
                          <span className="av-phone-num">{visit.visitor?.phone || "N/A"}</span>
                        </div>
                        {visit.channelPartner?.name && <div className="av-visitor-sub">🤝 {visit.channelPartner.name}</div>}
                      </td>
                      <td>
                        <div className="av-tags">
                          {(visit.propertyLayout||[]).map((t,i) => <span key={i} className="av-tag av-tag-layout">{t}</span>)}
                        </div>
                      </td>
                      <td><span className="av-exec">{visit.agent?.name || "—"}</span></td>
                      <td>
                        <span className={`av-lead-badge av-lead-${(visit.leadQuality||"cold").toLowerCase()}`}>
                          {visit.leadQuality === "Hot" ? "🔥" : visit.leadQuality === "Warm" ? "⚡" : "❄️"} {visit.leadQuality || "N/A"}
                        </span>
                      </td>
                      <td>
                        <span className={`av-status-badge av-status-${(visit.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`}>
                          {visit.bookingStatus === "Booked" ? "✅" : "❌"} {visit.bookingStatus || "N/A"}
                        </span>
                      </td>
                      <td>
                        {visitCheckIns.length > 0
                          ? <div className="av-checkin"><strong>{visitCheckIns.length}</strong> check-ins</div>
                          : <span className="av-no-data">—</span>}
                      </td>
                      <td>
                        <div className="av-remarks" title={visit.remarks}>
                          {visit.remarks || <span className="av-no-data">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="av-actions">
                          <button className="av-act-btn av-act-edit" onClick={() => handleEdit(visit)} title="Sales Edit">✏️</button>
                          {isAdminUser() && (
                            <button className="av-act-btn av-act-admin" onClick={() => handleAdminEdit(visit)} title="Admin Edit">🔧</button>
                          )}
                          <button className="av-act-btn av-act-hist" onClick={() => fetchEditHistory(visit.id)} disabled={historyLoading} title="History">
                            {historyLoading ? "⏳" : "📜"}
                          </button>
                          <button className="av-act-btn av-act-view" onClick={() => visit.visitor?.phone && viewVisitorHistory(visit.visitor.phone, visit.visitor.name)} title="View">👁️</button>
                          {isAdminUser() && (
                            <button className="av-act-btn av-act-del" onClick={() => handleDelete(visit.id)} title="Delete">🗑️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="av-table-footer">
            <span className="av-page-summary">
              Showing {totalRows === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + rowsPerPage, totalRows)} of {totalRows}
            </span>
            <PaginationBar />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ MODALS ═══════════════════════════════════════════ */}

      {/* ── Full Report Modal ── */}
      {showReportModal && (
        <div className="av-overlay" onClick={() => { if (!isGeneratingReport) setShowReportModal(false); }}>
          <div className="av-modal av-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header" style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", color: "#fff" }}>
              <div>
                <h2 style={{ color: "#fff" }}>📈 Generate Full Excel Report</h2>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#bfdbfe" }}>
                  15 detailed sheets — visits, performance, trends, analysis & more
                </p>
              </div>
              <button className="av-modal-close" style={{ color: "#fff" }} onClick={() => setShowReportModal(false)} disabled={isGeneratingReport}>✕</button>
            </div>

            <div className="av-modal-body" style={{ padding: "24px" }}>
              {/* Report Contents Info */}
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "16px", marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: "#0369a1", marginBottom: 10, fontSize: 14 }}>📋 Report Includes 15 Sheets:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                  {[
                    "1. All Visits (Master Data)",
                    "2. Dashboard Summary",
                    "3. Executive Performance",
                    "4. Daily Report",
                    "5. Monthly Report",
                    "6. Property Layout Analysis",
                    "7. Campaign Source Analysis",
                    "8. Visitor Identity Breakdown",
                    "9. Hot Leads Only",
                    "10. Booked Visitors",
                    "11. Channel Partner Report",
                    "12. Repeat Visitors",
                    "13. Time Slot Analysis",
                    "14. Day of Week Analysis",
                    "15. Purpose & Property Type",
                  ].map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#10b981" }}>✓</span> {s}
                    </div>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>📅 Date From</label>
                  <input
                    type="date"
                    className="av-filter-select"
                    style={{ width: "100%" }}
                    value={reportDateFrom}
                    onChange={e => setReportDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>📅 Date To</label>
                  <input
                    type="date"
                    className="av-filter-select"
                    style={{ width: "100%" }}
                    value={reportDateTo}
                    onChange={e => setReportDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>👔 Sales Executive</label>
                  <select className="av-filter-select" style={{ width: "100%" }} value={reportExecutive} onChange={e => setReportExecutive(e.target.value)}>
                    <option value="all">All Executives</option>
                    {SALES_EXECUTIVE_OPTIONS.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>🔥 Lead Status</label>
                  <select className="av-filter-select" style={{ width: "100%" }} value={reportLeadStatus} onChange={e => setReportLeadStatus(e.target.value)}>
                    <option value="all">All Lead Statuses</option>
                    {LEAD_STATUSES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>📋 Booking Status</label>
                  <select className="av-filter-select" style={{ width: "100%" }} value={reportBookingStatus} onChange={e => setReportBookingStatus(e.target.value)}>
                    <option value="all">All Booking Statuses</option>
                    <option value="Booked">Booked</option>
                    <option value="Not Booked">Not Booked</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e", width: "100%" }}>
                    📊 <strong>{getReportData().length}</strong> records match current filters
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#9a3412" }}>
                💡 <strong>Tip:</strong> Leave date fields empty to include all records. Use filters to generate focused reports for specific time periods, executives, or lead types.
              </div>
            </div>

            <div className="av-modal-footer">
              <button
                className="av-btn av-btn-ghost"
                onClick={() => {
                  setReportDateFrom(""); setReportDateTo("");
                  setReportExecutive("all"); setReportLeadStatus("all"); setReportBookingStatus("all");
                }}
                disabled={isGeneratingReport}
              >
                🔄 Reset Filters
              </button>
              <button className="av-btn av-btn-ghost" onClick={() => setShowReportModal(false)} disabled={isGeneratingReport}>
                Cancel
              </button>
              <button
                className="av-btn av-btn-primary"
                onClick={generateFullReport}
                disabled={isGeneratingReport || getReportData().length === 0}
                style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", minWidth: 180 }}
              >
                {isGeneratingReport
                  ? "⏳ Generating Report..."
                  : `📈 Generate Report (${getReportData().length} records)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visitor History Modal ── */}
      {showVisitorHistory && selectedVisitorHistory && (
        <div className="av-overlay" onClick={() => setShowVisitorHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header">
              <h2>👤 {selectedVisitorHistory.name}</h2>
              <button className="av-modal-close" onClick={() => setShowVisitorHistory(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-hist-summary">
                <div>📞 <strong>{selectedVisitorHistory.phone}</strong></div>
                <div>Total Visits: <strong>{selectedVisitorHistory.visits.length}</strong></div>
              </div>
              {selectedVisitorHistory.visits.map((v, i) => (
                <div key={v.id} className="av-tl-item">
                  <div className="av-tl-header">
                    <span className={`av-tl-badge ${v.isReturningVisit ? "returning" : "first"}`}>{v.isReturningVisit ? "🔄" : "🆕"}</span>
                    <span className="av-tl-num">#{selectedVisitorHistory.visits.length - i}</span>
                    <span className="av-tl-date">{formatDateTime(v.visitAt)}</span>
                  </div>
                  <div className="av-tl-body">
                    <div className="av-tl-row"><strong>Exec:</strong> {v.agent?.name || "N/A"}</div>
                    <div className="av-tl-row"><strong>Lead:</strong> <span className={`av-lead-badge av-lead-${(v.leadQuality||"cold").toLowerCase()}`} style={{marginLeft:8}}>{v.leadQuality || "N/A"}</span></div>
                    <div className="av-tl-row"><strong>Status:</strong> <span className={`av-status-badge av-status-${(v.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`} style={{marginLeft:8}}>{v.bookingStatus || "N/A"}</span></div>
                    {v.remarks && <div className="av-tl-row"><strong>Remarks:</strong> {v.remarks}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="av-modal-footer">
              <button className="av-btn av-btn-ghost" onClick={() => setShowVisitorHistory(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit History Modal ── */}
      {showEditHistory && (
        <div className="av-overlay" onClick={() => setShowEditHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header">
              <h2>📜 Edit History</h2>
              <button className="av-modal-close" onClick={() => setShowEditHistory(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              {historyLoading
                ? <div className="av-hist-loading"><div className="av-spinner"></div></div>
                : editHistory.length === 0
                  ? <div className="av-hist-empty"><span>📜</span><p>No history found</p></div>
                  : editHistory.map((log, i) => (
                    <div key={log.id} className={`av-tl-item ${log.action === "DELETE" ? "av-tl-delete" : ""}`}>
                      <div className="av-tl-header">
                        <span className={`av-tl-badge ${log.action === "DELETE" ? "delete" : ""}`}>{log.action === "DELETE" ? "🗑️" : "✏️"}</span>
                        <span className="av-tl-num">#{editHistory.length - i}</span>
                        <span className="av-tl-date">{formatDateTime(log.editedAt)}</span>
                      </div>
                      <div className="av-tl-body">
                        <div className="av-tl-row">👤 {log.editedBy?.email || "Unknown"}</div>
                        {log.action === "DELETE"
                          ? <div className="av-del-warn">⚠️ Record deleted</div>
                          : Object.keys(log.changes||{}).length > 0
                            ? <div className="av-changes">{Object.entries(log.changes).map(([f,c]) => (
                              <div key={f} className="av-change-row">
                                <span className="av-change-field">{f}</span>
                                <span className="av-change-from">{c.from}</span>
                                <span className="av-change-arrow">→</span>
                                <span className="av-change-to">{c.to}</span>
                              </div>
                            ))}</div>
                            : <div className="av-tl-row av-muted">No field changes recorded</div>}
                      </div>
                    </div>
                  ))}
            </div>
            <div className="av-modal-footer">
              <button className="av-btn av-btn-ghost" onClick={() => setShowEditHistory(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sales Edit Modal ── */}
      {showEditModal && editingVisit && originalVisitData && (
        <div className="av-overlay" onClick={() => { setShowEditModal(false); setEditingVisit(null); setOriginalVisitData(null); }}>
          <div className="av-modal av-modal-xl" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header">
              <div>
                <h2>✏️ Sales Edit — {originalVisitData.visitorName}</h2>
                <p style={{margin:"4px 0 0",fontSize:"12px",color:"#6b7280"}}>Visitor info is read-only. Fill sales portal details below.</p>
              </div>
              <button className="av-modal-close" onClick={() => { setShowEditModal(false); setEditingVisit(null); setOriginalVisitData(null); }}>✕</button>
            </div>

            <div className="av-ro-section">
              <div className="av-ro-section-header">
                <span className="av-ro-lock">🔒</span>
                <div>
                  <h4 className="av-ro-section-title">Visitor Information</h4>
                  <p className="av-ro-section-sub">Filled by receptionist — Read Only</p>
                </div>
                <span className="av-ro-badge">NOT Editable</span>
              </div>
              <div className="av-ro-grid">
                <ROField label="Name" icon="👤" value={originalVisitData.visitorName} />
                <ROField label="Contact" icon="📞" value={`${getCountryFlag(originalVisitData.countryCode)} ${originalVisitData.countryCode} ${originalVisitData.phone}`} />
                <ROField label="Date" icon="📅" value={originalVisitData.visitDate} />
                <ROField label="Time" icon="🕐" value={originalVisitData.visitTime} />
                <ROField label="Email" icon="✉️" value={originalVisitData.email} />
                <ROField label="Address" icon="📍" value={originalVisitData.location} />
              </div>
              <ROCheckboxGroup label="Property Layout" icon="🏠" options={PROPERTY_LAYOUTS} selected={originalVisitData.propertyLayout} />
              <ROCheckboxGroup label="Property Types" icon="🏢" options={PROPERTY_TYPES} selected={originalVisitData.propertyTypes} />
              <ROCheckboxGroup label="Purpose" icon="🎯" options={PURPOSES} selected={originalVisitData.purpose} />
              <ROCheckboxGroup label="Property Status" icon="🏗️" options={PROPERTY_STATUSES_LIST} selected={originalVisitData.propertyStatus} />
              <ROCheckboxGroup label="Campaign Source" icon="📢" options={CAMPAIGN_SOURCES} selected={originalVisitData.campaignSource} />
            </div>

            <div className="av-sp-divider">
              <div className="av-sp-divider-line"></div>
              <span className="av-sp-divider-text">✏️ Sales Portal — Editable Fields</span>
              <div className="av-sp-divider-line"></div>
            </div>

            <Formik initialValues={editingVisit} validationSchema={salesValidation} onSubmit={handleSalesUpdate} enableReinitialize>
              {({ values, setFieldValue, errors, touched, isSubmitting }) => (
                <Form>
                  <div className="av-sp-section">
                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">👤 Visitor Identity *</label>
                      <div className="av-sp-radio-grid">
                        {VISITOR_IDENTITIES.map(vi => (
                          <label key={vi} className={`av-sp-radio-item ${values.visitorIdentity === vi ? "checked" : ""}`}>
                            <input type="radio" checked={values.visitorIdentity === vi} onChange={() => setFieldValue("visitorIdentity", vi)} />
                            <span className="av-sp-radio-dot">{values.visitorIdentity === vi ? "●" : "○"}</span>
                            {vi}
                          </label>
                        ))}
                      </div>
                      <ErrorMessage name="visitorIdentity" component="div" className="av-err" />
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">🤝 Channel Partner / Broker</label>
                      <BrokerDropdown
                        brokers={brokers}
                        value={values.channelPartner}
                        onChange={(broker) => {
                          setFieldValue("channelPartner", broker.name);
                          setFieldValue("channelPartnerPhone", broker.phone);
                          setFieldValue("channelPartnerCountryCode", broker.countryCode);
                        }}
                        placeholder="Search or select broker..."
                      />
                      {values.channelPartner && (
                        <div className="av-sp-broker-info">
                          <span>📞 {values.channelPartnerCountryCode} {values.channelPartnerPhone}</span>
                        </div>
                      )}
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">🏠 Interested Layout *</label>
                      <div className="av-sp-cb-grid">
                        {PROPERTY_LAYOUTS.map(t => (
                          <label key={t} className={`av-sp-cb-item ${values.interestedLayout?.includes(t) ? "checked" : ""}`}>
                            <input type="checkbox" checked={values.interestedLayout?.includes(t) || false} onChange={() => setFieldValue("interestedLayout", toggleArr(values.interestedLayout, t))} />
                            <span className="av-sp-cb-mark">{values.interestedLayout?.includes(t) ? "✓" : ""}</span>
                            {t}
                          </label>
                        ))}
                      </div>
                      <ErrorMessage name="interestedLayout" component="div" className="av-err" />
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">🏢 Interested Property Types</label>
                      <div className="av-sp-cb-grid">
                        {PROPERTY_TYPES.map(t => (
                          <label key={t} className={`av-sp-cb-item ${values.interestedPropertyTypes?.includes(t) ? "checked" : ""}`}>
                            <input type="checkbox" checked={values.interestedPropertyTypes?.includes(t) || false} onChange={() => setFieldValue("interestedPropertyTypes", toggleArr(values.interestedPropertyTypes, t))} />
                            <span className="av-sp-cb-mark">{values.interestedPropertyTypes?.includes(t) ? "✓" : ""}</span>
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">🎯 Interested Purpose</label>
                      <div className="av-sp-cb-grid">
                        {PURPOSES.map(t => (
                          <label key={t} className={`av-sp-cb-item ${values.interestedPurpose?.includes(t) ? "checked" : ""}`}>
                            <input type="checkbox" checked={values.interestedPurpose?.includes(t) || false} onChange={() => setFieldValue("interestedPurpose", toggleArr(values.interestedPurpose, t))} />
                            <span className="av-sp-cb-mark">{values.interestedPurpose?.includes(t) ? "✓" : ""}</span>
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="av-sp-grid-2">
                      <div className="av-sp-field">
                        <label className="av-sp-label">🔥 Lead Status *</label>
                        <Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality && touched.leadQuality ? "av-err-border" : ""}`}>
                          <option value="">— Select Lead Status —</option>
                          {LEAD_STATUSES.map(l => <option key={l} value={l}>{l}</option>)}
                        </Field>
                        <ErrorMessage name="leadQuality" component="div" className="av-err" />
                      </div>
                      <div className="av-sp-field">
                        <label className="av-sp-label">👔 Sales Executive *</label>
                        <Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive && touched.salesExecutive ? "av-err-border" : ""}`}>
                          <option value="">— Select Executive —</option>
                          {SALES_EXECUTIVE_OPTIONS.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                        </Field>
                        <ErrorMessage name="salesExecutive" component="div" className="av-err" />
                      </div>
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">📋 Booking Status *</label>
                      <div className="av-sp-radio-grid">
                        {BOOKING_STATUSES.map(s => (
                          <label key={s} className={`av-sp-radio-item ${values.bookingStatus === s ? "checked" : ""}`}>
                            <input type="radio" checked={values.bookingStatus === s} onChange={() => setFieldValue("bookingStatus", s)} />
                            <span className="av-sp-radio-dot">{values.bookingStatus === s ? "●" : "○"}</span>
                            {s === "Booked" ? "☑ Booked" : "☐ Not Booked"}
                          </label>
                        ))}
                      </div>
                      <ErrorMessage name="bookingStatus" component="div" className="av-err" />
                    </div>

                    <div className="av-sp-field av-sp-full">
                      <label className="av-sp-label">📝 Remarks / Notes</label>
                      <Field as="textarea" name="remarks" rows="4" className="av-sp-textarea" placeholder="Add any notes about this visit..." />
                    </div>
                  </div>

                  <div className="av-modal-footer">
                    <button type="button" className="av-btn av-btn-ghost" onClick={() => { setShowEditModal(false); setEditingVisit(null); setOriginalVisitData(null); }} disabled={isSubmitting}>Cancel</button>
                    <button type="submit" className="av-btn av-btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? "⏳ Saving..." : "💾 Save Changes"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* ── Admin Edit Modal ── */}
      {showAdminEditModal && adminEditingVisit && isAdminUser() && (
        <div className="av-overlay" onClick={() => { setShowAdminEditModal(false); setAdminEditingVisit(null); }}>
          <div className="av-modal av-modal-xl" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header av-modal-header-admin">
              <div>
                <h2>🔧 Admin Full Edit — {adminEditingVisit.visitorName}</h2>
                <p style={{margin:"4px 0 0",fontSize:"12px",color:"#b91c1c"}}>
                  ⚡ Full access: All fields editable • Auto-syncs visitor info across records
                </p>
              </div>
              <button className="av-modal-close" onClick={() => { setShowAdminEditModal(false); setAdminEditingVisit(null); }}>✕</button>
            </div>

            <Formik initialValues={adminEditingVisit} validationSchema={adminValidation} onSubmit={handleAdminUpdate} enableReinitialize>
              {({ values, setFieldValue, errors, touched, isSubmitting }) => (
                <Form>
                  <div style={{ padding: "0 24px 24px", maxHeight: "68vh", overflowY: "auto" }}>
                    <div className="av-admin-section">
                      <div className="av-admin-section-title">
                        <span>👤</span> Visitor Information
                        <span className="av-admin-badge av-admin-badge-sync">🔄 Auto-Sync All Records</span>
                      </div>
                      <div className="av-admin-grid">
                        <div className="av-sp-field">
                          <label className="av-sp-label">Visitor Name *</label>
                          <Field name="visitorName" type="text" placeholder="Full name" className={`av-sp-input ${errors.visitorName && touched.visitorName ? "av-err-border" : ""}`} />
                          <ErrorMessage name="visitorName" component="div" className="av-err" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Phone Number *</label>
                          <div className="av-sp-phone-row">
                            <SearchableCountryDropdown value={values.countryCode} onChange={c => setFieldValue("countryCode", c)} name="adminCC" />
                            <Field name="phone" type="tel" placeholder="Mobile number" className={`av-sp-input ${errors.phone && touched.phone ? "av-err-border" : ""}`} onChange={e => setFieldValue("phone", e.target.value.replace(/\D/g,"").slice(0,15))} />
                          </div>
                          <ErrorMessage name="phone" component="div" className="av-err" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Email Address</label>
                          <Field name="email" type="email" placeholder="visitor@example.com" className={`av-sp-input ${errors.email && touched.email ? "av-err-border" : ""}`} />
                          <ErrorMessage name="email" component="div" className="av-err" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">City / Address</label>
                          <Field name="location" type="text" placeholder="City or full address" className="av-sp-input" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Visit Date *</label>
                          <Field name="visitDate" type="date" className={`av-sp-input ${errors.visitDate && touched.visitDate ? "av-err-border" : ""}`} />
                          <ErrorMessage name="visitDate" component="div" className="av-err" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Visit Time *</label>
                          <Field name="visitTime" type="time" className={`av-sp-input ${errors.visitTime && touched.visitTime ? "av-err-border" : ""}`} />
                          <ErrorMessage name="visitTime" component="div" className="av-err" />
                        </div>
                      </div>
                      <div className="av-sp-field" style={{marginTop:16}}>
                        <label className="av-sp-label">🔄 Visit Type</label>
                        <div className="av-sp-radio-grid">
                          {[{val:false,label:"🆕 First Time Visit"},{val:true,label:"🔄 Returning Visit"}].map(opt => (
                            <label key={String(opt.val)} className={`av-sp-radio-item ${values.isReturningVisit === opt.val ? "checked" : ""}`}>
                              <input type="radio" checked={values.isReturningVisit === opt.val} onChange={() => setFieldValue("isReturningVisit", opt.val)} />
                              <span className="av-sp-radio-dot">{values.isReturningVisit === opt.val ? "●" : "○"}</span>
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="av-admin-section" style={{marginTop:20}}>
                      <div className="av-admin-section-title">
                        <span>🏠</span> Property Details
                        <span className="av-admin-badge">Receptionist Fields</span>
                      </div>
                      {[
                        { label: "Property Layout *", field: "propertyLayout", options: PROPERTY_LAYOUTS, err: errors.propertyLayout && touched.propertyLayout },
                        { label: "Property Types", field: "propertyTypes", options: PROPERTY_TYPES },
                        { label: "Purpose", field: "purpose", options: PURPOSES },
                        { label: "Property Status", field: "propertyStatus", options: PROPERTY_STATUSES_LIST },
                        { label: "Campaign Source", field: "campaignSource", options: CAMPAIGN_SOURCES },
                      ].map(({ label, field, options, err }) => (
                        <div key={field} className="av-sp-field av-sp-full" style={{marginTop:12}}>
                          <label className="av-sp-label">{label}</label>
                          <div className="av-sp-cb-grid">
                            {options.map(t => (
                              <label key={t} className={`av-sp-cb-item ${values[field]?.includes(t) ? "checked" : ""}`}>
                                <input type="checkbox" checked={values[field]?.includes(t) || false} onChange={() => setFieldValue(field, toggleArr(values[field], t))} />
                                <span className="av-sp-cb-mark">{values[field]?.includes(t) ? "✓" : ""}</span>
                                {t}
                              </label>
                            ))}
                          </div>
                          {err && <div className="av-err">{errors[field]}</div>}
                        </div>
                      ))}
                    </div>

                    <div className="av-admin-section" style={{marginTop:20}}>
                      <div className="av-admin-section-title">
                        <span>🏢</span> Sales Portal Fields
                        <span className="av-admin-badge av-admin-badge-sales">Sales Executive Fields</span>
                      </div>

                      <div className="av-sp-field av-sp-full" style={{marginTop:12}}>
                        <label className="av-sp-label">👤 Visitor Identity</label>
                        <div className="av-sp-radio-grid">
                          {VISITOR_IDENTITIES.map(vi => (
                            <label key={vi} className={`av-sp-radio-item ${values.visitorIdentity === vi ? "checked" : ""}`}>
                              <input type="radio" checked={values.visitorIdentity === vi} onChange={() => setFieldValue("visitorIdentity", vi)} />
                              <span className="av-sp-radio-dot">{values.visitorIdentity === vi ? "●" : "○"}</span>
                              {vi}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="av-sp-field av-sp-full" style={{marginTop:12}}>
                        <label className="av-sp-label">🤝 Channel Partner / Broker</label>
                        <BrokerDropdown
                          brokers={brokers}
                          value={values.channelPartner}
                          onChange={(broker) => {
                            setFieldValue("channelPartner", broker.name);
                            setFieldValue("channelPartnerPhone", broker.phone);
                            setFieldValue("channelPartnerCountryCode", broker.countryCode);
                          }}
                          placeholder="Search or select broker..."
                        />
                        {values.channelPartner && (
                          <div className="av-sp-broker-info">
                            <span>📞 {values.channelPartnerCountryCode} {values.channelPartnerPhone}</span>
                          </div>
                        )}
                      </div>

                      {[
                        { label: "🏠 Interested Layout *", field: "interestedLayout", options: PROPERTY_LAYOUTS, err: errors.interestedLayout && touched.interestedLayout },
                        { label: "🏢 Interested Property Types", field: "interestedPropertyTypes", options: PROPERTY_TYPES },
                        { label: "🎯 Interested Purpose", field: "interestedPurpose", options: PURPOSES },
                      ].map(({ label, field, options, err }) => (
                        <div key={field} className="av-sp-field av-sp-full" style={{marginTop:12}}>
                          <label className="av-sp-label">{label}</label>
                          <div className="av-sp-cb-grid">
                            {options.map(t => (
                              <label key={t} className={`av-sp-cb-item ${values[field]?.includes(t) ? "checked" : ""}`}>
                                <input type="checkbox" checked={values[field]?.includes(t) || false} onChange={() => setFieldValue(field, toggleArr(values[field], t))} />
                                <span className="av-sp-cb-mark">{values[field]?.includes(t) ? "✓" : ""}</span>
                                {t}
                              </label>
                            ))}
                          </div>
                          {err && <div className="av-err">{errors[field]}</div>}
                        </div>
                      ))}

                      <div className="av-admin-grid" style={{marginTop:16}}>
                        <div className="av-sp-field">
                          <label className="av-sp-label">🔥 Lead Status *</label>
                          <Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality && touched.leadQuality ? "av-err-border" : ""}`}>
                            <option value="">— Select Lead Status —</option>
                            {LEAD_STATUSES.map(l => <option key={l} value={l}>{l === "Hot" ? "🔥 Hot" : l === "Warm" ? "⚡ Warm" : "❄️ Cold"}</option>)}
                          </Field>
                          <ErrorMessage name="leadQuality" component="div" className="av-err" />
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">👔 Sales Executive *</label>
                          <Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive && touched.salesExecutive ? "av-err-border" : ""}`}>
                            <option value="">— Select Executive —</option>
                            {SALES_EXECUTIVE_OPTIONS.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                          </Field>
                          <ErrorMessage name="salesExecutive" component="div" className="av-err" />
                        </div>
                      </div>

                      <div className="av-sp-field av-sp-full" style={{marginTop:16}}>
                        <label className="av-sp-label">📋 Booking Status *</label>
                        <div className="av-sp-radio-grid">
                          {BOOKING_STATUSES.map(s => (
                            <label key={s} className={`av-sp-radio-item ${values.bookingStatus === s ? "checked" : ""}`}>
                              <input type="radio" checked={values.bookingStatus === s} onChange={() => setFieldValue("bookingStatus", s)} />
                              <span className="av-sp-radio-dot">{values.bookingStatus === s ? "●" : "○"}</span>
                              {s === "Booked" ? "✅ Booked" : "❌ Not Booked"}
                            </label>
                          ))}
                        </div>
                        <ErrorMessage name="bookingStatus" component="div" className="av-err" />
                      </div>

                      <div className="av-sp-field av-sp-full" style={{marginTop:16}}>
                        <label className="av-sp-label">📝 Remarks / Notes</label>
                        <Field as="textarea" name="remarks" rows="4" className="av-sp-textarea" placeholder="Add notes..." />
                      </div>
                    </div>
                  </div>

                  <div className="av-modal-footer" style={{borderTop:"2px solid #fee2e2",background:"#fff5f5"}}>
                    <div style={{fontSize:"12px",color:"#6b7280",marginRight:"auto"}}>
                      🔧 Admin edit — All changes logged to audit trail
                    </div>
                    <button type="button" className="av-btn av-btn-ghost" onClick={() => { setShowAdminEditModal(false); setAdminEditingVisit(null); }} disabled={isSubmitting}>Cancel</button>
                    <button type="submit" className="av-btn av-btn-admin" disabled={isSubmitting}>
                      {isSubmitting ? "⏳ Saving All Changes..." : "🔧 Save All Changes"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* ── Upload / Import Modal ── */}
      {showUploadModal && (
        <div className="av-overlay" onClick={() => { if(!isUploading) { setShowUploadModal(false); setPreviewData([]); } }}>
          <div className="av-modal" onClick={e => e.stopPropagation()}>
            <div className="av-modal-header">
              <h2>📤 Import Excel Data</h2>
              <button className="av-modal-close" onClick={() => { setShowUploadModal(false); setPreviewData([]); }} disabled={isUploading}>✕</button>
            </div>
            <div className="av-modal-body">
              {uploadProgress > 0 && (
                <div className="av-progress-wrap">
                  <div className="av-progress-track">
                    <div className="av-progress-fill" style={{width:`${uploadProgress}%`}}></div>
                  </div>
                  <p className="av-progress-pct">{Math.round(uploadProgress)}%</p>
                </div>
              )}
              <div className="av-upload-summary">
                <h4>✅ {previewData.length} rows ready to import</h4>
                <p>{uploadStatus}</p>
              </div>
              {uploadErrors.length > 0 && (
                <div className="av-upload-errors">
                  <strong>⚠️ {uploadErrors.length} error(s) found (will be skipped)</strong>
                  <div className="av-error-list">
                    {uploadErrors.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                </div>
              )}
              {previewData.length > 0 && (
                <div className="av-preview-table-wrap">
                  <table className="av-table">
                    <thead>
                      <tr><th>Name</th><th>Phone</th><th>Executive</th><th>Lead</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                          <td>{r.visitor.name}</td>
                          <td>{r.visitor.phone}</td>
                          <td>{r.agent.name || "—"}</td>
                          <td>{r.leadQuality}</td>
                          <td>{r.bookingStatus}</td>
                        </tr>
                      ))}
                      {previewData.length > 10 && (
                        <tr><td colSpan="5" className="av-preview-more">...{previewData.length - 10} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="av-modal-footer">
              <button className="av-btn av-btn-ghost" onClick={() => { setShowUploadModal(false); setPreviewData([]); }} disabled={isUploading}>Cancel</button>
              <button className="av-btn av-btn-primary" onClick={importToFirebase} disabled={isUploading || !previewData.length}>
                {isUploading ? `⏳ Importing ${Math.round(uploadProgress)}%` : `📤 Import ${previewData.length} Records`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;