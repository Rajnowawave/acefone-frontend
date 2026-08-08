import React, { useEffect, useState, useRef, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  query, where, getDocs, orderBy, limit
} from "firebase/firestore";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import {
  FaPhone, FaUser, FaCalendarAlt, FaClock,
  FaEnvelope, FaMapMarkerAlt, FaHome, FaUsers,
  FaBullhorn, FaBuilding, FaExclamationTriangle,
  FaArrowRight, FaHistory, FaUserCheck
} from "react-icons/fa";
import SearchableCountryDropdown, { countryCodes } from "./SearchableCountryDropdown";
import { useNavigate } from "react-router-dom";
import "./VisitForm.css";

/* ─── Confetti helper ─── */
function launchConfetti() {
  const canvas = document.getElementById("vf-confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#1e2d5a", "#2c3e6b", "#c17f3e", "#27694f", "#d4954f", "#3d5080", "#f4d03f", "#e8e5de"];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 200,
    w: 6 + Math.random() * 9,
    h: 4 + Math.random() * 5,
    r: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    vr: (Math.random() - 0.5) * 0.15,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 0.85 + Math.random() * 0.15,
  }));

  let frame = 0;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.06;
      if (p.y < canvas.height + 20) alive = true;
      const fade = Math.max(0, (p.y - canvas.height * 0.7) / (canvas.height * 0.3));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = p.opacity * (1 - fade);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 240) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
}

/* ─── Success Modal with Auto-Close Countdown ─── */
function SuccessModal({ visitorName, visitTime, onClose }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const t = setTimeout(launchConfetti, 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(autoCloseTimer);
    };
  }, [onClose]);

  return (
    <>
      <canvas
        id="vf-confetti-canvas"
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 9999,
        }}
      />

      <div style={modalStyles.overlay}>
        <div style={modalStyles.modal}>
          <div style={modalStyles.accentBar} />

          <div style={modalStyles.checkRing}>
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <circle cx="17" cy="17" r="16" stroke="rgba(39,105,79,0.35)" strokeWidth="1.5" fill="rgba(39,105,79,0.08)" />
              <path
                d="M9 17.5 L14.5 23 L25 12"
                stroke="#27694f"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: "vf-drawCheck 0.45s ease 0.55s both" }}
              />
            </svg>
          </div>

          <h2 style={modalStyles.title}>Visit Submitted Successfully!</h2>

          <p style={modalStyles.subtitle}>
            Welcome back, <strong style={{ color: "#1e2d5a" }}>{visitorName}</strong>! 🎉
          </p>

          <div style={modalStyles.timeBadge}>
            <span style={modalStyles.timeDot} />
            {visitTime}
          </div>

          <div style={modalStyles.recordedBadge}>
            ✦ &nbsp;Your visit has been recorded
          </div>

          <div style={modalStyles.countdownContainer}>
            <div style={modalStyles.countdownBarTrack}>
              <div
                style={{
                  ...modalStyles.countdownBarFill,
                  width: `${(countdown / 5) * 100}%`,
                }}
              />
            </div>
            <p style={modalStyles.countdownText}>
              ⏱️ Auto-redirecting in{" "}
              <strong style={modalStyles.countdownNumber}>{countdown}s</strong>
            </p>
          </div>

          <button style={modalStyles.doneBtn} onClick={onClose}>
            DONE ✓
          </button>
        </div>
      </div>

      <style>{`
        @keyframes vf-overlayIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vf-modalIn    { from { opacity: 0; transform: scale(0.88) translateY(24px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes vf-ringPop    { from { opacity: 0; transform: scale(0.4) } to { opacity: 1; transform: scale(1) } }
        @keyframes vf-drawCheck  { to   { stroke-dashoffset: 0 } }
        @keyframes vf-slideUp    { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes vf-donePulse  { 0%,100% { box-shadow: 0 6px 28px rgba(30,45,90,0.28) } 50% { box-shadow: 0 8px 36px rgba(30,45,90,0.38) } }
        @keyframes vf-countdownPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.15) } }
      `}</style>
    </>
  );
}

const modalStyles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9000,
    background: "rgba(244,243,240,0.72)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px",
    animation: "vf-overlayIn 0.35s ease both",
  },
  modal: {
    background: "#ffffff",
    border: "1px solid #e8e5de",
    borderRadius: "24px",
    boxShadow: "0 2px 60px rgba(30,45,90,0.14), 0 1px 0 rgba(255,255,255,0.9) inset",
    padding: "48px 40px 40px",
    maxWidth: "420px",
    width: "100%",
    textAlign: "center",
    position: "relative",
    overflow: "hidden",
    animation: "vf-modalIn 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.08s both",
  },
  accentBar: {
    position: "absolute", top: 0, left: 0, right: 0, height: "3px",
    background: "linear-gradient(90deg, transparent 0%, #3d5080 25%, #1e2d5a 50%, #3d5080 75%, transparent 100%)",
  },
  checkRing: {
    width: "72px", height: "72px",
    borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 22px",
    animation: "vf-ringPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.25s both",
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "1.6rem",
    fontWeight: 700,
    color: "#1e2d5a",
    marginBottom: "10px",
    animation: "vf-slideUp 0.4s ease 0.38s both",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: "0.88rem",
    color: "#4a4740",
    marginBottom: "20px",
    lineHeight: 1.5,
    animation: "vf-slideUp 0.4s ease 0.46s both",
  },
  timeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "#f4f3f0",
    border: "1px solid #e8e5de",
    borderRadius: "100px",
    padding: "7px 18px",
    fontSize: "0.78rem",
    fontWeight: 500,
    color: "#4a4740",
    marginBottom: "12px",
    animation: "vf-slideUp 0.4s ease 0.52s both",
  },
  timeDot: {
    width: "6px", height: "6px",
    borderRadius: "50%",
    background: "#9b9690",
    display: "inline-block",
  },
  recordedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(39,105,79,0.07)",
    border: "1px solid rgba(39,105,79,0.22)",
    borderRadius: "100px",
    padding: "7px 18px",
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#27694f",
    marginBottom: "20px",
    animation: "vf-slideUp 0.4s ease 0.58s both",
  },
  countdownContainer: {
    marginBottom: "24px",
    animation: "vf-slideUp 0.4s ease 0.62s both",
  },
  countdownBarTrack: {
    width: "100%",
    height: "4px",
    background: "#e8e5de",
    borderRadius: "100px",
    overflow: "hidden",
    marginBottom: "10px",
  },
  countdownBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #1e2d5a, #3d5080, #c17f3e)",
    borderRadius: "100px",
    transition: "width 1s linear",
  },
  countdownText: {
    fontSize: "0.76rem",
    color: "#9b9690",
    margin: 0,
    letterSpacing: "0.02em",
  },
  countdownNumber: {
    color: "#1e2d5a",
    fontSize: "0.85rem",
    fontWeight: 700,
    animation: "vf-countdownPulse 1s ease infinite",
    display: "inline-block",
  },
  doneBtn: {
    width: "100%",
    padding: "16px 32px",
    background: "linear-gradient(135deg, #1e2d5a 0%, #2c3e6b 50%, #1e2d5a 100%)",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: "0.82rem",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#ffffff",
    boxShadow: "0 6px 28px rgba(30,45,90,0.28), 0 2px 6px rgba(30,45,90,0.16)",
    animation: "vf-slideUp 0.4s ease 0.65s both, vf-donePulse 2.5s ease 1.2s infinite",
    transition: "transform 0.15s ease",
  },
};

/* ═══════════════════════════════════════════════════════════════
   EXISTING CLIENT BANNER — Shows when phone matches DB record
   ═══════════════════════════════════════════════════════════════ */
function ExistingClientBanner({ onGoToExisting }) {
  return (
    <>
      <style>{`
        @keyframes ecb-slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ecb-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
          50% { box-shadow: 0 0 0 10px rgba(220,38,38,0); }
        }
        @keyframes ecb-bounce {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(8px); }
        }
        .ecb-simple-container {
          animation: ecb-slideDown 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
          margin-bottom: 20px;
          border-radius: 16px;
          overflow: hidden;
          border: 2px solid #dc2626;
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          box-shadow: 0 8px 32px rgba(220,38,38,0.2), 0 2px 8px rgba(220,38,38,0.1);
          padding: 24px;
        }
        .ecb-simple-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        .ecb-simple-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #dc2626, #ef4444);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 24px;
          flex-shrink: 0;
          animation: ecb-pulse 2s ease infinite;
        }
        .ecb-simple-text h3 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.3rem;
          font-weight: 700;
          color: #991b1b;
          margin: 0 0 6px;
        }
        .ecb-simple-text p {
          font-size: 0.9rem;
          color: #7f1d1d;
          margin: 0;
          line-height: 1.5;
        }
        .ecb-simple-message {
          background: #ffffff;
          border: 1px solid rgba(220,38,38,0.3);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }
        .ecb-simple-message p {
          margin: 0 0 8px;
          color: #1e2d5a;
          font-size: 0.88rem;
          line-height: 1.6;
        }
        .ecb-simple-message p:last-child {
          margin: 0;
        }
        .ecb-simple-message strong {
          color: #dc2626;
          font-weight: 700;
        }
        .ecb-simple-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 24px;
          background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(220,38,38,0.3);
          transition: all 0.2s ease;
        }
        .ecb-simple-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(220,38,38,0.4);
        }
        .ecb-simple-btn .ecb-arrow {
          animation: ecb-bounce 1.5s ease infinite;
          font-size: 18px;
        }
      `}</style>

      <div className="ecb-simple-container">
        <div className="ecb-simple-header">
          <div className="ecb-simple-icon">
            <FaExclamationTriangle />
          </div>
          <div className="ecb-simple-text">
            <h3>⚠️ Already Registered!</h3>
            <p>You have already filled the form previously</p>
          </div>
        </div>

        <div className="ecb-simple-message">
          <p>
            <strong>📋 Your details are already in our system.</strong>
          </p>
          <p>
            Please use the <strong>Existing Client Page</strong> to enter your visit information.
            It will automatically fill your details and track your visit history.
          </p>
          <p>
            👉 Click the button below to go to the Existing Client Page and enter your number there.
          </p>
        </div>

        <button className="ecb-simple-btn" onClick={onGoToExisting}>
          <FaArrowRight className="ecb-arrow" />
          Go to Existing Client Page
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN VISIT COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function Visit() {
  const navigate = useNavigate();
  const pad = (n) => String(n).padStart(2, "0");

  const getCurrentDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  };

  const getCurrentTime = () => {
    const n = new Date();
    return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  };

  const formatDisplayTime = () => {
    const n = new Date();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${pad(n.getHours())}:${pad(n.getMinutes())} • ${n.getDate()} ${months[n.getMonth()]} ${n.getFullYear()}`;
  };

  const [saving, setSaving] = useState(false);
  const [displayTime, setDisplayTime] = useState(getCurrentTime());

  const [successModal, setSuccessModal] = useState({ show: false, name: "", time: "" });
  const [errorBanner, setErrorBanner] = useState({ show: false, msg: "" });

  // ── Existing client detection state ──
  const [existingClient, setExistingClient] = useState(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const phoneCheckTimerRef = useRef(null);
  const lastCheckedPhoneRef = useRef("");

  const getCountryByCode = (code) =>
    countryCodes.find((c) => c.code === code) || countryCodes[0];

  const getPhoneValidation = (code) => {
    const c = getCountryByCode(code);
    return { minLength: c.minLength, maxLength: c.maxLength };
  };

  const [selectedCountryCode, setSelectedCountryCode] = useState("+91");

  useEffect(() => {
    const interval = setInterval(() => setDisplayTime(getCurrentTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  const closeSuccessModal = useCallback(() => {
    setSuccessModal({ show: false, name: "", time: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ═══════════════════════════════════════════════════════════
     PHONE NUMBER LOOKUP — Check if visitor exists in DB
     ═══════════════════════════════════════════════════════════ */
  const checkExistingVisitor = useCallback(async (phone, countryCode) => {
    if (!phone || phone.length < 7) {
      setExistingClient(null);
      return;
    }

    const checkKey = `${countryCode}-${phone}`;
    if (lastCheckedPhoneRef.current === checkKey) return;
    lastCheckedPhoneRef.current = checkKey;

    setCheckingPhone(true);
    try {
      const q = query(
        collection(db, "siteVisits"),
        where("visitor.phone", "==", phone),
        orderBy("visitAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        setExistingClient({ phone, countryCode });
      } else {
        setExistingClient(null);
      }
    } catch (err) {
      console.error("Phone lookup error:", err);
      setExistingClient(null);
    } finally {
      setCheckingPhone(false);
    }
  }, []);

  // Debounced phone check
  const handlePhoneChange = useCallback((phoneValue, countryCode, setFieldValue) => {
    const v = getPhoneValidation(countryCode);
    const digits = phoneValue.replace(/\D/g, "").slice(0, v.maxLength);
    setFieldValue("phone", digits);

    // Clear previous timer
    if (phoneCheckTimerRef.current) {
      clearTimeout(phoneCheckTimerRef.current);
    }

    // Reset if phone cleared
    if (!digits || digits.length < v.minLength) {
      setExistingClient(null);
      lastCheckedPhoneRef.current = "";
      return;
    }

    // Debounce: check after 600ms of no typing
    if (digits.length >= v.minLength) {
      phoneCheckTimerRef.current = setTimeout(() => {
        checkExistingVisitor(digits, countryCode);
      }, 600);
    }
  }, [checkExistingVisitor]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (phoneCheckTimerRef.current) {
        clearTimeout(phoneCheckTimerRef.current);
      }
    };
  }, []);

  /* Navigate to existing client page with phone number */
  const handleGoToExisting = useCallback(() => {
    navigate(`/existing-client`);
  }, [navigate]);

  const initialValues = {
    countryCode: "+91",
    phone: "",
    visitorName: "",
    visitDate: getCurrentDate(),
    email: "",
    location: "",
    propertyLayout: [],
    propertyTypes: [],
    purpose: [],
    propertyStatus: [],
    campaignSource: [],
  };

  const createValidationSchema = (code) => {
    const v = getPhoneValidation(code);
    return Yup.object({
      phone: Yup.string()
        .matches(/^\d+$/, "Please enter only digits")
        .min(v.minLength, `Phone must be at least ${v.minLength} digits`)
        .max(v.maxLength, `Phone must not exceed ${v.maxLength} digits`)
        .required("Contact number is required"),
      visitorName: Yup.string()
        .min(2, "Name must be at least 2 characters")
        .required("Visitor name is required"),
      visitDate: Yup.date().required("Visit date is required"),
      email: Yup.string().email("Please enter a valid email address").nullable(),
      location: Yup.string().required("City / Address is required"),
      propertyLayout: Yup.array().min(1, "Please select at least one property layout"),
    });
  };

  const toggleArrayField = (arr, item) => {
    const copy = [...arr];
    const idx = copy.indexOf(item);
    if (idx === -1) copy.push(item);
    else copy.splice(idx, 1);
    return copy;
  };

  const handleSubmit = async (values, { resetForm }) => {
    // Block submission if existing client detected
    if (existingClient) {
      setErrorBanner({ 
        show: true, 
        msg: "Please use the Existing Client Page for returning visitors. Click the button above to proceed." 
      });
      setTimeout(() => setErrorBanner({ show: false, msg: "" }), 5000);
      return;
    }

    setSaving(true);
    try {
      const n = new Date();
      const currentTime = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
      const visitDateTime = new Date(`${values.visitDate}T${currentTime}:00`);

      await addDoc(collection(db, "siteVisits"), {
        visitor: {
          name: values.visitorName.trim(),
          phone: values.phone,
          countryCode: values.countryCode,
          email: (values.email || "").trim(),
          location: values.location.trim(),
        },
        propertyLayout: values.propertyLayout,
        propertyTypes: values.propertyTypes,
        purpose: values.purpose,
        propertyStatus: values.propertyStatus,
        campaignSource: values.campaignSource,
        visitAt: visitDateTime,
        visitTime: currentTime,
        createdAt: serverTimestamp(),
        isFirstVisit: true,
        isReturningVisit: false,
        totalVisits: 1,
        bookingStatus: "Not Booked",
        leadQuality: "",
        agent: { name: "" },
        channelPartner: { name: "", phone: "", countryCode: "+91" },
        remarks: "",
        visitorIdentity: "New Visitor",
      });

      setSuccessModal({
        show: true,
        name: values.visitorName.trim(),
        time: formatDisplayTime(),
      });

      resetForm({ values: { ...initialValues, visitDate: getCurrentDate() } });
      setSelectedCountryCode("+91");
      setExistingClient(null);
      lastCheckedPhoneRef.current = "";

    } catch (err) {
      console.error(err);
      setErrorBanner({ show: true, msg: "Error saving form. Please try again." });
      setTimeout(() => setErrorBanner({ show: false, msg: "" }), 5000);
    } finally {
      setSaving(false);
    }
  };

  const CheckboxGroup = ({ options, field, values, setFieldValue }) => (
    <div className="vf-checkbox-grid">
      {options.map(({ label, emoji }) => (
        <label
          key={label}
          className={`vf-checkbox-item ${
            Array.isArray(values[field]) && values[field].includes(label) ? "vf-checked" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={Array.isArray(values[field]) && values[field].includes(label)}
            onChange={() =>
              setFieldValue(field, toggleArrayField(values[field] || [], label))
            }
          />
          <span className="vf-checkmark">
            {Array.isArray(values[field]) && values[field].includes(label) ? "✓" : ""}
          </span>
          {emoji && <span className="vf-option-emoji">{emoji}</span>}
          <span className="vf-option-label">{label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="vf-container">

      {/* ── SUCCESS MODAL ── */}
      {successModal.show && (
        <SuccessModal
          visitorName={successModal.name}
          visitTime={successModal.time}
          onClose={closeSuccessModal}
        />
      )}

      {/* ── ERROR BANNER ── */}
      {errorBanner.show && (
        <div className="vf-message vf-message-error">
          <span className="vf-message-icon">❌</span>
          <div className="vf-message-body">
            <strong>Error!</strong>
            <p>{errorBanner.msg}</p>
          </div>
          <button
            className="vf-message-close"
            onClick={() => setErrorBanner({ show: false, msg: "" })}
          >✕</button>
        </div>
      )}

      {/* Header */}
      <div className="vf-header">
        <div className="vf-header-icon">🏠</div>
        <h1 className="vf-header-title">Visitor Information Form</h1>
        <div className="vf-header-meta">
          <span className="vf-meta-badge">
            <FaCalendarAlt /> {getCurrentDate().split("-").reverse().join("-")}
          </span>
          <span className="vf-meta-badge">
            <FaClock /> {displayTime}
          </span>
        </div>
      </div>

      {/* Form Card */}
      <div className="vf-card">
        <Formik
          initialValues={initialValues}
          validationSchema={createValidationSchema(selectedCountryCode)}
          onSubmit={handleSubmit}
          enableReinitialize={false}
        >
          {({ values, setFieldValue, errors, touched }) => (
            <Form>
              {/* ── Section: Visitor Details ── */}
              <div className="vf-section">
                <div className="vf-section-header">
                  <span className="vf-section-icon">📋</span>
                  <h2 className="vf-section-title">Visitor Details</h2>
                  <div className="vf-section-note">Fields marked * are required</div>
                </div>

                {/* Contact Number */}
                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaPhone className="vf-label-icon" /> Contact Number*
                  </label>
                  <div className="vf-phone-row">
                    <SearchableCountryDropdown
                      value={values.countryCode || "+91"}
                      onChange={(code) => {
                        setFieldValue("countryCode", code);
                        setSelectedCountryCode(code);
                        setFieldValue("phone", "");
                        setExistingClient(null);
                        lastCheckedPhoneRef.current = "";
                      }}
                      name="countryCode"
                    />
                    <div className="vf-phone-field">
                      <Field
                        type="tel"
                        name="phone"
                        inputMode="numeric"
                        placeholder={`${getCountryByCode(values.countryCode || "+91").minLength} digit number`}
                        className={`vf-input ${errors.phone && touched.phone ? "vf-input-error" : ""} ${existingClient ? "vf-input-warning" : ""}`}
                        onChange={(e) => {
                          handlePhoneChange(e.target.value, values.countryCode || "+91", setFieldValue);
                        }}
                        value={values.phone || ""}
                      />
                      {/* Phone checking indicator */}
                      {checkingPhone && (
                        <div className="vf-phone-checking">
                          <span className="vf-mini-spinner"></span>
                          <span>Checking...</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="vf-phone-meta">
                    <span className="vf-phone-country">
                      {getCountryByCode(values.countryCode || "+91").flag}{" "}
                      {getCountryByCode(values.countryCode || "+91").country}
                    </span>
                    <span className="vf-phone-digits-info">
                      {getCountryByCode(values.countryCode || "+91").minLength === getCountryByCode(values.countryCode || "+91").maxLength
                        ? `${getCountryByCode(values.countryCode || "+91").minLength} digits required`
                        : `${getCountryByCode(values.countryCode || "+91").minLength}–${getCountryByCode(values.countryCode || "+91").maxLength} digits`}
                    </span>
                    {values.phone && (
                      <span className={`vf-digit-counter ${values.phone.length >= getCountryByCode(values.countryCode || "+91").minLength ? "vf-counter-valid" : "vf-counter-invalid"}`}>
                        {values.phone.length} / {getCountryByCode(values.countryCode || "+91").maxLength}
                      </span>
                    )}
                  </div>
                  <ErrorMessage name="phone" component="div" className="vf-error" />
                </div>

                {/* ═══ EXISTING CLIENT BANNER ═══ */}
                {existingClient && (
                  <ExistingClientBanner onGoToExisting={handleGoToExisting} />
                )}

                {/* Visitor Name */}
                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaUser className="vf-label-icon" /> Visitor Name*
                  </label>
                  <Field
                    type="text"
                    name="visitorName"
                    placeholder="Enter visitor's full name"
                    className={`vf-input ${errors.visitorName && touched.visitorName ? "vf-input-error" : ""}`}
                  />
                  <ErrorMessage name="visitorName" component="div" className="vf-error" />
                </div>

                {/* Visit Date & Time */}
                <div className="vf-row-2">
                  <div className="vf-field-group">
                    <label className="vf-label">
                      <FaCalendarAlt className="vf-label-icon" /> Visit Date*
                    </label>
                    <Field
                      type="date"
                      name="visitDate"
                      className={`vf-input ${errors.visitDate && touched.visitDate ? "vf-input-error" : ""}`}
                    />
                    <ErrorMessage name="visitDate" component="div" className="vf-error" />
                  </div>

                  <div className="vf-field-group">
                    <label className="vf-label">
                      <FaClock className="vf-label-icon" /> Visit Time*
                    </label>
                    <div className="vf-time-wrapper">
                      <input
                        type="text"
                        value={displayTime}
                        disabled
                        readOnly
                        className="vf-input vf-input-disabled"
                      />
                      <div className="vf-live-badge">
                        <span className="vf-pulse-dot"></span>
                        Live
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaEnvelope className="vf-label-icon" /> Email Address
                    <span className="vf-optional">(optional)</span>
                  </label>
                  <Field
                    type="email"
                    name="email"
                    placeholder="example@email.com"
                    className={`vf-input ${errors.email && touched.email ? "vf-input-error" : ""}`}
                  />
                  <ErrorMessage name="email" component="div" className="vf-error" />
                </div>

                {/* City / Address */}
                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaMapMarkerAlt className="vf-label-icon" /> City / Address*
                  </label>
                  <Field
                    type="text"
                    name="location"
                    placeholder="Enter city or full address"
                    className={`vf-input ${errors.location && touched.location ? "vf-input-error" : ""}`}
                  />
                  <ErrorMessage name="location" component="div" className="vf-error" />
                </div>
              </div>

              {/* ── Section: Property Preferences ── */}
              <div className="vf-section">
                <div className="vf-section-header">
                  <span className="vf-section-icon">🏠</span>
                  <h2 className="vf-section-title">Property Preferences</h2>
                </div>

                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaHome className="vf-label-icon" /> Property Layout*
                  </label>
                  <CheckboxGroup
                    options={[
                      { label: "1 BHK", emoji: "🛏" },
                      { label: "2 BHK", emoji: "🛏" },
                      { label: "3 BHK", emoji: "🛏" },
                      { label: "4 BHK", emoji: "🛏" },
                      { label: "PentHouse", emoji: "🏙" },
                      { label: "Commercial", emoji: "🏢" },
                    ]}
                    field="propertyLayout"
                    values={values}
                    setFieldValue={setFieldValue}
                  />
                  {errors.propertyLayout && touched.propertyLayout && (
                    <div className="vf-error">{errors.propertyLayout}</div>
                  )}
                </div>

                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaBuilding className="vf-label-icon" /> Property Types
                  </label>
                  <CheckboxGroup
                    options={[
                      { label: "Apartment", emoji: "🏢" },
                      { label: "Villa", emoji: "🏡" },
                      { label: "Plot", emoji: "📐" },
                    ]}
                    field="propertyTypes"
                    values={values}
                    setFieldValue={setFieldValue}
                  />
                </div>

                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaUsers className="vf-label-icon" /> Purpose
                  </label>
                  <CheckboxGroup
                    options={[
                      { label: "For Residence", emoji: "🏠" },
                      { label: "For Investment", emoji: "💰" },
                    ]}
                    field="purpose"
                    values={values}
                    setFieldValue={setFieldValue}
                  />
                </div>

                <div className="vf-field-group">
                  <label className="vf-label">
                    <FaHome className="vf-label-icon" /> Property Status
                  </label>
                  <CheckboxGroup
                    options={[
                      { label: "Under Construction", emoji: "🏗" },
                      { label: "Ready to use", emoji: "✅" },
                    ]}
                    field="propertyStatus"
                    values={values}
                    setFieldValue={setFieldValue}
                  />
                </div>
              </div>

              {/* ── Section: Campaign Source ── */}
              <div className="vf-section">
                <div className="vf-section-header">
                  <span className="vf-section-icon">📢</span>
                  <h2 className="vf-section-title">Campaign Source</h2>
                  <div className="vf-section-note">Select all that apply</div>
                </div>

                <div className="vf-field-group">
                  <CheckboxGroup
                    options={[
                      { label: "Newspaper", emoji: "📰" },
                      { label: "Social Media", emoji: "📱" },
                      { label: "Friend / Family", emoji: "👨‍👩‍👧‍👦" },
                      { label: "Online Search", emoji: "🔍" },
                      { label: "Hoardings", emoji: "🪧" },
                      { label: "Real Estate Portal", emoji: "🏠" },
                      { label: "Other", emoji: "📋" },
                    ]}
                    field="campaignSource"
                    values={values}
                    setFieldValue={setFieldValue}
                  />
                  {values.campaignSource.length > 0 && (
                    <div className="vf-selected-count">
                      {values.campaignSource.length} source(s) selected: {values.campaignSource.join(", ")}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="vf-submit-section">
                <button
                  type="submit"
                  className={`vf-submit-btn ${saving ? "vf-submitting" : ""} ${existingClient ? "vf-btn-disabled" : ""}`}
                  disabled={saving || existingClient}
                >
                  {saving ? (
                    <>
                      <span className="vf-spinner"></span>
                      Registering...
                    </>
                  ) : existingClient ? (
                    <>
                      <span>⚠️</span>
                      Use Existing Client Page
                    </>
                  ) : (
                    <>
                      <span>✅</span>
                      Register Visitor
                    </>
                  )}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}

export default Visit;