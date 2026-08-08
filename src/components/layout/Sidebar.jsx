import React, { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  UserX,
  Users,
  RefreshCcw,
  Briefcase,
  BarChart2,
  PhoneCall,
  UserPlus,
  ChevronDown,
  X,
  Building2,
  ClipboardList,
} from "lucide-react";
import "./Sidebar.css";

/* ─── Menu definitions per role ─── */
const SITE_VISIT_CHILDREN = [
  { label: "Non Existing Client", to: "/visit",           icon: <UserX size={16} /> },
  { label: "Existing Client",     to: "/existing-client", icon: <Users size={16} /> },
  { label: "Follow-Up",           to: "/follow-up",       icon: <RefreshCcw size={16} /> },
  { label: "Broker Detail",       to: "/broker-detail",   icon: <Briefcase size={16} /> },
  { label: "Analytics",           to: "/analytics",       icon: <BarChart2 size={16} /> },
];

const LEAD_CHILDREN = [
  { label: "Dashboard IVR Call", to: "/leadmanagement/dashboard-ivr-call", icon: <PhoneCall size={16} /> },
  { label: "Lead Management",  to: "/leadmanagement/lead-management",  icon: <ClipboardList size={16} /> },
  { label: "Dialer IVR Call", to: "/leadmanagement/dialer-ivr-call", icon: <PhoneCall size={16} /> },
  // { label: "Acefone IVR Call", to: "/leadmanagement/acefone-ivr-call", icon: <PhoneCall size={16} /> },
  { label: "CallLogs IVR Call", to: "/leadmanagement/calllogs-ivr-call", icon: <PhoneCall size={16} /> },
  { label: "Follow-Up IVR Call", to: "/leadmanagement/follow-up-ivr-call", icon: <PhoneCall size={16} /> },
  { label: "Agent IVR Call", to: "/leadmanagement/agent-ivr-call", icon: <PhoneCall size={16} /> },
  
  
  
];

const ADMIN_MENU = [
  { key: "dashboard", label: "Dashboard",       icon: <LayoutDashboard size={18} />, to: "/", end: true },
  { key: "sitevisit", label: "Site Visit",      icon: <MapPin size={18} />,          children: SITE_VISIT_CHILDREN },
  { key: "lead",      label: "Lead Management", icon: <ClipboardList size={18} />,   children: LEAD_CHILDREN },
  { key: "usermgmt",  label: "User Management", icon: <UserPlus size={18} />,
    children: [{ label: "User Create", to: "/user-create", icon: <UserPlus size={16} /> }] },
];

const USER_MENU = [
  { key: "dashboard", label: "Dashboard",       icon: <LayoutDashboard size={18} />, to: "/", end: true },
  { key: "sitevisit", label: "Site Visit",      icon: <MapPin size={18} />,          children: SITE_VISIT_CHILDREN },
  { key: "lead",      label: "Lead Management", icon: <ClipboardList size={18} />,   children: LEAD_CHILDREN },
];

const CLIENT_MENU = [
  { key: "sitevisit", label: "Site Visit", icon: <MapPin size={18} />,
    children: [
      { label: "Non Existing Client", to: "/visit",           icon: <UserX size={16} /> },
      { label: "Existing Client",     to: "/existing-client", icon: <Users size={16} /> },
    ]},
];

export default function Sidebar({ mobileOpen, onClose, isAdmin, isClient }) {
  const location  = useLocation();
  const [openGroups, setOpenGroups] = useState({});

  const menuItems = isAdmin ? ADMIN_MENU : isClient ? CLIENT_MENU : USER_MENU;

  /* Auto-open the group that contains the active route */
  useEffect(() => {
    const autoOpen = {};
    menuItems.forEach((item) => {
      if (item.children) {
        const hasActive = item.children.some((c) => location.pathname === c.to);
        if (hasActive) autoOpen[item.key] = true;
      }
    });
    setOpenGroups((prev) => ({ ...prev, ...autoOpen }));
  }, [location.pathname]);

  const toggleGroup = useCallback((key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isChildActive = (children) =>
    children?.some((c) => location.pathname === c.to);

  /* Handle close — works for both click and touch */
  const handleClose = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }, [onClose]);

  const handleGroupToggle = useCallback((e, key) => {
    e.preventDefault();
    e.stopPropagation();
    toggleGroup(key);
  }, [toggleGroup]);

  return (
    <>
      {/* ── Overlay (mobile backdrop) ── */}
      <div
        className={`sb-overlay ${mobileOpen ? "sb-overlay--visible" : ""}`}
        onClick={handleClose}
        onTouchEnd={handleClose}
        aria-hidden="true"
      />

      {/* ── Sidebar ── */}
      <aside
        className={`sb-sidebar ${mobileOpen ? "sb-sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        {/* Logo + close */}
        <div className="sb-logo">
          <div className="sb-logo__icon-wrap">
            <Building2 size={22} className="sb-logo__icon" />
          </div>
          <div className="sb-logo__text">
            <span className="sb-logo__name">Adinath</span>
            <span className="sb-logo__sub">Buildwell CRM</span>
          </div>
          <button
            className="sb-close-btn"
            onClick={handleClose}
            onTouchEnd={handleClose}
            aria-label="Close sidebar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sb-section-label">MAIN MENU</div>

        {/* Navigation */}
        <nav className="sb-nav">
          {menuItems.map((item) => {
            if (item.to) {
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `sb-link${isActive ? " sb-link--active" : ""}`
                  }
                  onClick={onClose}
                >
                  <span className="sb-link__icon">{item.icon}</span>
                  <span className="sb-link__label">{item.label}</span>
                </NavLink>
              );
            }

            const isOpen    = !!openGroups[item.key];
            const hasActive = isChildActive(item.children);

            return (
              <div key={item.key} className="sb-group">
                <button
                  type="button"
                  className={`sb-group__trigger${hasActive ? " sb-group__trigger--active" : ""}`}
                  onClick={(e) => handleGroupToggle(e, item.key)}
                  aria-expanded={isOpen}
                >
                  <span className="sb-link__icon">{item.icon}</span>
                  <span className="sb-link__label">{item.label}</span>
                  <ChevronDown
                    size={15}
                    className={`sb-group__arrow${isOpen ? " sb-group__arrow--open" : ""}`}
                  />
                </button>

                <div
                  className={`sb-group__children${isOpen ? " sb-group__children--open" : ""}`}
                  aria-hidden={!isOpen}
                >
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        `sb-child${isActive ? " sb-child--active" : ""}`
                      }
                      onClick={onClose}
                    >
                      <span className="sb-child__label">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sb-footer">
          <div className="sb-footer__divider" />
          <p className="sb-footer__copy">
            © {new Date().getFullYear()} Adinath Buildwell
          </p>
        </div>
      </aside>
    </>
  );
}
