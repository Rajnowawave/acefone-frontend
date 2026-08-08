import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./Navbar.css";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

/* ─────────────────────────────────────────────
   Link definitions for each role
───────────────────────────────────────────── */

const ADMIN_LINKS = [
  { to: "/", label: "Dashboard", icon: "fa-solid fa-house" },
  { to: "/visit", label: "Non Existing Client", icon: "fa-solid fa-briefcase" },
  { to: "/analytics", label: "Analytics", icon: "fa-solid fa-chart-line" },
  { to: "/existing-client", label: "Existing Client", icon: "fa-solid fa-users" },
  { to: "/follow-up", label: "Follow-Up", icon: "fa-solid fa-reply" },
  { to: "/broker-detail", label: "Broker Detail", icon: "fa-solid fa-handshake" },
  { to: "/user-create", label: "User Create", icon: "fa-solid fa-user-plus" },
];

const USER_LINKS = [
  { to: "/", label: "Dashboard", icon: "fa-solid fa-house" },
  { to: "/visit", label: "Non Existing Client", icon: "fa-solid fa-briefcase" },
  { to: "/analytics", label: "Analytics", icon: "fa-solid fa-chart-line" },
  { to: "/existing-client", label: "Existing Client", icon: "fa-solid fa-users" },
  { to: "/follow-up", label: "Follow-Up", icon: "fa-solid fa-reply" },
  { to: "/broker-detail", label: "Broker Detail", icon: "fa-solid fa-handshake" },
];

const CLIENT_LINKS = [
  { to: "/visit", label: "Non Existing Client", icon: "fa-solid fa-briefcase" },
  { to: "/existing-client", label: "Existing Client", icon: "fa-solid fa-users" },
];

export default function AdvancedNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const { isAdmin, isClient, loading } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
    } catch (e) {
      console.error(e);
      setLoggingOut(false);
    }
  };

  const getNavLinks = () => {
    if (isAdmin) return ADMIN_LINKS;
    if (isClient) return CLIENT_LINKS;
    return USER_LINKS;
  };

  const navLinks = getNavLinks();

  const getHomeLink = () => {
    if (isClient) return "/visit";
    return "/";
  };

  const getRoleBadge = () => {
    if (isAdmin) {
      return {
        className: "an-badge-admin",
        icon: "fa-shield-halved",
        label: "Admin",
        mobileLabel: "Administrator Panel",
      };
    }
    if (isClient) {
      return {
        className: "an-badge-client",
        icon: "fa-building",
        label: "Client",
        mobileLabel: "Client Account",
      };
    }
    return {
      className: "an-badge-user",
      icon: "fa-user",
      label: "Staff",
      mobileLabel: "Staff Account",
    };
  };

  const roleBadge = getRoleBadge();

  if (loading) return null;

  return (
    <>
      {/* ══════════════════════════════════════
          DESKTOP NAVBAR
      ══════════════════════════════════════ */}
      <nav className={`an-navbar ${scrolled ? "an-scrolled" : ""}`}>
        {/* Top accent line */}
        <div className="an-accent-line" />

        <div className="an-container">
          {/* Brand */}
          <NavLink className="an-brand" to={getHomeLink()}>
            <div className="an-brand-logo-wrap">
              <img
                src="Adinath-logo.jpg"
                alt="Adinath Buildwell Logo"
                className="an-brand-logo"
              />
            </div>
            <div className="an-brand-text">
              <span className="an-brand-name">Adinath</span>
              <span className="an-brand-sub">Buildwell</span>
            </div>
          </NavLink>

          {/* Desktop Links */}
          <ul className="an-nav-links">
            {navLinks.map(({ to, label, icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `an-nav-link ${isActive ? "an-active" : ""}`
                  }
                >
                  <i className={icon}></i>
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="an-actions">
            {/* Role Badge */}
            <div className={`an-role-badge ${roleBadge.className}`}>
              <i className={`fa-solid ${roleBadge.icon}`}></i>
              <span>{roleBadge.label}</span>
            </div>

            {/* Logout - Desktop */}
            <button
              className={`an-logout-btn ${loggingOut ? "an-logging-out" : ""}`}
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <>
                  <span className="an-logout-spinner"></span>
                  <span>Logging out…</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-arrow-right-from-bracket"></i>
                  <span>Logout</span>
                </>
              )}
            </button>

            {/* Hamburger */}
            <button
              className={`an-hamburger ${mobileOpen ? "an-ham-active" : ""}`}
              onClick={() => setMobileOpen((p) => !p)}
              aria-label="Toggle menu"
            >
              <span className="an-ham-line"></span>
              <span className="an-ham-line"></span>
              <span className="an-ham-line"></span>
            </button>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════
          MOBILE SIDE MENU
      ══════════════════════════════════════ */}
      <div className={`an-mobile-menu ${mobileOpen ? "an-mobile-open" : ""}`}>
        {/* Mobile Header */}
        <div className="an-mobile-header">
          <div className="an-mobile-brand">
            <img
              src="Adinath-logo.jpg"
              alt="Logo"
              className="an-mobile-logo"
            />
            <div className="an-mobile-brand-text">
              <span className="an-mobile-brand-name">Adinath</span>
              <span className="an-mobile-brand-sub">Buildwell</span>
            </div>
          </div>
          <button
            className="an-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Role Strip */}
        <div className={`an-mobile-role ${roleBadge.className}`}>
          <i className={`fa-solid ${roleBadge.icon}`}></i>
          <span>{roleBadge.mobileLabel}</span>
        </div>

        {/* Navigation Label */}
        <div className="an-mobile-nav-label">
          <span>Navigation</span>
          <div className="an-mobile-nav-line"></div>
        </div>

        {/* Mobile Links */}
        <div className="an-mobile-nav">
          {navLinks.map(({ to, label, icon }, index) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `an-mobile-link ${isActive ? "an-mobile-active" : ""}`
              }
              onClick={() => setMobileOpen(false)}
              style={{ animationDelay: `${0.05 * (index + 1)}s` }}
            >
              <div className="an-mobile-link-icon">
                <i className={icon}></i>
              </div>
              <span className="an-mobile-link-label">{label}</span>
              <i className="fa-solid fa-chevron-right an-mobile-link-arrow"></i>
            </NavLink>
          ))}
        </div>

        {/* Mobile Footer */}
        <div className="an-mobile-footer">
          <div className="an-mobile-footer-divider"></div>
          <button
            className={`an-mobile-logout ${loggingOut ? "an-logging-out" : ""}`}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <>
                <span className="an-logout-spinner"></span>
                Logging out…
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Logout
              </>
            )}
          </button>
          <p className="an-mobile-copyright">
            © {new Date().getFullYear()} Adinath Buildwell
          </p>
        </div>
      </div>

      {/* Overlay */}
      <div
        className={`an-overlay ${mobileOpen ? "an-overlay-visible" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
    </>
  );
}