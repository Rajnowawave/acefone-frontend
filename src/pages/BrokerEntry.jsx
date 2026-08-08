import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp, onSnapshot,
  query, orderBy, updateDoc, doc, deleteDoc,
} from "firebase/firestore";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, Legend,
} from "recharts";
import {
  FaPhone, FaUser, FaCalendarAlt, FaEdit, FaFilter, FaTimes,
  FaTrash, FaComment, FaHandshake, FaSearch, FaFileExcel,
  FaWhatsapp, FaSortAlphaDown, FaSortAlphaUp, FaChevronLeft,
  FaChevronRight, FaSortAmountDown, FaSortAmountUp,
  FaAngleDoubleLeft, FaAngleDoubleRight, FaLock, FaEye,
  FaChartLine, FaTrophy, FaUserFriends, FaCheckCircle,
  FaClock, FaFire, FaBolt, FaSnowflake, FaPercentage,
  FaMapMarkerAlt, FaArrowRight,
} from "react-icons/fa";
import SearchableCountryDropdown, { countryCodes } from "./SearchableCountryDropdown";
import { useAuth } from "../context/AuthContext";
import "./BrokerEntry.css";

/* ─── helpers ─── */
const getTodayDate = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const normalizeText = (v) => (v || "").toString().trim().toLowerCase();
const normalizePhone = (v) => (v || "").toString().replace(/\D/g, "").trim();
const toJsDate = (ts) => {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};
const getTsValue = (ts) => { const d = toJsDate(ts); return d ? d.getTime() : 0; };
const formatDate = (ts) => {
  const d = toJsDate(ts);
  if (!d) return "N/A";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const formatTime = (ts) => {
  const d = toJsDate(ts);
  if (!d) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
};
const formatEntryDateDisplay = (s) => {
  if (!s) return "N/A";
  const [y, m, d] = s.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const getCountryByCode = (code) => countryCodes.find((c) => c.code === code) || countryCodes[0];
const getPhoneValidation = (code) => { const c = getCountryByCode(code); return { minLength: c.minLength, maxLength: c.maxLength }; };
const formatPhoneDisplay = (phone, cc) => {
  if (!phone) return "N/A";
  const c = getCountryByCode(cc || "+91");
  return `${c.flag} ${cc || "+91"} ${phone}`;
};
const shortName = (name) => { if (!name) return "Unknown"; return name.split(" ").slice(0, 2).join(" "); };

/* ─── chart tooltip ─── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bex-tooltip">
      <div className="bex-tooltip-label">{label}</div>
      {payload.map((item, i) => (
        <div className="bex-tooltip-row" key={i}>
          <span className="bex-tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* ─── summary card ─── */
function SummaryCard({ icon: Icon, title, value, subtitle, color = "blue" }) {
  return (
    <div className={`bex-sum-card ${color}`}>
      <div className="bex-sum-icon"><Icon /></div>
      <div className="bex-sum-body">
        <div className="bex-sum-title">{title}</div>
        <div className="bex-sum-value">{value}</div>
        {subtitle && <div className="bex-sum-sub">{subtitle}</div>}
      </div>
    </div>
  );
}

/* ─── history panel ─── */
function BrokerHistoryPanel({ broker, visits, stats, onEdit, onClose }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const PER = 8;

  useEffect(() => { setSearch(""); setTab("all"); setPage(1); }, [broker?.id]);

  const filtered = useMemo(() => {
    let list = visits || [];
    if (tab === "booked") list = list.filter((v) => v.bookingStatus === "Booked");
    if (tab === "hot") list = list.filter((v) => v.leadQuality === "Hot");
    if (tab === "warm") list = list.filter((v) => v.leadQuality === "Warm");
    if (tab === "cold") list = list.filter((v) => v.leadQuality === "Cold");
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((v) =>
        v.visitor?.name?.toLowerCase().includes(s) ||
        v.visitor?.phone?.includes(search) ||
        v.visitor?.location?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [visits, tab, search]);

  const totalP = Math.ceil(filtered.length / PER);
  const paginated = filtered.slice((page - 1) * PER, page * PER);

  if (!broker) {
    return (
      <div className="bex-history-card">
        <div className="bex-history-empty">
          <div className="bex-history-empty-icon"><FaArrowRight /></div>
          <h3>Select a Broker</h3>
          <p>Click on any broker row to view their complete customer history here.</p>
        </div>
      </div>
    );
  }

  const leadColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#3b82f6" };
  const tc = {
    all: visits.length,
    booked: visits.filter((v) => v.bookingStatus === "Booked").length,
    hot: visits.filter((v) => v.leadQuality === "Hot").length,
    warm: visits.filter((v) => v.leadQuality === "Warm").length,
    cold: visits.filter((v) => v.leadQuality === "Cold").length,
  };

  return (
    <div className="bex-history-card">
      <div className="bex-history-header">
        <div className="bex-history-user">
          <div className="bex-history-avatar">{(broker.brokerName || "?")[0].toUpperCase()}</div>
          <div>
            <h3>{broker.brokerName || "N/A"}</h3>
            <div className="bex-history-meta">
              <span><FaPhone /> {formatPhoneDisplay(broker.phone, broker.countryCode)}</span>
              <span><FaCalendarAlt /> {formatEntryDateDisplay(broker.entryDate)}</span>
            </div>
          </div>
        </div>
        <div className="bex-history-btns">
          <button className="bex-mini-btn" onClick={onEdit}><FaEdit /> Edit</button>
          <a href={`https://wa.me/${(broker.countryCode || "+91").replace("+", "")}${broker.phone || ""}`}
            target="_blank" rel="noopener noreferrer" className="bex-mini-btn wa">
            <FaWhatsapp /> Chat
          </a>
          <button className="bex-mini-btn close" onClick={onClose}><FaTimes /></button>
        </div>
      </div>

      {broker.remark && (
        <div className="bex-history-remark"><FaComment /><span>{broker.remark}</span></div>
      )}

      <div className="bex-history-stats">
        <div className="bex-h-stat"><span className="val">{stats.visits}</span><span className="lbl">Customers</span></div>
        <div className="bex-h-stat green"><span className="val">{stats.booked}</span><span className="lbl">Bookings</span></div>
        <div className="bex-h-stat red"><span className="val">{stats.hot}</span><span className="lbl">Hot</span></div>
        <div className="bex-h-stat gold"><span className="val">{stats.warm}</span><span className="lbl">Warm</span></div>
        <div className="bex-h-stat blue"><span className="val">{stats.cold}</span><span className="lbl">Cold</span></div>
        <div className="bex-h-stat purple"><span className="val">{stats.conversion}%</span><span className="lbl">Conv.</span></div>
      </div>

      <div className="bex-history-toolbar">
        <div className="bex-h-tabs">
          {[
            { key: "all", label: `All (${tc.all})` },
            { key: "booked", label: `Booked (${tc.booked})` },
            { key: "hot", label: `🔥 Hot (${tc.hot})` },
            { key: "warm", label: `⚡ Warm (${tc.warm})` },
            { key: "cold", label: `❄️ Cold (${tc.cold})` },
          ].map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="bex-h-search">
          <FaSearch />
          <input type="text" placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")}><FaTimes /></button>}
        </div>
      </div>

      <div className="bex-h-table-wrap">
        <table className="bex-h-table">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Phone</th><th>Location</th>
              <th>Visit Date</th><th>Lead</th><th>Booking</th><th>Layout</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan="8" className="bex-h-no-data">No customers found for this filter.</td></tr>
            ) : paginated.map((v, i) => (
              <tr key={v.id}>
                <td>{(page - 1) * PER + i + 1}</td>
                <td>
                  <div className="bex-cust-cell">
                    <div className="bex-cust-av">{(v.visitor?.name || "?")[0].toUpperCase()}</div>
                    <strong>{v.visitor?.name || "Unknown"}</strong>
                  </div>
                </td>
                <td>
                  <div className="bex-cust-phone">
                    <span>{v.visitor?.countryCode || "+91"} {v.visitor?.phone || "N/A"}</span>
                    {v.visitor?.phone && (
                      <a href={`https://wa.me/${(v.visitor?.countryCode || "+91").replace("+", "")}${v.visitor.phone}`}
                        target="_blank" rel="noopener noreferrer"><FaWhatsapp /></a>
                    )}
                  </div>
                </td>
                <td><span className="bex-loc"><FaMapMarkerAlt />{v.visitor?.location || "—"}</span></td>
                <td>
                  <div className="bex-date-col">
                    <span>{formatDate(v.visitAt)}</span>
                    <small>{formatTime(v.visitAt)}</small>
                  </div>
                </td>
                <td>
                  {v.leadQuality ? (
                    <span className="bex-lead-badge" style={{
                      color: leadColor[v.leadQuality] || "#6b7280",
                      borderColor: `${leadColor[v.leadQuality] || "#6b7280"}33`,
                      background: `${leadColor[v.leadQuality] || "#6b7280"}12`,
                    }}>
                      {v.leadQuality === "Hot" && <FaFire />}
                      {v.leadQuality === "Warm" && <FaBolt />}
                      {v.leadQuality === "Cold" && <FaSnowflake />}
                      {v.leadQuality}
                    </span>
                  ) : "—"}
                </td>
                <td>
                  <span className={`bex-book-badge ${v.bookingStatus === "Booked" ? "booked" : "not"}`}>
                    {v.bookingStatus === "Booked" ? "✅ Booked" : "Not Booked"}
                  </span>
                </td>
                <td>
                  {v.propertyLayout?.length > 0 ? (
                    <div className="bex-layout-tags">
                      {v.propertyLayout.slice(0, 2).map((t) => <span key={t} className="bex-layout-tag">{t}</span>)}
                      {v.propertyLayout.length > 2 && <span className="bex-layout-more">+{v.propertyLayout.length - 2}</span>}
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalP > 1 && (
        <div className="bex-h-pagination">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><FaChevronLeft /></button>
          <span>Page <strong>{page}</strong> of <strong>{totalP}</strong></span>
          <button onClick={() => setPage((p) => Math.min(totalP, p + 1))} disabled={page === totalP}><FaChevronRight /></button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function BrokerEntry() {
  const { currentUser, isAdmin } = useAuth();
  const formRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingBrokerId, setDeletingBrokerId] = useState(null);
  const [showMsg, setShowMsg] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const [selectedCountryCode, setSelectedCountryCode] = useState("+91");
  const [brokers, setBrokers] = useState([]);
  const [siteVisits, setSiteVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBrokerId, setEditingBrokerId] = useState(null);
  const [editingBrokerData, setEditingBrokerData] = useState(null);
  const [selectedBrokerId, setSelectedBrokerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [brokerToDelete, setBrokerToDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const PER_PAGE_OPTIONS = [10, 25, 50, 100];

  const initialValues = { brokerName: "", phone: "", countryCode: "+91", remark: "", entryDate: getTodayDate() };
  const getEditVals = (d) => ({
    brokerName: d?.brokerName || "", phone: d?.phone || "",
    countryCode: d?.countryCode || "+91", remark: d?.remark || "",
    entryDate: d?.entryDate || getTodayDate(),
  });
  const createSchema = (cc) => {
    const v = getPhoneValidation(cc);
    return Yup.object({
      brokerName: Yup.string().min(2, "Min 2 chars").required("Required"),
      phone: Yup.string().matches(/^\d+$/, "Digits only").min(v.minLength, `Min ${v.minLength}`).max(v.maxLength, `Max ${v.maxLength}`).required("Required"),
      entryDate: Yup.string().required("Required"), remark: Yup.string(),
    });
  };

  useEffect(() => {
    const q = query(collection(db, "brokers"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setBrokers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }, () => setLoading(false));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "siteVisits"), orderBy("visitAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setSiteVisits(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); });
    return () => unsub();
  }, []);

  const notify = useCallback((text, type = "success") => {
    setMsg(text); setMsgType(type); setShowMsg(true);
    setTimeout(() => { setShowMsg(false); setMsg(""); }, 3500);
  }, []);

  /* broker -> visits map */
  const brokerVisitMap = useMemo(() => {
    const map = {};
    brokers.forEach((b) => { map[b.id] = []; });
    const nameIdx = new Map();
    const phoneIdx = new Map();
    brokers.forEach((b) => {
      const n = normalizeText(b.brokerName);
      const p = normalizePhone(b.phone);
      if (n) { if (!nameIdx.has(n)) nameIdx.set(n, []); nameIdx.get(n).push(b.id); }
      if (p) { if (!phoneIdx.has(p)) phoneIdx.set(p, []); phoneIdx.get(p).push(b.id); }
    });
    siteVisits.forEach((v) => {
      const cn = normalizeText(v.channelPartner?.name);
      const cp = normalizePhone(v.channelPartner?.phone);
      const ids = new Set([...(cn ? nameIdx.get(cn) || [] : []), ...(cp ? phoneIdx.get(cp) || [] : [])]);
      ids.forEach((id) => { map[id].push(v); });
    });
    Object.keys(map).forEach((id) => { map[id].sort((a, b) => getTsValue(b.visitAt) - getTsValue(a.visitAt)); });
    return map;
  }, [brokers, siteVisits]);

  /* stats per broker */
  const brokerStatsMap = useMemo(() => {
    const s = {};
    brokers.forEach((b) => {
      const vis = brokerVisitMap[b.id] || [];
      const booked = vis.filter((v) => v.bookingStatus === "Booked").length;
      s[b.id] = {
        visits: vis.length, booked,
        hot: vis.filter((v) => v.leadQuality === "Hot").length,
        warm: vis.filter((v) => v.leadQuality === "Warm").length,
        cold: vis.filter((v) => v.leadQuality === "Cold").length,
        lastVisitAt: vis[0]?.visitAt || null,
        conversion: vis.length > 0 ? ((booked / vis.length) * 100).toFixed(1) : "0.0",
      };
    });
    return s;
  }, [brokers, brokerVisitMap]);

  /* analytics */
  const analytics = useMemo(() => {
    const tv = Object.values(brokerStatsMap).reduce((s, x) => s + x.visits, 0);
    const tb = Object.values(brokerStatsMap).reduce((s, x) => s + x.booked, 0);
    const ab = Object.values(brokerStatsMap).filter((x) => x.visits > 0).length;
    const cr = tv > 0 ? ((tb / tv) * 100).toFixed(1) : "0.0";
    const topChart = brokers
      .map((b) => ({ name: shortName(b.brokerName), visits: brokerStatsMap[b.id]?.visits || 0, bookings: brokerStatsMap[b.id]?.booked || 0 }))
      .filter((b) => b.visits > 0).sort((a, b) => b.visits - a.visits).slice(0, 6);
    const mm = {};
    siteVisits.forEach((v) => {
      const d = toJsDate(v.visitAt); if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!mm[k]) mm[k] = { visits: 0, bookings: 0 };
      mm[k].visits += 1;
      if (v.bookingStatus === "Booked") mm[k].bookings += 1;
    });
    const monthly = Object.entries(mm).sort().slice(-6).map(([m, d]) => ({
      month: new Date(`${m}-01`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      visits: d.visits, bookings: d.bookings,
    }));
    return { totalBrokers: brokers.length, activeBrokers: ab, totalVisits: tv, totalBookings: tb, conversionRate: cr, topChart, monthly };
  }, [brokers, brokerStatsMap, siteVisits]);

  const uniqueNames = useMemo(() => [...new Set(brokers.map((b) => b.brokerName).filter(Boolean))].sort(), [brokers]);

  /* filtered brokers */
  const filteredBrokers = useMemo(() => {
    let res = brokers.filter((b) => {
      const s = searchTerm.toLowerCase();
      const ms = !searchTerm || b.brokerName?.toLowerCase().includes(s) || b.phone?.includes(searchTerm) || b.remark?.toLowerCase().includes(s);
      const mn = !nameFilter || b.brokerName === nameFilter;
      let md = true;
      if (dateFilter) {
        if (b.entryDate) md = b.entryDate === dateFilter;
        else if (b.createdAt?.seconds) md = new Date(b.createdAt.seconds * 1000).toISOString().split("T")[0] === dateFilter;
        else md = false;
      }
      return ms && mn && md;
    });
    res.sort((a, b) => {
      let av, bv;
      if (sortBy === "brokerName") { av = a.brokerName?.toLowerCase() || ""; bv = b.brokerName?.toLowerCase() || ""; }
      else if (sortBy === "visits") { av = brokerStatsMap[a.id]?.visits || 0; bv = brokerStatsMap[b.id]?.visits || 0; }
      else if (sortBy === "bookings") { av = brokerStatsMap[a.id]?.booked || 0; bv = brokerStatsMap[b.id]?.booked || 0; }
      else if (sortBy === "lastVisit") { av = getTsValue(brokerStatsMap[a.id]?.lastVisitAt); bv = getTsValue(brokerStatsMap[b.id]?.lastVisitAt); }
      else if (sortBy === "entryDate") { av = a.entryDate || ""; bv = b.entryDate || ""; }
      else { av = a.createdAt?.seconds || 0; bv = b.createdAt?.seconds || 0; }
      return sortOrder === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return res;
  }, [brokers, searchTerm, nameFilter, dateFilter, sortBy, sortOrder, brokerStatsMap]);

  const selectedBroker = useMemo(() => brokers.find((b) => b.id === selectedBrokerId) || null, [brokers, selectedBrokerId]);
  const selectedVisits = useMemo(() => selectedBrokerId ? brokerVisitMap[selectedBrokerId] || [] : [], [selectedBrokerId, brokerVisitMap]);
  const selectedStats = useMemo(() => selectedBrokerId ? brokerStatsMap[selectedBrokerId] || { visits: 0, booked: 0, hot: 0, warm: 0, cold: 0, lastVisitAt: null, conversion: "0.0" } : { visits: 0, booked: 0, hot: 0, warm: 0, cold: 0, lastVisitAt: null, conversion: "0.0" }, [selectedBrokerId, brokerStatsMap]);

  const totalItems = filteredBrokers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
  const paginated = filteredBrokers.slice(startIdx, endIdx);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, nameFilter, dateFilter, sortBy, sortOrder, itemsPerPage]);

  const handleSubmit = async (values, { resetForm }) => {
    setSaving(true);
    try {
      await addDoc(collection(db, "brokers"), {
        brokerName: values.brokerName.trim(), phone: values.phone,
        countryCode: values.countryCode || "+91", remark: values.remark?.trim() || "",
        entryDate: values.entryDate || getTodayDate(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        createdBy: currentUser?.uid || null, createdByEmail: currentUser?.email || null,
      });
      notify("✅ Broker added!"); resetForm(); setSelectedCountryCode("+91");
    } catch { notify("❌ Error adding broker.", "error"); } finally { setSaving(false); }
  };

  const handleUpdate = async (values, { resetForm }) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "brokers", editingBrokerId), {
        brokerName: values.brokerName.trim(), phone: values.phone,
        countryCode: values.countryCode || "+91", remark: values.remark?.trim() || "",
        entryDate: values.entryDate || getTodayDate(),
        updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || null, updatedByEmail: currentUser?.email || null,
      });
      notify("✅ Broker updated!"); resetForm();
      setEditingBrokerId(null); setEditingBrokerData(null); setSelectedCountryCode("+91");
    } catch { notify("❌ Error updating.", "error"); } finally { setSaving(false); }
  };

  const handleEdit = (b) => { setEditingBrokerId(b.id); setEditingBrokerData(b); setSelectedCountryCode(b.countryCode || "+91"); formRef.current?.scrollIntoView({ behavior: "smooth" }); };
  const cancelEdit = () => { setEditingBrokerId(null); setEditingBrokerData(null); setSelectedCountryCode("+91"); };
  const showDeleteModal = (b) => { if (!isAdmin) { notify("❌ Admin only!", "error"); return; } setBrokerToDelete(b); setShowDeleteConfirm(true); };

  const handleDelete = async () => {
    if (!brokerToDelete || !isAdmin) return;
    setDeleting(true); setDeletingBrokerId(brokerToDelete.id);
    try {
      await deleteDoc(doc(db, "brokers", brokerToDelete.id));
      notify("🗑️ Deleted!"); setShowDeleteConfirm(false); setBrokerToDelete(null);
      if (selectedBrokerId === brokerToDelete.id) setSelectedBrokerId(null);
    } catch { notify("❌ Error.", "error"); } finally { setDeleting(false); setDeletingBrokerId(null); }
  };

  /* ═══════════════════════════════════════
     ADVANCED EXCEL EXPORT — MULTIPLE SHEETS
  ═══════════════════════════════════════ */
  const exportExcel = () => {
    if (!filteredBrokers.length) { notify("❌ No data!", "error"); return; }

    const wb = XLSX.utils.book_new();

    /* ── Sheet 1: Broker Summary ── */
    const summaryData = filteredBrokers.map((b, i) => {
      const st = brokerStatsMap[b.id] || {};
      return {
        "S.No": i + 1,
        "Broker Name": b.brokerName || "",
        "Phone": `${b.countryCode || "+91"} ${b.phone || ""}`,
        "Entry Date": formatEntryDateDisplay(b.entryDate),
        "Remark": b.remark || "",
        "Total Customers": st.visits || 0,
        "Bookings": st.booked || 0,
        "Hot Leads": st.hot || 0,
        "Warm Leads": st.warm || 0,
        "Cold Leads": st.cold || 0,
        "Conversion %": st.conversion ? `${st.conversion}%` : "0%",
        "Last Visit": st.lastVisitAt ? formatDate(st.lastVisitAt) : "No Visits",
        "Status": (st.visits || 0) >= 10 ? "🏆 Elite" : (st.visits || 0) >= 5 ? "⭐ Pro" : (st.visits || 0) >= 1 ? "Active" : "New",
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1["!cols"] = [
      { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 30 },
      { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 },
      { wch: 13 }, { wch: 14 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Broker Summary");

    /* ── Sheet 2: All Customer Visits ── */
    const allVisitsData = [];
    let serial = 0;
    filteredBrokers.forEach((b) => {
      const visits = brokerVisitMap[b.id] || [];
      visits.forEach((v) => {
        serial++;
        allVisitsData.push({
          "S.No": serial,
          "Broker Name": b.brokerName || "",
          "Broker Phone": `${b.countryCode || "+91"} ${b.phone || ""}`,
          "Customer Name": v.visitor?.name || "Unknown",
          "Customer Phone": `${v.visitor?.countryCode || "+91"} ${v.visitor?.phone || "N/A"}`,
          "Customer Location": v.visitor?.location || "—",
          "Visit Date": formatDate(v.visitAt),
          "Visit Time": formatTime(v.visitAt),
          "Lead Quality": v.leadQuality || "—",
          "Booking Status": v.bookingStatus === "Booked" ? "✅ Booked" : "❌ Not Booked",
          "Property Layout": v.propertyLayout?.join(", ") || "—",
        });
      });
    });
    if (allVisitsData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(allVisitsData);
      ws2["!cols"] = [
        { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
        { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, "All Customer Visits");
    }

    /* ── Sheet 3: Broker Performance Ranking ── */
    const rankData = filteredBrokers
      .map((b) => {
        const st = brokerStatsMap[b.id] || {};
        return { broker: b, st };
      })
      .sort((a, b) => (b.st.visits || 0) - (a.st.visits || 0))
      .map((item, i) => ({
        "Rank": i + 1,
        "Broker Name": item.broker.brokerName || "",
        "Phone": `${item.broker.countryCode || "+91"} ${item.broker.phone || ""}`,
        "Total Customers": item.st.visits || 0,
        "Total Bookings": item.st.booked || 0,
        "Hot Leads": item.st.hot || 0,
        "Warm Leads": item.st.warm || 0,
        "Cold Leads": item.st.cold || 0,
        "Conversion Rate": item.st.conversion ? `${item.st.conversion}%` : "0%",
        "Performance Tier": (item.st.visits || 0) >= 10 ? "🏆 Elite" : (item.st.visits || 0) >= 5 ? "⭐ Pro" : (item.st.visits || 0) >= 1 ? "Active" : "New",
        "Last Customer Visit": item.st.lastVisitAt ? formatDate(item.st.lastVisitAt) : "—",
        "Entry Date": formatEntryDateDisplay(item.broker.entryDate),
      }));
    const ws3 = XLSX.utils.json_to_sheet(rankData);
    ws3["!cols"] = [
      { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 14 },
      { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, "Performance Ranking");

    /* ── Sheet 4: Monthly Analytics ── */
    const monthMap = {};
    siteVisits.forEach((v) => {
      const d = toJsDate(v.visitAt);
      if (!d) return;
      const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!monthMap[key]) monthMap[key] = { visits: 0, booked: 0, hot: 0, warm: 0, cold: 0 };
      monthMap[key].visits++;
      if (v.bookingStatus === "Booked") monthMap[key].booked++;
      if (v.leadQuality === "Hot") monthMap[key].hot++;
      if (v.leadQuality === "Warm") monthMap[key].warm++;
      if (v.leadQuality === "Cold") monthMap[key].cold++;
    });
    const monthlyData = Object.entries(monthMap).map(([month, d]) => ({
      "Month": month,
      "Total Visits": d.visits,
      "Bookings": d.booked,
      "Hot Leads": d.hot,
      "Warm Leads": d.warm,
      "Cold Leads": d.cold,
      "Conversion Rate": d.visits > 0 ? `${((d.booked / d.visits) * 100).toFixed(1)}%` : "0%",
    }));
    if (monthlyData.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(monthlyData);
      ws4["!cols"] = [
        { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws4, "Monthly Analytics");
    }

    /* ── Sheet 5: Lead Quality Breakdown Per Broker ── */
    const leadBreakdownData = filteredBrokers.map((b, i) => {
      const st = brokerStatsMap[b.id] || {};
      const total = st.visits || 0;
      return {
        "S.No": i + 1,
        "Broker Name": b.brokerName || "",
        "Total Customers": total,
        "🔥 Hot": st.hot || 0,
        "⚡ Warm": st.warm || 0,
        "❄️ Cold": st.cold || 0,
        "Hot %": total > 0 ? `${((st.hot / total) * 100).toFixed(1)}%` : "0%",
        "Warm %": total > 0 ? `${((st.warm / total) * 100).toFixed(1)}%` : "0%",
        "Cold %": total > 0 ? `${((st.cold / total) * 100).toFixed(1)}%` : "0%",
        "✅ Booked": st.booked || 0,
        "Conversion %": st.conversion ? `${st.conversion}%` : "0%",
      };
    });
    const ws5 = XLSX.utils.json_to_sheet(leadBreakdownData);
    ws5["!cols"] = [
      { wch: 5 }, { wch: 22 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 13 },
    ];
    XLSX.utils.book_append_sheet(wb, ws5, "Lead Breakdown");

    /* ── Sheet 6: Dashboard Overview ── */
    const overviewData = [
      { Metric: "Report Generated", Value: new Date().toLocaleString("en-IN") },
      { Metric: "Generated By", Value: currentUser?.email || "N/A" },
      { Metric: "", Value: "" },
      { Metric: "Total Registered Brokers", Value: analytics.totalBrokers },
      { Metric: "Active Brokers (with visits)", Value: analytics.activeBrokers },
      { Metric: "Inactive Brokers (no visits)", Value: analytics.totalBrokers - analytics.activeBrokers },
      { Metric: "", Value: "" },
      { Metric: "Total Customers Brought", Value: analytics.totalVisits },
      { Metric: "Total Bookings Done", Value: analytics.totalBookings },
      { Metric: "Overall Conversion Rate", Value: `${analytics.conversionRate}%` },
      { Metric: "", Value: "" },
      { Metric: "Total Hot Leads", Value: siteVisits.filter((v) => v.leadQuality === "Hot").length },
      { Metric: "Total Warm Leads", Value: siteVisits.filter((v) => v.leadQuality === "Warm").length },
      { Metric: "Total Cold Leads", Value: siteVisits.filter((v) => v.leadQuality === "Cold").length },
      { Metric: "", Value: "" },
      { Metric: "Avg. Customers per Broker", Value: analytics.activeBrokers > 0 ? (analytics.totalVisits / analytics.activeBrokers).toFixed(1) : "0" },
      { Metric: "Avg. Bookings per Broker", Value: analytics.activeBrokers > 0 ? (analytics.totalBookings / analytics.activeBrokers).toFixed(1) : "0" },
    ];
    const ws6 = XLSX.utils.json_to_sheet(overviewData);
    ws6["!cols"] = [{ wch: 32 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws6, "Dashboard Overview");

    /* ── Sheet 7: Booked Customers Only ── */
    const bookedOnly = [];
    let bSerial = 0;
    filteredBrokers.forEach((b) => {
      const visits = (brokerVisitMap[b.id] || []).filter((v) => v.bookingStatus === "Booked");
      visits.forEach((v) => {
        bSerial++;
        bookedOnly.push({
          "S.No": bSerial,
          "Broker Name": b.brokerName || "",
          "Broker Phone": `${b.countryCode || "+91"} ${b.phone || ""}`,
          "Customer Name": v.visitor?.name || "Unknown",
          "Customer Phone": `${v.visitor?.countryCode || "+91"} ${v.visitor?.phone || "N/A"}`,
          "Location": v.visitor?.location || "—",
          "Visit Date": formatDate(v.visitAt),
          "Lead Quality": v.leadQuality || "—",
          "Property Layout": v.propertyLayout?.join(", ") || "—",
        });
      });
    });
    if (bookedOnly.length > 0) {
      const ws7 = XLSX.utils.json_to_sheet(bookedOnly);
      ws7["!cols"] = [
        { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
        { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws7, "Booked Customers");
    }

    XLSX.writeFile(wb, `Broker_Analytics_Report_${getTodayDate()}.xlsx`);
    notify("📥 Excel report with 7 sheets downloaded!");
  };

  const handleSort = (f) => { if (sortBy === f) setSortOrder((p) => (p === "asc" ? "desc" : "asc")); else { setSortBy(f); setSortOrder("asc"); } };
  const hasFilters = searchTerm || nameFilter || dateFilter;

  const getPageNums = () => {
    const p = [];
    if (totalPages <= 5) { for (let i = 1; i <= totalPages; i++) p.push(i); }
    else if (currentPage <= 3) p.push(1, 2, 3, 4, "...", totalPages);
    else if (currentPage >= totalPages - 2) p.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    else p.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    return p;
  };

  return (
    <div className="bex-root">
      {/* HEADER */}
      <div className="bex-header">
        <div className="bex-header-left">
          <div className="bex-header-icon"><FaHandshake /></div>
          <div>
            <h1>Broker Management</h1>
            <p>Track broker performance & customer history</p>
          </div>
        </div>
        <div className="bex-header-right">
          {isAdmin && <div className="bex-admin-tag"><FaLock /> Admin</div>}
          <div className="bex-date-tag"><FaClock /> {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </div>

      {showMsg && (
        <div className={`bex-notif ${msgType}`}>
          <span>{msg}</span>
          <button onClick={() => setShowMsg(false)}><FaTimes /></button>
        </div>
      )}

      {showDeleteConfirm && brokerToDelete && isAdmin && (
        <div className="bex-overlay">
          <div className="bex-modal">
            <div className="bex-modal-head">
              <h3>⚠️ Confirm Delete</h3>
              <button onClick={() => setShowDeleteConfirm(false)}><FaTimes /></button>
            </div>
            <div className="bex-modal-body">
              <p>Delete this broker permanently?</p>
              <div className="bex-del-preview">
                <p><strong>Name:</strong> {brokerToDelete.brokerName}</p>
                <p><strong>Phone:</strong> {formatPhoneDisplay(brokerToDelete.phone, brokerToDelete.countryCode)}</p>
                <p><strong>Customers:</strong> {brokerStatsMap[brokerToDelete.id]?.visits || 0}</p>
              </div>
              <div className="bex-del-warn">This action cannot be undone.</div>
            </div>
            <div className="bex-modal-foot">
              <button className="bex-btn bex-btn-light" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="bex-btn bex-btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* FORM */}
      <div className="bex-section" ref={formRef}>
        <div className="bex-form-wrap">
          <Formik
            initialValues={editingBrokerId ? getEditVals(editingBrokerData) : initialValues}
            validationSchema={createSchema(selectedCountryCode)}
            onSubmit={editingBrokerId ? handleUpdate : handleSubmit}
            enableReinitialize
          >
            {({ values, setFieldValue, errors, touched, resetForm }) => (
              <Form className="bex-form-card">
                <div className="bex-form-header">
                  <div className="bex-form-title">
                    <span className={`bex-badge ${editingBrokerId ? "edit" : "new"}`}>{editingBrokerId ? "Edit" : "Add"}</span>
                    <h3>{editingBrokerId ? "Edit Broker" : "Add New Broker"}</h3>
                  </div>
                  {editingBrokerId && <button type="button" className="bex-close-btn" onClick={() => { cancelEdit(); resetForm(); }}><FaTimes /></button>}
                </div>
                <div className="bex-form-grid">
                  <div className="bex-field">
                    <label><FaUser /> Broker Name *</label>
                    <Field name="brokerName" type="text" placeholder="Full name" className={errors.brokerName && touched.brokerName ? "err" : ""} />
                    <ErrorMessage name="brokerName" component="div" className="bex-error" />
                  </div>
                  <div className="bex-field">
                    <label><FaPhone /> Phone *</label>
                    <div className="bex-phone-row">
                      <SearchableCountryDropdown value={values.countryCode || "+91"} onChange={(c) => { setFieldValue("countryCode", c); setSelectedCountryCode(c); }} />
                      <Field type="tel" name="phone" placeholder="Phone" className={errors.phone && touched.phone ? "err" : ""}
                        onChange={(e) => { const v = getPhoneValidation(values.countryCode || "+91"); setFieldValue("phone", e.target.value.replace(/\D/g, "").slice(0, v.maxLength)); }}
                        value={values.phone || ""} />
                    </div>
                    <ErrorMessage name="phone" component="div" className="bex-error" />
                  </div>
                  <div className="bex-field">
                    <label><FaCalendarAlt /> Entry Date *</label>
                    <Field type="date" name="entryDate" className={errors.entryDate && touched.entryDate ? "err" : ""} />
                    <ErrorMessage name="entryDate" component="div" className="bex-error" />
                  </div>
                  <div className="bex-field">
                    <label><FaComment /> Remark</label>
                    <Field as="textarea" name="remark" rows="2" placeholder="Notes..." />
                  </div>
                </div>
                <div className="bex-form-actions">
                  {editingBrokerId && <button type="button" className="bex-btn bex-btn-light" onClick={() => { cancelEdit(); resetForm(); }}>Cancel</button>}
                  <button type="submit" className="bex-btn bex-btn-primary" disabled={saving}>{saving ? "Saving..." : editingBrokerId ? "Update" : "Add Broker"}</button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="bex-section">
        <div className="bex-sum-grid">
          <SummaryCard icon={FaUserFriends} title="Total Brokers" value={analytics.totalBrokers} subtitle="Registered" color="blue" />
          <SummaryCard icon={FaCheckCircle} title="Active Brokers" value={analytics.activeBrokers} subtitle="With customers" color="green" />
          <SummaryCard icon={FaEye} title="Total Customers" value={analytics.totalVisits} subtitle="All brokers" color="purple" />
          <SummaryCard icon={FaTrophy} title="Bookings" value={analytics.totalBookings} subtitle={`${analytics.conversionRate}% conversion`} color="gold" />
        </div>
      </div>

      {/* CHARTS */}
      {(analytics.topChart.length > 0 || analytics.monthly.length > 0) && (
        <div className="bex-section">
          <div className="bex-chart-row">
            {analytics.topChart.length > 0 && (
              <div className="bex-chart-card">
                <div className="bex-chart-head"><h3><FaTrophy /> Top Brokers</h3></div>
                <div className="bex-chart-body">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={analytics.topChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="visits" name="Customers" fill="#1e2d5a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="bookings" name="Bookings" fill="#27694f" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {analytics.monthly.length > 0 && (
              <div className="bex-chart-card">
                <div className="bex-chart-head"><h3><FaChartLine /> Monthly Trend</h3></div>
                <div className="bex-chart-body">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={analytics.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="visits" name="Customers" stroke="#1e2d5a" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#c17f3e" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLE + HISTORY */}
      <div className="bex-section">
        <div className="bex-main-layout">
          <div className="bex-table-card">
            <div className="bex-table-top">
              <div className="bex-table-top-left">
                <h3><FaUser /> Broker List</h3>
                <span className="bex-count">{filteredBrokers.length}</span>
              </div>
              <div className="bex-table-top-right">
                <div className="bex-per-page">
                  <label>Show</label>
                  <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))}>
                    {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button className={`bex-icon-btn ${showFilters ? "active" : ""}`} onClick={() => setShowFilters((p) => !p)}>
                  <FaFilter />{hasFilters && <span className="bex-dot" />}
                </button>
                <button className="bex-btn bex-btn-export" onClick={exportExcel}><FaFileExcel /> Export</button>
              </div>
            </div>

            {showFilters && (
              <div className="bex-filters">
                <div className="bex-filters-grid">
                  <div className="bex-filter-item">
                    <label>Search</label>
                    <div className="bex-search-wrap">
                      <FaSearch />
                      <input type="text" placeholder="Name / phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      {searchTerm && <button onClick={() => setSearchTerm("")}><FaTimes /></button>}
                    </div>
                  </div>
                  <div className="bex-filter-item">
                    <label>Broker</label>
                    <select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)}>
                      <option value="">All</option>
                      {uniqueNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="bex-filter-item">
                    <label>Date</label>
                    <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                  </div>
                  <div className="bex-filter-item">
                    <label>Sort By</label>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                      <option value="createdAt">Created</option>
                      <option value="entryDate">Entry Date</option>
                      <option value="brokerName">Name</option>
                      <option value="visits">Customers</option>
                      <option value="bookings">Bookings</option>
                      <option value="lastVisit">Last Visit</option>
                    </select>
                  </div>
                </div>
                {hasFilters && <button className="bex-clear-btn" onClick={() => { setSearchTerm(""); setNameFilter(""); setDateFilter(""); }}><FaTimes /> Clear</button>}
              </div>
            )}

            <div className="bex-result-bar">
              Showing <strong>{totalItems > 0 ? startIdx + 1 : 0}</strong> – <strong>{endIdx}</strong> of <strong>{totalItems}</strong>
            </div>

            {loading ? (
              <div className="bex-loading"><div className="bex-spinner" /><p>Loading...</p></div>
            ) : filteredBrokers.length === 0 ? (
              <div className="bex-empty"><div className="bex-empty-icon">📋</div><h3>No Brokers</h3><p>{hasFilters ? "Try changing filters." : "Add your first broker."}</p></div>
            ) : (
              <>
                <div className="bex-table-scroll">
                  <table className="bex-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="sortable" onClick={() => handleSort("brokerName")}>Broker {sortBy === "brokerName" && <span className="sort-ic">{sortOrder === "asc" ? <FaSortAlphaDown /> : <FaSortAlphaUp />}</span>}</th>
                        <th>Phone</th>
                        <th className="sortable" onClick={() => handleSort("visits")}>Customers {sortBy === "visits" && <span className="sort-ic">{sortOrder === "asc" ? <FaSortAmountDown /> : <FaSortAmountUp />}</span>}</th>
                        <th className="sortable" onClick={() => handleSort("bookings")}>Bookings {sortBy === "bookings" && <span className="sort-ic">{sortOrder === "asc" ? <FaSortAmountDown /> : <FaSortAmountUp />}</span>}</th>
                        <th>Conv.</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((b, idx) => {
                        const st = brokerStatsMap[b.id] || { visits: 0, booked: 0, conversion: "0.0" };
                        return (
                          <tr key={b.id} className={selectedBrokerId === b.id ? "selected-row" : ""} onClick={() => setSelectedBrokerId(b.id)}>
                            <td>{startIdx + idx + 1}</td>
                            <td>
                              <div className="bex-broker-cell">
                                <div className="bex-avatar">{(b.brokerName || "?")[0].toUpperCase()}</div>
                                <div>
                                  <div className="bex-b-name">{b.brokerName || "N/A"}</div>
                                  <div className="bex-b-date"><FaCalendarAlt /> {formatEntryDateDisplay(b.entryDate)}</div>
                                </div>
                              </div>
                            </td>
                            <td><a href={`tel:${b.countryCode || "+91"}${b.phone}`} className="bex-phone-link" onClick={(e) => e.stopPropagation()}><FaPhone /> {formatPhoneDisplay(b.phone, b.countryCode)}</a></td>
                            <td><span className="bex-pill visits"><FaUserFriends /> {st.visits}</span></td>
                            <td><span className="bex-pill bookings"><FaCheckCircle /> {st.booked}</span></td>
                            <td><span className="bex-pill conv">{st.conversion}%</span></td>
                            <td>
                              <div className="bex-actions" onClick={(e) => e.stopPropagation()}>
                                <button className="bex-act edit" onClick={() => handleEdit(b)} title="Edit"><FaEdit /></button>
                                <a href={`https://wa.me/${(b.countryCode || "+91").replace("+", "")}${b.phone || ""}`} target="_blank" rel="noopener noreferrer" className="bex-act wa" title="WhatsApp"><FaWhatsapp /></a>
                                {isAdmin && <button className="bex-act del" onClick={() => showDeleteModal(b)} disabled={deletingBrokerId === b.id} title="Delete"><FaTrash /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="bex-pagination">
                    <button className="bex-pg-btn" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><FaAngleDoubleLeft /></button>
                    <button className="bex-pg-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><FaChevronLeft /></button>
                    <div className="bex-pg-nums">
                      {getPageNums().map((p, i) => p === "..." ? <span key={i} className="bex-ellipsis">…</span> : <button key={p} className={`bex-pg-num ${currentPage === p ? "active" : ""}`} onClick={() => setCurrentPage(p)}>{p}</button>)}
                    </div>
                    <button className="bex-pg-btn" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><FaChevronRight /></button>
                    <button className="bex-pg-btn" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><FaAngleDoubleRight /></button>
                  </div>
                )}
              </>
            )}
          </div>

          <BrokerHistoryPanel
            broker={selectedBroker}
            visits={selectedVisits}
            stats={selectedStats}
            onEdit={() => selectedBroker && handleEdit(selectedBroker)}
            onClose={() => setSelectedBrokerId(null)}
          />
        </div>
      </div>
    </div>
  );
}

export default BrokerEntry;