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

  // Sync external value
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

  // ── Broker list from Firestore ──
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
    avgVisitsPerDay:"", topExecutive:"", topPropertyType:"",
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
      // ── Channel partner pre-filled from broker ──
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
    propertyLayout: Yup.array().min(1,"Select at least one"),
    leadQuality: Yup.string().required("Required"),
    bookingStatus: Yup.string().required("Required"),
  });

  const handleSalesUpdate = async (values, { setSubmitting }) => {
    try {
      setSubmitting(true);
      const original = visits.find((v) => v.id === values.id);
      if (!original) throw new Error("Not found");
      const updated = {
        visitorIdentity: values.visitorIdentity,
        channelPartner: { name:values.channelPartner?.trim()||"", phone:values.channelPartnerPhone?.trim()||"", countryCode:values.channelPartnerCountryCode||"+91" },
        salesPortal: { interestedLayout:values.interestedLayout||[], interestedPropertyTypes:values.interestedPropertyTypes||[], interestedPurpose:values.interestedPurpose||[] },
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
        visitor: { name:values.visitorName.trim(), phone:values.phone.trim(), countryCode:values.countryCode||"+91", email:values.email?.trim()||"", location:values.location?.trim()||"" },
        propertyLayout: values.propertyLayout||[], propertyTypes:values.propertyTypes||[],
        purpose:values.purpose||[], propertyStatus:values.propertyStatus||[],
        campaignSource:values.campaignSource||[],
        channelPartner: { name:values.channelPartner?.trim()||"", phone:values.channelPartnerPhone?.trim()||"", countryCode:values.channelPartnerCountryCode||"+91" },
        salesPortal: { interestedLayout:values.interestedLayout||[], interestedPropertyTypes:values.interestedPropertyTypes||[], interestedPurpose:values.interestedPurpose||[] },
        visitorIdentity: values.visitorIdentity,
        agent: { name: values.salesExecutive },
        visitAt: visitDateTime, visitTime: values.visitTime,
        leadQuality: values.leadQuality,
        bookingStatus: values.bookingStatus,
        remarks: values.remarks?.trim() || "",
        lastModified: serverTimestamp(), lastModifiedBy: getUserInfo(),
      };
      await updateDoc(doc(db,"siteVisits",values.id), updatedData);
      const phoneToSync = values.originalPhone || values.phone.trim();
      const otherVisits = visits.filter(v => v.visitor?.phone === phoneToSync && v.id !== values.id);
      let syncCount = 0;
      for (const other of otherVisits) {
        const needsUpdate = other.visitor?.name !== values.visitorName.trim() ||
          other.visitor?.email !== (values.email?.trim()||"") ||
          other.visitor?.location !== (values.location?.trim()||"");
        if (needsUpdate) {
          try {
            await updateDoc(doc(db,"siteVisits",other.id), {
              "visitor.name": values.visitorName.trim(),
              "visitor.email": values.email?.trim()||"",
              "visitor.location": values.location?.trim()||"",
              "visitor.countryCode": values.countryCode||"+91",
              lastModified: serverTimestamp(), lastModifiedBy: getUserInfo(),
            });
            syncCount++;
          } catch(err) { console.error("Sync error:", err); }
        }
      }
      await logEditActivity(values.id, original, {...original,...updatedData});
      setShowAdminEditModal(false); setAdminEditingVisit(null);
      if (syncCount > 0) alert(`Updated! Auto-synced ${syncCount} other record(s).`);
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

  // ── Excel Export (same as original, abbreviated for space) ──
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const data = filteredVisits;
    const mainData = data.map((v, i) => ({
      "S.No": i+1,
      "Visit Date": formatDate(v.visitAt),
      "Visit Time": formatTime(v.visitAt),
      "Visitor Name": v.visitor?.name || "",
      "Phone": v.visitor?.phone || "",
      "Email": v.visitor?.email || "",
      "City / Address": v.visitor?.location || "",
      "Property Layout": (v.propertyLayout||[]).join(", "),
      "Sales Executive": v.agent?.name || "",
      "Channel Partner": v.channelPartner?.name || "",
      "Channel Partner Phone": v.channelPartner?.phone || "",
      "Lead Status": v.leadQuality || "",
      "Booking Status": v.bookingStatus || "",
      "Remarks": v.remarks || "",
    }));
    const ws1 = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, ws1, "All Visits");
    XLSX.writeFile(wb, `Site-Visit-Analytics-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const downloadExcelTemplate = () => {
    const template = [{ "Visit Date":"2024-01-15","Visitor Name":"John Doe","Phone":"9876543210","Country Code":"+91","Email":"john@example.com","City / Address":"Mumbai","Property Layout":"2 BHK, 3 BHK","Sales Executive":"Tushar Bhandari","Lead Status":"Hot","Booking Status":"Not Booked","Remarks":"" }];
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
    if (typeof visitTime === "number") { const h = Math.floor(visitTime*24), m = Math.floor((visitTime*24-h)*60); visitTime = `${pad(h)}:${pad(m)}`; }
    const [hh,mm] = (visitTime+"").split(":");
    visitDate.setHours(parseInt(hh)||10, parseInt(mm)||0, 0, 0);
    return {
      errors,
      data: errors.length === 0 ? {
        visitor: { name:row["Visitor Name"].trim(), phone, email:row["Email"]?.trim()||"", location:row["City / Address"]?.trim()||"", countryCode:row["Country Code"]?.trim()||"+91" },
        agent: { name:row["Sales Executive"]?.trim()||"" },
        propertyLayout: row["Property Layout"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
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

  if (authLoading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Authenticating...</p></div>;
  if (!user) return <div className="av-auth-screen"><div className="av-auth-card"><div className="av-auth-icon">🔒</div><h2>Login Required</h2><button onClick={()=>window.location.href="/login"} className="av-auth-btn">Login</button></div></div>;
  if (loading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Loading...</p></div>;

  const PageNumbers = () => {
    const pages=[];
    let start,end;
    if(totalPages<=7){start=1;end=totalPages;}
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
    <div className="av-ro-field"><div className="av-ro-label">{icon} {label}</div><div className="av-ro-value">{value||"N/A"}</div></div>
  );
  const ROCheckboxGroup = ({label,options,selected,icon}) => (
    <div className="av-ro-field av-ro-full"><div className="av-ro-label">{icon} {label}</div>
      <div className="av-ro-chips">{options.map(opt=>(<span key={opt} className={`av-ro-chip ${selected?.includes(opt)?"av-chip-on":"av-chip-off"}`}>{selected?.includes(opt)?"☑":"☐"} {opt}</span>))}</div>
    </div>
  );

  return (
    <div className="av-container">
      {/* Header */}
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
                {isAdminUser()&&<span className="av-admin-tag">Admin</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="av-content">
        {/* Stats */}
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
              <div className="av-stat-body"><div className="av-stat-label">{s.label}</div><div className="av-stat-value" style={{color:s.color}}>{s.val}</div><div className="av-stat-sub">{s.sub}</div></div>
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
              <div><div className="av-lead-val" style={{color:l.color}}>{l.val}</div><div className="av-lead-lbl">{l.label}</div>{l.sub&&<div className="av-lead-sub">{l.sub}</div>}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="av-filters-card">
          <div className="av-filters-top">
            <h3 className="av-filters-title">🔍 Search & Filters</h3>
            <div className="av-filters-right">
              <div className="av-search-wrap" ref={searchRef}>
                <span className="av-search-ico">🔍</span>
                <input type="text" className="av-search-input" placeholder="Search..." value={searchTerm} onChange={handleSearchChange} onFocus={()=>searchTerm.length>=2&&setShowSuggestions(true)} />
                {searchTerm&&<button className="av-search-clear" onClick={()=>{setSearchTerm("");setShowSuggestions(false);}}>✕</button>}
                {showSuggestions&&searchSuggestions.length>0&&(
                  <div className="av-suggestions">
                    {searchSuggestions.map((s,i)=>(
                      <div key={i} className="av-sug-item" onClick={()=>{setSearchTerm(s.value);setShowSuggestions(false);if(s.phone)viewVisitorHistory(s.phone,s.name||s.value);}}>
                        <span className="av-sug-icon">{s.type==="name"?"👤":s.type==="phone"?"📞":"✉️"}</span>
                        <span className="av-sug-val">{s.value}</span>
                        {s.visitCount>1&&<span className="av-sug-badge">{s.visitCount}×</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="av-btn av-btn-ghost" onClick={clearAllFilters}>🔄 Clear</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{display:"none"}} />
              <button className="av-btn av-btn-info" onClick={()=>fileInputRef.current?.click()}>📤 Import</button>
              <button className="av-btn av-btn-purple" onClick={downloadExcelTemplate}>📥 Template</button>
              <button className="av-btn av-btn-success" onClick={exportToExcel}>📊 Export</button>
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
              <div key={f.key} className="av-filter-item"><label className="av-filter-label">{f.label}</label>
                <select className="av-filter-select" value={filters[f.key]} onChange={e=>updateFilter(f.key,e.target.value)}>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div className="av-filter-item"><label className="av-filter-label">From</label><input type="date" className="av-filter-select" value={filters.dateFrom} onChange={e=>updateFilter("dateFrom",e.target.value)} /></div>
            <div className="av-filter-item"><label className="av-filter-label">To</label><input type="date" className="av-filter-select" value={filters.dateTo} onChange={e=>updateFilter("dateTo",e.target.value)} /></div>
          </div>
          <div className="av-filter-summary">Showing <strong>{filteredVisits.length}</strong> of <strong>{visits.length}</strong></div>
        </div>

        {/* Table */}
        <div className="av-table-card">
          <div className="av-table-top">
            <h3 className="av-table-title">📋 Visit Records</h3>
            <div className="av-table-controls">
              <div className="av-rows-wrap"><span>Show</span>
                <select className="av-rows-sel" value={isCustom?"custom":rowsPerPage} onChange={handleRowsChange}>
                  {[5,10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}<option value="custom">Custom</option>
                </select>
                {isCustom&&<input type="number" min="1" placeholder="#" className="av-custom-rows" value={customRows} onChange={e=>{setCustomRows(e.target.value);if(e.target.value&&Number(e.target.value)>0){setRowsPerPage(Number(e.target.value));setCurrentPage(1);}}} />}
                <span>entries</span>
              </div>
              <PaginationBar />
            </div>
          </div>
          <div className="av-table-wrap">
            <table className="av-table">
              <thead><tr><th>#</th><th>Type</th><th>Date</th><th>Visitor</th><th>Contact</th><th>Property</th><th>Executive</th><th>Lead</th><th>Status</th><th>Check-Ins</th><th>Remarks</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedVisits.length===0?(
                  <tr><td colSpan="12" className="av-empty"><div className="av-empty-inner"><span>🔍</span><p>{searchTerm?`No results for "${searchTerm}"`:"No visits found"}</p></div></td></tr>
                ):paginatedVisits.map((visit,idx)=>{
                  const isReturning=visit.visitor?.phone&&visitorCounts[visit.visitor.phone]?.count>1;
                  const isRetVisit=visit.isReturningVisit===true;
                  const visitCheckIns=checkInLogs.filter(l=>l.originalVisitRef===visit.id||l.phone===visit.visitor?.phone);
                  return(
                    <tr key={visit.id} className={isRetVisit?"av-row-returning":""}>
                      <td className="av-td-num">{startIndex+idx+1}</td>
                      <td><div className="av-type-cell"><span className={`av-type-badge ${isRetVisit?"returning":"first"}`}>{isRetVisit?"🔄":"🆕"} {isRetVisit?"Return":"First"}</span>{visit.visitorIdentity&&<span className="av-identity-chip">{visit.visitorIdentity}</span>}</div></td>
                      <td><div className="av-date">{formatDate(visit.visitAt)}</div><div className="av-time">{formatTime(visit.visitAt)}</div></td>
                      <td><div className="av-visitor-name" onClick={()=>visit.visitor?.phone&&viewVisitorHistory(visit.visitor.phone,visit.visitor.name)} title="View history">{visit.visitor?.name||"N/A"}{isReturning&&<span className="av-repeat-badge">{visitorCounts[visit.visitor.phone].count}×</span>}</div>{visit.visitor?.email&&<div className="av-visitor-sub">✉️ {visit.visitor.email}</div>}{visit.visitor?.location&&<div className="av-visitor-sub">📍 {visit.visitor.location}</div>}</td>
                      <td>
                        <div className="av-phone-row"><span>{getCountryFlag(visit.visitor?.countryCode||"+91")}</span><span className="av-cc">{visit.visitor?.countryCode||"+91"}</span><span className="av-phone-num">{visit.visitor?.phone||"N/A"}</span></div>
                        {/* Channel partner badge in table */}
                        {visit.channelPartner?.name&&(
                          <div className="av-cp-badge">
                            <span className="av-cp-icon">🤝</span>
                            <span className="av-cp-name">{visit.channelPartner.name}</span>
                          </div>
                        )}
                      </td>
                      <td><div className="av-tags">{(visit.propertyLayout||[]).map((t,i)=><span key={i} className="av-tag av-tag-layout">{t}</span>)}</div></td>
                      <td><span className="av-exec">{visit.agent?.name||"—"}</span></td>
                      <td><span className={`av-lead-badge av-lead-${(visit.leadQuality||"cold").toLowerCase()}`}>{visit.leadQuality==="Hot"?"🔥":visit.leadQuality==="Warm"?"⚡":"❄️"} {visit.leadQuality||"N/A"}</span></td>
                      <td><span className={`av-status-badge av-status-${(visit.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`}>{visit.bookingStatus==="Booked"?"✅":"❌"} {visit.bookingStatus||"N/A"}</span></td>
                      <td>{visitCheckIns.length>0?<div className="av-checkin"><strong>{visitCheckIns.length}</strong> check-ins</div>:<span className="av-no-data">—</span>}</td>
                      <td><div className="av-remarks" title={visit.remarks}>{visit.remarks||<span className="av-no-data">—</span>}</div></td>
                      <td><div className="av-actions">
                        <button className="av-act-btn av-act-edit" onClick={()=>handleEdit(visit)} title="Sales Edit">✏️</button>
                        {isAdminUser()&&<button className="av-act-btn av-act-admin" onClick={()=>handleAdminEdit(visit)} title="Admin Edit">🔧</button>}
                        <button className="av-act-btn av-act-hist" onClick={()=>fetchEditHistory(visit.id)} disabled={historyLoading} title="History">{historyLoading?"⏳":"📜"}</button>
                        <button className="av-act-btn av-act-view" onClick={()=>visit.visitor?.phone&&viewVisitorHistory(visit.visitor.phone,visit.visitor.name)} title="View">👁️</button>
                        {isAdminUser()&&<button className="av-act-btn av-act-del" onClick={()=>handleDelete(visit.id)} title="Delete">🗑️</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="av-table-footer"><span className="av-page-summary">Showing {totalRows===0?0:startIndex+1}–{Math.min(startIndex+rowsPerPage,totalRows)} of {totalRows}</span><PaginationBar /></div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {/* Visitor History */}
      {showVisitorHistory&&selectedVisitorHistory&&(
        <div className="av-overlay" onClick={()=>setShowVisitorHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>👤 {selectedVisitorHistory.name}</h2><button className="av-modal-close" onClick={()=>setShowVisitorHistory(false)}>✕</button></div>
            <div className="av-modal-body">
              <div className="av-hist-summary"><div>📞 <strong>{selectedVisitorHistory.phone}</strong></div><div>Visits: <strong>{selectedVisitorHistory.visits.length}</strong></div></div>
              {selectedVisitorHistory.visits.map((v,i)=>(
                <div key={v.id} className="av-tl-item">
                  <div className="av-tl-header"><span className={`av-tl-badge ${v.isReturningVisit?"returning":"first"}`}>{v.isReturningVisit?"🔄":"🆕"}</span><span className="av-tl-num">#{selectedVisitorHistory.visits.length-i}</span><span className="av-tl-date">{formatDateTime(v.visitAt)}</span></div>
                  <div className="av-tl-body">
                    <div className="av-tl-row"><strong>Exec:</strong> {v.agent?.name||"N/A"}</div>
                    {v.channelPartner?.name&&<div className="av-tl-row"><strong>Channel Partner:</strong> 🤝 {v.channelPartner.name}</div>}
                    <div className="av-tl-row"><strong>Lead:</strong> <span className={`av-lead-badge av-lead-${(v.leadQuality||"cold").toLowerCase()}`} style={{marginLeft:8}}>{v.leadQuality||"N/A"}</span></div>
                    <div className="av-tl-row"><strong>Status:</strong> <span className={`av-status-badge av-status-${(v.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`} style={{marginLeft:8}}>{v.bookingStatus||"N/A"}</span></div>
                    {v.remarks&&<div className="av-tl-row"><strong>Remarks:</strong> {v.remarks}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>setShowVisitorHistory(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* Edit History */}
      {showEditHistory&&(
        <div className="av-overlay" onClick={()=>setShowEditHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>📜 Edit History</h2><button className="av-modal-close" onClick={()=>setShowEditHistory(false)}>✕</button></div>
            <div className="av-modal-body">
              {historyLoading?<div className="av-hist-loading"><div className="av-spinner"></div></div>
              :editHistory.length===0?<div className="av-hist-empty"><span>📜</span><p>No history</p></div>
              :editHistory.map((log,i)=>(
                <div key={log.id} className={`av-tl-item ${log.action==="DELETE"?"av-tl-delete":""}`}>
                  <div className="av-tl-header"><span className={`av-tl-badge ${log.action==="DELETE"?"delete":""}`}>{log.action==="DELETE"?"🗑️":"✏️"}</span><span className="av-tl-num">#{editHistory.length-i}</span><span className="av-tl-date">{formatDateTime(log.editedAt)}</span></div>
                  <div className="av-tl-body">
                    <div className="av-tl-row">👤 {log.editedBy?.email||"Unknown"}</div>
                    {log.action==="DELETE"?<div className="av-del-warn">⚠️ Deleted</div>
                    :Object.keys(log.changes||{}).length>0?<div className="av-changes">{Object.entries(log.changes).map(([f,c])=>(<div key={f} className="av-change-row"><span className="av-change-field">{f}</span><span className="av-change-from">{c.from}</span><span className="av-change-arrow">→</span><span className="av-change-to">{c.to}</span></div>))}</div>
                    :<div className="av-tl-row av-muted">No changes</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>setShowEditHistory(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ══ SALES EDIT MODAL — with Broker Dropdown ══ */}
      {showEditModal&&editingVisit&&originalVisitData&&(
        <div className="av-overlay" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}}>
          <div className="av-modal av-modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>✏️ {originalVisitData.visitorName}</h2><button className="av-modal-close" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}}>✕</button></div>

            {/* Read-only visitor info */}
            <div className="av-ro-section">
              <div className="av-ro-section-header"><span className="av-ro-lock">🔒</span><div><h4 className="av-ro-section-title">Visitor Information</h4><p className="av-ro-section-sub">Read Only</p></div><span className="av-ro-badge">NOT Editable</span></div>
              <div className="av-ro-grid">
                <ROField label="Contact" icon="📞" value={`${getCountryFlag(originalVisitData.countryCode)} ${originalVisitData.countryCode} ${originalVisitData.phone}`} />
                <ROField label="Name" icon="👤" value={originalVisitData.visitorName} />
                <ROField label="Date" icon="📅" value={originalVisitData.visitDate} />
                <ROField label="Time" icon="🕐" value={originalVisitData.visitTime} />
                <ROField label="Email" icon="✉️" value={originalVisitData.email} />
                <ROField label="Address" icon="📍" value={originalVisitData.location} />
              </div>
              <ROCheckboxGroup label="Layout" icon="🏠" options={PROPERTY_LAYOUTS} selected={originalVisitData.propertyLayout} />
              <ROCheckboxGroup label="Types" icon="🏢" options={PROPERTY_TYPES} selected={originalVisitData.propertyTypes} />
              <ROCheckboxGroup label="Purpose" icon="🎯" options={PURPOSES} selected={originalVisitData.purpose} />
              <ROCheckboxGroup label="Status" icon="🏗" options={PROPERTY_STATUSES_LIST} selected={originalVisitData.propertyStatus} />
              <ROCheckboxGroup label="Source" icon="📢" options={CAMPAIGN_SOURCES} selected={originalVisitData.campaignSource} />
            </div>

            <div className="av-sp-divider"><div className="av-sp-divider-line"></div><span className="av-sp-divider-text">Sales Portal</span><div className="av-sp-divider-line"></div></div>

            <Formik initialValues={editingVisit} validationSchema={salesValidation} onSubmit={handleSalesUpdate} enableReinitialize>
              {({values,setFieldValue,errors,touched,isSubmitting})=>(
                <Form>
                  <div className="av-sp-section">
                    <div className="av-sp-section-header"><span className="av-sp-icon">🏢</span><h4 className="av-sp-title">Sales Portal</h4><span className="av-sp-badge">Editable</span></div>

                    {/* Visitor Identity */}
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Visitor Identity *</label><div className="av-sp-radio-grid">{VISITOR_IDENTITIES.map(vi=>(<label key={vi} className={`av-sp-radio-item ${values.visitorIdentity===vi?"checked":""}`}><input type="radio" name="vi" checked={values.visitorIdentity===vi} onChange={()=>setFieldValue("visitorIdentity",vi)} /><span className="av-sp-radio-dot">{values.visitorIdentity===vi?"●":"○"}</span>{vi}</label>))}</div><ErrorMessage name="visitorIdentity" component="div" className="av-err" /></div>

                    {/* ══ CHANNEL PARTNER — Broker Dropdown ══ */}
                    <div className="av-sp-grid-2">
                      <div className="av-sp-field">
                        <label className="av-sp-label">🤝 Channel Partner <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(from broker list)</span></label>
                        <BrokerDropdown
                          brokers={brokers}
                          value={values.channelPartner}
                          onChange={(selected) => {
                            setFieldValue("channelPartner", selected.name);
                            setFieldValue("channelPartnerPhone", selected.phone);
                            setFieldValue("channelPartnerCountryCode", selected.countryCode);
                          }}
                          placeholder="Search or select broker..."
                        />
                        {/* Show selected broker phone auto-filled */}
                        {values.channelPartner && values.channelPartnerPhone && (
                          <div className="av-cp-autofill">
                            📞 Auto-filled: {values.channelPartnerCountryCode} {values.channelPartnerPhone}
                          </div>
                        )}
                      </div>
                      {/* Manual phone override */}
                      <div className="av-sp-field">
                        <label className="av-sp-label">Partner Contact <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(auto or manual)</span></label>
                        <div className="av-sp-phone-row">
                          <SearchableCountryDropdown value={values.channelPartnerCountryCode} onChange={c=>setFieldValue("channelPartnerCountryCode",c)} name="cpcc" />
                          <Field name="channelPartnerPhone" type="tel" placeholder="Phone" className="av-sp-input" onChange={e=>setFieldValue("channelPartnerPhone",e.target.value.replace(/\D/g,"").slice(0,15))} />
                        </div>
                      </div>
                    </div>

                    {/* Interested Layout */}
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Interested Layout *</label><div className="av-sp-cb-grid">{PROPERTY_LAYOUTS.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedLayout?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedLayout?.includes(t)||false} onChange={()=>setFieldValue("interestedLayout",toggleArr(values.interestedLayout,t))} /><span className="av-sp-cb-mark">{values.interestedLayout?.includes(t)?"✓":""}</span>{t}</label>))}</div><ErrorMessage name="interestedLayout" component="div" className="av-err" /></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Property Types</label><div className="av-sp-cb-grid">{PROPERTY_TYPES.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedPropertyTypes?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedPropertyTypes?.includes(t)||false} onChange={()=>setFieldValue("interestedPropertyTypes",toggleArr(values.interestedPropertyTypes,t))} /><span className="av-sp-cb-mark">{values.interestedPropertyTypes?.includes(t)?"✓":""}</span>{t}</label>))}</div></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Purpose</label><div className="av-sp-cb-grid">{PURPOSES.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedPurpose?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedPurpose?.includes(t)||false} onChange={()=>setFieldValue("interestedPurpose",toggleArr(values.interestedPurpose,t))} /><span className="av-sp-cb-mark">{values.interestedPurpose?.includes(t)?"✓":""}</span>{t}</label>))}</div></div>

                    <div className="av-sp-grid-2">
                      <div className="av-sp-field"><label className="av-sp-label">Lead Status *</label><Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality&&touched.leadQuality?"av-err-border":""}`}><option value="">— Select —</option>{LEAD_STATUSES.map(l=><option key={l} value={l}>{l}</option>)}</Field><ErrorMessage name="leadQuality" component="div" className="av-err" /></div>
                      <div className="av-sp-field"><label className="av-sp-label">Sales Executive *</label><Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive&&touched.salesExecutive?"av-err-border":""}`}><option value="">— Select —</option>{SALES_EXECUTIVE_OPTIONS.map(ex=><option key={ex} value={ex}>{ex}</option>)}</Field><ErrorMessage name="salesExecutive" component="div" className="av-err" /></div>
                    </div>

                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Booking Status *</label><div className="av-sp-radio-grid">{BOOKING_STATUSES.map(s=>(<label key={s} className={`av-sp-radio-item ${values.bookingStatus===s?"checked":""}`}><input type="radio" name="bs" checked={values.bookingStatus===s} onChange={()=>setFieldValue("bookingStatus",s)} /><span className="av-sp-radio-dot">{values.bookingStatus===s?"●":"○"}</span>{s==="Booked"?"☑ Booked":"☐ Not Booked"}</label>))}</div><ErrorMessage name="bookingStatus" component="div" className="av-err" /></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Remarks</label><Field as="textarea" name="remarks" rows="3" className="av-sp-textarea" placeholder="Notes..." /></div>
                  </div>
                  <div className="av-modal-footer"><button type="button" className="av-btn av-btn-ghost" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}} disabled={isSubmitting}>Cancel</button><button type="submit" className="av-btn av-btn-primary" disabled={isSubmitting}>{isSubmitting?"⏳ Saving...":"💾 Save"}</button></div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Admin Edit Modal — also with BrokerDropdown */}
      {showAdminEditModal&&adminEditingVisit&&isAdminUser()&&(
        <div className="av-overlay" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}}>
          <div className="av-modal av-modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header av-modal-header-admin"><div><h2>🔧 Admin Edit — {adminEditingVisit.visitorName}</h2><p style={{margin:"4px 0 0",fontSize:"12px",color:"#b91c1c"}}>⚡ Auto-syncs across all records</p></div><button className="av-modal-close" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}}>✕</button></div>
            <Formik initialValues={adminEditingVisit} validationSchema={adminValidation} onSubmit={handleAdminUpdate} enableReinitialize>
              {({values,setFieldValue,errors,touched,isSubmitting})=>(
                <Form>
                  <div style={{padding:"24px",maxHeight:"65vh",overflowY:"auto"}}>
                    <div className="av-admin-section">
                      <div className="av-admin-section-title"><span>👤</span> Visitor Info <span className="av-admin-badge">Auto-Sync</span></div>
                      <div className="av-admin-grid">
                        <div className="av-sp-field"><label className="av-sp-label">Name *</label><Field name="visitorName" type="text" className={`av-sp-input ${errors.visitorName&&touched.visitorName?"av-err-border":""}`} /><ErrorMessage name="visitorName" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Phone *</label><div className="av-sp-phone-row"><SearchableCountryDropdown value={values.countryCode} onChange={c=>setFieldValue("countryCode",c)} name="cc" /><Field name="phone" type="tel" className={`av-sp-input ${errors.phone&&touched.phone?"av-err-border":""}`} onChange={e=>setFieldValue("phone",e.target.value.replace(/\D/g,"").slice(0,15))} /></div><ErrorMessage name="phone" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Email</label><Field name="email" type="email" className="av-sp-input" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Address</label><Field name="location" type="text" className="av-sp-input" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Date *</label><Field name="visitDate" type="date" className={`av-sp-input ${errors.visitDate&&touched.visitDate?"av-err-border":""}`} /><ErrorMessage name="visitDate" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Time *</label><Field name="visitTime" type="time" className={`av-sp-input ${errors.visitTime&&touched.visitTime?"av-err-border":""}`} /><ErrorMessage name="visitTime" component="div" className="av-err" /></div>
                      </div>
                      {[{l:"Layout *",f:"propertyLayout",o:PROPERTY_LAYOUTS,e:true},{l:"Types",f:"propertyTypes",o:PROPERTY_TYPES},{l:"Purpose",f:"purpose",o:PURPOSES},{l:"Property Status",f:"propertyStatus",o:PROPERTY_STATUSES_LIST},{l:"Source",f:"campaignSource",o:CAMPAIGN_SOURCES}].map(({l,f,o,e})=>(
                        <div key={f} className="av-sp-field" style={{marginTop:16}}><label className="av-sp-label">{l}</label><div className="av-sp-cb-grid">{o.map(t=>(<label key={t} className={`av-sp-cb-item ${values[f]?.includes(t)?"checked":""}`}><input type="checkbox" checked={values[f]?.includes(t)||false} onChange={()=>setFieldValue(f,toggleArr(values[f],t))} /><span className="av-sp-cb-mark">{values[f]?.includes(t)?"✓":""}</span>{t}</label>))}</div>{e&&<ErrorMessage name={f} component="div" className="av-err" />}</div>
                      ))}
                    </div>
                    <div className="av-admin-section" style={{marginTop:20}}>
                      <div className="av-admin-section-title"><span>🏢</span> Sales Portal <span className="av-admin-badge">Admin</span></div>
                      <div className="av-admin-grid">
                        <div className="av-sp-field"><label className="av-sp-label">Identity</label><Field as="select" name="visitorIdentity" className="av-sp-select">{VISITOR_IDENTITIES.map(v=><option key={v} value={v}>{v}</option>)}</Field></div>
                        <div className="av-sp-field"><label className="av-sp-label">Executive *</label><Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive&&touched.salesExecutive?"av-err-border":""}`}><option value="">— Select —</option>{SALES_EXECUTIVE_OPTIONS.map(ex=><option key={ex} value={ex}>{ex}</option>)}</Field><ErrorMessage name="salesExecutive" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Lead *</label><Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality&&touched.leadQuality?"av-err-border":""}`}><option value="">— Select —</option>{LEAD_STATUSES.map(l=><option key={l} value={l}>{l}</option>)}</Field><ErrorMessage name="leadQuality" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Booking *</label><Field as="select" name="bookingStatus" className={`av-sp-select ${errors.bookingStatus&&touched.bookingStatus?"av-err-border":""}`}>{BOOKING_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</Field><ErrorMessage name="bookingStatus" component="div" className="av-err" /></div>
                        {/* ── Admin Channel Partner Dropdown ── */}
                        <div className="av-sp-field av-sp-full">
                          <label className="av-sp-label">🤝 Channel Partner <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(from broker list)</span></label>
                          <BrokerDropdown
                            brokers={brokers}
                            value={values.channelPartner}
                            onChange={(selected) => {
                              setFieldValue("channelPartner", selected.name);
                              setFieldValue("channelPartnerPhone", selected.phone);
                              setFieldValue("channelPartnerCountryCode", selected.countryCode);
                            }}
                            placeholder="Search or select broker..."
                          />
                          {values.channelPartner && values.channelPartnerPhone && (
                            <div className="av-cp-autofill">📞 Auto-filled: {values.channelPartnerCountryCode} {values.channelPartnerPhone}</div>
                          )}
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Partner Phone <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(auto or manual)</span></label>
                          <div className="av-sp-phone-row"><SearchableCountryDropdown value={values.channelPartnerCountryCode} onChange={c=>setFieldValue("channelPartnerCountryCode",c)} name="cpcc2" /><Field name="channelPartnerPhone" type="tel" className="av-sp-input" onChange={e=>setFieldValue("channelPartnerPhone",e.target.value.replace(/\D/g,"").slice(0,15))} /></div>
                        </div>
                      </div>
                      <div className="av-sp-field" style={{marginTop:16}}><label className="av-sp-label">Remarks</label><Field as="textarea" name="remarks" rows="3" className="av-sp-textarea" placeholder="Notes..." /></div>
                    </div>
                  </div>
                  <div className="av-modal-footer"><button type="button" className="av-btn av-btn-ghost" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}} disabled={isSubmitting}>Cancel</button><button type="submit" className="av-btn av-btn-admin" disabled={isSubmitting}>{isSubmitting?"⏳ Saving...":"🔧 Save All Changes"}</button></div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal&&(
        <div className="av-overlay" onClick={()=>{if(!isUploading){setShowUploadModal(false);setPreviewData([]);}}}>
          <div className="av-modal" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>📤 Import Excel</h2><button className="av-modal-close" onClick={()=>{setShowUploadModal(false);setPreviewData([]);}} disabled={isUploading}>✕</button></div>
            <div className="av-modal-body">
              {uploadProgress>0&&<div className="av-progress-wrap"><div className="av-progress-track"><div className="av-progress-fill" style={{width:`${uploadProgress}%`}}></div></div><p className="av-progress-pct">{Math.round(uploadProgress)}%</p></div>}
              <div className="av-upload-summary"><h4>✅ {previewData.length} rows ready</h4><p>{uploadStatus}</p></div>
              {uploadErrors.length>0&&<div className="av-upload-errors"><strong>⚠️ {uploadErrors.length} error(s)</strong><div className="av-error-list">{uploadErrors.map((e,i)=><div key={i}>• {e}</div>)}</div></div>}
              {previewData.length>0&&<div className="av-preview-table-wrap"><table className="av-table"><thead><tr><th>Name</th><th>Phone</th><th>Exec</th><th>Lead</th><th>Status</th></tr></thead><tbody>{previewData.slice(0,10).map((r,i)=><tr key={i}><td>{r.visitor.name}</td><td>{r.visitor.phone}</td><td>{r.agent.name||"—"}</td><td>{r.leadQuality}</td><td>{r.bookingStatus}</td></tr>)}{previewData.length>10&&<tr><td colSpan="5" className="av-preview-more">...{previewData.length-10} more</td></tr>}</tbody></table></div>}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>{setShowUploadModal(false);setPreviewData([]);}} disabled={isUploading}>Cancel</button><button className="av-btn av-btn-primary" onClick={importToFirebase} disabled={isUploading||!previewData.length}>{isUploading?`⏳ ${Math.round(uploadProgress)}%`:`📤 Import ${previewData.length}`}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;






























// ==========================================================


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

  // Sync external value
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

  // ── Broker list from Firestore ──
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
    avgVisitsPerDay:"", topExecutive:"", topPropertyType:"",
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
      // ── Channel partner pre-filled from broker ──
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
    propertyLayout: Yup.array().min(1,"Select at least one"),
    leadQuality: Yup.string().required("Required"),
    bookingStatus: Yup.string().required("Required"),
  });

  const handleSalesUpdate = async (values, { setSubmitting }) => {
    try {
      setSubmitting(true);
      const original = visits.find((v) => v.id === values.id);
      if (!original) throw new Error("Not found");
      const updated = {
        visitorIdentity: values.visitorIdentity,
        channelPartner: { name:values.channelPartner?.trim()||"", phone:values.channelPartnerPhone?.trim()||"", countryCode:values.channelPartnerCountryCode||"+91" },
        salesPortal: { interestedLayout:values.interestedLayout||[], interestedPropertyTypes:values.interestedPropertyTypes||[], interestedPurpose:values.interestedPurpose||[] },
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
        visitor: { name:values.visitorName.trim(), phone:values.phone.trim(), countryCode:values.countryCode||"+91", email:values.email?.trim()||"", location:values.location?.trim()||"" },
        propertyLayout: values.propertyLayout||[], propertyTypes:values.propertyTypes||[],
        purpose:values.purpose||[], propertyStatus:values.propertyStatus||[],
        campaignSource:values.campaignSource||[],
        channelPartner: { name:values.channelPartner?.trim()||"", phone:values.channelPartnerPhone?.trim()||"", countryCode:values.channelPartnerCountryCode||"+91" },
        salesPortal: { interestedLayout:values.interestedLayout||[], interestedPropertyTypes:values.interestedPropertyTypes||[], interestedPurpose:values.interestedPurpose||[] },
        visitorIdentity: values.visitorIdentity,
        agent: { name: values.salesExecutive },
        visitAt: visitDateTime, visitTime: values.visitTime,
        leadQuality: values.leadQuality,
        bookingStatus: values.bookingStatus,
        remarks: values.remarks?.trim() || "",
        lastModified: serverTimestamp(), lastModifiedBy: getUserInfo(),
      };
      await updateDoc(doc(db,"siteVisits",values.id), updatedData);
      const phoneToSync = values.originalPhone || values.phone.trim();
      const otherVisits = visits.filter(v => v.visitor?.phone === phoneToSync && v.id !== values.id);
      let syncCount = 0;
      for (const other of otherVisits) {
        const needsUpdate = other.visitor?.name !== values.visitorName.trim() ||
          other.visitor?.email !== (values.email?.trim()||"") ||
          other.visitor?.location !== (values.location?.trim()||"");
        if (needsUpdate) {
          try {
            await updateDoc(doc(db,"siteVisits",other.id), {
              "visitor.name": values.visitorName.trim(),
              "visitor.email": values.email?.trim()||"",
              "visitor.location": values.location?.trim()||"",
              "visitor.countryCode": values.countryCode||"+91",
              lastModified: serverTimestamp(), lastModifiedBy: getUserInfo(),
            });
            syncCount++;
          } catch(err) { console.error("Sync error:", err); }
        }
      }
      await logEditActivity(values.id, original, {...original,...updatedData});
      setShowAdminEditModal(false); setAdminEditingVisit(null);
      if (syncCount > 0) alert(`Updated! Auto-synced ${syncCount} other record(s).`);
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

  // ── Excel Export (same as original, abbreviated for space) ──
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const data = filteredVisits;
    const mainData = data.map((v, i) => ({
      "S.No": i+1,
      "Visit Date": formatDate(v.visitAt),
      "Visit Time": formatTime(v.visitAt),
      "Visitor Name": v.visitor?.name || "",
      "Phone": v.visitor?.phone || "",
      "Email": v.visitor?.email || "",
      "City / Address": v.visitor?.location || "",
      "Property Layout": (v.propertyLayout||[]).join(", "),
      "Sales Executive": v.agent?.name || "",
      "Channel Partner": v.channelPartner?.name || "",
      "Channel Partner Phone": v.channelPartner?.phone || "",
      "Lead Status": v.leadQuality || "",
      "Booking Status": v.bookingStatus || "",
      "Remarks": v.remarks || "",
    }));
    const ws1 = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, ws1, "All Visits");
    XLSX.writeFile(wb, `Site-Visit-Analytics-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const downloadExcelTemplate = () => {
    const template = [{ "Visit Date":"2024-01-15","Visitor Name":"John Doe","Phone":"9876543210","Country Code":"+91","Email":"john@example.com","City / Address":"Mumbai","Property Layout":"2 BHK, 3 BHK","Sales Executive":"Tushar Bhandari","Lead Status":"Hot","Booking Status":"Not Booked","Remarks":"" }];
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
    if (typeof visitTime === "number") { const h = Math.floor(visitTime*24), m = Math.floor((visitTime*24-h)*60); visitTime = `${pad(h)}:${pad(m)}`; }
    const [hh,mm] = (visitTime+"").split(":");
    visitDate.setHours(parseInt(hh)||10, parseInt(mm)||0, 0, 0);
    return {
      errors,
      data: errors.length === 0 ? {
        visitor: { name:row["Visitor Name"].trim(), phone, email:row["Email"]?.trim()||"", location:row["City / Address"]?.trim()||"", countryCode:row["Country Code"]?.trim()||"+91" },
        agent: { name:row["Sales Executive"]?.trim()||"" },
        propertyLayout: row["Property Layout"]?.split(",").map(s=>s.trim()).filter(Boolean)||[],
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

  if (authLoading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Authenticating...</p></div>;
  if (!user) return <div className="av-auth-screen"><div className="av-auth-card"><div className="av-auth-icon">🔒</div><h2>Login Required</h2><button onClick={()=>window.location.href="/login"} className="av-auth-btn">Login</button></div></div>;
  if (loading) return <div className="av-loading-screen"><div className="av-spinner"></div><p>Loading...</p></div>;

  const PageNumbers = () => {
    const pages=[];
    let start,end;
    if(totalPages<=7){start=1;end=totalPages;}
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
    <div className="av-ro-field"><div className="av-ro-label">{icon} {label}</div><div className="av-ro-value">{value||"N/A"}</div></div>
  );
  const ROCheckboxGroup = ({label,options,selected,icon}) => (
    <div className="av-ro-field av-ro-full"><div className="av-ro-label">{icon} {label}</div>
      <div className="av-ro-chips">{options.map(opt=>(<span key={opt} className={`av-ro-chip ${selected?.includes(opt)?"av-chip-on":"av-chip-off"}`}>{selected?.includes(opt)?"☑":"☐"} {opt}</span>))}</div>
    </div>
  );

  return (
    <div className="av-container">
      {/* Header */}
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
                {isAdminUser()&&<span className="av-admin-tag">Admin</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="av-content">
        {/* Stats */}
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
              <div className="av-stat-body"><div className="av-stat-label">{s.label}</div><div className="av-stat-value" style={{color:s.color}}>{s.val}</div><div className="av-stat-sub">{s.sub}</div></div>
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
              <div><div className="av-lead-val" style={{color:l.color}}>{l.val}</div><div className="av-lead-lbl">{l.label}</div>{l.sub&&<div className="av-lead-sub">{l.sub}</div>}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="av-filters-card">
          <div className="av-filters-top">
            <h3 className="av-filters-title">🔍 Search & Filters</h3>
            <div className="av-filters-right">
              <div className="av-search-wrap" ref={searchRef}>
                <span className="av-search-ico">🔍</span>
                <input type="text" className="av-search-input" placeholder="Search..." value={searchTerm} onChange={handleSearchChange} onFocus={()=>searchTerm.length>=2&&setShowSuggestions(true)} />
                {searchTerm&&<button className="av-search-clear" onClick={()=>{setSearchTerm("");setShowSuggestions(false);}}>✕</button>}
                {showSuggestions&&searchSuggestions.length>0&&(
                  <div className="av-suggestions">
                    {searchSuggestions.map((s,i)=>(
                      <div key={i} className="av-sug-item" onClick={()=>{setSearchTerm(s.value);setShowSuggestions(false);if(s.phone)viewVisitorHistory(s.phone,s.name||s.value);}}>
                        <span className="av-sug-icon">{s.type==="name"?"👤":s.type==="phone"?"📞":"✉️"}</span>
                        <span className="av-sug-val">{s.value}</span>
                        {s.visitCount>1&&<span className="av-sug-badge">{s.visitCount}×</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="av-btn av-btn-ghost" onClick={clearAllFilters}>🔄 Clear</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{display:"none"}} />
              <button className="av-btn av-btn-info" onClick={()=>fileInputRef.current?.click()}>📤 Import</button>
              <button className="av-btn av-btn-purple" onClick={downloadExcelTemplate}>📥 Template</button>
              <button className="av-btn av-btn-success" onClick={exportToExcel}>📊 Export</button>
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
              <div key={f.key} className="av-filter-item"><label className="av-filter-label">{f.label}</label>
                <select className="av-filter-select" value={filters[f.key]} onChange={e=>updateFilter(f.key,e.target.value)}>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div className="av-filter-item"><label className="av-filter-label">From</label><input type="date" className="av-filter-select" value={filters.dateFrom} onChange={e=>updateFilter("dateFrom",e.target.value)} /></div>
            <div className="av-filter-item"><label className="av-filter-label">To</label><input type="date" className="av-filter-select" value={filters.dateTo} onChange={e=>updateFilter("dateTo",e.target.value)} /></div>
          </div>
          <div className="av-filter-summary">Showing <strong>{filteredVisits.length}</strong> of <strong>{visits.length}</strong></div>
        </div>

        {/* Table */}
        <div className="av-table-card">
          <div className="av-table-top">
            <h3 className="av-table-title">📋 Visit Records</h3>
            <div className="av-table-controls">
              <div className="av-rows-wrap"><span>Show</span>
                <select className="av-rows-sel" value={isCustom?"custom":rowsPerPage} onChange={handleRowsChange}>
                  {[5,10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}<option value="custom">Custom</option>
                </select>
                {isCustom&&<input type="number" min="1" placeholder="#" className="av-custom-rows" value={customRows} onChange={e=>{setCustomRows(e.target.value);if(e.target.value&&Number(e.target.value)>0){setRowsPerPage(Number(e.target.value));setCurrentPage(1);}}} />}
                <span>entries</span>
              </div>
              <PaginationBar />
            </div>
          </div>
          <div className="av-table-wrap">
            <table className="av-table">
              <thead><tr><th>#</th><th>Type</th><th>Date</th><th>Visitor</th><th>Contact</th><th>Property</th><th>Executive</th><th>Lead</th><th>Status</th><th>Check-Ins</th><th>Remarks</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedVisits.length===0?(
                  <tr><td colSpan="12" className="av-empty"><div className="av-empty-inner"><span>🔍</span><p>{searchTerm?`No results for "${searchTerm}"`:"No visits found"}</p></div></td></tr>
                ):paginatedVisits.map((visit,idx)=>{
                  const isReturning=visit.visitor?.phone&&visitorCounts[visit.visitor.phone]?.count>1;
                  const isRetVisit=visit.isReturningVisit===true;
                  const visitCheckIns=checkInLogs.filter(l=>l.originalVisitRef===visit.id||l.phone===visit.visitor?.phone);
                  return(
                    <tr key={visit.id} className={isRetVisit?"av-row-returning":""}>
                      <td className="av-td-num">{startIndex+idx+1}</td>
                      <td><div className="av-type-cell"><span className={`av-type-badge ${isRetVisit?"returning":"first"}`}>{isRetVisit?"🔄":"🆕"} {isRetVisit?"Return":"First"}</span>{visit.visitorIdentity&&<span className="av-identity-chip">{visit.visitorIdentity}</span>}</div></td>
                      <td><div className="av-date">{formatDate(visit.visitAt)}</div><div className="av-time">{formatTime(visit.visitAt)}</div></td>
                      <td><div className="av-visitor-name" onClick={()=>visit.visitor?.phone&&viewVisitorHistory(visit.visitor.phone,visit.visitor.name)} title="View history">{visit.visitor?.name||"N/A"}{isReturning&&<span className="av-repeat-badge">{visitorCounts[visit.visitor.phone].count}×</span>}</div>{visit.visitor?.email&&<div className="av-visitor-sub">✉️ {visit.visitor.email}</div>}{visit.visitor?.location&&<div className="av-visitor-sub">📍 {visit.visitor.location}</div>}</td>
                      <td>
                        <div className="av-phone-row"><span>{getCountryFlag(visit.visitor?.countryCode||"+91")}</span><span className="av-cc">{visit.visitor?.countryCode||"+91"}</span><span className="av-phone-num">{visit.visitor?.phone||"N/A"}</span></div>
                        {/* Channel partner badge in table */}
                        {visit.channelPartner?.name&&(
                          <div className="av-cp-badge">
                            <span className="av-cp-icon">🤝</span>
                            <span className="av-cp-name">{visit.channelPartner.name}</span>
                          </div>
                        )}
                      </td>
                      <td><div className="av-tags">{(visit.propertyLayout||[]).map((t,i)=><span key={i} className="av-tag av-tag-layout">{t}</span>)}</div></td>
                      <td><span className="av-exec">{visit.agent?.name||"—"}</span></td>
                      <td><span className={`av-lead-badge av-lead-${(visit.leadQuality||"cold").toLowerCase()}`}>{visit.leadQuality==="Hot"?"🔥":visit.leadQuality==="Warm"?"⚡":"❄️"} {visit.leadQuality||"N/A"}</span></td>
                      <td><span className={`av-status-badge av-status-${(visit.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`}>{visit.bookingStatus==="Booked"?"✅":"❌"} {visit.bookingStatus||"N/A"}</span></td>
                      <td>{visitCheckIns.length>0?<div className="av-checkin"><strong>{visitCheckIns.length}</strong> check-ins</div>:<span className="av-no-data">—</span>}</td>
                      <td><div className="av-remarks" title={visit.remarks}>{visit.remarks||<span className="av-no-data">—</span>}</div></td>
                      <td><div className="av-actions">
                        <button className="av-act-btn av-act-edit" onClick={()=>handleEdit(visit)} title="Sales Edit">✏️</button>
                        {isAdminUser()&&<button className="av-act-btn av-act-admin" onClick={()=>handleAdminEdit(visit)} title="Admin Edit">🔧</button>}
                        <button className="av-act-btn av-act-hist" onClick={()=>fetchEditHistory(visit.id)} disabled={historyLoading} title="History">{historyLoading?"⏳":"📜"}</button>
                        <button className="av-act-btn av-act-view" onClick={()=>visit.visitor?.phone&&viewVisitorHistory(visit.visitor.phone,visit.visitor.name)} title="View">👁️</button>
                        {isAdminUser()&&<button className="av-act-btn av-act-del" onClick={()=>handleDelete(visit.id)} title="Delete">🗑️</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="av-table-footer"><span className="av-page-summary">Showing {totalRows===0?0:startIndex+1}–{Math.min(startIndex+rowsPerPage,totalRows)} of {totalRows}</span><PaginationBar /></div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {/* Visitor History */}
      {showVisitorHistory&&selectedVisitorHistory&&(
        <div className="av-overlay" onClick={()=>setShowVisitorHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>👤 {selectedVisitorHistory.name}</h2><button className="av-modal-close" onClick={()=>setShowVisitorHistory(false)}>✕</button></div>
            <div className="av-modal-body">
              <div className="av-hist-summary"><div>📞 <strong>{selectedVisitorHistory.phone}</strong></div><div>Visits: <strong>{selectedVisitorHistory.visits.length}</strong></div></div>
              {selectedVisitorHistory.visits.map((v,i)=>(
                <div key={v.id} className="av-tl-item">
                  <div className="av-tl-header"><span className={`av-tl-badge ${v.isReturningVisit?"returning":"first"}`}>{v.isReturningVisit?"🔄":"🆕"}</span><span className="av-tl-num">#{selectedVisitorHistory.visits.length-i}</span><span className="av-tl-date">{formatDateTime(v.visitAt)}</span></div>
                  <div className="av-tl-body">
                    <div className="av-tl-row"><strong>Exec:</strong> {v.agent?.name||"N/A"}</div>
                    {v.channelPartner?.name&&<div className="av-tl-row"><strong>Channel Partner:</strong> 🤝 {v.channelPartner.name}</div>}
                    <div className="av-tl-row"><strong>Lead:</strong> <span className={`av-lead-badge av-lead-${(v.leadQuality||"cold").toLowerCase()}`} style={{marginLeft:8}}>{v.leadQuality||"N/A"}</span></div>
                    <div className="av-tl-row"><strong>Status:</strong> <span className={`av-status-badge av-status-${(v.bookingStatus||"").toLowerCase().replace(/\s+/g,"-")}`} style={{marginLeft:8}}>{v.bookingStatus||"N/A"}</span></div>
                    {v.remarks&&<div className="av-tl-row"><strong>Remarks:</strong> {v.remarks}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>setShowVisitorHistory(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* Edit History */}
      {showEditHistory&&(
        <div className="av-overlay" onClick={()=>setShowEditHistory(false)}>
          <div className="av-modal av-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>📜 Edit History</h2><button className="av-modal-close" onClick={()=>setShowEditHistory(false)}>✕</button></div>
            <div className="av-modal-body">
              {historyLoading?<div className="av-hist-loading"><div className="av-spinner"></div></div>
              :editHistory.length===0?<div className="av-hist-empty"><span>📜</span><p>No history</p></div>
              :editHistory.map((log,i)=>(
                <div key={log.id} className={`av-tl-item ${log.action==="DELETE"?"av-tl-delete":""}`}>
                  <div className="av-tl-header"><span className={`av-tl-badge ${log.action==="DELETE"?"delete":""}`}>{log.action==="DELETE"?"🗑️":"✏️"}</span><span className="av-tl-num">#{editHistory.length-i}</span><span className="av-tl-date">{formatDateTime(log.editedAt)}</span></div>
                  <div className="av-tl-body">
                    <div className="av-tl-row">👤 {log.editedBy?.email||"Unknown"}</div>
                    {log.action==="DELETE"?<div className="av-del-warn">⚠️ Deleted</div>
                    :Object.keys(log.changes||{}).length>0?<div className="av-changes">{Object.entries(log.changes).map(([f,c])=>(<div key={f} className="av-change-row"><span className="av-change-field">{f}</span><span className="av-change-from">{c.from}</span><span className="av-change-arrow">→</span><span className="av-change-to">{c.to}</span></div>))}</div>
                    :<div className="av-tl-row av-muted">No changes</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>setShowEditHistory(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ══ SALES EDIT MODAL — with Broker Dropdown ══ */}
      {showEditModal&&editingVisit&&originalVisitData&&(
        <div className="av-overlay" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}}>
          <div className="av-modal av-modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>✏️ {originalVisitData.visitorName}</h2><button className="av-modal-close" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}}>✕</button></div>

            {/* Read-only visitor info */}
            <div className="av-ro-section">
              <div className="av-ro-section-header"><span className="av-ro-lock">🔒</span><div><h4 className="av-ro-section-title">Visitor Information</h4><p className="av-ro-section-sub">Read Only</p></div><span className="av-ro-badge">NOT Editable</span></div>
              <div className="av-ro-grid">
                <ROField label="Contact" icon="📞" value={`${getCountryFlag(originalVisitData.countryCode)} ${originalVisitData.countryCode} ${originalVisitData.phone}`} />
                <ROField label="Name" icon="👤" value={originalVisitData.visitorName} />
                <ROField label="Date" icon="📅" value={originalVisitData.visitDate} />
                <ROField label="Time" icon="🕐" value={originalVisitData.visitTime} />
                <ROField label="Email" icon="✉️" value={originalVisitData.email} />
                <ROField label="Address" icon="📍" value={originalVisitData.location} />
              </div>
              <ROCheckboxGroup label="Layout" icon="🏠" options={PROPERTY_LAYOUTS} selected={originalVisitData.propertyLayout} />
              <ROCheckboxGroup label="Types" icon="🏢" options={PROPERTY_TYPES} selected={originalVisitData.propertyTypes} />
              <ROCheckboxGroup label="Purpose" icon="🎯" options={PURPOSES} selected={originalVisitData.purpose} />
              <ROCheckboxGroup label="Status" icon="🏗" options={PROPERTY_STATUSES_LIST} selected={originalVisitData.propertyStatus} />
              <ROCheckboxGroup label="Source" icon="📢" options={CAMPAIGN_SOURCES} selected={originalVisitData.campaignSource} />
            </div>

            <div className="av-sp-divider"><div className="av-sp-divider-line"></div><span className="av-sp-divider-text">Sales Portal</span><div className="av-sp-divider-line"></div></div>

            <Formik initialValues={editingVisit} validationSchema={salesValidation} onSubmit={handleSalesUpdate} enableReinitialize>
              {({values,setFieldValue,errors,touched,isSubmitting})=>(
                <Form>
                  <div className="av-sp-section">
                    <div className="av-sp-section-header"><span className="av-sp-icon">🏢</span><h4 className="av-sp-title">Sales Portal</h4><span className="av-sp-badge">Editable</span></div>

                    {/* Visitor Identity */}
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Visitor Identity *</label><div className="av-sp-radio-grid">{VISITOR_IDENTITIES.map(vi=>(<label key={vi} className={`av-sp-radio-item ${values.visitorIdentity===vi?"checked":""}`}><input type="radio" name="vi" checked={values.visitorIdentity===vi} onChange={()=>setFieldValue("visitorIdentity",vi)} /><span className="av-sp-radio-dot">{values.visitorIdentity===vi?"●":"○"}</span>{vi}</label>))}</div><ErrorMessage name="visitorIdentity" component="div" className="av-err" /></div>

                    {/* ══ CHANNEL PARTNER — Broker Dropdown ══ */}
                    <div className="av-sp-grid-2">
                      <div className="av-sp-field">
                        <label className="av-sp-label">🤝 Channel Partner <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(from broker list)</span></label>
                        <BrokerDropdown
                          brokers={brokers}
                          value={values.channelPartner}
                          onChange={(selected) => {
                            setFieldValue("channelPartner", selected.name);
                            setFieldValue("channelPartnerPhone", selected.phone);
                            setFieldValue("channelPartnerCountryCode", selected.countryCode);
                          }}
                          placeholder="Search or select broker..."
                        />
                        {/* Show selected broker phone auto-filled */}
                        {values.channelPartner && values.channelPartnerPhone && (
                          <div className="av-cp-autofill">
                            📞 Auto-filled: {values.channelPartnerCountryCode} {values.channelPartnerPhone}
                          </div>
                        )}
                      </div>
                      {/* Manual phone override */}
                      <div className="av-sp-field">
                        <label className="av-sp-label">Partner Contact <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(auto or manual)</span></label>
                        <div className="av-sp-phone-row">
                          <SearchableCountryDropdown value={values.channelPartnerCountryCode} onChange={c=>setFieldValue("channelPartnerCountryCode",c)} name="cpcc" />
                          <Field name="channelPartnerPhone" type="tel" placeholder="Phone" className="av-sp-input" onChange={e=>setFieldValue("channelPartnerPhone",e.target.value.replace(/\D/g,"").slice(0,15))} />
                        </div>
                      </div>
                    </div>

                    {/* Interested Layout */}
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Interested Layout *</label><div className="av-sp-cb-grid">{PROPERTY_LAYOUTS.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedLayout?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedLayout?.includes(t)||false} onChange={()=>setFieldValue("interestedLayout",toggleArr(values.interestedLayout,t))} /><span className="av-sp-cb-mark">{values.interestedLayout?.includes(t)?"✓":""}</span>{t}</label>))}</div><ErrorMessage name="interestedLayout" component="div" className="av-err" /></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Property Types</label><div className="av-sp-cb-grid">{PROPERTY_TYPES.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedPropertyTypes?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedPropertyTypes?.includes(t)||false} onChange={()=>setFieldValue("interestedPropertyTypes",toggleArr(values.interestedPropertyTypes,t))} /><span className="av-sp-cb-mark">{values.interestedPropertyTypes?.includes(t)?"✓":""}</span>{t}</label>))}</div></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Purpose</label><div className="av-sp-cb-grid">{PURPOSES.map(t=>(<label key={t} className={`av-sp-cb-item ${values.interestedPurpose?.includes(t)?"checked":""}`}><input type="checkbox" checked={values.interestedPurpose?.includes(t)||false} onChange={()=>setFieldValue("interestedPurpose",toggleArr(values.interestedPurpose,t))} /><span className="av-sp-cb-mark">{values.interestedPurpose?.includes(t)?"✓":""}</span>{t}</label>))}</div></div>

                    <div className="av-sp-grid-2">
                      <div className="av-sp-field"><label className="av-sp-label">Lead Status *</label><Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality&&touched.leadQuality?"av-err-border":""}`}><option value="">— Select —</option>{LEAD_STATUSES.map(l=><option key={l} value={l}>{l}</option>)}</Field><ErrorMessage name="leadQuality" component="div" className="av-err" /></div>
                      <div className="av-sp-field"><label className="av-sp-label">Sales Executive *</label><Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive&&touched.salesExecutive?"av-err-border":""}`}><option value="">— Select —</option>{SALES_EXECUTIVE_OPTIONS.map(ex=><option key={ex} value={ex}>{ex}</option>)}</Field><ErrorMessage name="salesExecutive" component="div" className="av-err" /></div>
                    </div>

                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Booking Status *</label><div className="av-sp-radio-grid">{BOOKING_STATUSES.map(s=>(<label key={s} className={`av-sp-radio-item ${values.bookingStatus===s?"checked":""}`}><input type="radio" name="bs" checked={values.bookingStatus===s} onChange={()=>setFieldValue("bookingStatus",s)} /><span className="av-sp-radio-dot">{values.bookingStatus===s?"●":"○"}</span>{s==="Booked"?"☑ Booked":"☐ Not Booked"}</label>))}</div><ErrorMessage name="bookingStatus" component="div" className="av-err" /></div>
                    <div className="av-sp-field av-sp-full"><label className="av-sp-label">Remarks</label><Field as="textarea" name="remarks" rows="3" className="av-sp-textarea" placeholder="Notes..." /></div>
                  </div>
                  <div className="av-modal-footer"><button type="button" className="av-btn av-btn-ghost" onClick={()=>{setShowEditModal(false);setEditingVisit(null);setOriginalVisitData(null);}} disabled={isSubmitting}>Cancel</button><button type="submit" className="av-btn av-btn-primary" disabled={isSubmitting}>{isSubmitting?"⏳ Saving...":"💾 Save"}</button></div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Admin Edit Modal — also with BrokerDropdown */}
      {showAdminEditModal&&adminEditingVisit&&isAdminUser()&&(
        <div className="av-overlay" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}}>
          <div className="av-modal av-modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header av-modal-header-admin"><div><h2>🔧 Admin Edit — {adminEditingVisit.visitorName}</h2><p style={{margin:"4px 0 0",fontSize:"12px",color:"#b91c1c"}}>⚡ Auto-syncs across all records</p></div><button className="av-modal-close" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}}>✕</button></div>
            <Formik initialValues={adminEditingVisit} validationSchema={adminValidation} onSubmit={handleAdminUpdate} enableReinitialize>
              {({values,setFieldValue,errors,touched,isSubmitting})=>(
                <Form>
                  <div style={{padding:"24px",maxHeight:"65vh",overflowY:"auto"}}>
                    <div className="av-admin-section">
                      <div className="av-admin-section-title"><span>👤</span> Visitor Info <span className="av-admin-badge">Auto-Sync</span></div>
                      <div className="av-admin-grid">
                        <div className="av-sp-field"><label className="av-sp-label">Name *</label><Field name="visitorName" type="text" className={`av-sp-input ${errors.visitorName&&touched.visitorName?"av-err-border":""}`} /><ErrorMessage name="visitorName" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Phone *</label><div className="av-sp-phone-row"><SearchableCountryDropdown value={values.countryCode} onChange={c=>setFieldValue("countryCode",c)} name="cc" /><Field name="phone" type="tel" className={`av-sp-input ${errors.phone&&touched.phone?"av-err-border":""}`} onChange={e=>setFieldValue("phone",e.target.value.replace(/\D/g,"").slice(0,15))} /></div><ErrorMessage name="phone" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Email</label><Field name="email" type="email" className="av-sp-input" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Address</label><Field name="location" type="text" className="av-sp-input" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Date *</label><Field name="visitDate" type="date" className={`av-sp-input ${errors.visitDate&&touched.visitDate?"av-err-border":""}`} /><ErrorMessage name="visitDate" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Time *</label><Field name="visitTime" type="time" className={`av-sp-input ${errors.visitTime&&touched.visitTime?"av-err-border":""}`} /><ErrorMessage name="visitTime" component="div" className="av-err" /></div>
                      </div>
                      {[{l:"Layout *",f:"propertyLayout",o:PROPERTY_LAYOUTS,e:true},{l:"Types",f:"propertyTypes",o:PROPERTY_TYPES},{l:"Purpose",f:"purpose",o:PURPOSES},{l:"Property Status",f:"propertyStatus",o:PROPERTY_STATUSES_LIST},{l:"Source",f:"campaignSource",o:CAMPAIGN_SOURCES}].map(({l,f,o,e})=>(
                        <div key={f} className="av-sp-field" style={{marginTop:16}}><label className="av-sp-label">{l}</label><div className="av-sp-cb-grid">{o.map(t=>(<label key={t} className={`av-sp-cb-item ${values[f]?.includes(t)?"checked":""}`}><input type="checkbox" checked={values[f]?.includes(t)||false} onChange={()=>setFieldValue(f,toggleArr(values[f],t))} /><span className="av-sp-cb-mark">{values[f]?.includes(t)?"✓":""}</span>{t}</label>))}</div>{e&&<ErrorMessage name={f} component="div" className="av-err" />}</div>
                      ))}
                    </div>
                    <div className="av-admin-section" style={{marginTop:20}}>
                      <div className="av-admin-section-title"><span>🏢</span> Sales Portal <span className="av-admin-badge">Admin</span></div>
                      <div className="av-admin-grid">
                        <div className="av-sp-field"><label className="av-sp-label">Identity</label><Field as="select" name="visitorIdentity" className="av-sp-select">{VISITOR_IDENTITIES.map(v=><option key={v} value={v}>{v}</option>)}</Field></div>
                        <div className="av-sp-field"><label className="av-sp-label">Executive *</label><Field as="select" name="salesExecutive" className={`av-sp-select ${errors.salesExecutive&&touched.salesExecutive?"av-err-border":""}`}><option value="">— Select —</option>{SALES_EXECUTIVE_OPTIONS.map(ex=><option key={ex} value={ex}>{ex}</option>)}</Field><ErrorMessage name="salesExecutive" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Lead *</label><Field as="select" name="leadQuality" className={`av-sp-select ${errors.leadQuality&&touched.leadQuality?"av-err-border":""}`}><option value="">— Select —</option>{LEAD_STATUSES.map(l=><option key={l} value={l}>{l}</option>)}</Field><ErrorMessage name="leadQuality" component="div" className="av-err" /></div>
                        <div className="av-sp-field"><label className="av-sp-label">Booking *</label><Field as="select" name="bookingStatus" className={`av-sp-select ${errors.bookingStatus&&touched.bookingStatus?"av-err-border":""}`}>{BOOKING_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</Field><ErrorMessage name="bookingStatus" component="div" className="av-err" /></div>
                        {/* ── Admin Channel Partner Dropdown ── */}
                        <div className="av-sp-field av-sp-full">
                          <label className="av-sp-label">🤝 Channel Partner <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(from broker list)</span></label>
                          <BrokerDropdown
                            brokers={brokers}
                            value={values.channelPartner}
                            onChange={(selected) => {
                              setFieldValue("channelPartner", selected.name);
                              setFieldValue("channelPartnerPhone", selected.phone);
                              setFieldValue("channelPartnerCountryCode", selected.countryCode);
                            }}
                            placeholder="Search or select broker..."
                          />
                          {values.channelPartner && values.channelPartnerPhone && (
                            <div className="av-cp-autofill">📞 Auto-filled: {values.channelPartnerCountryCode} {values.channelPartnerPhone}</div>
                          )}
                        </div>
                        <div className="av-sp-field">
                          <label className="av-sp-label">Partner Phone <span style={{fontSize:"0.65rem",color:"#6b7280",fontWeight:400}}>(auto or manual)</span></label>
                          <div className="av-sp-phone-row"><SearchableCountryDropdown value={values.channelPartnerCountryCode} onChange={c=>setFieldValue("channelPartnerCountryCode",c)} name="cpcc2" /><Field name="channelPartnerPhone" type="tel" className="av-sp-input" onChange={e=>setFieldValue("channelPartnerPhone",e.target.value.replace(/\D/g,"").slice(0,15))} /></div>
                        </div>
                      </div>
                      <div className="av-sp-field" style={{marginTop:16}}><label className="av-sp-label">Remarks</label><Field as="textarea" name="remarks" rows="3" className="av-sp-textarea" placeholder="Notes..." /></div>
                    </div>
                  </div>
                  <div className="av-modal-footer"><button type="button" className="av-btn av-btn-ghost" onClick={()=>{setShowAdminEditModal(false);setAdminEditingVisit(null);}} disabled={isSubmitting}>Cancel</button><button type="submit" className="av-btn av-btn-admin" disabled={isSubmitting}>{isSubmitting?"⏳ Saving...":"🔧 Save All Changes"}</button></div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal&&(
        <div className="av-overlay" onClick={()=>{if(!isUploading){setShowUploadModal(false);setPreviewData([]);}}}>
          <div className="av-modal" onClick={e=>e.stopPropagation()}>
            <div className="av-modal-header"><h2>📤 Import Excel</h2><button className="av-modal-close" onClick={()=>{setShowUploadModal(false);setPreviewData([]);}} disabled={isUploading}>✕</button></div>
            <div className="av-modal-body">
              {uploadProgress>0&&<div className="av-progress-wrap"><div className="av-progress-track"><div className="av-progress-fill" style={{width:`${uploadProgress}%`}}></div></div><p className="av-progress-pct">{Math.round(uploadProgress)}%</p></div>}
              <div className="av-upload-summary"><h4>✅ {previewData.length} rows ready</h4><p>{uploadStatus}</p></div>
              {uploadErrors.length>0&&<div className="av-upload-errors"><strong>⚠️ {uploadErrors.length} error(s)</strong><div className="av-error-list">{uploadErrors.map((e,i)=><div key={i}>• {e}</div>)}</div></div>}
              {previewData.length>0&&<div className="av-preview-table-wrap"><table className="av-table"><thead><tr><th>Name</th><th>Phone</th><th>Exec</th><th>Lead</th><th>Status</th></tr></thead><tbody>{previewData.slice(0,10).map((r,i)=><tr key={i}><td>{r.visitor.name}</td><td>{r.visitor.phone}</td><td>{r.agent.name||"—"}</td><td>{r.leadQuality}</td><td>{r.bookingStatus}</td></tr>)}{previewData.length>10&&<tr><td colSpan="5" className="av-preview-more">...{previewData.length-10} more</td></tr>}</tbody></table></div>}
            </div>
            <div className="av-modal-footer"><button className="av-btn av-btn-ghost" onClick={()=>{setShowUploadModal(false);setPreviewData([]);}} disabled={isUploading}>Cancel</button><button className="av-btn av-btn-primary" onClick={importToFirebase} disabled={isUploading||!previewData.length}>{isUploading?`⏳ ${Math.round(uploadProgress)}%`:`📤 Import ${previewData.length}`}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;