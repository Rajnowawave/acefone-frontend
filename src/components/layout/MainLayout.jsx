import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "../../context/AuthContext";
import "./MainLayout.css";

export default function MainLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, isClient } = useAuth();
  const location = useLocation();

  /* Close drawer on route change */
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  /* Lock body scroll when mobile drawer is open */
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [mobileOpen]);

  const openSidebar  = useCallback(() => setMobileOpen(true),  []);
  const closeSidebar = useCallback(() => setMobileOpen(false), []);
  const toggleSidebar = useCallback(() => setMobileOpen((p) => !p), []);

  return (
    <div className="ml-shell">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={closeSidebar}
        isAdmin={isAdmin}
        isClient={isClient}
      />

      <div className="ml-main">
        <Header onMenuToggle={toggleSidebar} />
        <main className="ml-content">
          {children}
        </main>
      </div>
    </div>
  );
}
