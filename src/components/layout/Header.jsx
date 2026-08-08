import React, { useState, useCallback } from "react";
import { Menu, LogOut, ShieldCheck, User, Building2, Loader2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import "./Header.css";

export default function Header({ onMenuToggle }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const { isAdmin, isClient, loading } = useAuth();

  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
    } catch (e) {
      console.error(e);
      setLoggingOut(false);
    }
  }, []);

  /* Hamburger handler — supports both click and touch */
  const handleMenuToggle = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onMenuToggle();
  }, [onMenuToggle]);

  const getRoleBadge = () => {
    if (isAdmin) return { label: "Admin",  icon: <ShieldCheck size={13} />, cls: "hd-badge--admin"  };
    if (isClient) return { label: "Client", icon: <Building2  size={13} />, cls: "hd-badge--client" };
    return              { label: "Staff",  icon: <User        size={13} />, cls: "hd-badge--user"   };
  };

  const badge = getRoleBadge();
  if (loading) return null;

  return (
    <header className="hd-header">

      {/* ── Left: hamburger + mobile brand ── */}
      <div className="hd-left">
        <button
          type="button"
          className="hd-hamburger"
          onClick={handleMenuToggle}
          onTouchEnd={handleMenuToggle}
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="hd-brand-mobile">
          <span className="hd-brand-mobile__name">Adinath</span>
          <span className="hd-brand-mobile__sub">CRM</span>
        </div>
      </div>

      {/* ── Right: badge + logout ── */}
      <div className="hd-right">
        <div className={`hd-badge ${badge.cls}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        <button
          type="button"
          className={`hd-logout${loggingOut ? " hd-logout--busy" : ""}`}
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <>
              <Loader2 size={15} className="hd-logout__spinner" />
              <span>Logging out…</span>
            </>
          ) : (
            <>
              <LogOut size={15} />
              <span>Logout</span>
            </>
          )}
        </button>
      </div>

    </header>
  );
}
