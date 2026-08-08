import React, { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import SearchableCountryDropdown, { countryCodes } from "./SearchableCountryDropdown";
import "./About.css";

function About() {
  const pad = (n) => String(n).padStart(2, "0");

  const getCountryByCode = (code) =>
    countryCodes.find((c) => c.code === code) || countryCodes[0];

  const getPhoneValidation = (code) => {
    const c = getCountryByCode(code);
    return { minLength: c.minLength, maxLength: c.maxLength };
  };

  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("search");
  const [visitorData, setVisitorData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [visitorName, setVisitorName] = useState("");

  // ⏱️ Countdown state
  const [countdown, setCountdown] = useState(5);

  const validation = getPhoneValidation(countryCode);
  const isPhoneValid =
    phone.length >= validation.minLength && phone.length <= validation.maxLength;

  // ✅ Reset handler
  const handleReset = useCallback(() => {
    setPhone("");
    setCountryCode("+91");
    setStep("search");
    setVisitorData(null);
    setVisitorName("");
    setErrorMsg("");
    setCountdown(5);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ⏱️ Auto-redirect on success — 5 second countdown
  useEffect(() => {
    if (step !== "success") return;

    // Reset countdown when success step starts
    setCountdown(5);

    // Countdown every 1 second
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-redirect after 5 seconds
    const autoRedirectTimer = setTimeout(() => {
      handleReset();
    }, 5000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(autoRedirectTimer);
    };
  }, [step, handleReset]);

  const handleSearch = async () => {
    if (!isPhoneValid) return;
    setSearching(true);
    setErrorMsg("");

    try {
      const q = query(
        collection(db, "siteVisits"),
        orderBy("createdAt", "desc"),
        limit(500)
      );
      const snap = await getDocs(q);
      let found = null;

      snap.docs.forEach((doc) => {
        const d = doc.data();
        const storedPhone = String(d.visitor?.phone || d.phone || "").replace(/\D/g, "");
        const storedCode = d.visitor?.countryCode || d.countryCode || "+91";
        const searchPhone = phone.replace(/\D/g, "");

        if (storedPhone === searchPhone && storedCode === countryCode && !found) {
          found = { id: doc.id, ...d };
        }
      });

      if (found) {
        setVisitorData(found);
        setVisitorName(found.visitor?.name || "Visitor");
        await submitVisit(found);
      } else {
        setStep("not-found");
      }
    } catch (err) {
      console.error("Search error:", err);
      setErrorMsg("Something went wrong. Please try again.");
      setStep("error");
    } finally {
      setSearching(false);
    }
  };

  const submitVisit = async (visitor) => {
    setSubmitting(true);
    const now = new Date();
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    try {
      await addDoc(collection(db, "userVisitLogs"), {
        visitorName: visitor.visitor?.name || "Unknown Visitor",
        phone: visitor.visitor?.phone || phone,
        countryCode: visitor.visitor?.countryCode || countryCode,
        email: visitor.visitor?.email || "",
        location: visitor.visitor?.location || "",
        checkedInAt: serverTimestamp(),
        visitTime: currentTime,
        visitDate: now.toLocaleDateString("en-IN"),
        originalVisitRef: visitor.id,
        propertyTypes: visitor.propertyTypes || visitor.propertyLayout || [],
        propertyLayout: visitor.propertyLayout || [],
        purpose: visitor.purpose || [],
        propertyStatus: visitor.propertyStatus || [],
        campaignSource: visitor.campaignSource || [],
        source: "Returning Visit",
        timestamp: now.getTime(),
        status: "checked-in",
        isReturningVisit: true,
      });

      await addDoc(collection(db, "siteVisits"), {
        visitor: {
          name: visitor.visitor?.name || "Unknown Visitor",
          phone: visitor.visitor?.phone || phone,
          countryCode: visitor.visitor?.countryCode || countryCode,
          email: visitor.visitor?.email || "",
          location: visitor.visitor?.location || "",
        },
        propertyLayout: visitor.propertyLayout || [],
        propertyTypes: visitor.propertyTypes || [],
        purpose: visitor.purpose || [],
        propertyStatus: visitor.propertyStatus || [],
        campaignSource: visitor.campaignSource || [],
        visitAt: now,
        visitTime: currentTime,
        createdAt: serverTimestamp(),
        isFirstVisit: false,
        isReturningVisit: true,
        originalVisitRef: visitor.id,
        agent: visitor.agent || {},
        leadQuality: visitor.leadQuality || "Warm",
        bookingStatus: visitor.bookingStatus || "Interested",
        existingClient: "Yes",
      });

      setStep("success");
    } catch (err) {
      console.error("Submit error:", err);
      setErrorMsg("Error submitting check-in. Please try again.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ───────── SEARCH ───────── */
  if (step === "search") {
    return (
      <div className="rv-page">
        <div className="rv-bg">
          <div className="rv-shape rv-shape1" />
          <div className="rv-shape rv-shape2" />
          <div className="rv-shape rv-shape3" />
        </div>

        <div className="rv-card">
          <div className="rv-icon-wrap">
            <div className="rv-icon-circle">
              <span>🔄</span>
            </div>
          </div>

          <h1 className="rv-title">Welcome Back!</h1>
          <p className="rv-subtitle">Enter your registered phone number to check in</p>

          <div className="rv-form">
            <label className="rv-label">Phone Number</label>
            <div className="rv-phone-row">
              <SearchableCountryDropdown
                value={countryCode}
                onChange={(code) => { setCountryCode(code); setPhone(""); }}
                name="countryCode"
                id="countryCode"
              />
              <input
                type="tel"
                inputMode="numeric"
                placeholder={`${validation.minLength}–${validation.maxLength} digits`}
                value={phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, validation.maxLength);
                  setPhone(digits);
                }}
                onKeyDown={(e) => e.key === "Enter" && isPhoneValid && handleSearch()}
                className="rv-input"
              />
            </div>

            <div className="rv-phone-meta">
              <span className="rv-flag-label">
                {getCountryByCode(countryCode).flag} {getCountryByCode(countryCode).country}
              </span>
              {phone && (
                <span className={`rv-digit-count ${phone.length >= validation.minLength ? "rv-ok" : "rv-warn"}`}>
                  {phone.length}/{validation.maxLength}
                </span>
              )}
            </div>

            {errorMsg && <div className="rv-error-inline">{errorMsg}</div>}

            <button
              className="rv-btn rv-btn-primary"
              onClick={handleSearch}
              disabled={!isPhoneValid || searching || submitting}
            >
              {searching || submitting ? (
                <><span className="rv-spinner" />{searching ? "Searching…" : "Checking in…"}</>
              ) : (
                <>Check In <span className="rv-arrow">→</span></>
              )}
            </button>

            <div className="rv-hint">
              <span>ℹ️</span> Your phone number must be registered to check in
            </div>

            <div className="rv-divider"><span>OR</span></div>

            <div className="rv-first-time">
              <p>📝 <strong>First time here?</strong></p>
              <a href="/visit" className="rv-link">Go to Registration Form →</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ───────── SUCCESS with Auto-Redirect ───────── */
  if (step === "success") {
    const now = new Date();
    return (
      <div className="rv-page">
        <div className="rv-bg">
          <div className="rv-shape rv-shape1 rv-shape-green" />
          <div className="rv-shape rv-shape2 rv-shape-green" />
          <div className="rv-shape rv-shape3 rv-shape-green" />
        </div>

        <div className="rv-confetti-wrap">
          {[...Array(30)].map((_, i) => (
            <div key={i} className={`rv-confetti rv-confetti-${i % 6}`} style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }} />
          ))}
        </div>

        <div className="rv-card rv-card-success">
          <div className="rv-check-wrap">
            <div className="rv-check-circle">
              <svg className="rv-checkmark" viewBox="0 0 52 52">
                <circle className="rv-checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                <path className="rv-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
          </div>

          <h2 className="rv-success-title">Visit Submitted Successfully!</h2>

          <p className="rv-success-msg">
            Welcome back, <strong>{visitorName}</strong>! 🎉
          </p>

          <div className="rv-success-time">
            <span>🕐</span>
            <span>
              {pad(now.getHours())}:{pad(now.getMinutes())} &bull;{" "}
              {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>

          <div className="rv-success-badge">
            <span>✨</span> Your visit has been recorded
          </div>

          {/* ⏱️ Countdown Timer */}
          <div className="rv-countdown-container">
            <div className="rv-countdown-bar-track">
              <div
                className="rv-countdown-bar-fill"
                style={{ width: `${(countdown / 5) * 100}%` }}
              />
            </div>
            <p className="rv-countdown-text">
              ⏱️ Redirecting in{" "}
              <strong className="rv-countdown-number">{countdown}s</strong>
            </p>
          </div>

          <button className="rv-btn rv-btn-done" onClick={handleReset}>
            Done ✓
          </button>
        </div>
      </div>
    );
  }

  /* ───────── NOT FOUND ───────── */
  if (step === "not-found") {
    return (
      <div className="rv-page">
        <div className="rv-bg">
          <div className="rv-shape rv-shape1 rv-shape-amber" />
          <div className="rv-shape rv-shape2 rv-shape-amber" />
        </div>

        <div className="rv-card rv-card-warn">
          <div className="rv-big-emoji">📋</div>

          <h2 className="rv-warn-title">Not Registered</h2>

          <p className="rv-warn-text">
            We couldn't find a registration for{" "}
            <strong>{getCountryByCode(countryCode).flag} {countryCode} {phone}</strong>
          </p>

          <p className="rv-warn-hint">
            Looks like this is your first visit! Please register using the form.
          </p>

          <div className="rv-warn-actions">
            <button className="rv-btn rv-btn-primary" onClick={() => window.location.href = '/visit'}>
              📝 Go to Registration
            </button>
            <button className="rv-btn rv-btn-ghost" onClick={handleReset}>
              ← Try Different Number
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ───────── ERROR ───────── */
  if (step === "error") {
    return (
      <div className="rv-page">
        <div className="rv-bg">
          <div className="rv-shape rv-shape1 rv-shape-red" />
          <div className="rv-shape rv-shape2 rv-shape-red" />
        </div>

        <div className="rv-card rv-card-error">
          <div className="rv-big-emoji">❌</div>

          <h2 className="rv-err-title">Something Went Wrong</h2>
          <p className="rv-err-text">{errorMsg || "Please try again."}</p>

          <button className="rv-btn rv-btn-primary" onClick={handleReset}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default About;