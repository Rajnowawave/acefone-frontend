// LeadManagement.jsx — ULTRA ADVANCED v4.0 Professional
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Plus, Upload, Download, Filter,
  Edit2, Trash2, X, FileText, Calendar,
  BarChart3, TrendingUp, Users, MapPin,
  Building2, ChevronLeft, ChevronRight,
  Eye, Activity, TableProperties, Phone,
  PhoneCall, PhoneMissed,
  Clock, User, RefreshCw, ChevronDown, ChevronUp,
  Tag, Bell, Copy, CheckCircle, AlertCircle, Info, Zap,
  SortAsc, SortDesc, Mail,
  MessageSquare, Target, Award, Minus,
  Flag, Globe, UserX, UserPlus, UserCheck,
  Shuffle, ClipboardList, ArrowRightLeft, RotateCcw,
  PieChart as PieChartIcon, Hash, ExternalLink
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import './LeadManagement.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* ═══════════════ STORAGE ═══════════════ */
const SK = {
  LEADS: 'lm_leads_v4', NOTES: 'lm_notes_v4',
  HIDE_UNK: 'lm_hide_unk_v4', ASSIGN: 'lm_assign_v4',
};
const LS = {
  get: (k, fb = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ═══════════════ CONSTANTS ═══════════════ */
const PROP_TYPES = ['Apartment','Villa','Plot','Commercial','Farmhouse','Office Space','Penthouse','Row House','Studio','Warehouse','Showroom'];
const STATUSES = [
  {v:'new',l:'New',c:'#3b82f6',bg:'#dbeafe'},{v:'contacted',l:'Contacted',c:'#8b5cf6',bg:'#ede9fe'},
  {v:'qualified',l:'Qualified',c:'#f59e0b',bg:'#fef3c7'},{v:'proposal',l:'Proposal',c:'#ec4899',bg:'#fce7f3'},
  {v:'negotiation',l:'Negotiation',c:'#06b6d4',bg:'#cffafe'},{v:'won',l:'Won',c:'#10b981',bg:'#d1fae5'},
  {v:'lost',l:'Lost',c:'#ef4444',bg:'#fee2e2'},{v:'hold',l:'On Hold',c:'#6b7280',bg:'#f3f4f6'},
];
const PRIOS = [{v:'low',l:'Low',c:'#10b981',i:'🟢'},{v:'medium',l:'Medium',c:'#f59e0b',i:'🟡'},{v:'high',l:'High',c:'#ef4444',i:'🔴'},{v:'urgent',l:'Urgent',c:'#7c3aed',i:'🚨'}];
const BUDGETS = ['Under ₹25L','₹25L–50L','₹50L–1Cr','₹1Cr–2Cr','₹2Cr–5Cr','Above ₹5Cr'];
const SOURCES = ['Website','Facebook','Instagram','Google Ads','Referral','Walk-in','IVR/Call','WhatsApp','Email Campaign','Other'];
const COLORS = ['#1e2d5a','#c17f3e','#27694f','#b5621e','#6d28d9','#0ea5e9','#ec4899','#10b981','#f59e0b','#ef4444'];

const AGENTS = [
  {id:'001',name:'Neelam',number:'919251651958',color:'#3b82f6'},
  {id:'002',name:'Bhavika',number:'919251651956',color:'#8b5cf6'},
  {id:'003',name:'Tushar Bhandari',number:'917976630010',color:'#10b981'},
  {id:'004',name:'Vikash Singhvi',number:'919509805201',color:'#f59e0b'},
  {id:'005',name:'Amit Sharma',number:'918094121221',color:'#ef4444'},
];

/* ═══════════════ HELPERS ═══════════════ */
const cn = (n='') => String(n).replace(/\D/g,'');
const fp = n => { const d=cn(n); if(d.length<=5)return d; if(d.length<=10)return `${d.slice(0,5)} ${d.slice(5)}`; return `+${d.slice(0,d.length-10)} ${d.slice(-10,-5)} ${d.slice(-5)}`; };
const fs = s => { s=Math.max(0,Math.floor(Number(s)||0)); const m=Math.floor(s/60),sec=s%60; return `${m}:${String(sec).padStart(2,'0')}`; };
const fdt = ts => { if(!ts)return '—'; const d=new Date(ts); return isNaN(d)?'—':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}); };
const fd = ts => { if(!ts)return '—'; const d=new Date(ts); return isNaN(d)?ts:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
const ago = ts => { if(!ts)return ''; const d=Math.floor((Date.now()-new Date(ts).getTime())/1000); if(d<60)return 'now'; if(d<3600)return `${Math.floor(d/60)}m`; if(d<86400)return `${Math.floor(d/3600)}h`; return `${Math.floor(d/86400)}d`; };
const gid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const isUnk = n => !n||['','unknown','n/a','na','-'].includes(n.trim().toLowerCase());

const SCOL = {completed:{bg:'#dcfce7',c:'#16a34a'},connected:{bg:'#dcfce7',c:'#16a34a'},answered:{bg:'#dcfce7',c:'#16a34a'},failed:{bg:'#fee2e2',c:'#dc2626'},busy:{bg:'#fef9c3',c:'#ca8a04'},'no-answer':{bg:'#f1f5f9',c:'#64748b'},canceled:{bg:'#f1f5f9',c:'#64748b'}};

/* ═══════════════ TOAST ═══════════════ */
const TCtx = React.createContext(null);
const TProvider = ({children}) => {
  const [ts,setTs] = useState([]);
  const t = useCallback((m,type='success',dur=3000)=>{const id=gid();setTs(p=>[...p,{id,m,type}]);setTimeout(()=>setTs(p=>p.filter(x=>x.id!==id)),dur);},[]);
  return <TCtx.Provider value={t}>{children}
    <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:8,pointerEvents:'none'}}>
      {ts.map(x=><div key={x.id} style={{background:x.type==='error'?'#fee2e2':x.type==='warning'?'#fef3c7':'#d1fae5',color:x.type==='error'?'#dc2626':x.type==='warning'?'#92400e':'#065f46',border:`1px solid ${x.type==='error'?'#fca5a5':x.type==='warning'?'#fcd34d':'#6ee7b7'}`,borderRadius:12,padding:'10px 16px',fontSize:'0.82rem',fontWeight:600,display:'flex',alignItems:'center',gap:8,pointerEvents:'auto',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',maxWidth:360}}>
        {x.type==='error'?<AlertCircle size={15}/>:<CheckCircle size={15}/>}{x.m}
      </div>)}
    </div>
  </TCtx.Provider>;
};
const useT = () => React.useContext(TCtx);

/* ═══════════════ CONFIRM ═══════════════ */
const Confirm = ({msg,sub,ok='Confirm',onOk,onNo}) => (
  <div className="lm-modal-overlay" onClick={onNo}><div className="lm-modal lm-modal--confirm" onClick={e=>e.stopPropagation()}>
    <div style={{textAlign:'center',padding:'8px 0 16px'}}>
      <div style={{width:56,height:56,borderRadius:'50%',background:'#fee2e2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><Trash2 size={24} color="#dc2626"/></div>
      <h3 style={{fontSize:'1.1rem',color:'#1e2d5a',marginBottom:8}}>{msg}</h3>
      {sub&&<p style={{fontSize:'0.82rem',color:'#64748b'}}>{sub}</p>}
    </div>
    <div className="lm-modal__footer" style={{justifyContent:'center',gap:12}}>
      <button className="lm-btn lm-btn--ghost" onClick={onNo}>Cancel</button>
      <button className="lm-btn lm-btn--danger" onClick={onOk}>{ok}</button>
    </div>
  </div></div>
);

/* ═══════════════ CALL HOOK ═══════════════ */
const useCallData = (leads,hideUnk=false) => {
  const [logs,setLogs]=useState([]);const [loading,setLoading]=useState(false);const [lastF,setLastF]=useState(null);const [err,setErr]=useState(null);
  const fetch_ = useCallback(async()=>{setLoading(true);setErr(null);try{const r=await fetch(`${API}/call-logs?limit=1000`);if(!r.ok)throw new Error(`${r.status}`);const d=await r.json();setLogs(Array.isArray(d)?d:[]);setLastF(Date.now());}catch(e){setErr(e.message);}finally{setLoading(false);}},[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const fl=useMemo(()=>hideUnk?logs.filter(l=>!isUnk(l.answered_agent_name||l.agent_name||'')):logs,[logs,hideUnk]);

  const map=useMemo(()=>{
    const m={};if(!leads.length||!fl.length)return m;
    leads.forEach(ld=>{
      const l10=cn(ld.contact).slice(-10);if(l10.length<5)return;
      const mt=fl.filter(lg=>[lg.call_to_number,lg.client_number,lg.customer_number,lg.caller_id_number,lg.call_from_number].filter(Boolean).map(n=>cn(n)).some(n=>n.slice(-10)===l10));
      if(!mt.length)return;
      mt.sort((a,b)=>{const t=l=>l.createdAt?._seconds?l.createdAt._seconds*1000:new Date(l.createdAt||0).getTime();return t(b)-t(a);});
      const ab={};mt.forEach(lg=>{const n=lg.answered_agent_name||lg.agent_name||'Unknown';if(!ab[n])ab[n]={name:n,total:0,connected:0,missed:0,dur:0};ab[n].total++;const s=(lg.call_status||'').toLowerCase();if(['completed','connected','answered'].includes(s)){ab[n].connected++;ab[n].dur+=Number(lg.duration||lg.call_duration||lg.billsec||0);}else ab[n].missed++;});
      const td=mt.reduce((s,l)=>s+Number(l.duration||l.call_duration||l.billsec||0),0);
      const co=mt.filter(l=>['completed','connected','answered'].includes((l.call_status||'').toLowerCase())).length;
      const gt=l=>l.createdAt?._seconds?l.createdAt._seconds*1000:new Date(l.createdAt||0).getTime();
      m[ld.id]={logs:mt,total:mt.length,connected:co,missed:mt.length-co,dur:td,agents:Object.values(ab),lastAt:mt[0]?gt(mt[0]):null,lastAgent:mt[0]?.answered_agent_name||mt[0]?.agent_name||'?',lastOutcome:mt[0]?.outcome||'',lastStatus:mt[0]?.call_status||''};
    });return m;
  },[fl,leads]);

  const unkCnt=useMemo(()=>logs.filter(l=>isUnk(l.answered_agent_name||l.agent_name||'')).length,[logs]);
  return {map,loading,err,refresh:fetch_,lastF,total:fl.length,unkCnt};
};

/* ═══════════════ ASSIGN HOOK ═══════════════ */
const useAssign = () => {
  const [a,setA_]=useState(()=>LS.get(SK.ASSIGN,{}));
  const save=useCallback(fn=>{setA_(p=>{const n=typeof fn==='function'?fn(p):fn;LS.set(SK.ASSIGN,n);return n;});},[]);
  return {
    a,
    set:(lid,ag)=>save(p=>({...p,[lid]:{agentId:ag.id,agentName:ag.name,agentColor:ag.color,at:Date.now(),hist:[...(p[lid]?.hist||[]),{from:p[lid]?.agentName||null,at:Date.now(),act:p[lid]?'reassigned':'assigned'}]}})),
    bulk:(ids,ag)=>save(p=>{const n={...p};ids.forEach(id=>{n[id]={agentId:ag.id,agentName:ag.name,agentColor:ag.color,at:Date.now(),hist:[...(p[id]?.hist||[]),{from:p[id]?.agentName||null,at:Date.now(),act:p[id]?'reassigned':'assigned'}]};});return n;}),
    del:id=>save(p=>{const n={...p};delete n[id];return n;}),
    delBulk:ids=>save(p=>{const n={...p};ids.forEach(id=>delete n[id]);return n;}),
    clear:()=>save({}),
  };
};

/* ═══════════════ CHART TOOLTIP ═══════════════ */
const CTip = ({active,payload,label}) => {
  if(!active||!payload?.length)return null;
  return <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
    <div style={{fontWeight:700,fontSize:'0.82rem',color:'#1e2d5a',marginBottom:4}}>{label}</div>
    {payload.map((e,i)=><div key={i} style={{fontSize:'0.74rem',color:e.color,fontWeight:600,display:'flex',gap:6,alignItems:'center'}}><div style={{width:8,height:8,borderRadius:2,background:e.color}}/>{e.name}: <strong>{e.value}</strong></div>)}
  </div>;
};

/* ═══════════════════════════════════════════════════
   ASSIGNMENT DASHBOARD — PROFESSIONAL v2
═══════════════════════════════════════════════════ */
const Dashboard = ({asgn,leads,callMap,onDel,onReassign,toast}) => {
  const [view,setView] = useState('overview'); // overview | agent_<id>
  const [leadSearch,setLeadSearch] = useState('');

  const data = useMemo(()=>{
    const m={};
    AGENTS.forEach(ag=>{m[ag.id]={...ag,leads:[],called:[],pending:[],connected:[]};});
    Object.entries(asgn).forEach(([lid,as])=>{
      const ld=leads.find(l=>l.id===lid);if(!ld)return;
      const d=m[as.agentId];if(!d)return;
      const cd=callMap[lid];
      let ac=false,aco=false;
      if(cd?.logs){
        ac=cd.logs.some(lg=>(lg.answered_agent_name||lg.agent_name||'').toLowerCase().includes(as.agentName.toLowerCase().split(' ')[0]));
        aco=cd.logs.some(lg=>{const la=(lg.answered_agent_name||lg.agent_name||'').toLowerCase();const st=(lg.call_status||'').toLowerCase();return la.includes(as.agentName.toLowerCase().split(' ')[0])&&['completed','connected','answered'].includes(st);});
      }
      const info={...ld,cd,ac,aco,as,anyCalled:cd?.total>0};
      d.leads.push(info);
      if(ac)d.called.push(info);else d.pending.push(info);
      if(aco)d.connected.push(info);
    });
    return Object.values(m);
  },[asgn,leads,callMap]);

  const totA=Object.keys(asgn).length;
  const totC=data.reduce((s,a)=>s+a.called.length,0);
  const totCo=data.reduce((s,a)=>s+a.connected.length,0);
  const totP=totA-totC;
  const pct=totA>0?Math.round(totC/totA*100):0;

  const barData=useMemo(()=>data.filter(a=>a.leads.length>0).map(a=>({name:a.name.split(' ')[0],Assigned:a.leads.length,Called:a.called.length,Pending:a.pending.length,Connected:a.connected.length})),[data]);
  const pieData=useMemo(()=>[{name:'Connected',value:totCo,color:'#10b981'},{name:'Called Only',value:totC-totCo,color:'#f59e0b'},{name:'Pending',value:totP,color:'#ef4444'}].filter(d=>d.value>0),[totC,totCo,totP]);

  // Selected agent detail
  const selAgent = view.startsWith('agent_') ? data.find(a=>a.id===view.replace('agent_','')) : null;
  const filteredAgentLeads = useMemo(()=>{
    if(!selAgent)return [];
    if(!leadSearch)return selAgent.leads;
    const s=leadSearch.toLowerCase();
    return selAgent.leads.filter(l=>l.name.toLowerCase().includes(s)||l.contact.includes(s)||l.city.toLowerCase().includes(s));
  },[selAgent,leadSearch]);

  if(totA===0)return null;

  return (
    <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:16,marginBottom:20,overflow:'hidden',boxShadow:'0 1px 8px rgba(30,45,90,0.06)'}}>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,#0f172a,#1e3a5f)',padding:'18px 24px',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <ClipboardList size={20}/>
          <div>
            <h3 style={{margin:0,fontSize:'1rem',fontWeight:700}}>Call Assignment Dashboard</h3>
            <p style={{margin:0,fontSize:'0.74rem',opacity:0.7}}>{totA} assigned · {totC} called · {totP} pending</p>
          </div>
        </div>
        {view!=='overview'&&(
          <button onClick={()=>{setView('overview');setLeadSearch('');}} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:8,color:'#fff',padding:'6px 14px',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
            <ChevronLeft size={14}/> Back to Overview
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',borderBottom:'1px solid #f1f5f9'}}>
        {[
          {i:<Users size={16}/>,v:totA,l:'Assigned',c:'#1e2d5a',bg:'#f0f4ff'},
          {i:<PhoneCall size={16}/>,v:totC,l:'Called',c:'#16a34a',bg:'#f0fdf4'},
          {i:<Clock size={16}/>,v:totP,l:'Pending',c:'#f59e0b',bg:'#fffbeb'},
          {i:<CheckCircle size={16}/>,v:totCo,l:'Connected',c:'#8b5cf6',bg:'#faf5ff'},
          {i:<Target size={16}/>,v:`${pct}%`,l:'Done',c:'#0ea5e9',bg:'#f0f9ff'},
        ].map((s,i)=>(
          <div key={i} style={{padding:'14px 16px',background:s.bg,display:'flex',alignItems:'center',gap:10,borderRight:i<4?'1px solid #f1f5f9':'none'}}>
            <div style={{color:s.c}}>{s.i}</div>
            <div><div style={{fontSize:'1.2rem',fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div><div style={{fontSize:'0.68rem',color:'#64748b',fontWeight:600}}>{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* ═══ OVERVIEW VIEW ═══ */}
      {view==='overview'&&(
        <div style={{padding:20}}>
          {/* Charts */}
          <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:16,marginBottom:20}}>
            <div style={{background:'#fafbfc',border:'1px solid #f1f5f9',borderRadius:12,padding:16}}>
              <h4 style={{margin:'0 0 12px',fontSize:'0.84rem',fontWeight:700,color:'#1e2d5a',display:'flex',alignItems:'center',gap:6}}><BarChart3 size={14}/> Agent Performance</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barSize={16} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="name" tick={{fontSize:11,fill:'#64748b'}}/>
                  <YAxis tick={{fontSize:11,fill:'#64748b'}} allowDecimals={false}/>
                  <Tooltip content={<CTip/>}/>
                  <Bar dataKey="Assigned" fill="#94a3b8" radius={[3,3,0,0]}/>
                  <Bar dataKey="Called" fill="#10b981" radius={[3,3,0,0]}/>
                  <Bar dataKey="Pending" fill="#ef4444" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'#fafbfc',border:'1px solid #f1f5f9',borderRadius:12,padding:16,display:'flex',flexDirection:'column',alignItems:'center'}}>
              <h4 style={{margin:'0 0 8px',fontSize:'0.84rem',fontWeight:700,color:'#1e2d5a',alignSelf:'flex-start',display:'flex',alignItems:'center',gap:6}}><PieChartIcon size={14}/> Status</h4>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={2} stroke="#fff">
                  {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Pie><Tooltip content={<CTip/>}/></PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',gap:14,marginTop:4}}>
                {pieData.map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:'0.7rem',color:'#475569'}}><div style={{width:8,height:8,borderRadius:2,background:d.color}}/>{d.name}: <strong>{d.value}</strong></div>)}
              </div>
            </div>
          </div>

          {/* Agent cards grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {data.map(agent=>{
              const cp=agent.leads.length>0?Math.round(agent.called.length/agent.leads.length*100):0;
              if(agent.leads.length===0)return (
                <div key={agent.id} style={{border:'1px solid #f1f5f9',borderRadius:12,padding:'16px 18px',opacity:0.5,display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'#e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',fontWeight:700,color:'#94a3b8'}}>{agent.name[0]}</div>
                  <div><div style={{fontWeight:700,fontSize:'0.84rem',color:'#94a3b8'}}>{agent.name}</div><div style={{fontSize:'0.7rem',color:'#cbd5e1'}}>No leads assigned</div></div>
                </div>
              );
              return (
                <div key={agent.id} onClick={()=>setView(`agent_${agent.id}`)}
                  style={{border:`1px solid ${agent.color}30`,borderRadius:12,padding:'16px 18px',cursor:'pointer',transition:'all 0.2s',background:'#fff',
                    borderLeft:`4px solid ${agent.color}`,position:'relative',overflow:'hidden'}}>
                  {/* Hover bg */}
                  <div style={{position:'absolute',inset:0,background:`${agent.color}05`,opacity:0,transition:'opacity 0.2s',pointerEvents:'none'}}/>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,position:'relative'}}>
                    <div style={{width:40,height:40,borderRadius:'50%',background:agent.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',fontWeight:800,flexShrink:0}}>{agent.name[0]}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:'0.88rem',color:'#1e2d5a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{agent.name}</div>
                      <div style={{fontSize:'0.7rem',color:'#64748b'}}>{agent.leads.length} leads assigned</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'1.3rem',fontWeight:800,color:cp>=80?'#16a34a':cp>=50?'#f59e0b':'#ef4444',lineHeight:1}}>{cp}%</div>
                      <div style={{fontSize:'0.62rem',color:'#94a3b8',fontWeight:600}}>done</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{height:6,background:'#f1f5f9',borderRadius:3,overflow:'hidden',marginBottom:10}}>
                    <div style={{height:'100%',borderRadius:3,background:`linear-gradient(90deg,${agent.color},${agent.color}aa)`,width:`${cp}%`,transition:'width 0.6s ease'}}/>
                  </div>
                  {/* Mini stats */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:4}}>
                    {[
                      {l:'Assigned',v:agent.leads.length,c:'#475569'},
                      {l:'Called',v:agent.called.length,c:'#16a34a'},
                      {l:'Pending',v:agent.pending.length,c:'#f59e0b'},
                      {l:'Connected',v:agent.connected.length,c:'#8b5cf6'},
                    ].map((s,i)=>(
                      <div key={i} style={{textAlign:'center',padding:'6px 4px',background:'#f8fafc',borderRadius:6}}>
                        <div style={{fontSize:'0.95rem',fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
                        <div style={{fontSize:'0.58rem',color:'#94a3b8',fontWeight:600,marginTop:2}}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{textAlign:'center',marginTop:10,fontSize:'0.72rem',color:agent.color,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                    View Details <ExternalLink size={11}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unassigned notice */}
          {(()=>{const u=leads.length-totA;return u>0?<div style={{marginTop:16,background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:10,padding:'10px 18px',fontSize:'0.8rem',fontWeight:700,color:'#92400e',display:'flex',alignItems:'center',gap:8}}><AlertCircle size={15}/>{u} lead{u!==1?'s':''} not assigned yet</div>:null;})()}
        </div>
      )}

      {/* ═══ AGENT DETAIL VIEW ═══ */}
      {selAgent&&(
        <div style={{padding:20}}>
          {/* Agent header */}
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20,padding:'16px 20px',background:`${selAgent.color}08`,border:`1px solid ${selAgent.color}20`,borderRadius:14}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:selAgent.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',fontWeight:800,flexShrink:0}}>{selAgent.name[0]}</div>
            <div style={{flex:1}}>
              <h3 style={{margin:0,fontSize:'1.1rem',fontWeight:700,color:'#1e2d5a'}}>{selAgent.name}</h3>
              <div style={{display:'flex',gap:16,marginTop:6,flexWrap:'wrap'}}>
                {[
                  {i:'📋',l:'Assigned',v:selAgent.leads.length,c:'#475569'},
                  {i:'✅',l:'Called',v:selAgent.called.length,c:'#16a34a'},
                  {i:'⏳',l:'Pending',v:selAgent.pending.length,c:'#f59e0b'},
                  {i:'📞',l:'Connected',v:selAgent.connected.length,c:'#8b5cf6'},
                ].map((s,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:'0.8rem'}}>
                    <span>{s.i}</span><span style={{color:'#64748b'}}>{s.l}:</span><strong style={{color:s.c,fontSize:'0.9rem'}}>{s.v}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'2rem',fontWeight:800,color:selAgent.color,lineHeight:1}}>
                {selAgent.leads.length>0?Math.round(selAgent.called.length/selAgent.leads.length*100):0}%
              </div>
              <div style={{fontSize:'0.7rem',color:'#64748b',fontWeight:600}}>Completion</div>
              <div style={{width:100,height:6,background:'#e2e8f0',borderRadius:3,marginTop:6,overflow:'hidden'}}>
                <div style={{height:'100%',background:selAgent.color,borderRadius:3,width:`${selAgent.leads.length>0?Math.round(selAgent.called.length/selAgent.leads.length*100):0}%`}}/>
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{marginBottom:12,display:'flex',gap:10,alignItems:'center'}}>
            <div style={{flex:1,position:'relative'}}>
              <Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
              <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="Search leads…" style={{width:'100%',padding:'8px 12px 8px 36px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:'0.8rem',outline:'none'}}/>
            </div>
            <span style={{fontSize:'0.78rem',color:'#64748b',fontWeight:600}}>{filteredAgentLeads.length} lead{filteredAgentLeads.length!==1?'s':''}</span>
          </div>

          {/* Leads table — FIXED HEIGHT with scroll */}
          <div style={{border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden'}}>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:'40px 2fr 1.5fr 1fr 1.2fr 1fr 120px',gap:8,padding:'10px 16px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontSize:'0.72rem',fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em'}}>
              <span>#</span><span>Lead</span><span>Contact</span><span>City</span><span>Status</span><span>Assigned</span><span>Actions</span>
            </div>
            {/* Scrollable body — MAX 400px */}
            <div style={{maxHeight:400,overflowY:'auto'}}>
              {filteredAgentLeads.length===0?(
                <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}><Users size={28} style={{opacity:0.3,marginBottom:8}}/><p>No leads found</p></div>
              ):filteredAgentLeads.map((ld,i)=>(
                <div key={ld.id} style={{
                  display:'grid',gridTemplateColumns:'40px 2fr 1.5fr 1fr 1.2fr 1fr 120px',gap:8,padding:'10px 16px',alignItems:'center',
                  borderBottom:'1px solid #f8fafc',fontSize:'0.8rem',background:ld.ac?'#f0fdf4':'#fff',transition:'background 0.15s',
                }}>
                  <span style={{color:'#94a3b8',fontSize:'0.72rem',fontWeight:600}}>{i+1}</span>
                  <div>
                    <div style={{fontWeight:700,color:'#1e2d5a',fontSize:'0.82rem'}}>{ld.name}</div>
                    {ld.propertyType&&<div style={{fontSize:'0.68rem',color:'#94a3b8'}}>{ld.propertyType}{ld.budget?` · ${ld.budget}`:''}</div>}
                  </div>
                  <div style={{color:'#475569',fontSize:'0.78rem'}}>{fp(ld.contact)}</div>
                  <div style={{color:'#475569',fontSize:'0.78rem'}}>{ld.city}</div>
                  <div>
                    {ld.ac?(
                      <span style={{display:'inline-flex',alignItems:'center',gap:3,background:ld.aco?'#dcfce7':'#fef3c7',color:ld.aco?'#16a34a':'#92400e',borderRadius:5,padding:'3px 8px',fontSize:'0.72rem',fontWeight:700}}>
                        {ld.aco?<><PhoneCall size={10}/> Connected</>:<><Phone size={10}/> Called</>}
                      </span>
                    ):ld.anyCalled?(
                      <span style={{display:'inline-flex',alignItems:'center',gap:3,background:'#dbeafe',color:'#1d4ed8',borderRadius:5,padding:'3px 8px',fontSize:'0.72rem',fontWeight:700}}>
                        <UserX size={10}/> Other
                      </span>
                    ):(
                      <span style={{display:'inline-flex',alignItems:'center',gap:3,background:'#fee2e2',color:'#dc2626',borderRadius:5,padding:'3px 8px',fontSize:'0.72rem',fontWeight:700}}>
                        <Clock size={10}/> Pending
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:'0.7rem',color:'#94a3b8'}}>{ago(ld.as.at)}</div>
                  <div style={{display:'flex',gap:4}}>
                    <select value="" onChange={e=>{if(e.target.value){const ag=AGENTS.find(a=>a.id===e.target.value);if(ag){onReassign(ld.id,ag);toast(`→ ${ag.name}`);}}}}
                      style={{padding:'3px 6px',borderRadius:5,border:'1px solid #bfdbfe',fontSize:'0.68rem',color:'#2563eb',background:'#eff6ff',cursor:'pointer',fontWeight:600,maxWidth:80}}>
                      <option value="">Change…</option>
                      {AGENTS.filter(a=>a.id!==selAgent.id).map(a=><option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>)}
                    </select>
                    <button onClick={()=>{onDel(ld.id);toast('Removed');}} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:5,cursor:'pointer',color:'#dc2626',padding:'3px 6px',lineHeight:1}}><X size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════ ASSIGN MODAL ═══════════════ */
const AssignModal = ({leads,selIds,asgn,onAssign,onClose,toast}) => {
  const [mode,setMode]=useState('all');
  const [selAg,setSelAg]=useState(null);
  const [mm,setMm]=useState({});
  const [ac,setAc]=useState({});
  const sl=leads.filter(l=>selIds.has(l.id));
  useEffect(()=>{const c={};AGENTS.forEach(a=>{c[a.id]=Math.floor(sl.length/AGENTS.length);});let r=sl.length%AGENTS.length;AGENTS.forEach(a=>{if(r>0){c[a.id]++;r--;}});setAc(c);},[sl.length]);
  const gc=id=>Object.values(asgn).filter(a=>a.agentId===id).length;

  return (
    <div className="lm-modal-overlay" onClick={onClose}><div className="lm-modal lm-modal--wide lm-modal--tall" onClick={e=>e.stopPropagation()}>
      <div className="lm-modal__header">
        <div><h2 className="lm-modal__title"><UserPlus size={18}/> Assign / Reassign Calls</h2><p className="lm-modal__subtitle">{sl.length} leads · Already assigned = <strong>reassigned</strong></p></div>
        <button className="lm-modal__close" onClick={onClose}><X size={18}/></button>
      </div>
      <div style={{display:'flex',borderBottom:'1px solid #e8e5de',background:'#fafaf8'}}>
        {[{k:'all',l:'One Agent',i:<UserPlus size={13}/>},{k:'each',l:'Individual',i:<ClipboardList size={13}/>},{k:'auto',l:'Distribute',i:<Shuffle size={13}/>}].map(t=>(
          <button key={t.k} onClick={()=>setMode(t.k)} style={{flex:1,padding:'11px',border:'none',background:'none',cursor:'pointer',fontSize:'0.78rem',fontWeight:mode===t.k?700:500,color:mode===t.k?'#1e2d5a':'#64748b',borderBottom:mode===t.k?'2px solid #1e2d5a':'2px solid transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>{t.i} {t.l}</button>
        ))}
      </div>
      <div className="lm-modal__body" style={{maxHeight:'55vh',overflowY:'auto'}}>
        {mode==='all'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {AGENTS.map(ag=>{const s=selAg===ag.id;return(
              <div key={ag.id} onClick={()=>setSelAg(ag.id)} style={{background:s?`${ag.color}10`:'#fff',border:`2px solid ${s?ag.color:'#e8e5de'}`,borderRadius:12,padding:16,cursor:'pointer',transition:'all 0.2s'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:ag.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',fontWeight:800}}>{ag.name[0]}</div>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:'0.86rem',color:'#1e2d5a'}}>{ag.name}</div><div style={{fontSize:'0.72rem',color:'#64748b'}}>{gc(ag.id)} assigned</div></div>
                  {s&&<CheckCircle size={20} color={ag.color}/>}
                </div>
              </div>
            );})}
          </div>
        )}
        {mode==='each'&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {sl.map(ld=>{const cur=asgn[ld.id];return(
              <div key={ld.id} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 12px',border:'1px solid #f1f5f9',borderRadius:8}}>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:'0.82rem',color:'#1e2d5a'}}>{ld.name}</div><div style={{fontSize:'0.7rem',color:'#64748b'}}>{fp(ld.contact)}{cur?` · Now: ${cur.agentName}`:''}</div></div>
                <select value={mm[ld.id]||''} onChange={e=>{if(e.target.value)setMm(p=>({...p,[ld.id]:e.target.value}));else setMm(p=>{const n={...p};delete n[ld.id];return n;});}} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:'0.78rem',fontWeight:600,cursor:'pointer',minWidth:140}}>
                  <option value="">Select…</option>{AGENTS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            );})}
          </div>
        )}
        {mode==='auto'&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {AGENTS.map(ag=>{const c=ac[ag.id]||0;return(
              <div key={ag.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 14px',border:'1px solid #f1f5f9',borderRadius:10}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:ag.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',fontWeight:800,flexShrink:0}}>{ag.name[0]}</div>
                <div style={{flex:1}}><div style={{fontWeight:700,color:'#1e2d5a'}}>{ag.name}</div></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={()=>setAc(p=>({...p,[ag.id]:Math.max(0,c-1)}))} style={{width:28,height:28,borderRadius:6,border:'1px solid #d1d5db',background:'#f8fafc',cursor:'pointer',fontSize:'1rem',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                  <div style={{width:40,textAlign:'center',fontSize:'1rem',fontWeight:800,color:ag.color}}>{c}</div>
                  <button onClick={()=>setAc(p=>({...p,[ag.id]:c+1}))} style={{width:28,height:28,borderRadius:6,border:'1px solid #d1d5db',background:'#f8fafc',cursor:'pointer',fontSize:'1rem',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                </div>
              </div>
            );})}
            {(()=>{const t=Object.values(ac).reduce((s,v)=>s+v,0);const ok=t===sl.length;return <div style={{background:ok?'#f0fdf4':'#fef2f2',border:`1px solid ${ok?'#bbf7d0':'#fecaca'}`,borderRadius:8,padding:'8px 14px',fontSize:'0.78rem',fontWeight:700,color:ok?'#166534':'#dc2626',display:'flex',alignItems:'center',gap:6}}>{ok?<CheckCircle size={14}/>:<AlertCircle size={14}/>}{t}/{sl.length}</div>;})()}
          </div>
        )}
      </div>
      <div className="lm-modal__footer">
        <button className="lm-btn lm-btn--ghost" onClick={onClose}>Cancel</button>
        {mode==='all'&&<button className="lm-btn lm-btn--primary" disabled={!selAg} onClick={()=>{const ag=AGENTS.find(a=>a.id===selAg);onAssign(Array.from(selIds),ag);toast(`✅ ${selIds.size} → ${ag.name}`);onClose();}}><UserPlus size={14}/> Assign</button>}
        {mode==='each'&&<button className="lm-btn lm-btn--primary" disabled={!Object.keys(mm).length} onClick={()=>{Object.entries(mm).forEach(([lid,aid])=>{const ag=AGENTS.find(a=>a.id===aid);if(ag)onAssign([lid],ag);});toast(`✅ ${Object.keys(mm).length} assigned`);onClose();}}><UserCheck size={14}/> Save</button>}
        {mode==='auto'&&<button className="lm-btn lm-btn--primary" disabled={Object.values(ac).reduce((s,v)=>s+v,0)!==sl.length} onClick={()=>{let idx=0;AGENTS.forEach(ag=>{const c=ac[ag.id]||0;if(c>0){onAssign(sl.slice(idx,idx+c).map(l=>l.id),ag);idx+=c;}});toast(`✅ Distributed`);onClose();}}><Shuffle size={14}/> Distribute</button>}
      </div>
    </div></div>
  );
};

/* ═══════════════ CALL HISTORY ═══════════════ */
const CallHistory = ({lead,cd,asgn,onClose}) => {
  if(!cd)return null;
  return (
    <div className="lm-modal-overlay" onClick={onClose}><div className="lm-modal lm-modal--wide lm-modal--tall" onClick={e=>e.stopPropagation()}>
      <div className="lm-modal__header">
        <div><h2 className="lm-modal__title"><PhoneCall size={18}/> Call History</h2>
        <p className="lm-modal__subtitle"><strong>{lead.name}</strong> · {fp(lead.contact)}{asgn&&<span style={{color:asgn.agentColor,fontWeight:700}}> (Assigned: {asgn.agentName})</span>}</p></div>
        <button className="lm-modal__close" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="ch-summary">
        {[{i:<Phone size={16}/>,cls:'icon--navy',v:cd.total,l:'Total'},{i:<PhoneCall size={16}/>,cls:'icon--green',v:cd.connected,l:'Connected'},{i:<PhoneMissed size={16}/>,cls:'icon--red',v:cd.missed,l:'Missed'},{i:<Clock size={16}/>,cls:'icon--accent',v:fs(cd.dur),l:'Duration'}].map((s,i)=>(<div className="ch-stat" key={i}><div className={`ch-stat__icon ${s.cls}`}>{s.i}</div><div className="ch-stat__val">{s.v}</div><div className="ch-stat__lbl">{s.l}</div></div>))}
      </div>
      <div className="lm-modal__body ch-body" style={{maxHeight:'50vh',overflowY:'auto'}}>
        {cd.logs.map((lg,i)=>{
          const ts=lg.createdAt?._seconds?lg.createdAt._seconds*1000:new Date(lg.createdAt||0).getTime();
          const st=(lg.call_status||'').toLowerCase();const col=SCOL[st]||{bg:'#f1f5f9',c:'#64748b'};
          const dur=Number(lg.duration||lg.call_duration||lg.billsec||0);
          const ag=lg.answered_agent_name||lg.agent_name||'?';
          const isA=asgn&&ag.toLowerCase().includes(asgn.agentName.toLowerCase().split(' ')[0]);
          return (
            <div className="ch-call-item" key={lg.id||i} style={{borderLeft:isA?`3px solid ${asgn.agentColor}`:'3px solid transparent'}}>
              <div className="ch-call-item__num">#{cd.logs.length-i}</div>
              <div className="ch-call-item__icon">{['completed','connected','answered'].includes(st)?<PhoneCall size={14} color="#16a34a"/>:<PhoneMissed size={14} color="#dc2626"/>}</div>
              <div className="ch-call-item__info">
                <div className="ch-call-item__row1">
                  <span className="ch-agent-name"><User size={11}/> {ag}{isA&&<span style={{fontSize:'0.6rem',background:`${asgn.agentColor}20`,color:asgn.agentColor,borderRadius:3,padding:'1px 5px',marginLeft:4,fontWeight:700}}>ASSIGNED</span>}</span>
                  <span className="ch-status-badge" style={{background:col.bg,color:col.c}}>{lg.call_status||'—'}</span>
                </div>
                <div className="ch-call-item__row2"><span><Calendar size={11}/> {fdt(ts)}</span>{dur>0&&<span><Clock size={11}/> {fs(dur)}</span>}</div>
                {lg.remark&&<div className="ch-call-remark">💬 {lg.remark}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={onClose}>Close</button></div>
    </div></div>
  );
};

/* ═══════════════ NOTES ═══════════════ */
const Notes = ({lead,notes,onSave,onClose}) => {
  const [txt,setTxt]=useState('');const [ln,setLn]=useState(notes[lead.id]||[]);
  const add=()=>{if(!txt.trim())return;const n={id:gid(),text:txt.trim(),at:Date.now()};const u=[n,...ln];setLn(u);onSave(lead.id,u);setTxt('');};
  return (
    <div className="lm-modal-overlay" onClick={onClose}><div className="lm-modal lm-modal--wide" onClick={e=>e.stopPropagation()}>
      <div className="lm-modal__header"><div><h2 className="lm-modal__title"><MessageSquare size={18}/> Notes — {lead.name}</h2></div><button className="lm-modal__close" onClick={onClose}><X size={18}/></button></div>
      <div className="lm-modal__body">
        <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="Add note…" className="lm-input" rows={3} style={{resize:'vertical',minHeight:70,marginBottom:10}}/>
        <button className="lm-btn lm-btn--primary lm-btn--sm" onClick={add} style={{marginBottom:16}}><Plus size={13}/> Add</button>
        <div style={{maxHeight:300,overflowY:'auto'}}>
          {ln.length===0?<p style={{textAlign:'center',color:'#94a3b8',padding:20}}>No notes yet</p>
          :ln.map(n=><div key={n.id} style={{background:'#fef9f0',border:'1px solid #f3e8d0',borderRadius:8,padding:'10px 12px',marginBottom:6,display:'flex',gap:8}}>
            <div style={{flex:1}}><p style={{margin:0,fontSize:'0.82rem',color:'#1e2d5a',lineHeight:1.5}}>{n.text}</p><span style={{fontSize:'0.68rem',color:'#94a3b8'}}>{fdt(n.at)}</span></div>
            <button onClick={()=>{const u=ln.filter(x=>x.id!==n.id);setLn(u);onSave(lead.id,u);}} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:2}}><Trash2 size={12}/></button>
          </div>)}
        </div>
      </div>
      <div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={onClose}>Close</button></div>
    </div></div>
  );
};

/* ═══════════════ TEMPLATE ═══════════════ */
const TplModal = ({onClose}) => {
  const dl=()=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet([{Date:'2025-01-15',Name:'Rajesh Kumar','Contact no.':'+91 98765 43210',City:'Mumbai','Property Type':'Apartment',Source:'Website',Budget:'₹50L–1Cr',Priority:'high'}],{header:['Date','Name','Contact no.','City','Property Type','Source','Budget','Priority']});XLSX.utils.book_append_sheet(wb,ws,'Leads');XLSX.writeFile(wb,'template.xlsx');onClose();};
  return <div className="lm-modal-overlay" onClick={onClose}><div className="lm-modal" onClick={e=>e.stopPropagation()}>
    <div className="lm-modal__header"><h2 className="lm-modal__title">📥 Template</h2><button className="lm-modal__close" onClick={onClose}><X size={18}/></button></div>
    <div className="lm-modal__body"><p style={{color:'#64748b'}}>Download Excel template with headers: Date, Name, Contact no., City, Property Type, Source, Budget, Priority</p></div>
    <div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={onClose}>Cancel</button><button className="lm-btn lm-btn--primary" onClick={dl}><Download size={15}/> Download</button></div>
  </div></div>;
};

/* ═══════════════ LEAD FORM ═══════════════ */
const LForm = ({d,setD}) => (
  <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <div className="lm-form-group"><label className="lm-label"><Calendar size={13}/> Date</label><input type="date" value={d.date} className="lm-input" onChange={e=>setD({...d,date:e.target.value})}/></div>
      <div className="lm-form-group"><label className="lm-label"><Flag size={13}/> Priority</label><select value={d.priority||'medium'} className="lm-select" onChange={e=>setD({...d,priority:e.target.value})}>{PRIOS.map(p=><option key={p.v} value={p.v}>{p.i} {p.l}</option>)}</select></div>
    </div>
    <div className="lm-form-group"><label className="lm-label"><Users size={13}/> Name *</label><input value={d.name} placeholder="Full name" className="lm-input" onChange={e=>setD({...d,name:e.target.value})}/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <div className="lm-form-group"><label className="lm-label"><Phone size={13}/> Contact *</label><input value={d.contact} placeholder="+91…" className="lm-input" onChange={e=>setD({...d,contact:e.target.value})}/></div>
      <div className="lm-form-group"><label className="lm-label"><MapPin size={13}/> City *</label><input value={d.city} className="lm-input" onChange={e=>setD({...d,city:e.target.value})}/></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <div className="lm-form-group"><label className="lm-label"><Building2 size={13}/> Property *</label><select value={d.propertyType} className="lm-select" onChange={e=>setD({...d,propertyType:e.target.value})}><option value="">Select</option>{PROP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      <div className="lm-form-group"><label className="lm-label"><Globe size={13}/> Source</label><select value={d.source||''} className="lm-select" onChange={e=>setD({...d,source:e.target.value})}><option value="">Select</option>{SOURCES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <div className="lm-form-group"><label className="lm-label"><Target size={13}/> Budget</label><select value={d.budget||''} className="lm-select" onChange={e=>setD({...d,budget:e.target.value})}><option value="">Select</option>{BUDGETS.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
      <div className="lm-form-group"><label className="lm-label"><Activity size={13}/> Status</label><select value={d.status||'new'} className="lm-select" onChange={e=>setD({...d,status:e.target.value})}>{STATUSES.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════ */
const Main = () => {
  const toast = useT();
  const [leads,setLeads_]=useState(()=>LS.get(SK.LEADS,[]));
  const [notes,setNotes]=useState(()=>LS.get(SK.NOTES,{}));
  const [hideUnk,setHideUnk]=useState(()=>LS.get(SK.HIDE_UNK,false));
  const setLeads=useCallback(fn=>setLeads_(p=>{const n=typeof fn==='function'?fn(p):fn;setTimeout(()=>LS.set(SK.LEADS,n),0);return n;}),[]);
  const saveNotes=useCallback((lid,ln)=>setNotes(p=>{const n={...p,[lid]:ln};LS.set(SK.NOTES,n);return n;}),[]);

  const {a:asgn,set:assignOne,bulk:assignBulk,del:unassign,delBulk:unassignBulk}=useAssign();
  const {map:callMap,loading:cLoading,err:cErr,refresh:cRefresh,lastF:cLastF,total:cTotal,unkCnt}=useCallData(leads,hideUnk);

  const [search,setSearch]=useState('');
  const [fCity,setFCity]=useState('');const [fType,setFType]=useState('');const [fCall,setFCall]=useState('');const [fAsgn,setFAsgn]=useState('');const [fStat,setFStat]=useState('');
  const [sortF,setSortF]=useState('date');const [sortD,setSortD]=useState('desc');
  const [page,setPage]=useState(1);const [perPage,setPerPage]=useState(10);
  const [showAdd,setShowAdd]=useState(false);const [showEdit,setShowEdit]=useState(false);const [showFilter,setShowFilter]=useState(false);const [showTpl,setShowTpl]=useState(false);
  const [showNotes,setShowNotes]=useState(false);const [showAssign,setShowAssign]=useState(false);
  const [histLead,setHistLead]=useState(null);const [notesLead,setNotesLead]=useState(null);const [confirm,setConfirm]=useState(null);
  const [selIds,setSelIds]=useState(new Set());
  const empty={date:new Date().toISOString().split('T')[0],name:'',contact:'',email:'',city:'',propertyType:'',source:'',budget:'',status:'new',priority:'medium',assignedTo:'',tags:[],remark:''};
  const [newL,setNewL]=useState(empty);const [editL,setEditL]=useState({id:null,...empty});

  const cities=useMemo(()=>[...new Set(leads.map(l=>l.city))].filter(Boolean).sort(),[leads]);

  const filtered=useMemo(()=>{
    let arr=leads.filter(l=>{
      const s=search.toLowerCase();
      const ms=!search||[l.name,l.contact,l.city,l.propertyType].some(f=>(f||'').toLowerCase().includes(s));
      const mc=!fCity||l.city===fCity;const mt=!fType||l.propertyType===fType;const mst=!fStat||l.status===fStat;
      let mcs=true;
      if(fCall==='called')mcs=(callMap[l.id]?.total||0)>0;
      if(fCall==='not_called')mcs=(callMap[l.id]?.total||0)===0;
      if(fCall==='connected')mcs=(callMap[l.id]?.connected||0)>0;
      let ma=true;
      if(fAsgn==='assigned')ma=!!asgn[l.id];
      if(fAsgn==='unassigned')ma=!asgn[l.id];
      if(fAsgn==='pending'){const as=asgn[l.id];if(!as)ma=false;else{const cd=callMap[l.id];ma=!(cd?.logs?.some(lg=>(lg.answered_agent_name||lg.agent_name||'').toLowerCase().includes(as.agentName.toLowerCase().split(' ')[0])));}}
      if(fAsgn==='done'){const as=asgn[l.id];if(!as)ma=false;else{const cd=callMap[l.id];ma=!!(cd?.logs?.some(lg=>(lg.answered_agent_name||lg.agent_name||'').toLowerCase().includes(as.agentName.toLowerCase().split(' ')[0])));}}
      if(fAsgn.startsWith('ag_'))ma=asgn[l.id]?.agentId===fAsgn.slice(3);
      return ms&&mc&&mt&&mst&&mcs&&ma;
    });
    arr.sort((a,b)=>{let va,vb;if(sortF==='date'){va=new Date(a.date).getTime();vb=new Date(b.date).getTime();}else if(sortF==='name'){va=a.name.toLowerCase();vb=b.name.toLowerCase();}else if(sortF==='calls'){va=callMap[a.id]?.total||0;vb=callMap[b.id]?.total||0;}else{va=a[sortF]||'';vb=b[sortF]||'';}return sortD==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0);});
    return arr;
  },[leads,search,fCity,fType,fStat,fCall,fAsgn,sortF,sortD,callMap,asgn]);

  const tPages=Math.ceil(filtered.length/perPage);const iFirst=(page-1)*perPage;const cur=filtered.slice(iFirst,iFirst+perPage);
  useEffect(()=>{setPage(1);},[search,fCity,fType,fStat,fCall,fAsgn]);
  const allSel=cur.length>0&&cur.every(l=>selIds.has(l.id));
  const toggleAll=()=>{if(allSel)setSelIds(p=>{const n=new Set(p);cur.forEach(l=>n.delete(l.id));return n;});else setSelIds(p=>{const n=new Set(p);cur.forEach(l=>n.add(l.id));return n;});};
  const hSort=f=>{if(sortF===f)setSortD(d=>d==='asc'?'desc':'asc');else{setSortF(f);setSortD('desc');}};
  const SI=({f})=>{if(sortF!==f)return <Minus size={12} style={{opacity:0.3}}/>;return sortD==='asc'?<SortAsc size={12}/>:<SortDesc size={12}/>;};
  const fCnt=[fCity,fType,fCall,fAsgn,fStat].filter(Boolean).length;

  const handleImport=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const wb=XLSX.read(ev.target.result,{type:'binary'});const d=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);const imp=d.filter(r=>(r.Name||r.name)&&(r['Contact no.']||r.contact)).map(r=>({id:gid(),date:r.Date||r.date||new Date().toISOString().split('T')[0],name:(r.Name||r.name||'').trim(),contact:(r['Contact no.']||r.contact||'').trim(),email:'',city:(r.City||r.city||'').trim(),propertyType:r['Property Type']||r.propertyType||'',source:r.Source||r.source||'',budget:r.Budget||r.budget||'',priority:r.Priority||r.priority||'medium',status:'new',assignedTo:'',tags:[],remark:''}));if(!imp.length){toast('No valid leads','error');return;}setLeads(p=>[...p,...imp]);toast(`✅ ${imp.length} imported`);setTimeout(cRefresh,2000);}catch{toast('Import error','error');}};r.readAsBinaryString(file);e.target.value='';};

  const handleExport=(exp=filtered)=>{if(!exp.length){toast('Nothing to export','warning');return;}const d=exp.map(l=>{const cd=callMap[l.id];const as=asgn[l.id];return{Date:l.date,Name:l.name,Contact:l.contact,City:l.city,Property:l.propertyType,Status:l.status,'Assigned To':as?.agentName||'—',Calls:cd?.total||0,Connected:cd?.connected||0};});const ws=XLSX.utils.json_to_sheet(d);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Leads');XLSX.writeFile(wb,`leads_${new Date().toISOString().split('T')[0]}.xlsx`);toast(`📥 ${d.length} exported`);};

  return (
    <div className="lm-dashboard">
      {/* Header */}
      <div className="lm-header">
        <div className="lm-header__left"><h1><BarChart3 size={26}/> Lead Management</h1><p>Manage, assign & track</p></div>
        <div className="lm-header__actions">
          <button onClick={()=>setHideUnk(p=>{const n=!p;LS.set(SK.HIDE_UNK,n);return n;})} style={{display:'flex',alignItems:'center',gap:5,background:hideUnk?'#fee2e2':'#f8fafc',color:hideUnk?'#dc2626':'#64748b',border:`1px solid ${hideUnk?'#fca5a5':'#e2e8f0'}`,borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:'0.75rem',fontWeight:700}}>
            <UserX size={14}/>{hideUnk?'Unknown Hidden':'Hide Unknown'}{unkCnt>0&&<span style={{background:hideUnk?'#dc2626':'#94a3b8',color:'#fff',borderRadius:999,fontSize:'0.62rem',padding:'1px 5px'}}>{unkCnt}</span>}
          </button>
          <button className="lm-btn lm-btn--ghost lm-btn--sm" onClick={()=>setShowFilter(true)}><Filter size={15}/> Filter{fCnt>0&&<span style={{background:'#1e2d5a',color:'#fff',borderRadius:999,fontSize:'0.62rem',padding:'1px 6px'}}>{fCnt}</span>}</button>
          <button className="lm-btn lm-btn--template lm-btn--sm" onClick={()=>setShowTpl(true)}><TableProperties size={15}/></button>
          <label className="lm-btn lm-btn--outline lm-btn--sm lm-btn--import"><Upload size={15}/> Import<input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport}/></label>
          <button className="lm-btn lm-btn--outline lm-btn--sm" onClick={()=>handleExport()}><Download size={15}/> Export</button>
          <button className="lm-btn lm-btn--primary lm-btn--sm" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add</button>
        </div>
      </div>

      {/* Stats */}
      <div className="lm-stats"><div className="lm-stats__grid lm-stats__grid--8">
        {[{i:<FileText size={18}/>,cls:'icon--navy',v:leads.length,l:'Total'},{i:<UserCheck size={18}/>,cls:'icon--green',v:Object.keys(asgn).length,l:'Assigned'},{i:<UserX size={18}/>,cls:'icon--red',v:leads.length-Object.keys(asgn).length,l:'Unassigned'},{i:<MapPin size={18}/>,cls:'icon--teal',v:cities.length,l:'Cities'}].map((s,i)=>(<div className="lm-stat-card lm-stat-card--compact" key={i}><div className={`lm-stat-card__icon ${s.cls}`}>{s.i}</div><div><p className="lm-stat-card__label">{s.l}</p><h3 className="lm-stat-card__value">{s.v}</h3></div></div>))}
      </div></div>

      {/* Dashboard */}
      <Dashboard asgn={asgn} leads={leads} callMap={callMap} onDel={id=>{unassign(id);toast('Removed');}} onReassign={(lid,ag)=>assignOne(lid,ag)} toast={toast}/>

      {/* Action bar */}
      <div className="lm-action-bar"><div className="lm-action-bar__row">
        <div className="lm-search"><Search className="lm-search__icon" size={17}/><input className="lm-search__input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="lm-search__clear" onClick={()=>setSearch('')}><X size={14}/></button>}</div>
        <div className="lm-actions-group">
          <div className="lm-call-filter-btns">{[{k:'',l:'All'},{k:'not_called',l:'📵 Not Called'},{k:'called',l:'📞 Called'},{k:'connected',l:'✅ Connected'}].map(f=><button key={f.k} className={`lm-call-filter-btn ${fCall===f.k?'lm-call-filter-btn--active':''}`} onClick={()=>setFCall(p=>p===f.k?'':f.k)}>{f.l}</button>)}</div>
          <div className="lm-call-filter-btns">{[{k:'',l:'📋 All'},{k:'assigned',l:'✅ Assigned'},{k:'unassigned',l:'❌ Unassigned'},{k:'pending',l:'⏳ Pending'},{k:'done',l:'✔️ Done'}].map(f=><button key={f.k} className={`lm-call-filter-btn ${fAsgn===f.k?'lm-call-filter-btn--active':''}`} onClick={()=>setFAsgn(p=>p===f.k?'':f.k)}>{f.l}</button>)}</div>
          <select className="lm-select" style={{fontSize:'0.78rem',padding:'6px 10px',width:'auto'}} value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1);}}>{[10,25,50].map(n=><option key={n} value={n}>{n}/pg</option>)}</select>
        </div>
      </div></div>

      {/* Table */}
      <div className="lm-table-section">
        <div className="lm-table-header">
          <h3 className="lm-table-header__title"><Users size={17}/> Leads</h3>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {selIds.size>0&&<button className="lm-btn lm-btn--primary lm-btn--sm" onClick={()=>setShowAssign(true)} style={{background:'linear-gradient(135deg,#1e2d5a,#2d4080)'}}><UserPlus size={14}/> Assign ({selIds.size})</button>}
            <span className="lm-table-header__count">{filtered.length} records</span>
          </div>
        </div>
        <div className="lm-table-wrapper"><table className="lm-table"><thead><tr>
          <th style={{width:36}}><input type="checkbox" checked={allSel} onChange={toggleAll}/></th>
          <th>#</th>
          <th onClick={()=>hSort('date')} style={{cursor:'pointer'}}>Date <SI f="date"/></th>
          <th onClick={()=>hSort('name')} style={{cursor:'pointer'}}>Name <SI f="name"/></th>
          <th>Contact</th><th>City</th><th>Property</th><th>Status</th>
          <th style={{minWidth:180}}>Assignment</th>
          <th onClick={()=>hSort('calls')} style={{cursor:'pointer'}}>Calls <SI f="calls"/></th>
          <th>Actions</th>
        </tr></thead><tbody>
          {cur.length>0?cur.map((ld,idx)=>{
            const st=STATUSES.find(s=>s.v===(ld.status||'new'))||STATUSES[0];
            const sel=selIds.has(ld.id);const as=asgn[ld.id];const cd=callMap[ld.id];
            let ac=false,aco=false;
            if(as&&cd?.logs){ac=cd.logs.some(lg=>(lg.answered_agent_name||lg.agent_name||'').toLowerCase().includes(as.agentName.toLowerCase().split(' ')[0]));aco=cd.logs.some(lg=>(lg.answered_agent_name||lg.agent_name||'').toLowerCase().includes(as.agentName.toLowerCase().split(' ')[0])&&['completed','connected','answered'].includes((lg.call_status||'').toLowerCase()));}
            return (
              <tr key={ld.id} style={{background:sel?'#eff6ff':undefined,borderLeft:sel?'3px solid #1e2d5a':as?`3px solid ${as.agentColor}`:'3px solid transparent'}}>
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel} onChange={()=>setSelIds(p=>{const n=new Set(p);n.has(ld.id)?n.delete(ld.id):n.add(ld.id);return n;})}/></td>
                <td style={{color:'#94a3b8',fontSize:'0.74rem'}}>{iFirst+idx+1}</td>
                <td style={{fontSize:'0.78rem'}}>{fd(ld.date)}</td>
                <td><div style={{fontWeight:700,fontSize:'0.82rem',color:'#1e2d5a'}}>{ld.name}</div></td>
                <td style={{fontSize:'0.78rem'}}>{fp(ld.contact)}</td>
                <td style={{fontSize:'0.78rem'}}>{ld.city}</td>
                <td><span className="lm-table__badge">{ld.propertyType}</span></td>
                <td><span style={{background:st.bg,color:st.c,borderRadius:6,padding:'3px 8px',fontSize:'0.72rem',fontWeight:700}}>{st.l}</span></td>
                <td onClick={e=>e.stopPropagation()}>
                  {as?(
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:22,height:22,borderRadius:'50%',background:as.agentColor,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.6rem',fontWeight:800,flexShrink:0}}>{as.agentName[0]}</div>
                        <span style={{fontSize:'0.76rem',fontWeight:700,color:as.agentColor}}>{as.agentName.split(' ')[0]}</span>
                        {ac?<span style={{fontSize:'0.65rem',background:aco?'#dcfce7':'#fef3c7',color:aco?'#16a34a':'#92400e',borderRadius:4,padding:'1px 6px',fontWeight:700}}>{aco?'Connected':'Called'}</span>
                        :<span style={{fontSize:'0.65rem',background:'#fee2e2',color:'#dc2626',borderRadius:4,padding:'1px 6px',fontWeight:700}}>Pending</span>}
                      </div>
                      <div style={{display:'flex',gap:3}}>
                        <select value="" onChange={e=>{if(e.target.value){const ag=AGENTS.find(a=>a.id===e.target.value);if(ag){assignOne(ld.id,ag);toast(`→ ${ag.name.split(' ')[0]}`);}}}}
                          style={{padding:'2px 4px',borderRadius:4,border:'1px solid #bfdbfe',fontSize:'0.65rem',color:'#2563eb',background:'#eff6ff',cursor:'pointer',fontWeight:600}}>
                          <option value="">Change…</option>{AGENTS.filter(a=>a.id!==as.agentId).map(a=><option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>)}
                        </select>
                        <button onClick={()=>{unassign(ld.id);toast('Removed');}} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:4,cursor:'pointer',color:'#dc2626',padding:'2px 4px',lineHeight:1}}><X size={9}/></button>
                      </div>
                    </div>
                  ):(
                    <select value="" onChange={e=>{if(e.target.value){const ag=AGENTS.find(a=>a.id===e.target.value);if(ag){assignOne(ld.id,ag);toast(`✅ → ${ag.name.split(' ')[0]}`);}}}}
                      style={{padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:'0.74rem',color:'#1e2d5a',background:'#f8fafc',cursor:'pointer',fontWeight:600}}>
                      <option value="">Assign…</option>{AGENTS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </td>
                <td onClick={e=>e.stopPropagation()}>
                  {cd&&cd.total>0?<div onClick={()=>setHistLead(ld)} style={{cursor:'pointer'}}>
                    <div style={{display:'flex',gap:5,fontSize:'0.72rem',fontWeight:600}}><span style={{color:'#1e2d5a'}}>{cd.total}</span><span style={{color:'#16a34a'}}>{cd.connected}✓</span><span style={{color:'#dc2626'}}>{cd.missed}✗</span></div>
                    <div style={{height:3,background:'#e2e8f0',borderRadius:2,marginTop:3}}><div style={{height:'100%',background:cd.connected/cd.total>=0.5?'#16a34a':'#f59e0b',borderRadius:2,width:`${Math.round(cd.connected/cd.total*100)}%`}}/></div>
                  </div>:<span style={{fontSize:'0.72rem',color:'#cbd5e1'}}>—</span>}
                </td>
                <td onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',gap:3}}>
                    <button className="lm-btn lm-btn--icon lm-btn--icon-edit" onClick={()=>{setEditL({...empty,...ld});setShowEdit(true);}}><Edit2 size={13}/></button>
                    <button className="lm-btn lm-btn--icon" onClick={()=>{setNotesLead(ld);setShowNotes(true);}} style={{color:'#f59e0b'}}><MessageSquare size={13}/></button>
                    <button className="lm-btn lm-btn--icon lm-btn--icon-delete" onClick={()=>setConfirm({msg:`Delete "${ld.name}"?`,ok:'Delete',fn:()=>{setLeads(p=>p.filter(l=>l.id!==ld.id));unassign(ld.id);setConfirm(null);toast('Deleted');}})}><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            );
          }):<tr><td colSpan="11"><div className="lm-empty"><FileText size={40} style={{opacity:0.2}}/><p className="lm-empty__title">{leads.length?'No match':'No leads'}</p>{!leads.length&&<button className="lm-btn lm-btn--primary lm-btn--sm" onClick={()=>setShowAdd(true)}><Plus size={14}/> Add</button>}</div></td></tr>}
        </tbody></table></div>

        {tPages>1&&<div className="lm-pagination">
          <span className="lm-pagination__info">{iFirst+1}–{Math.min(iFirst+perPage,filtered.length)} of {filtered.length}</span>
          <div className="lm-pagination__controls">
            <button className="lm-pagination__btn" disabled={page===1} onClick={()=>setPage(1)}>«</button>
            <button className="lm-pagination__btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={13}/></button>
            {Array.from({length:Math.min(5,tPages)},(_,i)=>{const pg=Math.max(1,Math.min(page-2,tPages-4))+i;return pg<=tPages?<button key={pg} className={`lm-pagination__page ${page===pg?'lm-pagination__page--active':''}`} onClick={()=>setPage(pg)}>{pg}</button>:null;}).filter(Boolean)}
            <button className="lm-pagination__btn" disabled={page===tPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={13}/></button>
            <button className="lm-pagination__btn" disabled={page===tPages} onClick={()=>setPage(tPages)}>»</button>
          </div>
        </div>}
      </div>

      {/* Modals */}
      {showAdd&&<div className="lm-modal-overlay" onClick={()=>setShowAdd(false)}><div className="lm-modal lm-modal--wide" onClick={e=>e.stopPropagation()}><div className="lm-modal__header"><h2 className="lm-modal__title"><Plus size={18}/> Add Lead</h2><button className="lm-modal__close" onClick={()=>setShowAdd(false)}><X size={18}/></button></div><div className="lm-modal__body"><LForm d={newL} setD={setNewL}/></div><div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="lm-btn lm-btn--primary" onClick={()=>{if(!newL.name.trim()||!newL.contact.trim()||!newL.city.trim()||!newL.propertyType){toast('Fill required','error');return;}setLeads(p=>[{id:gid(),...newL},...p]);setNewL(empty);setShowAdd(false);toast('✅ Added');}}><Plus size={15}/> Add</button></div></div></div>}
      {showEdit&&<div className="lm-modal-overlay" onClick={()=>setShowEdit(false)}><div className="lm-modal lm-modal--wide" onClick={e=>e.stopPropagation()}><div className="lm-modal__header"><h2 className="lm-modal__title"><Edit2 size={18}/> Edit</h2><button className="lm-modal__close" onClick={()=>setShowEdit(false)}><X size={18}/></button></div><div className="lm-modal__body"><LForm d={editL} setD={setEditL}/></div><div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={()=>setShowEdit(false)}>Cancel</button><button className="lm-btn lm-btn--primary" onClick={()=>{setLeads(p=>p.map(l=>l.id===editL.id?editL:l));setShowEdit(false);toast('✏️ Saved');}}><CheckCircle size={15}/> Save</button></div></div></div>}
      {showFilter&&<div className="lm-modal-overlay" onClick={()=>setShowFilter(false)}><div className="lm-modal" onClick={e=>e.stopPropagation()}><div className="lm-modal__header"><h2 className="lm-modal__title"><Filter size={18}/> Filters</h2><button className="lm-modal__close" onClick={()=>setShowFilter(false)}><X size={18}/></button></div><div className="lm-modal__body" style={{display:'flex',flexDirection:'column',gap:12}}>
        <div className="lm-form-group"><label className="lm-label">City</label><select className="lm-select" value={fCity} onChange={e=>setFCity(e.target.value)}><option value="">All</option>{cities.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="lm-form-group"><label className="lm-label">Property</label><select className="lm-select" value={fType} onChange={e=>setFType(e.target.value)}><option value="">All</option>{PROP_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="lm-form-group"><label className="lm-label">Status</label><select className="lm-select" value={fStat} onChange={e=>setFStat(e.target.value)}><option value="">All</option>{STATUSES.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
        <div className="lm-form-group"><label className="lm-label">Assignment</label><select className="lm-select" value={fAsgn} onChange={e=>setFAsgn(e.target.value)}><option value="">All</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option><option value="pending">Pending</option><option value="done">Done</option>{AGENTS.map(a=><option key={a.id} value={`ag_${a.id}`}>{a.name}</option>)}</select></div>
      </div><div className="lm-modal__footer"><button className="lm-btn lm-btn--ghost" onClick={()=>{setFCity('');setFType('');setFCall('');setFAsgn('');setFStat('');setSearch('');setShowFilter(false);}}>Reset</button><button className="lm-btn lm-btn--primary" onClick={()=>setShowFilter(false)}>Apply</button></div></div></div>}
      {showTpl&&<TplModal onClose={()=>setShowTpl(false)}/>}
      {showNotes&&notesLead&&<Notes lead={notesLead} notes={notes} onSave={saveNotes} onClose={()=>{setShowNotes(false);setNotesLead(null);}}/>}
      {showAssign&&selIds.size>0&&<AssignModal leads={leads} selIds={selIds} asgn={asgn} onAssign={assignBulk} onClose={()=>setShowAssign(false)} toast={toast}/>}
      {histLead&&<CallHistory lead={histLead} cd={callMap[histLead.id]} asgn={asgn[histLead.id]} onClose={()=>setHistLead(null)}/>}
      {confirm&&<Confirm msg={confirm.msg} sub={confirm.sub} ok={confirm.ok} onOk={confirm.fn} onNo={()=>setConfirm(null)}/>}

      {/* Bulk bar */}
      {selIds.size>0&&<div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#fff',borderRadius:14,padding:'10px 20px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 8px 32px rgba(0,0,0,0.2)',zIndex:500}}>
        <span style={{fontSize:'0.8rem',fontWeight:700}}><CheckCircle size={13} style={{marginRight:4}}/>{selIds.size} selected</span>
        <div style={{width:1,height:18,background:'rgba(255,255,255,0.2)'}}/>
        <button onClick={()=>setShowAssign(true)} style={{background:'#10b981',border:'none',color:'#fff',borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:'0.76rem',fontWeight:700,display:'flex',alignItems:'center',gap:4}}><UserPlus size={12}/> Assign</button>
        <button onClick={()=>handleExport(filtered.filter(l=>selIds.has(l.id)))} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:'0.76rem'}}><Download size={12}/></button>
        <button onClick={()=>{const c=selIds.size;setConfirm({msg:`Delete ${c}?`,ok:`Delete ${c}`,fn:()=>{setLeads(p=>p.filter(l=>!selIds.has(l.id)));unassignBulk(Array.from(selIds));setSelIds(new Set());setConfirm(null);toast(`🗑️ ${c} deleted`);}});}} style={{background:'rgba(239,68,68,0.3)',border:'none',color:'#fff',borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:'0.76rem'}}><Trash2 size={12}/></button>
        <button onClick={()=>setSelIds(new Set())} style={{background:'none',border:'1px solid rgba(255,255,255,0.2)',color:'#fff',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}><X size={12}/></button>
      </div>}
    </div>
  );
};

const LeadManagement = () => <TProvider><Main/></TProvider>;
export default LeadManagement;