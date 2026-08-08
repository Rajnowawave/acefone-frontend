// LeadManagement.jsx — Complete Integrated Code
import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Upload, Download, Filter,
  Edit2, Trash2, X, FileText, Calendar,
  BarChart3, TrendingUp, Users, MapPin,
  Building2, ChevronLeft, ChevronRight,
  Eye, Activity, TableProperties
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';
import './LeadManagement.css';

/* ════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════ */
const PROPERTY_TYPES = [
  'Apartment', 'Villa', 'Plot', 'Commercial', 'Farmhouse', 'Office Space'
];

const CHART_COLORS = [
  '#1e2d5a', '#c17f3e', '#27694f',
  '#b5621e', '#6d28d9', '#0ea5e9'
];

const TEMPLATES = {
  basic: {
    name: 'Basic Template',
    description: '3 sample rows — see the exact format',
    icon: '📋',
    headers: ['Date', 'Name', 'Contact no.', 'City', 'Property Type'],
    rows: [
      { Date: '2025-01-15', Name: 'Rajesh Kumar',  'Contact no.': '+91 98765 43210', City: 'Mumbai',    'Property Type': 'Apartment' },
      { Date: '2025-01-16', Name: 'Priya Sharma',  'Contact no.': '+91 87654 32109', City: 'Delhi',     'Property Type': 'Villa' },
      { Date: '2025-01-17', Name: 'Amit Patel',    'Contact no.': '+91 76543 21098', City: 'Bangalore', 'Property Type': 'Plot' },
    ]
  },
  bulk: {
    name: 'Bulk Import (20 rows)',
    description: '20 sample rows with varied cities & types',
    icon: '📊',
    headers: ['Date', 'Name', 'Contact no.', 'City', 'Property Type'],
    rows: [
      { Date:'2025-01-01', Name:'Aakash Sharma',  'Contact no.':'+91 98001 10001', City:'Mumbai',         'Property Type':'Apartment'  },
      { Date:'2025-01-02', Name:'Babita Verma',   'Contact no.':'+91 98001 10002', City:'Delhi',          'Property Type':'Villa'      },
      { Date:'2025-01-03', Name:'Chetan Patel',   'Contact no.':'+91 98001 10003', City:'Bangalore',      'Property Type':'Plot'       },
      { Date:'2025-01-04', Name:'Divya Nair',     'Contact no.':'+91 98001 10004', City:'Hyderabad',      'Property Type':'Commercial' },
      { Date:'2025-01-05', Name:'Eshan Gupta',    'Contact no.':'+91 98001 10005', City:'Pune',           'Property Type':'Farmhouse'  },
      { Date:'2025-01-06', Name:'Farida Sheikh',  'Contact no.':'+91 98001 10006', City:'Chennai',        'Property Type':'Office Space'},
      { Date:'2025-01-07', Name:'Gaurav Mishra',  'Contact no.':'+91 98001 10007', City:'Kolkata',        'Property Type':'Apartment'  },
      { Date:'2025-01-08', Name:'Hina Qureshi',   'Contact no.':'+91 98001 10008', City:'Ahmedabad',      'Property Type':'Villa'      },
      { Date:'2025-01-09', Name:'Ishan Tiwari',   'Contact no.':'+91 98001 10009', City:'Jaipur',         'Property Type':'Plot'       },
      { Date:'2025-01-10', Name:'Jyoti Yadav',    'Contact no.':'+91 98001 10010', City:'Lucknow',        'Property Type':'Apartment'  },
      { Date:'2025-01-11', Name:'Karan Mehta',    'Contact no.':'+91 98001 10011', City:'Surat',          'Property Type':'Commercial' },
      { Date:'2025-01-12', Name:'Lata Desai',     'Contact no.':'+91 98001 10012', City:'Nagpur',         'Property Type':'Farmhouse'  },
      { Date:'2025-01-13', Name:'Mohit Singh',    'Contact no.':'+91 98001 10013', City:'Indore',         'Property Type':'Villa'      },
      { Date:'2025-01-14', Name:'Nisha Pandey',   'Contact no.':'+91 98001 10014', City:'Bhopal',         'Property Type':'Apartment'  },
      { Date:'2025-01-15', Name:'Om Prakash',     'Contact no.':'+91 98001 10015', City:'Patna',          'Property Type':'Plot'       },
      { Date:'2025-01-16', Name:'Poonam Jain',    'Contact no.':'+91 98001 10016', City:'Vadodara',       'Property Type':'Office Space'},
      { Date:'2025-01-17', Name:'Qasim Ali',      'Contact no.':'+91 98001 10017', City:'Coimbatore',     'Property Type':'Commercial' },
      { Date:'2025-01-18', Name:'Rekha Soni',     'Contact no.':'+91 98001 10018', City:'Visakhapatnam',  'Property Type':'Apartment'  },
      { Date:'2025-01-19', Name:'Suresh Babu',    'Contact no.':'+91 98001 10019', City:'Kochi',          'Property Type':'Villa'      },
      { Date:'2025-01-20', Name:'Tara Khanna',    'Contact no.':'+91 98001 10020', City:'Chandigarh',     'Property Type':'Farmhouse'  },
    ]
  },
  empty: {
    name: 'Empty Template',
    description: 'Headers only — fill your own data',
    icon: '📝',
    headers: ['Date', 'Name', 'Contact no.', 'City', 'Property Type'],
    rows: [{ Date:'', Name:'', 'Contact no.':'', City:'', 'Property Type':'' }]
  }
};

/* ════════════════════════════════════════
   CUSTOM TOOLTIP
════════════════════════════════════════ */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8e5de',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(30,45,90,0.10)',
      padding: '10px 14px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '0.88rem',
        fontWeight: 600,
        color: '#1e2d5a',
        marginBottom: 4
      }}>{label}</div>
      {payload.map((e, i) => (
        <div key={i} style={{ fontSize: '0.78rem', color: e.color, fontWeight: 600 }}>
          {e.name}: <strong>{e.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════
   TEMPLATE DOWNLOAD MODAL
════════════════════════════════════════ */
const TemplateModal = ({ onClose }) => {
  const [selected, setSelected] = useState('basic');

  const downloadTemplate = () => {
    const tmpl   = TEMPLATES[selected];
    const wb     = XLSX.utils.book_new();

    /* Sheet 1 — Data */
    const ws1    = XLSX.utils.json_to_sheet(tmpl.rows, { header: tmpl.headers });
    ws1['!cols'] = [{ wch:14 },{ wch:22 },{ wch:18 },{ wch:18 },{ wch:18 }];
    ws1['!rows'] = [{ hpt:22 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Leads Data');

    /* Sheet 2 — Instructions */
    const instrRows = [
      ['LEAD MANAGEMENT — IMPORT INSTRUCTIONS'],
      [''],
      ['FIELD',        'FORMAT',      'REQUIRED', 'EXAMPLE',          'NOTES'],
      ['Date',         'YYYY-MM-DD',  'Optional', '2025-01-15',       "If blank, today's date is used"],
      ['Name',         'Text',        'Required', 'Rajesh Kumar',     'Full name of the lead'],
      ['Contact no.',  'Text',        'Required', '+91 98765 43210',  'Include country code'],
      ['City',         'Text',        'Required', 'Mumbai',           'Any city — type manually'],
      ['Property Type','Text',        'Required', 'Apartment',        'See valid values in Sheet 3'],
      [''],
      ['RULES:'],
      ['1. Do NOT rename the column headers'],
      ['2. Date must be YYYY-MM-DD format'],
      ['3. Delete sample rows before importing real data'],
      ['4. Save as .xlsx or .csv'],
      ['5. Max 5000 rows per import'],
    ];
    const ws2    = XLSX.utils.aoa_to_sheet(instrRows);
    ws2['!cols'] = [{ wch:18 },{ wch:20 },{ wch:12 },{ wch:22 },{ wch:44 }];
    ws2['!merges'] = [{ s:{ r:0,c:0 }, e:{ r:0,c:4 } }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    /* Sheet 3 — Valid Values */
    const validRows = [
      ['VALID PROPERTY TYPES'],[''],
      ['Value','Use exactly this text'],
      ...PROPERTY_TYPES.map(t => [t, `"${t}"`]),
      [''],
      ['DATE FORMAT EXAMPLES'],[''],
      ['Input','Meaning'],
      ['2025-01-15','15 January 2025'],
      ['2025-06-30','30 June 2025'],
      ['2025-12-01','1 December 2025'],
    ];
    const ws3    = XLSX.utils.aoa_to_sheet(validRows);
    ws3['!cols'] = [{ wch:20 },{ wch:36 }];
    ws3['!merges'] = [
      { s:{ r:0,c:0 }, e:{ r:0,c:1 } },
      { s:{ r:6,c:0 }, e:{ r:6,c:1 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'Valid Values');

    XLSX.writeFile(wb, `lead_template_${selected}_${new Date().toISOString().split('T')[0]}.xlsx`);
    onClose();
  };

  return (
    <div className="lm-modal-overlay" onClick={onClose}>
      <div className="lm-modal lm-modal--wide" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lm-modal__header">
          <div>
            <h2 className="lm-modal__title">📥 Download Import Template</h2>
            <p className="lm-modal__subtitle">
              Each file has 3 sheets: Leads Data · Instructions · Valid Values
            </p>
          </div>
          <button className="lm-modal__close" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Body */}
        <div className="lm-modal__body">
          {Object.entries(TEMPLATES).map(([key, tmpl]) => (
            <div
              key={key}
              className={`tmpl-card ${selected === key ? 'tmpl-card--active' : ''}`}
              onClick={() => setSelected(key)}
            >
              <div className="tmpl-card__icon">{tmpl.icon}</div>

              <div style={{ flex:1, minWidth:0 }}>
                <div className="tmpl-card__name">{tmpl.name}</div>
                <div className="tmpl-card__desc">{tmpl.description}</div>
                <div className="tmpl-card__cols">
                  {tmpl.headers.map(h => (
                    <span key={h} className="tmpl-col-pill">{h}</span>
                  ))}
                </div>
              </div>

              <div className="tmpl-radio">
                {selected === key && <div className="tmpl-radio__dot"/>}
              </div>
            </div>
          ))}

          <div className="tmpl-info-box">
            <span style={{ fontSize:'1rem', flexShrink:0 }}>ℹ️</span>
            <div className="tmpl-info-box__text">
              The downloaded <strong>.xlsx</strong> file contains{' '}
              <strong>3 sheets</strong>:{' '}
              <strong>Leads Data</strong> (fill here),{' '}
              <strong>Instructions</strong> (field guide),{' '}
              <strong>Valid Values</strong> (accepted Property Types + Date format examples).
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="lm-modal__footer" style={{ justifyContent:'space-between' }}>
          <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6 }}>
            📁 Saves as <strong style={{ color:'var(--text-secondary)' }}>.xlsx</strong>
          </span>
          <div style={{ display:'flex', gap:10 }}>
            <button className="lm-btn lm-btn--ghost" onClick={onClose}>Cancel</button>
            <button className="lm-btn lm-btn--template" onClick={downloadTemplate}>
              <Download size={15}/> Download {TEMPLATES[selected].name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════
   LEAD FORM FIELDS (shared Add / Edit)
════════════════════════════════════════ */
const LeadFormFields = ({ data, setData }) => (
  <>
    <div className="lm-form-group">
      <label className="lm-label"><Calendar size={13}/> Date</label>
      <input type="date" value={data.date} className="lm-input"
        onChange={e => setData({ ...data, date: e.target.value })} />
    </div>
    <div className="lm-form-group">
      <label className="lm-label">
        <Users size={13}/> Name <span className="lm-label__required">*</span>
      </label>
      <input type="text" value={data.name} placeholder="Enter full name" className="lm-input"
        onChange={e => setData({ ...data, name: e.target.value })} />
    </div>
    <div className="lm-form-group">
      <label className="lm-label">
        <Eye size={13}/> Contact No. <span className="lm-label__required">*</span>
      </label>
      <input type="tel" value={data.contact} placeholder="+91 XXXXX XXXXX" className="lm-input"
        onChange={e => setData({ ...data, contact: e.target.value })} />
    </div>
    <div className="lm-form-group">
      <label className="lm-label">
        <MapPin size={13}/> City <span className="lm-label__required">*</span>
      </label>
      <input type="text" value={data.city} placeholder="Type city name" className="lm-input"
        onChange={e => setData({ ...data, city: e.target.value })} />
    </div>
    <div className="lm-form-group">
      <label className="lm-label">
        <Building2 size={13}/> Property Type <span className="lm-label__required">*</span>
      </label>
      <select value={data.propertyType} className="lm-select"
        onChange={e => setData({ ...data, propertyType: e.target.value })}>
        <option value="">Select Property Type</option>
        {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  </>
);

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
const LeadManagement = () => {

  /* ── State ── */
  const [leads, setLeads] = useState([

  ]);

  const [searchTerm,         setSearchTerm]         = useState('');
  const [filterCity,         setFilterCity]          = useState('');
  const [filterPropertyType, setFilterPropertyType]  = useState('');
  const [currentPage,        setCurrentPage]         = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [showAddModal,      setShowAddModal]      = useState(false);
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [showFilterModal,   setShowFilterModal]   = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const [chartView,          setChartView]          = useState('monthly');
  const [selectedChartMonth, setSelectedChartMonth] = useState(null);

  const emptyLead = { date:'', name:'', contact:'', city:'', propertyType:'' };
  const [newLead,  setNewLead]  = useState(emptyLead);
  const [editLead, setEditLead] = useState({ id:null, ...emptyLead });

  /* ── Derived data ── */
  const uniqueCities = useMemo(() =>
    [...new Set(leads.map(l => l.city))].filter(Boolean).sort(), [leads]);

  const filteredLeads = useMemo(() =>
    leads.filter(lead => {
      const s = searchTerm.toLowerCase();
      const ms = lead.name.toLowerCase().includes(s) ||
                 lead.contact.includes(searchTerm) ||
                 lead.city.toLowerCase().includes(s) ||
                 lead.propertyType.toLowerCase().includes(s);
      const mc = filterCity         ? lead.city.toLowerCase() === filterCity.toLowerCase() : true;
      const mp = filterPropertyType ? lead.propertyType === filterPropertyType             : true;
      return ms && mc && mp;
    }), [leads, searchTerm, filterCity, filterPropertyType]);

  /* Pagination */
  const totalPages   = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const indexOfFirst = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentLeads = filteredLeads.slice(indexOfFirst, indexOfFirst + ITEMS_PER_PAGE);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const now    = new Date();
    const mth    = leads.filter(l => {
      const d = new Date(l.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const wkStart = new Date(now);
    wkStart.setDate(now.getDate() - now.getDay());
    wkStart.setHours(0,0,0,0);
    const wk = leads.filter(l => new Date(l.date) >= wkStart);
    const td = leads.filter(l => new Date(l.date).toDateString() === now.toDateString());
    return {
      total:     leads.length,
      thisMonth: mth.length,
      thisWeek:  wk.length,
      today:     td.length,
      cities:    uniqueCities.length,
    };
  }, [leads, uniqueCities]);

  /* ── Chart data ── */
  const monthlyData = useMemo(() => {
    const map = {};
    leads.forEach(l => {
      const d   = new Date(l.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const lbl = d.toLocaleString('en-IN', { month:'short', year:'2-digit' });
      if (!map[key]) map[key] = { key, month:lbl, leads:0 };
      map[key].leads++;
    });
    return Object.values(map).sort((a,b) => a.key.localeCompare(b.key));
  }, [leads]);

  const weeklyData = useMemo(() => {
    const map = {};
    leads.forEach(l => {
      const d   = new Date(l.date);
      const soy = new Date(d.getFullYear(), 0, 1);
      const wn  = Math.ceil(((d - soy)/86400000 + soy.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(wn).padStart(2,'0')}`;
      if (!map[key]) map[key] = { key, week:`W${wn}`, leads:0 };
      map[key].leads++;
    });
    return Object.values(map).sort((a,b) => a.key.localeCompare(b.key));
  }, [leads]);

  const dailyData = useMemo(() => {
    const now  = new Date();
    let yr, mo;
    if (selectedChartMonth) {
      [yr, mo] = selectedChartMonth.split('-').map(Number); mo -= 1;
    } else {
      yr = now.getFullYear(); mo = now.getMonth();
    }
    const days   = new Date(yr, mo+1, 0).getDate();
    const mapD   = {};
    for (let i = 1; i <= days; i++) {
      const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      mapD[ds]  = { date:ds, day:new Date(yr,mo,i).toLocaleString('en-IN',{weekday:'short'}), dayNum:i, leads:0 };
    }
    leads.forEach(l => {
      const d = new Date(l.date);
      if (d.getFullYear()===yr && d.getMonth()===mo) {
        const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (mapD[ds]) mapD[ds].leads++;
      }
    });
    return Object.values(mapD);
  }, [leads, selectedChartMonth]);

  const cityData = useMemo(() => {
    const m = {};
    leads.forEach(l => { if (!m[l.city]) m[l.city] = { city:l.city, count:0 }; m[l.city].count++; });
    return Object.values(m).sort((a,b) => b.count - a.count);
  }, [leads]);

  const propertyData = useMemo(() => {
    const m = {};
    leads.forEach(l => { if (!m[l.propertyType]) m[l.propertyType] = { type:l.propertyType, count:0 }; m[l.propertyType].count++; });
    return Object.values(m).sort((a,b) => b.count - a.count);
  }, [leads]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedChartMonth) return new Date().toLocaleString('en-IN', { month:'long', year:'numeric' });
    const [y,m] = selectedChartMonth.split('-').map(Number);
    return new Date(y, m-1).toLocaleString('en-IN', { month:'long', year:'numeric' });
  }, [selectedChartMonth]);

  const dailySummary = useMemo(() => ({
    total:      dailyData.reduce((s,d) => s+d.leads, 0),
    peak:       Math.max(0, ...dailyData.map(d => d.leads)),
    avg:        (dailyData.reduce((s,d) => s+d.leads, 0) / Math.max(1, dailyData.length)).toFixed(1),
    activeDays: dailyData.filter(d => d.leads > 0).length,
  }), [dailyData]);

  /* ── Handlers ── */
  const handleImport = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type:'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const imp  = data.map((row, i) => ({
          id:           Date.now() + i,
          date:         row.Date         || row.date         || new Date().toISOString().split('T')[0],
          name:         row.Name         || row.name         || '',
          contact:      row['Contact no.']|| row.contact     || row.Contact || '',
          city:         row.City         || row.city         || '',
          propertyType: row['Property Type'] || row.propertyType || '',
        }));
        setLeads(prev => [...prev, ...imp]);
        alert(`✅ Successfully imported ${imp.length} leads!`);
      } catch { alert('❌ Error importing file. Please check format.'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const data = filteredLeads.map(l => ({
      Date:           l.date,
      Name:           l.name,
      'Contact no.':  l.contact,
      City:           l.city,
      'Property Type':l.propertyType,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleAddLead = () => {
    if (!newLead.name || !newLead.contact || !newLead.city || !newLead.propertyType)
      return alert('Please fill all required fields');
    setLeads(prev => [{
      id:   Date.now(),
      date: newLead.date || new Date().toISOString().split('T')[0],
      ...newLead
    }, ...prev]);
    setNewLead(emptyLead);
    setShowAddModal(false);
  };

  const handleSaveEdit = () => {
    if (!editLead.name || !editLead.contact || !editLead.city || !editLead.propertyType)
      return alert('Please fill all required fields');
    setLeads(prev => prev.map(l => l.id === editLead.id ? { ...editLead } : l));
    setShowEditModal(false);
  };

  const handleDelete = id => {
    if (window.confirm('Are you sure you want to delete this lead?'))
      setLeads(prev => prev.filter(l => l.id !== id));
  };

  const openEdit = lead => { setEditLead({ ...lead }); setShowEditModal(true); };

  const resetFilters = () => {
    setFilterCity(''); setFilterPropertyType('');
    setSearchTerm(''); setShowFilterModal(false);
  };

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div className="lm-dashboard">

      {/* ═══════════ HEADER ═══════════ */}
      <div className="lm-header">
        <div className="lm-header__left">
          <h1><BarChart3 size={26}/> Lead Management</h1>
          <p>Manage, track and analyse all your property leads in one place</p>
        </div>
        <div className="lm-header__actions">
          <button className="lm-btn lm-btn--ghost lm-btn--sm"
            onClick={() => setShowFilterModal(true)}>
            <Filter size={15}/> Filter
          </button>

          {/* ── Template Download ── */}
          <button className="lm-btn lm-btn--template lm-btn--sm"
            onClick={() => setShowTemplateModal(true)}>
            <TableProperties size={15}/> Template
          </button>

          {/* ── Import ── */}
          <label className="lm-btn lm-btn--outline lm-btn--sm lm-btn--import">
            <Upload size={15}/> Import
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport}/>
          </label>

          {/* ── Export ── */}
          <button className="lm-btn lm-btn--outline lm-btn--sm" onClick={handleExport}>
            <Download size={15}/> Export
          </button>

          {/* ── Add Lead ── */}
          <button className="lm-btn lm-btn--primary lm-btn--sm"
            onClick={() => setShowAddModal(true)}>
            <Plus size={15}/> Add Lead
          </button>
        </div>
      </div>

      {/* ═══════════ STATS ═══════════ */}
      <div className="lm-stats">
        <div className="lm-stats__grid">
          {[
            { icon:<FileText size={21}/>, cls:'icon--navy',   val:stats.total,     lbl:'Total Leads',  ctx:'All records'                                  },
            { icon:<Calendar size={21}/>, cls:'icon--green',  val:stats.thisMonth, lbl:'This Month',   ctx:new Date().toLocaleString('en-IN',{month:'long'})},
            { icon:<TrendingUp size={21}/>,cls:'icon--accent', val:stats.thisWeek,  lbl:'This Week',    ctx:'Current week'                                  },
            { icon:<Eye size={21}/>,      cls:'icon--amber',  val:stats.today,     lbl:'Today',        ctx:new Date().toLocaleDateString('en-IN')           },
            { icon:<MapPin size={21}/>,   cls:'icon--purple', val:stats.cities,    lbl:'Cities',       ctx:'Unique locations'                               },
          ].map((s,i) => (
            <div className="lm-stat-card" key={i}>
              <div className={`lm-stat-card__icon ${s.cls}`}>{s.icon}</div>
              <div>
                <p className="lm-stat-card__label">{s.lbl}</p>
                <h3 className="lm-stat-card__value">{s.val}</h3>
                <span className="lm-stat-card__context">{s.ctx}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ ANALYTICS ═══════════ */}
      <div className="lm-analytics">

        {/* Analytics header */}
        <div className="lm-analytics__header">
          <div>
            <h3 className="lm-analytics__title"><Activity size={20}/> Lead Analytics</h3>
            <p className="lm-analytics__subtitle">Visualise your lead acquisition trends</p>
          </div>
          <div className="lm-view-toggle">
            {[
              { key:'daily',   icon:<Calendar size={13}/>,   label:'Daily'   },
              { key:'weekly',  icon:<BarChart3 size={13}/>,  label:'Weekly'  },
              { key:'monthly', icon:<TrendingUp size={13}/>, label:'Monthly' },
            ].map(v => (
              <button key={v.key}
                className={`lm-view-toggle__btn ${chartView===v.key ? 'lm-view-toggle__btn--active' : ''}`}
                onClick={() => setChartView(v.key)}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Month quick selector (daily view) */}
        {chartView === 'daily' && monthlyData.length > 0 && (
          <div className="lm-month-selector">
            {monthlyData.map(m => {
              const now     = new Date();
              const autoKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
              const active  = (selectedChartMonth || autoKey) === m.key;
              return (
                <button key={m.key}
                  className={`lm-month-btn ${active ? 'lm-month-btn--active' : ''}`}
                  onClick={() => setSelectedChartMonth(m.key)}>
                  <span className="lm-month-btn__label">{m.month}</span>
                  <span className="lm-month-btn__count">{m.leads}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main chart card */}
        <div className="lm-chart-card">
          <div className="lm-chart-card__header">
            <h3 className="lm-chart-card__title">
              {chartView === 'daily'   && <><Calendar size={18}/> Daily Leads — {selectedMonthLabel}</>}
              {chartView === 'weekly'  && <><BarChart3 size={18}/> Weekly Leads Overview</>}
              {chartView === 'monthly' && <><TrendingUp size={18}/> Monthly Leads Trend</>}
            </h3>
            <span className="lm-chart-card__badge">
              {chartView === 'daily'   && `${dailySummary.total} leads`}
              {chartView === 'weekly'  && `${weeklyData.length} weeks`}
              {chartView === 'monthly' && `${monthlyData.length} months`}
            </span>
          </div>

          {/* Daily summary bar */}
          {chartView === 'daily' && (
            <div className="lm-daily-stats">
              {[
                { icon:<FileText size={15}/>,   cls:'icon--navy',   val:dailySummary.total,      lbl:'Total'      },
                { icon:<TrendingUp size={15}/>, cls:'icon--green',  val:dailySummary.peak,       lbl:'Peak Day'   },
                { icon:<Activity size={15}/>,   cls:'icon--accent', val:dailySummary.avg,        lbl:'Avg / Day'  },
                { icon:<BarChart3 size={15}/>,  cls:'icon--amber',  val:dailySummary.activeDays, lbl:'Active Days'},
              ].map((s,i) => (
                <div className="lm-daily-stat" key={i}>
                  <div className={`lm-daily-stat__icon ${s.cls}`}>{s.icon}</div>
                  <div>
                    <div className="lm-daily-stat__value">{s.val}</div>
                    <div className="lm-daily-stat__label">{s.lbl}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div style={{ height: chartView === 'daily' ? 320 : 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartView === 'daily' ? (
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" vertical={false}/>
                  <XAxis dataKey="dayNum" tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={{ stroke:'#e8e5de' }}/>
                  <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Bar dataKey="leads" name="Leads" fill="#1e2d5a" radius={[4,4,0,0]} maxBarSize={28}/>
                </BarChart>
              ) : chartView === 'weekly' ? (
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="wkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1e2d5a" stopOpacity={0.18}/>
                      <stop offset="95%" stopColor="#1e2d5a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" vertical={false}/>
                  <XAxis dataKey="week" tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={{ stroke:'#e8e5de' }}/>
                  <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="#1e2d5a" fill="url(#wkGrad)"
                    strokeWidth={2.5} dot={{ r:4, fill:'#1e2d5a' }}
                    activeDot={{ r:6, stroke:'#fff', strokeWidth:2 }}/>
                </AreaChart>
              ) : (
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={{ stroke:'#e8e5de' }}/>
                  <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'#9b9690' }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Line type="monotone" dataKey="leads" name="Leads" stroke="#c17f3e"
                    strokeWidth={3} dot={{ r:5, fill:'#c17f3e', stroke:'#fff', strokeWidth:2 }}
                    activeDot={{ r:7, stroke:'#c17f3e', strokeWidth:2 }}/>
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution charts */}
        <div className="lm-charts-grid">
          {/* City */}
          <div className="lm-chart-card" style={{ marginBottom:0 }}>
            <div className="lm-chart-card__header">
              <h3 className="lm-chart-card__title"><MapPin size={17}/> Leads by City</h3>
              <span className="lm-chart-card__badge">{cityData.length} cities</span>
            </div>
            <div style={{ height:260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" horizontal={false}/>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize:11, fill:'#9b9690' }} axisLine={{ stroke:'#e8e5de' }} tickLine={false}/>
                  <YAxis dataKey="city" type="category" width={90} tick={{ fontSize:11, fill:'#4a4740' }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Bar dataKey="count" name="Leads" radius={[0,4,4,0]} maxBarSize={20}>
                    {cityData.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Property Type */}
          <div className="lm-chart-card" style={{ marginBottom:0 }}>
            <div className="lm-chart-card__header">
              <h3 className="lm-chart-card__title"><Building2 size={17}/> By Property Type</h3>
              <span className="lm-chart-card__badge">{propertyData.length} types</span>
            </div>
            <div style={{ height:260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={propertyData} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={95}
                    dataKey="count" nameKey="type" paddingAngle={3}
                    label={({ type, percent }) => `${type} ${(percent*100).toFixed(0)}%`}
                    labelLine={{ stroke:'#d9d5cc' }}
                    style={{ fontSize:'0.68rem', fontWeight:600, fill:'#4a4740' }}>
                    {propertyData.map((_,i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={2}/>
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ ACTION BAR ═══════════ */}
      <div className="lm-action-bar">
        <div className="lm-action-bar__row">
          <div className="lm-search">
            <Search className="lm-search__icon" size={17}/>
            <input type="text" className="lm-search__input"
              placeholder="Search by name, contact, city, property type…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <div className="lm-actions-group">
            <button className="lm-btn lm-btn--outline lm-btn--sm"
              onClick={() => setShowFilterModal(true)}>
              <Filter size={14}/> Filter
              {(filterCity||filterPropertyType) && (
                <span style={{
                  marginLeft:4, background:'var(--navy)', color:'#fff',
                  borderRadius:999, fontSize:'0.6rem', padding:'1px 7px', fontWeight:700
                }}>
                  {[filterCity,filterPropertyType].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {(filterCity || filterPropertyType) && (
          <div className="lm-active-filters">
            <span className="lm-active-filters__label">Active Filters:</span>
            {filterCity && (
              <span className="lm-filter-tag lm-filter-tag--city">
                City: {filterCity}
                <span className="lm-filter-tag__close" onClick={() => setFilterCity('')}><X size={12}/></span>
              </span>
            )}
            {filterPropertyType && (
              <span className="lm-filter-tag lm-filter-tag--type">
                Type: {filterPropertyType}
                <span className="lm-filter-tag__close" onClick={() => setFilterPropertyType('')}><X size={12}/></span>
              </span>
            )}
            <button className="lm-clear-filters" onClick={resetFilters}>Clear all</button>
          </div>
        )}
      </div>

      {/* ═══════════ TABLE ═══════════ */}
      <div className="lm-table-section">
        <div className="lm-table-header">
          <h3 className="lm-table-header__title"><Users size={17}/> Lead Records</h3>
          <span className="lm-table-header__count">
            {filteredLeads.length} {filteredLeads.length === 1 ? 'record' : 'records'} found
          </span>
        </div>

        <div className="lm-table-wrapper">
          <table className="lm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Contact No.</th>
                <th>City</th>
                <th>Property Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentLeads.length > 0 ? currentLeads.map(lead => (
                <tr key={lead.id}>
                  <td className="lm-table__date">
                    {new Date(lead.date).toLocaleDateString('en-IN', {
                      day:'2-digit', month:'short', year:'numeric'
                    })}
                  </td>
                  <td className="lm-table__name">{lead.name}</td>
                  <td className="lm-table__contact">{lead.contact}</td>
                  <td>{lead.city}</td>
                  <td><span className="lm-table__badge">{lead.propertyType}</span></td>
                  <td>
                    <div className="lm-table__actions">
                      <button className="lm-btn lm-btn--icon lm-btn--icon-edit"
                        onClick={() => openEdit(lead)} title="Edit">
                        <Edit2 size={14}/>
                      </button>
                      <button className="lm-btn lm-btn--icon lm-btn--icon-delete"
                        onClick={() => handleDelete(lead.id)} title="Delete">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6">
                    <div className="lm-empty">
                      <div className="lm-empty__icon"><FileText size={46}/></div>
                      <p className="lm-empty__title">No leads found</p>
                      <p className="lm-empty__text">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="lm-pagination">
            <span className="lm-pagination__info">
              Showing {indexOfFirst+1}–{Math.min(indexOfFirst+ITEMS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length}
            </span>
            <div className="lm-pagination__controls">
              <button className="lm-pagination__btn"
                onClick={() => setCurrentPage(p => Math.max(p-1,1))}
                disabled={currentPage===1}>
                <ChevronLeft size={13}/> Prev
              </button>
              <div className="lm-pagination__pages">
                {[...Array(totalPages)].map((_,i) => (
                  <button key={i+1}
                    className={`lm-pagination__page ${currentPage===i+1 ? 'lm-pagination__page--active' : ''}`}
                    onClick={() => setCurrentPage(i+1)}>
                    {i+1}
                  </button>
                ))}
              </div>
              <button className="lm-pagination__btn"
                onClick={() => setCurrentPage(p => Math.min(p+1, totalPages))}
                disabled={currentPage===totalPages}>
                Next <ChevronRight size={13}/>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ ADD MODAL ═══════════ */}
      {showAddModal && (
        <div className="lm-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="lm-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-modal__header">
              <div>
                <h2 className="lm-modal__title">Add New Lead</h2>
                <p className="lm-modal__subtitle">Fill in the details below</p>
              </div>
              <button className="lm-modal__close" onClick={() => setShowAddModal(false)}>
                <X size={18}/>
              </button>
            </div>
            <div className="lm-modal__body">
              <LeadFormFields data={newLead} setData={setNewLead}/>
            </div>
            <div className="lm-modal__footer">
              <button className="lm-btn lm-btn--ghost"
                onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="lm-btn lm-btn--primary" onClick={handleAddLead}>
                <Plus size={15}/> Add Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ EDIT MODAL ═══════════ */}
      {showEditModal && (
        <div className="lm-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="lm-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-modal__header">
              <div>
                <h2 className="lm-modal__title">Edit Lead</h2>
                <p className="lm-modal__subtitle">Update lead information</p>
              </div>
              <button className="lm-modal__close" onClick={() => setShowEditModal(false)}>
                <X size={18}/>
              </button>
            </div>
            <div className="lm-modal__body">
              <LeadFormFields data={editLead} setData={setEditLead}/>
            </div>
            <div className="lm-modal__footer">
              <button className="lm-btn lm-btn--ghost"
                onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="lm-btn lm-btn--primary" onClick={handleSaveEdit}>
                <Edit2 size={15}/> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FILTER MODAL ═══════════ */}
      {showFilterModal && (
        <div className="lm-modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="lm-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-modal__header">
              <div>
                <h2 className="lm-modal__title">Filter Leads</h2>
                <p className="lm-modal__subtitle">Narrow down your results</p>
              </div>
              <button className="lm-modal__close" onClick={() => setShowFilterModal(false)}>
                <X size={18}/>
              </button>
            </div>
            <div className="lm-modal__body">
              <div className="lm-form-group">
                <label className="lm-label"><MapPin size={13}/> City</label>
                <input type="text" value={filterCity} className="lm-input"
                  placeholder="Type city name to filter…"
                  onChange={e => setFilterCity(e.target.value)}/>
                {uniqueCities.length > 0 && (
                  <div className="lm-city-chips">
                    {uniqueCities.map(city => (
                      <span key={city}
                        className={`lm-city-chip ${filterCity===city ? 'lm-city-chip--active' : 'lm-city-chip--inactive'}`}
                        onClick={() => setFilterCity(filterCity===city ? '' : city)}>
                        {city}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="lm-form-group">
                <label className="lm-label"><Building2 size={13}/> Property Type</label>
                <select value={filterPropertyType} className="lm-select"
                  onChange={e => setFilterPropertyType(e.target.value)}>
                  <option value="">All Property Types</option>
                  {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="lm-modal__footer">
              <button className="lm-btn lm-btn--ghost" onClick={resetFilters}>Reset All</button>
              <button className="lm-btn lm-btn--primary"
                onClick={() => setShowFilterModal(false)}>
                <Filter size={15}/> Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TEMPLATE MODAL ═══════════ */}
      {showTemplateModal && (
        <TemplateModal onClose={() => setShowTemplateModal(false)}/>
      )}

    </div>
  );
};

export default LeadManagement;