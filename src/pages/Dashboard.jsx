import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Doughnut, Line } from "react-chartjs-2";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import styles from "./Dashboard.module.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

ChartJS.defaults.color = "#64748b";
ChartJS.defaults.font.family = "'Inter', 'Segoe UI', Roboto, Arial, sans-serif";

function Dashboard() {
  const [visits, setVisits] = useState([]);
  const [filteredVisits, setFilteredVisits] = useState([]);
  const [agents, setAgents] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [visitorCounts, setVisitorCounts] = useState({});

  const [activeTab, setActiveTab] = useState("overview");
  const [showFilters, setShowFilters] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [filterName, setFilterName] = useState("");
  const [showFilterSave, setShowFilterSave] = useState(false);

  // Day Detail Modal State
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDayVisits, setSelectedDayVisits] = useState([]);
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const modalRef = useRef(null);

  // Chart view states
  const [timelineView, setTimelineView] = useState("monthly");
  const [selectedChartMonth, setSelectedChartMonth] = useState(new Date().getMonth());
  const [selectedChartYear, setSelectedChartYear] = useState(new Date().getFullYear());

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedBroker, setSelectedBroker] = useState("");
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedLeadQuality, setSelectedLeadQuality] = useState("");
  const [selectedExistingClient, setSelectedExistingClient] = useState("");

  const tableSectionRef = useRef(null);
  const datePickerRef = useRef(null);
  const filtersSectionRef = useRef(null);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredVisits.slice(startIndex, endIndex);

  const countryCodes = [
    { code: "+91", country: "India", flag: "🇮🇳" },
    { code: "+1", country: "USA", flag: "🇺🇸" },
    { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
    { code: "+971", country: "UAE", flag: "🇦🇪" },
    { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
    { code: "+974", country: "Qatar", flag: "🇶🇦" },
    { code: "+968", country: "Oman", flag: "🇴🇲" },
    { code: "+973", country: "Bahrain", flag: "🇧🇭" },
    { code: "+965", country: "Kuwait", flag: "🇰🇼" },
    { code: "+61", country: "Australia", flag: "🇦🇺" },
    { code: "+92", country: "Pakistan", flag: "🇵🇰" },
    { code: "+880", country: "Bangladesh", flag: "🇧🇩" },
  ];

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const shortMonthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const getCountryByCode = (code) => {
    return countryCodes.find(c => c.code === code) || { code: "+91", country: "India", flag: "🇮🇳" };
  };

  const formatPhoneDisplay = (phone, countryCode) => {
    if (!phone) return "N/A";
    const country = getCountryByCode(countryCode || "+91");
    return `${country.flag} ${countryCode || "+91"} ${phone}`;
  };

  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp?.toDate) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return new Date(timestamp);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = getDateFromTimestamp(timestamp);
    if (!date) return "-";
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatShortDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = getDateFromTimestamp(timestamp);
    if (!date) return "-";
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
    });
  };

  // ============================================================
  // DAY CLICK HANDLER — Opens modal with customers for that day
  // ============================================================
  const handleDayClick = (dayIndex) => {
    const day = dayIndex + 1;
    const clickedDate = new Date(selectedChartYear, selectedChartMonth, day);

    const dayVisits = filteredVisits.filter((v) => {
      const rawDate = v.visitAt || v.createdAt;
      const visitDate = getDateFromTimestamp(rawDate);
      if (!visitDate) return false;
      return (
        visitDate.getDate() === day &&
        visitDate.getMonth() === selectedChartMonth &&
        visitDate.getFullYear() === selectedChartYear
      );
    });

    // Sort by time
    dayVisits.sort((a, b) => {
      const dateA = getDateFromTimestamp(a.visitAt || a.createdAt);
      const dateB = getDateFromTimestamp(b.visitAt || b.createdAt);
      return (dateA || 0) - (dateB || 0);
    });

    setSelectedDayVisits(dayVisits);
    setSelectedDayInfo({
      day,
      date: clickedDate,
      dateStr: clickedDate.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      count: dayVisits.length,
    });
    setModalSearchTerm("");
    setShowDayModal(true);
  };

  // Close modal on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowDayModal(false);
      }
    }
    if (showDayModal) {
      document.addEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [showDayModal]);

  // Filter modal visits by search
  const filteredModalVisits = selectedDayVisits.filter((v) => {
    if (!modalSearchTerm) return true;
    const term = modalSearchTerm.toLowerCase();
    return (
      v.visitor?.name?.toLowerCase().includes(term) ||
      v.visitor?.phone?.includes(modalSearchTerm) ||
      v.visitor?.email?.toLowerCase().includes(term) ||
      v.agent?.name?.toLowerCase().includes(term) ||
      v.channelPartner?.name?.toLowerCase().includes(term)
    );
  });

  // Export day visits to Excel
  const exportDayVisits = () => {
    const exportData = filteredModalVisits.map((v) => {
      const rawDate = v.visitAt || v.createdAt;
      const visitDate = getDateFromTimestamp(rawDate);
      return {
        "Time": visitDate ? visitDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : "-",
        "Visitor Name": v.visitor?.name || "-",
        "Phone": v.visitor?.phone ? `${v.visitor?.countryCode || "+91"} ${v.visitor.phone}` : "-",
        "Email": v.visitor?.email || "-",
        "Location": v.visitor?.location || "-",
        "Property Types": Array.isArray(v.propertyTypes) ? v.propertyTypes.join(", ") : v.propertyTypes || "-",
        "Sales Executive": v.agent?.name || "-",
        "Channel Partner": v.channelPartner?.name || "-",
        "Lead Quality": v.leadQuality || "-",
        "Existing Client": v.existingClient || "-",
        "Booking Status": v.bookingStatus || "-",
        "Remarks": v.remarks || "-",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Day Visits");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(data, `Visits_${selectedDayInfo?.dateStr?.replace(/,/g, "").replace(/ /g, "_")}.xlsx`);
  };

  // visitorCounts useEffect
  useEffect(() => {
    const counts = {};
    visits.forEach(visit => {
      const phone = visit.visitor?.phone;
      if (phone) {
        const rawDate = visit.visitAt || visit.createdAt || null;
        const visitDate = getDateFromTimestamp(rawDate);
        if (!counts[phone]) {
          counts[phone] = {
            count: 1,
            name: visit.visitor?.name || "",
            visitDates: visitDate ? [visitDate] : [],
          };
        } else {
          counts[phone].count++;
          if (visitDate) counts[phone].visitDates.push(visitDate);
        }
      }
    });
    setVisitorCounts(counts);
  }, [visits]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedAgent, selectedBroker, selectedPropertyType,
    dateRange, customDateRange, searchTerm,
    selectedLeadQuality, selectedExistingClient,
  ]);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePrevious = () => { if (currentPage > 1) handlePageChange(currentPage - 1); };
  const handleNext = () => { if (currentPage < totalPages) handlePageChange(currentPage + 1); };

  const downloadExcel = async () => {
    try {
      setExportLoading(true);
      const exportData = filteredVisits.map((v) => {
        const rawDate = v.visitAt || v.createdAt || null;
        const visitDate = getDateFromTimestamp(rawDate);
        return {
          "Date & Time": visitDate ? formatDate(visitDate) : "-",
          "Visitor Name": v.visitor?.name || "-",
          "Country Code": v.visitor?.countryCode || "+91",
          Phone: v.visitor?.phone || "-",
          Email: v.visitor?.email || "-",
          Location: v.visitor?.location || "-",
          "Property Types": Array.isArray(v.propertyTypes)
            ? v.propertyTypes.join(", ")
            : v.propertyTypes || "-",
          "Sales Executive": v.agent?.name || "-",
          "Channel Partner": v.channelPartner?.name || "-",
          "Channel Partner Phone": v.channelPartner?.phone || "-",
          "Referral Source": Array.isArray(v.referralSource)
            ? v.referralSource.join(", ")
            : v.referralSource || "-",
          "Lead Quality": v.leadQuality || "-",
          "Existing Client": v.existingClient || "-",
          "Booking Status": v.bookingStatus || "-",
          Remarks: v.remarks || "-",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Site Visits");

      const colWidths = [
        { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 15 },
        { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
        { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 30 },
      ];
      worksheet["!cols"] = colWidths;

      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const data = new Blob([excelBuffer], { type: "application/octet-stream" });
      saveAs(data, `SiteVisits_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setExportLoading(false);
    } catch (error) {
      console.error("Excel export error:", error);
      setExportLoading(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target) &&
        !event.target.classList.contains(styles.dateToggle)
      ) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "siteVisits"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const visitsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setVisits(visitsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching visits:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const uniqueAgents = [...new Set(visits.map((v) => v.agent?.name).filter(Boolean))].sort();
    setAgents(uniqueAgents);
    const uniqueBrokers = [...new Set(visits.map((v) => v.channelPartner?.name).filter(Boolean))].sort();
    setBrokers(uniqueBrokers);
  }, [visits]);

  useEffect(() => {
    let filtered = [...visits];
    setFilterLoading(true);

    if (selectedAgent) filtered = filtered.filter((v) => v.agent?.name === selectedAgent);
    if (selectedBroker) filtered = filtered.filter((v) => v.channelPartner?.name === selectedBroker);

    if (selectedPropertyType) {
      filtered = filtered.filter((v) => {
        if (Array.isArray(v.propertyTypes)) return v.propertyTypes.includes(selectedPropertyType);
        return v.propertyType === selectedPropertyType;
      });
    }

    if (selectedLeadQuality) filtered = filtered.filter((v) => v.leadQuality === selectedLeadQuality);
    if (selectedExistingClient) filtered = filtered.filter((v) => v.existingClient === selectedExistingClient);

    if (dateRange === "custom" && customDateRange.startDate && customDateRange.endDate) {
      const start = new Date(customDateRange.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customDateRange.endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((v) => {
        const visitDate = getDateFromTimestamp(v.visitAt || v.createdAt);
        if (!visitDate) return false;
        return visitDate >= start && visitDate <= end;
      });
    } else if (dateRange !== "all" && dateRange !== "custom") {
      const now = new Date();
      let startDate;
      switch (dateRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "yesterday":
          const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          filtered = filtered.filter((v) => {
            const visitDate = getDateFromTimestamp(v.visitAt || v.createdAt);
            if (!visitDate) return false;
            return visitDate >= yStart && visitDate < yEnd;
          });
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), quarter * 3, 1);
          break;
        default:
          startDate = null;
      }

      if (startDate && dateRange !== "yesterday") {
        filtered = filtered.filter((v) => {
          const visitDate = getDateFromTimestamp(v.visitAt || v.createdAt);
          if (!visitDate) return false;
          return visitDate >= startDate;
        });
      }
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.visitor?.name?.toLowerCase().includes(term) ||
          v.visitor?.phone?.includes(searchTerm) ||
          v.visitor?.email?.toLowerCase().includes(term) ||
          v.agent?.name?.toLowerCase().includes(term) ||
          v.channelPartner?.name?.toLowerCase().includes(term) ||
          v.existingClient?.toLowerCase().includes(term) ||
          (Array.isArray(v.propertyTypes) && v.propertyTypes.some((p) => p.toLowerCase().includes(term))) ||
          (Array.isArray(v.referralSource) && v.referralSource.some((r) => r.toLowerCase().includes(term)))
      );
    }

    setTimeout(() => {
      setFilteredVisits(filtered);
      setFilterLoading(false);
    }, 300);
  }, [
    visits, selectedAgent, selectedBroker, selectedPropertyType,
    dateRange, customDateRange, searchTerm,
    selectedLeadQuality, selectedExistingClient,
  ]);

  const saveCurrentFilters = () => {
    if (!filterName.trim()) return;
    const newFilter = {
      id: Date.now(),
      name: filterName,
      filters: {
        agent: selectedAgent, broker: selectedBroker,
        propertyType: selectedPropertyType, leadQuality: selectedLeadQuality,
        existingClient: selectedExistingClient, dateRange,
        customDateRange, searchTerm,
      },
    };
    setSavedFilters([...savedFilters, newFilter]);
    setFilterName("");
    setShowFilterSave(false);
  };

  const applySavedFilter = (filter) => {
    setSelectedAgent(filter.filters.agent || "");
    setSelectedBroker(filter.filters.broker || "");
    setSelectedPropertyType(filter.filters.propertyType || "");
    setSelectedLeadQuality(filter.filters.leadQuality || "");
    setSelectedExistingClient(filter.filters.existingClient || "");
    setDateRange(filter.filters.dateRange || "all");
    setCustomDateRange(filter.filters.customDateRange || { startDate: null, endDate: null });
    setSearchTerm(filter.filters.searchTerm || "");
  };

  const deleteSavedFilter = (id) => setSavedFilters(savedFilters.filter(f => f.id !== id));

  const clearFilters = () => {
    setSelectedAgent(""); setSelectedBroker(""); setSelectedPropertyType("");
    setSelectedLeadQuality(""); setSelectedExistingClient("");
    setDateRange("all"); setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
  };

  const chartColors = [
    "#2563eb", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6",
    "#f97316", "#84cc16", "#a855f7", "#0891b2",
  ];

  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { padding: 20, usePointStyle: true, boxWidth: 10, boxHeight: 10 },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#fff",
        bodyColor: "#94a3b8",
        bodySpacing: 6,
        padding: 14,
        boxPadding: 6,
        usePointStyle: true,
        cornerRadius: 10,
        displayColors: true,
        borderColor: "rgba(148, 163, 184, 0.2)",
        borderWidth: 1,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: ${context.parsed.y ?? context.parsed} visits`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { padding: 8 } },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(241, 245, 249, 0.8)", drawBorder: false },
        ticks: { precision: 0, padding: 10 },
      },
    },
    elements: {
      line: { tension: 0.4 },
      point: { radius: 5, hitRadius: 12, hoverRadius: 7, borderWidth: 2 },
      bar: { borderRadius: 6 },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          padding: 20,
          usePointStyle: true,
          font: { size: 12 },
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
              return data.labels.map((label, i) => ({
                text: `${label}: ${data.datasets[0].data[i]} (${total > 0 ? Math.round((data.datasets[0].data[i] / total) * 100) : 0}%)`,
                fillStyle: data.datasets[0].backgroundColor[i],
                strokeStyle: "#fff",
                lineWidth: 2,
                hidden: false,
                index: i,
              }));
            }
            return [];
          },
        },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#fff",
        bodyColor: "#94a3b8",
        padding: 14,
        usePointStyle: true,
        cornerRadius: 10,
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
            return ` ${context.label}: ${context.parsed} visits (${percentage}%)`;
          },
        },
      },
    },
    cutout: "65%",
  };

  const getTimelineData = () => {
    const sourceVisits = filteredVisits;

    if (timelineView === "monthly") {
      const monthlyCounts = Array(12).fill(0);
      sourceVisits.forEach((v) => {
        const rawDate = v.visitAt || v.createdAt;
        const visitDate = getDateFromTimestamp(rawDate);
        if (!visitDate) return;
        if (visitDate.getFullYear() === selectedChartYear) {
          monthlyCounts[visitDate.getMonth()]++;
        }
      });

      return {
        labels: shortMonthNames,
        datasets: [{
          label: `Monthly Visits (${selectedChartYear})`,
          data: monthlyCounts,
          backgroundColor: monthlyCounts.map((_, i) =>
            i === selectedChartMonth ? "#2563eb" : "rgba(37, 99, 235, 0.3)"
          ),
          borderColor: monthlyCounts.map((_, i) =>
            i === selectedChartMonth ? "#1d4ed8" : "rgba(37, 99, 235, 0.5)"
          ),
          borderWidth: 2,
          borderRadius: 8,
          maxBarThickness: 50,
        }],
      };
    }

    if (timelineView === "daily") {
      const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();
      const dailyCounts = Array(daysInMonth).fill(0);

      const dailyLabels = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(selectedChartYear, selectedChartMonth, i + 1);
        return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
      });

      sourceVisits.forEach((v) => {
        const rawDate = v.visitAt || v.createdAt;
        const visitDate = getDateFromTimestamp(rawDate);
        if (!visitDate) return;
        if (
          visitDate.getMonth() === selectedChartMonth &&
          visitDate.getFullYear() === selectedChartYear
        ) {
          dailyCounts[visitDate.getDate() - 1]++;
        }
      });

      const maxCount = Math.max(...dailyCounts, 0);

      return {
        labels: dailyLabels,
        datasets: [{
          label: `Daily Visits — ${monthNames[selectedChartMonth]} ${selectedChartYear}`,
          data: dailyCounts,
          borderColor: "#2563eb",
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(37, 99, 235, 0.15)";
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, "rgba(37, 99, 235, 0.4)");
            gradient.addColorStop(1, "rgba(37, 99, 235, 0.02)");
            return gradient;
          },
          fill: true,
          borderWidth: 2.5,
          pointBackgroundColor: dailyCounts.map((c) =>
            c === maxCount && maxCount > 0 ? "#f59e0b" : "#2563eb"
          ),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: dailyCounts.map((c) => (c > 0 ? 5 : 3)),
          pointHoverRadius: 8,
          tension: 0.4,
        }],
      };
    }

    if (timelineView === "weekly") {
      const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();
      const weeks = [];
      const weekLabels = [];
      let weekNum = 1;

      for (let day = 1; day <= daysInMonth; day += 7) {
        const endDay = Math.min(day + 6, daysInMonth);
        weeks.push({ start: day, end: endDay });
        weekLabels.push(`Week ${weekNum}\n(${day}–${endDay} ${shortMonthNames[selectedChartMonth]})`);
        weekNum++;
      }

      const weeklyCounts = Array(weeks.length).fill(0);

      sourceVisits.forEach((v) => {
        const rawDate = v.visitAt || v.createdAt;
        const visitDate = getDateFromTimestamp(rawDate);
        if (!visitDate) return;
        if (
          visitDate.getMonth() === selectedChartMonth &&
          visitDate.getFullYear() === selectedChartYear
        ) {
          const day = visitDate.getDate();
          const weekIndex = weeks.findIndex(w => day >= w.start && day <= w.end);
          if (weekIndex !== -1) weeklyCounts[weekIndex]++;
        }
      });

      return {
        labels: weekLabels,
        datasets: [{
          label: `Weekly Visits — ${monthNames[selectedChartMonth]} ${selectedChartYear}`,
          data: weeklyCounts,
          backgroundColor: weeklyCounts.map((_, i) => chartColors[i % chartColors.length]),
          borderColor: weeklyCounts.map((_, i) => chartColors[i % chartColors.length]),
          borderWidth: 2,
          borderRadius: 8,
          maxBarThickness: 60,
        }],
      };
    }

    if (timelineView === "yearly") {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
      const yearlyCounts = years.map(year => {
        return sourceVisits.filter(v => {
          const rawDate = v.visitAt || v.createdAt;
          const visitDate = getDateFromTimestamp(rawDate);
          return visitDate && visitDate.getFullYear() === year;
        }).length;
      });

      return {
        labels: years.map(String),
        datasets: [{
          label: "Yearly Visits",
          data: yearlyCounts,
          backgroundColor: years.map((y) =>
            y === selectedChartYear ? "#2563eb" : "rgba(37, 99, 235, 0.3)"
          ),
          borderColor: years.map((y) =>
            y === selectedChartYear ? "#1d4ed8" : "rgba(37, 99, 235, 0.5)"
          ),
          borderWidth: 2,
          borderRadius: 8,
          maxBarThickness: 60,
        }],
      };
    }

    return { labels: [], datasets: [] };
  };

  const getDailyChartOptions = () => {
    const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          handleDayClick(index);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          titleColor: "#fff",
          bodyColor: "#94a3b8",
          bodySpacing: 6,
          padding: 14,
          boxPadding: 6,
          usePointStyle: true,
          cornerRadius: 10,
          displayColors: false,
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              const d = new Date(selectedChartYear, selectedChartMonth, idx + 1);
              return d.toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });
            },
            label: (context) => {
              const val = context.parsed.y;
              return val === 0 ? "  No visits" : `  Visits: ${val}`;
            },
            afterLabel: (context) => {
              const data = context.dataset.data;
              const max = Math.max(...data);
              if (context.parsed.y === max && max > 0) {
                return "  🏆 Peak day this month";
              }
              if (context.parsed.y > 0) {
                return "  👆 Click to view customers";
              }
              return "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            padding: 6,
            font: { size: 11 },
            maxRotation: daysInMonth > 15 ? 45 : 0,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: daysInMonth > 20 ? 16 : daysInMonth,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(241, 245, 249, 0.8)", drawBorder: false },
          ticks: { precision: 0, padding: 10, stepSize: 1 },
        },
      },
      elements: {
        line: { tension: 0.4 },
        point: { radius: 5, hitRadius: 14, hoverRadius: 8, borderWidth: 2 },
      },
    };
  };

  const getDailyStats = () => {
    const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();
    const dailyCounts = Array(daysInMonth).fill(0);

    filteredVisits.forEach((v) => {
      const rawDate = v.visitAt || v.createdAt;
      const visitDate = getDateFromTimestamp(rawDate);
      if (!visitDate) return;
      if (
        visitDate.getMonth() === selectedChartMonth &&
        visitDate.getFullYear() === selectedChartYear
      ) {
        dailyCounts[visitDate.getDate() - 1]++;
      }
    });

    const total = dailyCounts.reduce((a, b) => a + b, 0);
    const maxCount = Math.max(...dailyCounts, 0);
    const maxDay = dailyCounts.indexOf(maxCount) + 1;
    const activeDays = dailyCounts.filter(c => c > 0).length;
    const avgPerActiveDay = activeDays > 0 ? (total / activeDays).toFixed(1) : 0;
    const avgPerDay = (total / daysInMonth).toFixed(1);

    return { total, maxCount, maxDay, activeDays, avgPerActiveDay, avgPerDay, dailyCounts };
  };

  const getSelectedMonthCount = () => {
    return filteredVisits.filter(v => {
      const rawDate = v.visitAt || v.createdAt;
      const visitDate = getDateFromTimestamp(rawDate);
      return visitDate &&
        visitDate.getMonth() === selectedChartMonth &&
        visitDate.getFullYear() === selectedChartYear;
    }).length;
  };

  const getAgentWiseData = () => {
    const agentCounts = {};
    filteredVisits.forEach((v) => {
      const agent = v.agent?.name || "Unknown";
      agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    });

    const sortedAgents = Object.keys(agentCounts).sort((a, b) => agentCounts[b] - agentCounts[a]);
    const topAgents = sortedAgents.slice(0, 8);
    const topCounts = topAgents.map(agent => agentCounts[agent]);

    if (sortedAgents.length > 8) {
      const othersCount = sortedAgents.slice(8).reduce((sum, agent) => sum + agentCounts[agent], 0);
      topAgents.push("Others");
      topCounts.push(othersCount);
    }

    return {
      labels: topAgents,
      datasets: [{
        label: "Visits",
        data: topCounts,
        backgroundColor: topAgents.map((_, i) => chartColors[i % chartColors.length]),
        borderColor: topAgents.map((_, i) => chartColors[i % chartColors.length]),
        borderWidth: 2,
        borderRadius: 8,
        maxBarThickness: 45,
      }],
    };
  };

  const getPropertyTypeData = () => {
    const typeCounts = {};
    filteredVisits.forEach((v) => {
      if (Array.isArray(v.propertyTypes)) {
        v.propertyTypes.forEach((type) => { typeCounts[type] = (typeCounts[type] || 0) + 1; });
      } else if (v.propertyType) {
        typeCounts[v.propertyType] = (typeCounts[v.propertyType] || 0) + 1;
      } else {
        typeCounts["Not Specified"] = (typeCounts["Not Specified"] || 0) + 1;
      }
    });
    return {
      labels: Object.keys(typeCounts),
      datasets: [{
        label: "Property Types",
        data: Object.values(typeCounts),
        backgroundColor: Object.keys(typeCounts).map((_, i) => chartColors[i % chartColors.length]),
        borderWidth: 2,
        borderColor: "#fff",
        hoverOffset: 12,
      }],
    };
  };

  const getLeadQualityData = () => {
    const qualityCounts = { "Hot": 0, "Warm": 0, "Cold": 0, "Not Specified": 0 };
    filteredVisits.forEach((v) => {
      if (v.leadQuality) qualityCounts[v.leadQuality] = (qualityCounts[v.leadQuality] || 0) + 1;
      else qualityCounts["Not Specified"]++;
    });
    return {
      labels: Object.keys(qualityCounts),
      datasets: [{
        label: "Lead Quality",
        data: Object.values(qualityCounts),
        backgroundColor: ["#ef4444", "#f59e0b", "#0ea5e9", "#94a3b8"],
        borderWidth: 2,
        borderColor: "#fff",
        hoverOffset: 12,
      }],
    };
  };

  const getExistingClientData = () => {
    const clientCounts = { "Yes": 0, "No": 0, "Not Specified": 0 };
    filteredVisits.forEach((v) => {
      if (v.existingClient === "Yes") clientCounts["Yes"]++;
      else if (v.existingClient === "No") clientCounts["No"]++;
      else clientCounts["Not Specified"]++;
    });
    return {
      labels: ["Existing Clients", "New Clients", "Not Specified"],
      datasets: [{
        label: "Client Type",
        data: Object.values(clientCounts),
        backgroundColor: ["#10b981", "#3b82f6", "#94a3b8"],
        borderWidth: 2,
        borderColor: "#fff",
        hoverOffset: 12,
      }],
    };
  };

  const getReferralSourceData = () => {
    const sourceCounts = {};
    filteredVisits.forEach((v) => {
      if (Array.isArray(v.referralSource)) {
        v.referralSource.forEach(src => { sourceCounts[src] = (sourceCounts[src] || 0) + 1; });
      } else if (v.referralSource) {
        sourceCounts[v.referralSource] = (sourceCounts[v.referralSource] || 0) + 1;
      }
    });
    const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      labels: sorted.map(([k]) => k),
      datasets: [{
        label: "Referral Sources",
        data: sorted.map(([, v]) => v),
        backgroundColor: sorted.map((_, i) => chartColors[i % chartColors.length]),
        borderColor: sorted.map((_, i) => chartColors[i % chartColors.length]),
        borderWidth: 2,
        borderRadius: 8,
        maxBarThickness: 45,
      }],
    };
  };

  const totalVisits = filteredVisits.length;

  const todayVisits = filteredVisits.filter((v) => {
    const visitDate = getDateFromTimestamp(v.visitAt || v.createdAt);
    return visitDate && visitDate.toDateString() === new Date().toDateString();
  }).length;

  const yesterdayVisits = filteredVisits.filter((v) => {
    const visitDate = getDateFromTimestamp(v.visitAt || v.createdAt);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return visitDate && visitDate.toDateString() === yesterday.toDateString();
  }).length;

  const uniqueVisitors = new Set(filteredVisits.map((v) => v.visitor?.phone).filter(Boolean)).size;

  const uniqueDays = new Set(
    filteredVisits.map((v) => {
      const date = getDateFromTimestamp(v.visitAt || v.createdAt);
      return date ? date.toDateString() : null;
    }).filter(Boolean)
  ).size;

  const averageVisitsPerDay = uniqueDays > 0 ? (filteredVisits.length / uniqueDays).toFixed(1) : 0;

  const hotLeads = filteredVisits.filter(v => v.leadQuality === "Hot").length;
  const warmLeads = filteredVisits.filter(v => v.leadQuality === "Warm").length;
  const coldLeads = filteredVisits.filter(v => v.leadQuality === "Cold").length;
  const existingClients = filteredVisits.filter(v => v.existingClient === "Yes").length;
  const newClients = filteredVisits.filter(v => v.existingClient === "No").length;

  const agentActivity = {};
  filteredVisits.forEach(v => {
    if (v.agent?.name) agentActivity[v.agent.name] = (agentActivity[v.agent.name] || 0) + 1;
  });
  const topAgent = Object.entries(agentActivity).sort((a, b) => b[1] - a[1]).map(([name]) => name)[0] || "-";

  const propertyPopularity = {};
  filteredVisits.forEach(v => {
    if (Array.isArray(v.propertyTypes)) {
      v.propertyTypes.forEach(type => {
        propertyPopularity[type] = (propertyPopularity[type] || 0) + 1;
      });
    }
  });
  const topProperty = Object.entries(propertyPopularity).sort((a, b) => b[1] - a[1]).map(([name]) => name)[0] || "-";

  const hasActiveFilters = () =>
    selectedAgent !== "" || selectedBroker !== "" || selectedPropertyType !== "" ||
    selectedLeadQuality !== "" || selectedExistingClient !== "" ||
    dateRange !== "all" || searchTerm !== "";

  const availableYears = () => {
    const years = new Set();
    visits.forEach(v => {
      const date = getDateFromTimestamp(v.visitAt || v.createdAt);
      if (date) years.add(date.getFullYear());
    });
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) years.add(y);
    return [...years].sort((a, b) => b - a);
  };

  const dailyStats = timelineView === "daily" ? getDailyStats() : null;
  const timelineData = getTimelineData();

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>

      {/* ============================================================
          DAY DETAIL MODAL
      ============================================================ */}
      {showDayModal && selectedDayInfo && (
        <div className={styles.modalOverlay}>
          <div className={styles.dayModal} ref={modalRef}>
            {/* Modal Header */}
            <div className={styles.dayModalHeader}>
              <div className={styles.dayModalHeaderLeft}>
                <div className={styles.dayModalIconWrap}>
                  <i className="fas fa-calendar-day"></i>
                </div>
                <div>
                  <h2 className={styles.dayModalTitle}>{selectedDayInfo.dateStr}</h2>
                  <p className={styles.dayModalSubtitle}>
                    <i className="fas fa-users"></i>
                    {selectedDayInfo.count} {selectedDayInfo.count === 1 ? "visit" : "visits"} recorded
                  </p>
                </div>
              </div>
              <div className={styles.dayModalHeaderRight}>
                {selectedDayInfo.count > 0 && (
                  <button className={styles.btnOutline} onClick={exportDayVisits} title="Export to Excel">
                    <i className="fas fa-file-excel"></i> Export
                  </button>
                )}
                <button
                  className={styles.dayModalClose}
                  onClick={() => setShowDayModal(false)}
                  title="Close"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            {/* Modal Quick Stats */}
            {selectedDayInfo.count > 0 && (
              <div className={styles.dayModalStats}>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue}>{selectedDayInfo.count}</span>
                  <span className={styles.dayModalStatLabel}>Total Visits</span>
                </div>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue}>
                    {new Set(selectedDayVisits.map(v => v.visitor?.phone).filter(Boolean)).size}
                  </span>
                  <span className={styles.dayModalStatLabel}>Unique Visitors</span>
                </div>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue} style={{ color: "#ef4444" }}>
                    {selectedDayVisits.filter(v => v.leadQuality === "Hot").length}
                  </span>
                  <span className={styles.dayModalStatLabel}>🔥 Hot Leads</span>
                </div>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue} style={{ color: "#f59e0b" }}>
                    {selectedDayVisits.filter(v => v.leadQuality === "Warm").length}
                  </span>
                  <span className={styles.dayModalStatLabel}>🌡️ Warm Leads</span>
                </div>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue} style={{ color: "#10b981" }}>
                    {selectedDayVisits.filter(v => v.existingClient === "Yes").length}
                  </span>
                  <span className={styles.dayModalStatLabel}>✅ Existing</span>
                </div>
                <div className={styles.dayModalStat}>
                  <span className={styles.dayModalStatValue} style={{ color: "#3b82f6" }}>
                    {selectedDayVisits.filter(v => v.existingClient === "No").length}
                  </span>
                  <span className={styles.dayModalStatLabel}>🆕 New</span>
                </div>
              </div>
            )}

            {/* Modal Search */}
            {selectedDayInfo.count > 0 && (
              <div className={styles.dayModalSearch}>
                <div className={styles.searchInputWrap}>
                  <i className={`fas fa-search ${styles.searchIcon}`}></i>
                  <input
                    type="text"
                    placeholder="Search by name, phone, email, agent..."
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    className={styles.searchInput}
                    autoFocus
                  />
                  {modalSearchTerm && (
                    <button className={styles.clearSearch} onClick={() => setModalSearchTerm("")}>
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
                {modalSearchTerm && (
                  <span className={styles.modalSearchResults}>
                    {filteredModalVisits.length} result{filteredModalVisits.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Modal Body */}
            <div className={styles.dayModalBody}>
              {selectedDayInfo.count === 0 ? (
                <div className={styles.dayModalEmpty}>
                  <div className={styles.dayModalEmptyIcon}>
                    <i className="fas fa-calendar-times"></i>
                  </div>
                  <h3>No Visits on This Day</h3>
                  <p>There were no site visits recorded on {selectedDayInfo.dateStr}.</p>
                </div>
              ) : filteredModalVisits.length === 0 ? (
                <div className={styles.dayModalEmpty}>
                  <div className={styles.dayModalEmptyIcon}>
                    <i className="fas fa-search"></i>
                  </div>
                  <h3>No Results Found</h3>
                  <p>No visitors match your search term.</p>
                  <button className={styles.btnGhost} onClick={() => setModalSearchTerm("")}>Clear Search</button>
                </div>
              ) : (
                <div className={styles.dayModalCards}>
                  {filteredModalVisits.map((visit, index) => {
                    const rawDate = visit.visitAt || visit.createdAt;
                    const visitDate = getDateFromTimestamp(rawDate);
                    const isExisting = visit.existingClient === "Yes";
                    const leadQuality = visit.leadQuality;

                    return (
                      <div
                        key={visit.id || index}
                        className={`${styles.dayVisitCard} ${
                          leadQuality === "Hot" ? styles.cardHot :
                          leadQuality === "Warm" ? styles.cardWarm :
                          leadQuality === "Cold" ? styles.cardCold : ""
                        }`}
                      >
                        {/* Card Header */}
                        <div className={styles.dayVisitCardHeader}>
                          <div className={styles.dayVisitCardAvatar}>
                            {visit.visitor?.name
                              ? visit.visitor.name.charAt(0).toUpperCase()
                              : "?"}
                          </div>
                          <div className={styles.dayVisitCardMeta}>
                            <h4 className={styles.dayVisitCardName}>
                              {visit.visitor?.name || "Unknown Visitor"}
                            </h4>
                            <span className={styles.dayVisitCardTime}>
                              <i className="fas fa-clock"></i>
                              {visitDate
                                ? visitDate.toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  })
                                : "–"}
                            </span>
                          </div>
                          <div className={styles.dayVisitCardBadges}>
                            {leadQuality && (
                              <span className={`${styles.leadQualityBadge} ${styles[leadQuality.toLowerCase()]}`}>
                                {leadQuality === "Hot" && <i className="fas fa-fire"></i>}
                                {leadQuality === "Warm" && <i className="fas fa-fire-alt"></i>}
                                {leadQuality === "Cold" && <i className="fas fa-snowflake"></i>}
                                {leadQuality}
                              </span>
                            )}
                            {visit.existingClient && (
                              <span className={`${styles.existingClientBadge} ${isExisting ? styles.existingYes : styles.existingNo}`}>
                                {isExisting ? (
                                  <><i className="fas fa-check-circle"></i> Existing</>
                                ) : (
                                  <><i className="fas fa-user-plus"></i> New</>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className={styles.dayVisitCardBody}>
                          {/* Contact Info */}
                          <div className={styles.dayVisitCardSection}>
                            <div className={styles.dayVisitCardRow}>
                              <i className="fas fa-phone"></i>
                              <span>
                                {visit.visitor?.phone
                                  ? formatPhoneDisplay(visit.visitor.phone, visit.visitor.countryCode)
                                  : "—"}
                              </span>
                            </div>
                            {visit.visitor?.email && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-envelope"></i>
                                <span>{visit.visitor.email}</span>
                              </div>
                            )}
                            {visit.visitor?.location && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-map-marker-alt"></i>
                                <span>{visit.visitor.location}</span>
                              </div>
                            )}
                          </div>

                          {/* Property & Agent */}
                          <div className={styles.dayVisitCardSection}>
                            {visit.agent?.name && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-user-tie"></i>
                                <span><strong>Agent:</strong> {visit.agent.name}</span>
                              </div>
                            )}
                            {visit.channelPartner?.name && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-handshake"></i>
                                <span><strong>Partner:</strong> {visit.channelPartner.name}</span>
                              </div>
                            )}
                            {(visit.propertyTypes || visit.propertyType) && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-building"></i>
                                <span>
                                  <strong>Property:</strong>{" "}
                                  {Array.isArray(visit.propertyTypes)
                                    ? visit.propertyTypes.join(", ")
                                    : visit.propertyTypes || visit.propertyType}
                                </span>
                              </div>
                            )}
                            {Array.isArray(visit.referralSource) && visit.referralSource.length > 0 && (
                              <div className={styles.dayVisitCardRow}>
                                <i className="fas fa-share-alt"></i>
                                <span><strong>Source:</strong> {visit.referralSource.join(", ")}</span>
                              </div>
                            )}
                          </div>

                          {/* Booking Status & Remarks */}
                          <div className={styles.dayVisitCardFooter}>
                            {visit.bookingStatus && (
                              <span className={`${styles.statusBadge} ${
                                visit.bookingStatus === "Booked" ? styles.statusBooked :
                                visit.bookingStatus === "Interested" ? styles.statusInterested :
                                styles.statusNotBooked
                              }`}>
                                {visit.bookingStatus === "Booked" && <i className="fas fa-check-circle"></i>}
                                {visit.bookingStatus === "Interested" && <i className="fas fa-star"></i>}
                                {(!visit.bookingStatus || visit.bookingStatus === "Not Booked") && <i className="fas fa-clock"></i>}
                                {visit.bookingStatus || "Not Booked"}
                              </span>
                            )}
                            {visit.remarks && (
                              <div className={styles.dayVisitCardRemarks}>
                                <i className="fas fa-comment-alt"></i>
                                <span>{visit.remarks}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {filteredModalVisits.length > 0 && (
              <div className={styles.dayModalFooter}>
                <span>
                  Showing {filteredModalVisits.length} of {selectedDayInfo.count} visits
                  {modalSearchTerm && ` (filtered)`}
                </span>
                <button className={styles.btnGhost} onClick={() => setShowDayModal(false)}>
                  <i className="fas fa-times"></i> Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles.dashboardHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.AnalyticsMainTitle}>Site Visits Dashboard</h1>
          <p>Comprehensive insights and performance metrics for your site visits</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.btnGroup}>
            <button className={styles.btnOutline} onClick={() => setShowFilters(!showFilters)}>
              <i className={`fas ${showFilters ? "fa-eye-slash" : "fa-filter"}`}></i>
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
            <button className={styles.btnOutline} onClick={() => setShowFilterSave(!showFilterSave)}>
              <i className="fas fa-save"></i> Save Filter
            </button>
            <div className={styles.exportDropdown}>
              <button className={styles.btnPrimary}>
                <i className="fas fa-download"></i> Export <i className="fas fa-chevron-down"></i>
              </button>
              <div className={styles.exportMenu}>
                <button onClick={downloadExcel} disabled={exportLoading}>
                  <i className="fas fa-file-excel"></i>
                  {exportLoading ? "Exporting..." : "Export to Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Save Filter Panel */}
      {showFilterSave && (
        <div className={styles.saveFilterPanel}>
          <h4>Save Current Filter Configuration</h4>
          <div className={styles.saveFilterForm}>
            <input
              type="text" placeholder="Filter name..."
              value={filterName} onChange={(e) => setFilterName(e.target.value)}
              className={styles.input}
            />
            <button className={styles.btnPrimary} onClick={saveCurrentFilters} disabled={!filterName.trim()}>
              <i className="fas fa-save"></i> Save
            </button>
          </div>
        </div>
      )}

      {/* Saved Filters */}
      {savedFilters.length > 0 && (
        <div className={styles.savedFiltersBar}>
          <h4>Saved Filters:</h4>
          <div className={styles.savedFiltersList}>
            {savedFilters.map((filter) => (
              <div key={filter.id} className={styles.savedFilter}>
                <span>{filter.name}</span>
                <div className={styles.savedFilterActions}>
                  <button className={styles.btnApply} onClick={() => applySavedFilter(filter)} title="Apply">
                    <i className="fas fa-check"></i>
                  </button>
                  <button className={styles.btnDelete} onClick={() => deleteSavedFilter(filter.id)} title="Delete">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Section */}
      {showFilters && (
        <div className={styles.filtersSection} ref={filtersSectionRef}>
          <div className={styles.filtersCard}>
            <div className={styles.filtersHeader}>
              <div className={styles.filtersTabs}>
                {["overview", "agents", "properties", "leads", "clients"].map(tab => (
                  <button
                    key={tab}
                    className={`${styles.filterTab} ${activeTab === tab ? styles.active : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    <i className={`fas fa-${tab === "overview" ? "chart-pie" : tab === "agents" ? "user-tie" : tab === "properties" ? "building" : tab === "leads" ? "fire" : "user-check"}`}></i>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className={styles.filterActions}>
                {hasActiveFilters() && (
                  <div className={styles.activeFilterBadge}>
                    <i className="fas fa-filter"></i> Filters Active
                  </div>
                )}
                <button className={styles.btnGhost} onClick={clearFilters}>
                  <i className="fas fa-times-circle"></i> Clear
                </button>
              </div>
            </div>

            <div className={styles.searchBar}>
              <div className={styles.searchInputWrap}>
                <i className={`fas fa-search ${styles.searchIcon}`}></i>
                <input
                  type="text"
                  placeholder="Search by name, phone, email, agent, existing client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {searchTerm && (
                  <button className={styles.clearSearch} onClick={() => setSearchTerm("")}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              {searchFocused && (
                <div className={styles.searchTips}>
                  <p><i className="fas fa-info-circle"></i> Search by name, phone, email, agent, property type, or referral source</p>
                </div>
              )}
            </div>

            <div className={styles.filtersGrid}>
              <div className={styles.filterGroup}>
                <label><i className="fas fa-calendar"></i> Date Range</label>
                <div className={styles.dateFilter}>
                  <select value={dateRange} onChange={(e) => { setDateRange(e.target.value); if (e.target.value === "custom") setShowDatePicker(true); }} className={styles.select}>
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">This Month</option>
                    <option value="quarter">This Quarter</option>
                    <option value="custom">Custom Range</option>
                  </select>
                  {dateRange === "custom" && (
                    <button className={`${styles.dateToggle} dateToggle`} onClick={() => setShowDatePicker(!showDatePicker)}>
                      <i className="fas fa-calendar-alt"></i>
                      {customDateRange.startDate && customDateRange.endDate
                        ? `${new Date(customDateRange.startDate).toLocaleDateString()} - ${new Date(customDateRange.endDate).toLocaleDateString()}`
                        : "Select dates"}
                    </button>
                  )}
                  {showDatePicker && dateRange === "custom" && (
                    <div className={styles.datePickerContainer} ref={datePickerRef}>
                      <div className={styles.datePickerHeader}>
                        <h4>Select Date Range</h4>
                        <button className={styles.closeDatePicker} onClick={() => setShowDatePicker(false)}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                      <div className={styles.datePickerInner}>
                        <div>
                          <label>Start Date</label>
                          <DatePicker
                            selected={customDateRange.startDate}
                            onChange={(date) => setCustomDateRange({ ...customDateRange, startDate: date })}
                            selectsStart startDate={customDateRange.startDate}
                            endDate={customDateRange.endDate} maxDate={new Date()}
                            className={styles.datePicker}
                          />
                        </div>
                        <div>
                          <label>End Date</label>
                          <DatePicker
                            selected={customDateRange.endDate}
                            onChange={(date) => setCustomDateRange({ ...customDateRange, endDate: date })}
                            selectsEnd startDate={customDateRange.startDate}
                            endDate={customDateRange.endDate}
                            minDate={customDateRange.startDate} maxDate={new Date()}
                            className={styles.datePicker}
                          />
                        </div>
                      </div>
                      <div className={styles.datePickerActions}>
                        <button className={styles.btnGhost} onClick={() => { setCustomDateRange({ startDate: null, endDate: null }); setShowDatePicker(false); setDateRange("all"); }}>Clear</button>
                        <button className={styles.btnPrimary} onClick={() => setShowDatePicker(false)} disabled={!customDateRange.startDate || !customDateRange.endDate}>Apply</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(activeTab === "overview" || activeTab === "agents") && (
                <div className={styles.filterGroup}>
                  <label><i className="fas fa-user-tie"></i> Sales Executive</label>
                  <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} className={styles.select}>
                    <option value="">All Executives</option>
                    {agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                  </select>
                </div>
              )}

              {(activeTab === "overview" || activeTab === "agents") && (
                <div className={styles.filterGroup}>
                  <label><i className="fas fa-handshake"></i> Channel Partner</label>
                  <select value={selectedBroker} onChange={(e) => setSelectedBroker(e.target.value)} className={styles.select}>
                    <option value="">All Partners</option>
                    {brokers.map((broker) => <option key={broker} value={broker}>{broker}</option>)}
                  </select>
                </div>
              )}

              {(activeTab === "overview" || activeTab === "properties") && (
                <div className={styles.filterGroup}>
                  <label><i className="fas fa-home"></i> Property Type</label>
                  <select value={selectedPropertyType} onChange={(e) => setSelectedPropertyType(e.target.value)} className={styles.select}>
                    <option value="">All Types</option>
                    <option value="1 BHK">1 BHK</option>
                    <option value="2 BHK">2 BHK</option>
                    <option value="3 BHK">3 BHK</option>
                    <option value="4 BHK">4 BHK</option>
                    <option value="PentHouse">PentHouse</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>
              )}

              {(activeTab === "overview" || activeTab === "leads") && (
                <div className={styles.filterGroup}>
                  <label><i className="fas fa-fire"></i> Lead Quality</label>
                  <select value={selectedLeadQuality} onChange={(e) => setSelectedLeadQuality(e.target.value)} className={styles.select}>
                    <option value="">All Leads</option>
                    <option value="Hot">🔥 Hot</option>
                    <option value="Warm">🌡️ Warm</option>
                    <option value="Cold">❄️ Cold</option>
                  </select>
                </div>
              )}

              {(activeTab === "overview" || activeTab === "clients") && (
                <div className={styles.filterGroup}>
                  <label><i className="fas fa-user-check"></i> Existing Client</label>
                  <select value={selectedExistingClient} onChange={(e) => setSelectedExistingClient(e.target.value)} className={styles.select}>
                    <option value="">All Clients</option>
                    <option value="Yes">✅ Yes - Existing</option>
                    <option value="No">🆕 No - New</option>
                  </select>
                </div>
              )}
            </div>

            <div className={styles.quickFilters}>
              <button className={`${styles.quickFilterBtn} ${dateRange === "today" ? styles.active : ""}`} onClick={() => setDateRange("today")}>Today</button>
              <button className={`${styles.quickFilterBtn} ${dateRange === "week" ? styles.active : ""}`} onClick={() => setDateRange("week")}>Last 7 Days</button>
              <button className={`${styles.quickFilterBtn} ${dateRange === "month" ? styles.active : ""}`} onClick={() => setDateRange("month")}>This Month</button>
              <button className={`${styles.quickFilterBtn} ${selectedLeadQuality === "Hot" ? styles.active : ""}`} onClick={() => setSelectedLeadQuality(selectedLeadQuality === "Hot" ? "" : "Hot")}>🔥 Hot Leads</button>
              <button className={`${styles.quickFilterBtn} ${selectedExistingClient === "Yes" ? styles.active : ""}`} onClick={() => setSelectedExistingClient(selectedExistingClient === "Yes" ? "" : "Yes")}>✅ Existing</button>
              <button className={`${styles.quickFilterBtn} ${selectedExistingClient === "No" ? styles.active : ""}`} onClick={() => setSelectedExistingClient(selectedExistingClient === "No" ? "" : "No")}>🆕 New</button>
            </div>
          </div>
        </div>
      )}

      {filterLoading && (
        <div className={styles.filterLoading}>
          <div className={styles.filterLoadingSpinner}></div>
          <span>Updating data...</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className={styles.statsSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconTotal}`}><i className="fas fa-users"></i></div>
            <div className={styles.statContent}>
              <h3>{totalVisits}</h3>
              <p>Total Visits</p>
              <div className={styles.statContext}>
                <span className={todayVisits > yesterdayVisits ? styles.trendUp : todayVisits < yesterdayVisits ? styles.trendDown : ""}>
                  {todayVisits > yesterdayVisits && <i className="fas fa-arrow-up"></i>}
                  {todayVisits < yesterdayVisits && <i className="fas fa-arrow-down"></i>}
                  {todayVisits} today
                </span>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconUnique}`}><i className="fas fa-user-check"></i></div>
            <div className={styles.statContent}>
              <h3>{uniqueVisitors}</h3>
              <p>Unique Visitors</p>
              <div className={styles.statContext}>
                <span>{totalVisits > 0 ? Math.round((uniqueVisitors / totalVisits) * 100) : 0}% unique ratio</span>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconLeads}`}><i className="fas fa-fire"></i></div>
            <div className={styles.statContent}>
              <h3>{hotLeads}</h3>
              <p>Hot Leads</p>
              <div className={styles.statContext}>
                <span className={styles.leadSplit}>
                  <span className={styles.leadHot}>🔥{hotLeads}</span>
                  <span className={styles.leadWarm}>🌡️{warmLeads}</span>
                  <span className={styles.leadCold}>❄️{coldLeads}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconExisting}`}><i className="fas fa-user-friends"></i></div>
            <div className={styles.statContent}>
              <h3>{existingClients}</h3>
              <p>Existing Clients</p>
              <div className={styles.statContext}>
                <span className={styles.clientSplit}>
                  <span className={styles.clientExisting}>✅ {existingClients}</span>
                  <span className={styles.clientNew}>🆕 {newClients}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconAvg}`}><i className="fas fa-chart-line"></i></div>
            <div className={styles.statContent}>
              <h3>{averageVisitsPerDay}</h3>
              <p>Avg/Day</p>
              <div className={styles.statContext}><span>Over {uniqueDays} days</span></div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.iconMonth}`}><i className="fas fa-calendar-alt"></i></div>
            <div className={styles.statContent}>
              <h3>{getSelectedMonthCount()}</h3>
              <p>{shortMonthNames[selectedChartMonth]} {selectedChartYear}</p>
              <div className={styles.statContext}>
                <span>Monthly visits</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className={styles.summarySection}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <h3>Performance Summary</h3>
            <div className={styles.periodBadge}>
              {dateRange === "all" ? "All Time" : dateRange === "today" ? "Today" :
                dateRange === "yesterday" ? "Yesterday" : dateRange === "week" ? "Last 7 Days" :
                dateRange === "month" ? "This Month" : dateRange === "quarter" ? "This Quarter" :
                dateRange === "custom" && customDateRange.startDate && customDateRange.endDate
                  ? `${new Date(customDateRange.startDate).toLocaleDateString()} - ${new Date(customDateRange.endDate).toLocaleDateString()}`
                  : "Custom Period"}
            </div>
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{totalVisits}</div>
              <div className={styles.summaryLabel}>Total Visits</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{topAgent}</div>
              <div className={styles.summaryLabel}>Top Agent</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{topProperty}</div>
              <div className={styles.summaryLabel}>Most Popular</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{filteredVisits.length > 0 ? `${Math.round((hotLeads / filteredVisits.length) * 100)}%` : "0%"}</div>
              <div className={styles.summaryLabel}>Hot Lead %</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{filteredVisits.length > 0 ? `${Math.round((existingClients / filteredVisits.length) * 100)}%` : "0%"}</div>
              <div className={styles.summaryLabel}>Existing Client %</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{filteredVisits.length > 0 ? `${Math.round(((hotLeads + warmLeads) / filteredVisits.length) * 100)}%` : "0%"}</div>
              <div className={styles.summaryLabel}>Conversion Potential</div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN TIMELINE CHART */}
      <div className={styles.timelineChartSection}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeaderFull}>
            <div className={styles.chartTitleGroup}>
              <h3><i className="fas fa-chart-line"></i> Visit Trends Analysis</h3>
              <p className={styles.chartSubtitle}>
                {timelineView === "monthly" && `All 12 months of ${selectedChartYear} • Selected: ${monthNames[selectedChartMonth]} (${getSelectedMonthCount()} visits)`}
                {timelineView === "daily" && `Every day in ${monthNames[selectedChartMonth]} ${selectedChartYear} • Total: ${getSelectedMonthCount()} visits • Click any day to view visitors`}
                {timelineView === "weekly" && `Week-wise breakdown for ${monthNames[selectedChartMonth]} ${selectedChartYear} • Total: ${getSelectedMonthCount()} visits`}
                {timelineView === "yearly" && "Year-over-year comparison (last 5 years)"}
              </p>
            </div>

            <div className={styles.chartControlsGroup}>
              <div className={styles.viewToggle}>
                {[
                  { key: "daily", label: "Daily", icon: "fa-calendar-day" },
                  { key: "weekly", label: "Weekly", icon: "fa-calendar-week" },
                  { key: "monthly", label: "Monthly", icon: "fa-calendar-alt" },
                  { key: "yearly", label: "Yearly", icon: "fa-calendar" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    className={`${styles.viewToggleBtn} ${timelineView === key ? styles.active : ""}`}
                    onClick={() => setTimelineView(key)}
                  >
                    <i className={`fas ${icon}`}></i> {label}
                  </button>
                ))}
              </div>

              {timelineView !== "yearly" && (
                <div className={styles.dateSelectors}>
                  <select
                    value={selectedChartMonth}
                    onChange={(e) => setSelectedChartMonth(Number(e.target.value))}
                    className={styles.chartSelect}
                  >
                    {monthNames.map((month, i) => (
                      <option key={i} value={i}>{month}</option>
                    ))}
                  </select>
                  <select
                    value={selectedChartYear}
                    onChange={(e) => setSelectedChartYear(Number(e.target.value))}
                    className={styles.chartSelect}
                  >
                    {availableYears().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              )}

              {timelineView === "yearly" && (
                <div className={styles.dateSelectors}>
                  <select
                    value={selectedChartYear}
                    onChange={(e) => setSelectedChartYear(Number(e.target.value))}
                    className={styles.chartSelect}
                  >
                    {availableYears().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Month Quick Selector */}
          {timelineView !== "yearly" && (
            <div className={styles.monthQuickSelector}>
              {shortMonthNames.map((month, i) => {
                const count = filteredVisits.filter(v => {
                  const date = getDateFromTimestamp(v.visitAt || v.createdAt);
                  return date && date.getMonth() === i && date.getFullYear() === selectedChartYear;
                }).length;
                return (
                  <button
                    key={i}
                    className={`${styles.monthBtn} ${selectedChartMonth === i ? styles.active : ""}`}
                    onClick={() => setSelectedChartMonth(i)}
                  >
                    <span className={styles.monthBtnLabel}>{month}</span>
                    <span className={styles.monthBtnCount}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* DAILY STATS SUMMARY ROW */}
          {timelineView === "daily" && dailyStats && (
            <div className={styles.dailyStatsRow}>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>
                  <i className="fas fa-calendar-check"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>{dailyStats.total}</span>
                  <span className={styles.dailyStatLabel}>Total This Month</span>
                </div>
              </div>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                  <i className="fas fa-trophy"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>{dailyStats.maxCount}</span>
                  <span className={styles.dailyStatLabel}>Peak Day (Day {dailyStats.maxDay})</span>
                </div>
              </div>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                  <i className="fas fa-calendar-day"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>{dailyStats.activeDays}</span>
                  <span className={styles.dailyStatLabel}>Active Days</span>
                </div>
              </div>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                  <i className="fas fa-chart-bar"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>{dailyStats.avgPerActiveDay}</span>
                  <span className={styles.dailyStatLabel}>Avg Per Active Day</span>
                </div>
              </div>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4" }}>
                  <i className="fas fa-chart-line"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>{dailyStats.avgPerDay}</span>
                  <span className={styles.dailyStatLabel}>Avg Per Day (All)</span>
                </div>
              </div>
              <div className={styles.dailyStat}>
                <div className={styles.dailyStatIcon} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                  <i className="fas fa-calendar-times"></i>
                </div>
                <div className={styles.dailyStatInfo}>
                  <span className={styles.dailyStatValue}>
                    {new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate() - dailyStats.activeDays}
                  </span>
                  <span className={styles.dailyStatLabel}>Days With No Visit</span>
                </div>
              </div>
            </div>
          )}

          {/* Click Hint for Daily View */}
          {timelineView === "daily" && getSelectedMonthCount() > 0 && (
            <div className={styles.chartClickHint}>
              <i className="fas fa-hand-pointer"></i>
              Click on any data point or day card below to view visitors for that day
            </div>
          )}

          {/* Chart */}
          <div className={styles.chartContainerLarge}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}>
                <i className="fas fa-chart-line"></i>
                <p>No data available for the selected filters</p>
                {hasActiveFilters() && (
                  <button onClick={clearFilters} className={styles.btnOutlineSmall}>Clear Filters</button>
                )}
              </div>
            ) : timelineView === "daily" ? (
              <Line data={timelineData} options={getDailyChartOptions()} />
            ) : (
              <Bar data={timelineData} options={baseChartOptions} />
            )}
          </div>

          {/* DAILY BREAKDOWN TABLE */}
          {timelineView === "daily" && dailyStats && dailyStats.total > 0 && (
            <div className={styles.dailyBreakdownTable}>
              <div className={styles.dailyBreakdownHeader}>
                <h4><i className="fas fa-table"></i> Day-wise Breakdown — {monthNames[selectedChartMonth]} {selectedChartYear}</h4>
                <p className={styles.dailyBreakdownHint}>
                  <i className="fas fa-hand-pointer"></i> Click on any day to view customers
                </p>
              </div>
              <div className={styles.dailyBreakdownGrid}>
                {dailyStats.dailyCounts.map((count, idx) => {
                  const day = idx + 1;
                  const date = new Date(selectedChartYear, selectedChartMonth, day);
                  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isPeak = count === dailyStats.maxCount && count > 0;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const barWidth = dailyStats.maxCount > 0 ? (count / dailyStats.maxCount) * 100 : 0;
                  const isClickable = count > 0;

                  return (
                    <div
                      key={day}
                      className={`
                        ${styles.dailyBreakdownItem}
                        ${isToday ? styles.dailyItemToday : ""}
                        ${isPeak ? styles.dailyItemPeak : ""}
                        ${count === 0 ? styles.dailyItemEmpty : ""}
                        ${isClickable ? styles.dailyItemClickable : ""}
                      `}
                      onClick={() => isClickable && handleDayClick(idx)}
                      title={isClickable ? `Click to view ${count} visitor${count > 1 ? "s" : ""} on ${date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}` : "No visits on this day"}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (isClickable && (e.key === "Enter" || e.key === " ")) {
                          handleDayClick(idx);
                        }
                      }}
                    >
                      <div className={styles.dailyItemHeader}>
                        <span className={`${styles.dailyItemDay} ${isWeekend ? styles.weekend : ""}`}>{dayName}</span>
                        <span className={styles.dailyItemDate}>{day}</span>
                        {isPeak && <span className={styles.peakBadge}>🏆</span>}
                        {isToday && <span className={styles.todayBadge}>Today</span>}
                      </div>
                      <div className={styles.dailyItemBar}>
                        <div
                          className={styles.dailyItemBarFill}
                          style={{
                            width: `${barWidth}%`,
                            background: isPeak
                              ? "#f59e0b"
                              : isToday
                              ? "#10b981"
                              : count > 0
                              ? "#2563eb"
                              : "transparent",
                          }}
                        ></div>
                      </div>
                      <span className={`${styles.dailyItemCount} ${count === 0 ? styles.zeroCount : ""}`}>
                        {count > 0 ? count : "—"}
                      </span>
                      {isClickable && (
                        <span className={styles.dailyItemViewHint}>
                          <i className="fas fa-eye"></i>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><i className="fas fa-user-tie"></i> Agent Performance</h3>
            <span className={styles.chartBadge}>{Object.keys(agentActivity).length} agents</span>
          </div>
          <div className={styles.chartContainer}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}><i className="fas fa-chart-bar"></i><p>No data available</p></div>
            ) : (
              <Bar data={getAgentWiseData()} options={baseChartOptions} />
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><i className="fas fa-building"></i> Property Types</h3>
            <span className={styles.chartBadge}>{Object.keys(propertyPopularity).length} types</span>
          </div>
          <div className={styles.chartContainer}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}><i className="fas fa-chart-pie"></i><p>No data available</p></div>
            ) : (
              <Doughnut data={getPropertyTypeData()} options={doughnutOptions} />
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><i className="fas fa-bullseye"></i> Lead Quality</h3>
            <span className={styles.chartBadge}>{hotLeads} hot leads</span>
          </div>
          <div className={styles.chartContainer}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}><i className="fas fa-bullseye"></i><p>No data available</p></div>
            ) : (
              <Doughnut data={getLeadQualityData()} options={doughnutOptions} />
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><i className="fas fa-user-check"></i> Client Distribution</h3>
            <span className={styles.chartBadge}>{existingClients} existing</span>
          </div>
          <div className={styles.chartContainer}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}><i className="fas fa-user-check"></i><p>No data available</p></div>
            ) : (
              <Doughnut data={getExistingClientData()} options={doughnutOptions} />
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><i className="fas fa-share-alt"></i> Referral Sources</h3>
          </div>
          <div className={styles.chartContainer}>
            {filteredVisits.length === 0 ? (
              <div className={styles.noChartData}><i className="fas fa-share-alt"></i><p>No data available</p></div>
            ) : (
              <Bar
                data={getReferralSourceData()}
                options={{
                  ...baseChartOptions,
                  indexAxis: "y",
                  scales: {
                    x: { beginAtZero: true, grid: { color: "rgba(241, 245, 249, 0.8)" }, ticks: { precision: 0 } },
                    y: { grid: { display: false } },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableSection} ref={tableSectionRef}>
        <div className={styles.tableHeader}>
          <h3><i className="fas fa-list"></i> Recent Visits</h3>
          <div className={styles.tableControls}>
            <span className={styles.resultsCount}>
              Showing {filteredVisits.length === 0 ? 0 : startIndex + 1}–{Math.min(endIndex, filteredVisits.length)} of {filteredVisits.length} results
            </span>
            <div className={styles.rowsPerPage}>
              <span>Show:</span>
              <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className={styles.selectCompact}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Visitor</th>
                <th>Contact</th>
                <th>Property Types</th>
                <th>Sales Executive</th>
                <th>Channel Partner</th>
                <th>Existing Client</th>
                <th>Lead Quality</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan="9" className={styles.noData}>
                    <div className={styles.noDataMessage}>
                      <i className="fas fa-search"></i>
                      <p>No visits found matching the current filters</p>
                      {hasActiveFilters() && <button onClick={clearFilters} className={styles.btnOutlineSmall}>Clear All Filters</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                currentItems.map((visit) => {
                  const rawVisitDate = visit.visitAt || visit.createdAt || null;
                  const visitDateObj = getDateFromTimestamp(rawVisitDate);
                  return (
                    <tr key={visit.id}>
                      <td>
                        <div className={styles.dateCell}>
                          <div className={styles.date}>
                            {visitDateObj ? visitDateObj.toLocaleDateString("en-US", { day: "2-digit", month: "short" }) : "-"}
                          </div>
                          <div className={styles.time}>
                            {visitDateObj ? visitDateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.visitorInfo}>
                          <strong>{visit.visitor?.name || "-"}</strong>
                          {visit.visitor?.location && <span><i className="fas fa-map-marker-alt"></i>{visit.visitor.location}</span>}
                        </div>
                      </td>
                      <td>
                        <div className={styles.contactInfo}>
                          {visit.visitor?.phone && (
                            <div className={styles.contactItem}>
                              <i className="fas fa-phone"></i>
                              <span className={styles.phoneDisplay}>{formatPhoneDisplay(visit.visitor.phone, visit.visitor.countryCode)}</span>
                            </div>
                          )}
                          {visit.visitor?.email && (
                            <div className={styles.contactItem}>
                              <i className="fas fa-envelope"></i>
                              <span className={styles.emailDisplay}>{visit.visitor.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.propertyTypes}>
                          {Array.isArray(visit.propertyTypes)
                            ? visit.propertyTypes.map((type) => <span key={type} className={styles.propertyBadge}>{type}</span>)
                            : visit.propertyTypes ? <span className={styles.propertyBadge}>{visit.propertyTypes}</span> : "-"}
                        </div>
                      </td>
                      <td><div className={styles.executiveInfo}>{visit.agent?.name || "-"}</div></td>
                      <td>
                        <div className={styles.partnerInfo}>
                          {visit.channelPartner?.name || "-"}
                          {visit.channelPartner?.phone && <small>{visit.channelPartner.phone}</small>}
                        </div>
                      </td>
                      <td>
                        {visit.existingClient === "Yes" ? (
                          <span className={`${styles.existingClientBadge} ${styles.existingYes}`}><i className="fas fa-check-circle"></i> Yes</span>
                        ) : visit.existingClient === "No" ? (
                          <span className={`${styles.existingClientBadge} ${styles.existingNo}`}><i className="fas fa-user-plus"></i> No</span>
                        ) : (
                          <span className={`${styles.existingClientBadge} ${styles.existingUnknown}`}><i className="fas fa-question-circle"></i> N/A</span>
                        )}
                      </td>
                      <td>
                        {visit.leadQuality ? (
                          <span className={`${styles.leadQualityBadge} ${styles[visit.leadQuality.toLowerCase()]}`}>
                            {visit.leadQuality === "Hot" && <i className="fas fa-fire"></i>}
                            {visit.leadQuality === "Warm" && <i className="fas fa-fire-alt"></i>}
                            {visit.leadQuality === "Cold" && <i className="fas fa-snowflake"></i>}
                            {visit.leadQuality}
                          </span>
                        ) : (
                          <span className={styles.leadQualityBadge}><i className="fas fa-question-circle"></i> Unknown</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${visit.bookingStatus === "Booked" ? styles.statusBooked : visit.bookingStatus === "Interested" ? styles.statusInterested : styles.statusNotBooked}`}>
                          {visit.bookingStatus === "Booked" && <i className="fas fa-check-circle"></i>}
                          {visit.bookingStatus === "Interested" && <i className="fas fa-star"></i>}
                          {(!visit.bookingStatus || visit.bookingStatus === "Not Booked") && <i className="fas fa-clock"></i>}
                          {visit.bookingStatus || "Not Booked"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredVisits.length > 0 && totalPages > 1 && (
          <div className={styles.paginationContainer}>
            <div className={styles.paginationInfo}><span>Page {currentPage} of {totalPages}</span></div>
            <div className={styles.paginationControls}>
              <button className={styles.paginationBtn} onClick={handlePrevious} disabled={currentPage === 1}>
                <i className="fas fa-chevron-left"></i> Previous
              </button>
              <div className={styles.paginationNumbers}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <button
                      key={pageNum}
                      className={`${styles.paginationNumber} ${pageNum === currentPage ? styles.active : ""}`}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button className={styles.paginationBtn} onClick={handleNext} disabled={currentPage === totalPages}>
                Next <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;