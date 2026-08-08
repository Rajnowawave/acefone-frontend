import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, 
  Timestamp, orderBy, doc, setDoc, getDoc, onSnapshot 
} from 'firebase/firestore';
import { 
  FaFileDownload, FaEye, FaSpinner, FaEnvelope, FaSync, 
  FaTimes, FaCalendarAlt, FaChartBar, FaUsers, FaCheckCircle, 
  FaTimesCircle, FaSearch, FaFilter, FaPlus, FaClock,
  FaFileExcel, FaBell, FaFileAlt, FaSave, FaCog,
  FaChartLine, FaChartPie, FaArrowUp, FaArrowDown, FaPercentage,
  FaMailBulk, FaHistory, FaToggleOn, FaToggleOff
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import './EmailReport.css';

// ⚠️ Apna Firebase Function URL yahan daalo
const FUNCTIONS_BASE_URL = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net';

function EmailReport() {
  const [visits, setVisits] = useState([]);
  const [filteredVisits, setFilteredVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [recipients, setRecipients] = useState(['']);
  const [filterBy, setFilterBy] = useState('24h');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [notification, setNotification] = useState(null);
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [reportLogs, setReportLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Schedule Config State
  const [scheduleConfig, setScheduleConfig] = useState({
    dailyEnabled: false,
    dailyRecipients: [''],
    weeklyEnabled: false,
    weeklyRecipients: [''],
    monthlyEnabled: false,
    monthlyRecipients: [''],
  });

  const searchRef = useRef(null);

  // Toast Notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Get time filter dates
  const getTimeFilterDates = () => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (showCustomDate && customDateRange.start && customDateRange.end) {
      startDate = new Date(customDateRange.start);
      endDate = new Date(customDateRange.end);
      endDate.setHours(23, 59, 59, 999);
    } else {
      switch(filterBy) {
        case '24h':
          startDate.setHours(now.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          startDate.setHours(0, 0, 0, 0);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        default:
          startDate.setHours(now.getHours() - 24);
      }
      endDate.setHours(23, 59, 59, 999);
    }
    return { startDate, endDate };
  };

  // Fetch visits
  const fetchVisits = async () => {
    setLoading(true);
    try {
      const visitsRef = collection(db, 'siteVisits');
      const { startDate, endDate } = getTimeFilterDates();

      const q = query(
        visitsRef,
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        visitDate: doc.data().visitAt 
          ? new Date(doc.data().visitAt.seconds * 1000).toLocaleDateString('en-IN') 
          : '',
        visitTime: doc.data().visitTime || '',
      }));

      setVisits(data);
      setFilteredVisits(data);
    } catch (err) {
      console.error('Fetch error:', err);
      showNotification('Error fetching visits', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load schedule config from Firestore
  const loadScheduleConfig = async () => {
    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/getScheduleConfig`);
      const data = await response.json();
      if (data.ok && data.config) {
        setScheduleConfig({
          dailyEnabled: data.config.dailyEnabled || false,
          dailyRecipients: data.config.dailyRecipients?.length 
            ? data.config.dailyRecipients : [''],
          weeklyEnabled: data.config.weeklyEnabled || false,
          weeklyRecipients: data.config.weeklyRecipients?.length 
            ? data.config.weeklyRecipients : [''],
          monthlyEnabled: data.config.monthlyEnabled || false,
          monthlyRecipients: data.config.monthlyRecipients?.length 
            ? data.config.monthlyRecipients : [''],
        });
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  };

  // Save schedule config
  const saveScheduleConfig = async () => {
    setSavingConfig(true);
    try {
      const cleanConfig = {
        ...scheduleConfig,
        dailyRecipients: scheduleConfig.dailyRecipients.filter(
          r => r && r.includes('@')
        ),
        weeklyRecipients: scheduleConfig.weeklyRecipients.filter(
          r => r && r.includes('@')
        ),
        monthlyRecipients: scheduleConfig.monthlyRecipients.filter(
          r => r && r.includes('@')
        ),
      };

      const response = await fetch(`${FUNCTIONS_BASE_URL}/saveScheduleConfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanConfig),
      });

      const data = await response.json();
      if (data.ok) {
        showNotification('✅ Schedule configuration saved successfully!');
        setShowScheduleConfig(false);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showNotification(`❌ Error saving config: ${err.message}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Load report logs
  const loadReportLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/getReportLogs`);
      const data = await response.json();
      if (data.ok) {
        setReportLogs(data.logs);
      }
    } catch (err) {
      showNotification('Error loading logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  // Filter visits
  useEffect(() => {
    let filtered = [...visits];
    if (searchTerm) {
      filtered = filtered.filter(v =>
        v.visitor?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.visitor?.phone?.includes(searchTerm) ||
        v.channelPartner?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.propertyTypes?.some(pt => 
          pt.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(v =>
        statusFilter === 'booked' 
          ? v.bookingStatus === 'Booked' 
          : v.bookingStatus !== 'Booked'
      );
    }
    setFilteredVisits(filtered);
  }, [searchTerm, statusFilter, visits]);

  useEffect(() => { fetchVisits(); }, [filterBy, showCustomDate, customDateRange]);
  useEffect(() => { loadScheduleConfig(); }, []);

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Recipient management - Manual Send
  const addRecipient = () => setRecipients([...recipients, '']);
  const removeRecipient = (index) => {
    const n = recipients.filter((_, i) => i !== index);
    setRecipients(n.length ? n : ['']);
  };
  const updateRecipient = (index, value) => {
    const n = [...recipients];
    n[index] = value;
    setRecipients(n);
  };

  // Recipient management - Schedule Config
  const addScheduleRecipient = (type) => {
    setScheduleConfig(prev => ({
      ...prev,
      [`${type}Recipients`]: [...prev[`${type}Recipients`], ''],
    }));
  };

  const removeScheduleRecipient = (type, index) => {
    setScheduleConfig(prev => {
      const list = prev[`${type}Recipients`].filter((_, i) => i !== index);
      return { ...prev, [`${type}Recipients`]: list.length ? list : [''] };
    });
  };

  const updateScheduleRecipient = (type, index, value) => {
    setScheduleConfig(prev => {
      const list = [...prev[`${type}Recipients`]];
      list[index] = value;
      return { ...prev, [`${type}Recipients`]: list };
    });
  };

  const toggleSchedule = (type) => {
    setScheduleConfig(prev => ({
      ...prev,
      [`${type}Enabled`]: !prev[`${type}Enabled`],
    }));
  };

  // Download Excel
  const downloadExcel = () => {
    if (filteredVisits.length === 0) {
      showNotification('No data to download', 'error');
      return;
    }
    const ws_data = [
      ['S.No', 'Visitor Name', 'Contact', 'Visit Date', 'Visit Time', 
       'Channel Partner', 'Property Layout', 'Lead Status', 'Booking Status', 
       'Executive', 'Remarks']
    ];
    filteredVisits.forEach((v, i) => {
      ws_data.push([
        i + 1,
        v.visitor?.name || 'N/A',
        `${v.visitor?.countryCode || '+91'} ${v.visitor?.phone || 'N/A'}`,
        v.visitDate,
        v.visitTime,
        v.channelPartner?.name || 'N/A',
        Array.isArray(v.propertyLayout) ? v.propertyLayout.join(', ') : 'N/A',
        v.leadQuality || 'N/A',
        v.bookingStatus || 'Not Booked',
        v.agent?.name || 'N/A',
        v.remarks || '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visit Report');
    XLSX.writeFile(
      wb, 
      `visit-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );
    showNotification('Excel downloaded successfully!');
  };

  // Send Manual Report via Cloud Function
  const sendReport = async () => {
    const validRecipients = recipients.filter(
      r => r && isValidEmail(r.trim())
    );
    if (validRecipients.length === 0) {
      showNotification('Please enter valid email address(es)', 'error');
      return;
    }
    if (filteredVisits.length === 0) {
      showNotification('No visits to report for selected period', 'error');
      return;
    }

    setSending(true);
    try {
      const periodText = showCustomDate ? 'custom' : filterBy;
      const customRange = showCustomDate ? customDateRange : null;

      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/sendManualReport`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: validRecipients,
            filterBy: periodText,
            customDateRange: customRange,
          }),
        }
      );

      const data = await response.json();
      if (data.ok) {
        showNotification(
          `✅ Report sent to ${data.successCount} recipient(s)! ` +
          `(${data.visitCount} visits)`,
          'success'
        );
        if (data.failCount === 0) setRecipients(['']);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showNotification(`❌ Error: ${err.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  // Statistics
  const getStatistics = () => {
    const total = filteredVisits.length;
    if (total === 0) return {
      total: 0, booked: 0, interested: 0, 
      notBooked: 0, bookingRate: 0,
      hotLeads: 0, warmLeads: 0, coldLeads: 0
    };
    const booked = filteredVisits.filter(
      v => v.bookingStatus === 'Booked'
    ).length;
    const interested = filteredVisits.filter(
      v => v.bookingStatus === 'Interested'
    ).length;
    const hotLeads = filteredVisits.filter(
      v => v.leadQuality === 'Hot'
    ).length;
    const warmLeads = filteredVisits.filter(
      v => v.leadQuality === 'Warm'
    ).length;
    const coldLeads = filteredVisits.filter(
      v => v.leadQuality === 'Cold'
    ).length;
    return {
      total,
      booked,
      interested,
      notBooked: total - booked - interested,
      hotLeads,
      warmLeads,
      coldLeads,
      bookingRate: ((booked / total) * 100).toFixed(1),
    };
  };

  const stats = getStatistics();

  // Schedule Config Section
  const renderScheduleSection = (type, label, icon, time) => (
    <div className={`er-schedule-block ${scheduleConfig[`${type}Enabled`] ? 'active' : ''}`}>
      <div className="er-schedule-block-header">
        <div className="er-schedule-block-title">
          <span className="er-schedule-icon">{icon}</span>
          <div>
            <strong>{label}</strong>
            <small>{time}</small>
          </div>
        </div>
        <button
          className={`er-toggle-btn ${scheduleConfig[`${type}Enabled`] ? 'on' : 'off'}`}
          onClick={() => toggleSchedule(type)}
          type="button"
        >
          {scheduleConfig[`${type}Enabled`] ? (
            <><FaToggleOn /> ON</>
          ) : (
            <><FaToggleOff /> OFF</>
          )}
        </button>
      </div>

      {scheduleConfig[`${type}Enabled`] && (
        <div className="er-schedule-recipients">
          <label className="er-recipients-label">
            Recipients for {label}:
          </label>
          {scheduleConfig[`${type}Recipients`].map((email, idx) => (
            <div key={idx} className="er-recipient-row">
              <input
                type="email"
                className={`er-recipient-input ${
                  email && !isValidEmail(email) ? 'invalid' : ''
                }`}
                placeholder="email@example.com"
                value={email}
                onChange={(e) => 
                  updateScheduleRecipient(type, idx, e.target.value)
                }
              />
              {scheduleConfig[`${type}Recipients`].length > 1 && (
                <button
                  className="er-remove-recipient"
                  onClick={() => removeScheduleRecipient(type, idx)}
                  type="button"
                >
                  <FaTimes />
                </button>
              )}
              {email && !isValidEmail(email) && (
                <small className="er-email-error">Invalid email</small>
              )}
            </div>
          ))}
          <button
            className="er-add-recipient"
            onClick={() => addScheduleRecipient(type)}
            type="button"
          >
            <FaPlus /> Add Email
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="er-container">
      {/* Notification Toast */}
      {notification && (
        <div className={`er-notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <FaTimes />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="er-header">
        <div className="er-header-main">
          <div className="er-logo-section">
            <FaChartBar className="er-logo-icon" />
            <div>
              <h1 className="er-title">Visit Report Dashboard</h1>
              <p className="er-subtitle">Analytics & Automated Reporting System</p>
            </div>
          </div>
          <div className="er-header-actions">
            <button
              className="er-btn er-btn-schedule"
              onClick={() => {
                setShowScheduleConfig(!showScheduleConfig);
                setShowLogs(false);
              }}
            >
              <FaCog /> Auto Schedule
            </button>
            <button
              className="er-btn er-btn-logs"
              onClick={() => {
                setShowLogs(!showLogs);
                setShowScheduleConfig(false);
                if (!showLogs) loadReportLogs();
              }}
            >
              <FaHistory /> Logs
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="er-search-section">
          <div className="er-search-wrapper">
            <FaSearch className="er-search-icon" />
            <input
              ref={searchRef}
              type="text"
              className="er-search-input"
              placeholder="Search by name, phone, channel partner..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="er-search-clear"
                onClick={() => setSearchTerm('')}
              >
                <FaTimes />
              </button>
            )}
          </div>

          <div className="er-filter-chips">
            <button
              className={`er-filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({visits.length})
            </button>
            <button
              className={`er-filter-chip ${statusFilter === 'booked' ? 'active' : ''}`}
              onClick={() => setStatusFilter('booked')}
            >
              <FaCheckCircle /> Booked (
              {visits.filter(v => v.bookingStatus === 'Booked').length})
            </button>
            <button
              className={`er-filter-chip ${statusFilter === 'notbooked' ? 'active' : ''}`}
              onClick={() => setStatusFilter('notbooked')}
            >
              <FaTimesCircle /> Not Booked (
              {visits.filter(v => v.bookingStatus !== 'Booked').length})
            </button>
          </div>
        </div>
      </header>

      {/* Auto Schedule Config Panel */}
      {showScheduleConfig && (
        <div className="er-schedule-panel">
          <div className="er-schedule-panel-header">
            <h3><FaCog /> Automatic Email Schedule Configuration</h3>
            <p className="er-schedule-subtitle">
              Set automatic emails — no backend needed!
            </p>
          </div>

          <div className="er-schedule-blocks">
            {renderScheduleSection(
              'daily', 
              'Daily Report', 
              '🌙', 
              'Sends every day at 9 PM IST'
            )}
            {renderScheduleSection(
              'weekly', 
              'Weekly Report', 
              '📅', 
              'Sends every Monday at 9 AM IST'
            )}
            {renderScheduleSection(
              'monthly', 
              'Monthly Report', 
              '📆', 
              'Sends on 1st of every month at 9 AM IST'
            )}
          </div>

          <div className="er-schedule-actions">
            <button
              className="er-btn er-btn-send"
              onClick={saveScheduleConfig}
              disabled={savingConfig}
            >
              {savingConfig ? (
                <><FaSpinner className="er-spin" /> Saving...</>
              ) : (
                <><FaSave /> Save Schedule Config</>
              )}
            </button>
            <button
              className="er-btn er-btn-refresh"
              onClick={() => setShowScheduleConfig(false)}
            >
              <FaTimes /> Close
            </button>
          </div>
        </div>
      )}

      {/* Report Logs Panel */}
      {showLogs && (
        <div className="er-logs-panel">
          <div className="er-logs-header">
            <h3><FaHistory /> Email Report Logs</h3>
            <button
              className="er-btn er-btn-refresh"
              onClick={loadReportLogs}
              disabled={logsLoading}
            >
              {logsLoading ? (
                <FaSpinner className="er-spin" />
              ) : (
                <FaSync />
              )} Refresh
            </button>
          </div>

          {logsLoading ? (
            <div className="er-loading-state">
              <FaSpinner className="er-spin" /> Loading logs...
            </div>
          ) : reportLogs.length === 0 ? (
            <div className="er-empty-state">
              <p>No report logs found yet.</p>
            </div>
          ) : (
            <div className="er-logs-list">
              {reportLogs.map((log, i) => (
                <div key={log.id || i} className="er-log-item">
                  <div className="er-log-type">
                    {log.type === 'daily' ? '🌙 Daily'
                      : log.type === 'weekly' ? '📅 Weekly'
                      : log.type === 'monthly' ? '📆 Monthly'
                      : '📨 Manual'}
                  </div>
                  <div className="er-log-details">
                    <div className="er-log-meta">
                      <span>📧 {log.recipients?.length || 0} recipients</span>
                      <span>📊 {log.visitCount || 0} visits</span>
                      <span className="er-log-success">
                        ✅ {log.success || 0} sent
                      </span>
                      {log.failed > 0 && (
                        <span className="er-log-failed">
                          ❌ {log.failed} failed
                        </span>
                      )}
                    </div>
                    <div className="er-log-time">
                      🕐 {log.sentAt 
                        ? new Date(log.sentAt).toLocaleString('en-IN') 
                        : 'Unknown'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time Filter */}
      <div className="er-filter-section">
        <div className="er-filter-header">
          <FaCalendarAlt className="er-filter-icon" />
          <span className="er-filter-label">Time Period</span>
          <button
            className="er-custom-date-btn"
            onClick={() => setShowCustomDate(!showCustomDate)}
          >
            {showCustomDate ? 'Preset Ranges' : 'Custom Range'}
          </button>
        </div>

        {showCustomDate ? (
          <div className="er-custom-date-range">
            <input
              type="date"
              className="er-date-input"
              value={customDateRange.start}
              onChange={(e) => 
                setCustomDateRange({ ...customDateRange, start: e.target.value })
              }
            />
            <span className="er-date-separator">to</span>
            <input
              type="date"
              className="er-date-input"
              value={customDateRange.end}
              onChange={(e) => 
                setCustomDateRange({ ...customDateRange, end: e.target.value })
              }
            />
            <button
              className="er-apply-date-btn"
              onClick={fetchVisits}
              disabled={!customDateRange.start || !customDateRange.end}
            >
              Apply
            </button>
          </div>
        ) : (
          <div className="er-filter-tabs">
            {['24h', '7d', '30d', '90d', '1y'].map(period => (
              <button
                key={period}
                className={`er-filter-tab ${filterBy === period ? 'active' : ''}`}
                onClick={() => setFilterBy(period)}
              >
                {period === '24h' && 'Last 24 Hours'}
                {period === '7d' && 'Last 7 Days'}
                {period === '30d' && 'Last 30 Days'}
                {period === '90d' && 'Last 90 Days'}
                {period === '1y' && 'Last Year'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="er-stats-section">
        <div className="er-stats-grid">
          <div className="er-stat-card total">
            <div className="er-stat-icon"><FaUsers /></div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.total}</div>
              <div className="er-stat-label">Total Visits</div>
            </div>
          </div>
          <div className="er-stat-card success">
            <div className="er-stat-icon"><FaCheckCircle /></div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.booked}</div>
              <div className="er-stat-label">Booked</div>
            </div>
          </div>
          <div className="er-stat-card warning">
            <div className="er-stat-icon">⭐</div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.interested}</div>
              <div className="er-stat-label">Interested</div>
            </div>
          </div>
          <div className="er-stat-card danger">
            <div className="er-stat-icon"><FaTimesCircle /></div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.notBooked}</div>
              <div className="er-stat-label">Not Booked</div>
            </div>
          </div>
          <div className="er-stat-card info">
            <div className="er-stat-icon"><FaPercentage /></div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.bookingRate}%</div>
              <div className="er-stat-label">Conversion Rate</div>
            </div>
          </div>
          <div className="er-stat-card hot">
            <div className="er-stat-icon">🔥</div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.hotLeads}</div>
              <div className="er-stat-label">Hot Leads</div>
            </div>
          </div>
          <div className="er-stat-card warm">
            <div className="er-stat-icon">⚡</div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.warmLeads}</div>
              <div className="er-stat-label">Warm Leads</div>
            </div>
          </div>
          <div className="er-stat-card cold">
            <div className="er-stat-icon">❄️</div>
            <div className="er-stat-content">
              <div className="er-stat-value">{stats.coldLeads}</div>
              <div className="er-stat-label">Cold Leads</div>
            </div>
          </div>
        </div>
      </div>

      {/* Email Configuration - Manual Send */}
      <div className="er-config-section">
        <div className="er-config-header">
          <h3 className="er-config-title">
            <FaEnvelope /> Send Manual Report
          </h3>
          <p className="er-config-subtitle">
            Send report right now to specific recipients
          </p>
        </div>

        <div className="er-recipients-section">
          <label className="er-recipients-label">Recipients</label>
          <div className="er-recipients-list">
            {recipients.map((email, index) => (
              <div key={index} className="er-recipient-row">
                <input
                  type="email"
                  className={`er-recipient-input ${
                    email && !isValidEmail(email) ? 'invalid' : ''
                  }`}
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => updateRecipient(index, e.target.value)}
                />
                {recipients.length > 1 && (
                  <button
                    className="er-remove-recipient"
                    onClick={() => removeRecipient(index)}
                  >
                    <FaTimes />
                  </button>
                )}
                {email && !isValidEmail(email) && (
                  <small className="er-email-error">
                    Please enter a valid email address
                  </small>
                )}
              </div>
            ))}
            <button
              className="er-add-recipient"
              onClick={addRecipient}
            >
              <FaPlus /> Add Recipient
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="er-actions-section">
          <div className="er-action-group">
            <button
              className="er-btn er-btn-refresh"
              onClick={fetchVisits}
              disabled={loading}
            >
              {loading ? (
                <><FaSpinner className="er-spin" /> Loading...</>
              ) : (
                <><FaSync /> Refresh</>
              )}
            </button>

            <button
              className={`er-btn er-btn-preview ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
            >
              <FaEye /> Data Preview
            </button>

            <button
              className="er-btn er-btn-excel"
              onClick={downloadExcel}
              disabled={filteredVisits.length === 0}
            >
              <FaFileExcel /> Excel
            </button>
          </div>

          <div className="er-action-group">
            <button
              className="er-btn er-btn-send"
              onClick={sendReport}
              disabled={
                sending || 
                filteredVisits.length === 0 || 
                !recipients.some(r => r && isValidEmail(r))
              }
            >
              {sending ? (
                <><FaSpinner className="er-spin" /> Sending...</>
              ) : (
                <><FaEnvelope /> Send Report ({filteredVisits.length} visits)</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Data Preview Modal */}
      {showPreview && (
        <div className="er-preview-modal">
          <div className="er-preview-container">
            <div className="er-preview-header">
              <h3>Data Preview ({filteredVisits.length} visits)</h3>
              <button
                className="er-preview-close"
                onClick={() => setShowPreview(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div className="er-preview-body">
              <div className="er-table-container">
                <table className="er-data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Visitor Name</th>
                      <th>Contact</th>
                      <th>Visit Date</th>
                      <th>Time</th>
                      <th>Channel Partner</th>
                      <th>Property</th>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Executive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisits.map((v, i) => (
                      <tr key={v.id}>
                        <td>{i + 1}</td>
                        <td>{v.visitor?.name || 'N/A'}</td>
                        <td>
                          {v.visitor?.countryCode || '+91'} {' '}
                          {v.visitor?.phone || 'N/A'}
                        </td>
                        <td>{v.visitDate}</td>
                        <td>{v.visitTime}</td>
                        <td>{v.channelPartner?.name || 'N/A'}</td>
                        <td>
                          {Array.isArray(v.propertyLayout)
                            ? v.propertyLayout.join(', ')
                            : 'N/A'}
                        </td>
                        <td>
                          <span className={`er-lead-badge ${
                            (v.leadQuality || '').toLowerCase()
                          }`}>
                            {v.leadQuality === 'Hot' ? '🔥'
                              : v.leadQuality === 'Warm' ? '⚡' : '❄️'}
                            {' '}{v.leadQuality || 'N/A'}
                          </span>
                        </td>
                        <td>
                          <span className={`er-status-badge ${
                            v.bookingStatus === 'Booked' ? 'success'
                              : v.bookingStatus === 'Interested' ? 'warning'
                              : 'pending'
                          }`}>
                            {v.bookingStatus || 'Not Booked'}
                          </span>
                        </td>
                        <td>{v.agent?.name || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredVisits.length === 0 && (
        <div className="er-empty-state">
          <div className="er-empty-icon">📊</div>
          <h3 className="er-empty-title">No Data Available</h3>
          <p className="er-empty-message">
            No visit data found for the selected period
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="er-loading-state">
          <FaSpinner className="er-spin" />
          <p>Loading visit data...</p>
        </div>
      )}
    </div>
  );
}

export default EmailReport;