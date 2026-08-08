import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import MainLayout from "./components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Visit from "./pages/Visit";
import FollowUp from "./pages/FollowUp";
import ExistingClient from "./pages/ExistingClient";
import Login from "./pages/Login";
import UserCreate from "./pages/UserCreate";
import EmailReport from "./pages/EmailReport";
import BrokerEntry from "./pages/BrokerEntry";

import "antd/dist/reset.css";
import { ConfigProvider, Spin } from "antd";

import { AuthProvider, useAuth } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import LeadManagement from "./pages/leadmanagement/LeadManagement";
import AcefoneIVRCall from "./pages/leadmanagement/AcefoneIVRCall";
import DashboardIVRCall from "./pages/leadmanagement/DashboardIVRCall";
import CallLogs from "./pages/leadmanagement/CallLogs";
import Agents from "./pages/leadmanagement/Agents";
import FollowUps from "./pages/leadmanagement/FollowUps";
import Dialer from "./pages/leadmanagement/Dialer";

const theme = {
  token: { colorPrimary: "#1890ff", borderRadius: 6 },
};

/* ─────────────────────────────────────────────
   Layout — sidebar only on authenticated pages
───────────────────────────────────────────── */
const Layout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  if (isLoginPage || !user) {
    return <>{children}</>;
  }

  return <MainLayout>{children}</MainLayout>;
};

/* ─────────────────────────────────────────────
   AdminOrUserRoute
───────────────────────────────────────────── */
const AdminOrUserRoute = ({ children }) => {
  const { user, loading, isClient } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isClient) return <Navigate to="/visit" replace />;

  return children;
};

/* ─────────────────────────────────────────────
   HomeRoute
───────────────────────────────────────────── */
const HomeRoute = () => {
  const { user, loading, isClient } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isClient) return <Navigate to="/visit" replace />;

  return <Dashboard />;
};

/* ─────────────────────────────────────────────
   FallbackRoute
───────────────────────────────────────────── */
const FallbackRoute = () => {
  const { user, loading, isClient } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isClient) return <Navigate to="/visit" replace />;

  return <Navigate to="/" replace />;
};

/* ─────────────────────────────────────────────
   Placeholder for future pages
───────────────────────────────────────────── */
const ComingSoon = ({ title }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      gap: 12,
    }}
  >
    <div style={{ fontSize: 48 }}>🚧</div>
    <h2 style={{ color: "#1e2d5a", margin: 0, fontSize: 22, fontWeight: 700 }}>
      {title}
    </h2>
    <p style={{ color: "#9b9690", margin: 0, fontSize: 14 }}>
      This page is coming soon.
    </p>
  </div>
);

/* ─────────────────────────────────────────────
   Main App
───────────────────────────────────────────── */
function App() {
  return (
    <ConfigProvider theme={theme}>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Home / Dashboard */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/dashboard" element={<HomeRoute />} />

              {/* Site Visit */}
              <Route path="/visit" element={<PrivateRoute><Visit /></PrivateRoute>} />
              <Route path="/sitevisit/non-existing-client" element={<PrivateRoute><Visit /></PrivateRoute>} />
              <Route path="/existing-client" element={<PrivateRoute><ExistingClient /></PrivateRoute>} />
              <Route path="/sitevisit/existing-client" element={<PrivateRoute><ExistingClient /></PrivateRoute>} />

              {/* Admin + User */}
              <Route path="/analytics" element={<AdminOrUserRoute><Analytics /></AdminOrUserRoute>} />
              <Route path="/sitevisit/analytics" element={<AdminOrUserRoute><Analytics /></AdminOrUserRoute>} />
              <Route path="/follow-up" element={<AdminOrUserRoute><FollowUp /></AdminOrUserRoute>} />
              <Route path="/sitevisit/follow-up" element={<AdminOrUserRoute><FollowUp /></AdminOrUserRoute>} />
              <Route path="/broker-detail" element={<AdminOrUserRoute><BrokerEntry /></AdminOrUserRoute>} />
              <Route path="/sitevisit/broker-detail" element={<AdminOrUserRoute><BrokerEntry /></AdminOrUserRoute>} />
              <Route path="/emailreport" element={<AdminOrUserRoute><EmailReport /></AdminOrUserRoute>} />

              {/* Lead Management */}
              <Route 
  path="/leadmanagement/lead-management" 
  element={
    <AdminOrUserRoute>
      <LeadManagement />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/acefone-ivr-call" 
  element={
    <AdminOrUserRoute>
      <AcefoneIVRCall />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/dashboard-ivr-call" 
  element={
    <AdminOrUserRoute>
      <DashboardIVRCall />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/calllogs-ivr-call" 
  element={
    <AdminOrUserRoute>
      <CallLogs />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/agent-ivr-call" 
  element={
    <AdminOrUserRoute>
      <Agents />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/follow-up-ivr-call" 
  element={
    <AdminOrUserRoute>
      <FollowUps />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

<Route 
  path="/leadmanagement/dialer-ivr-call" 
  element={
    <AdminOrUserRoute>
      <Dialer onCallMade={(data) => console.log("Call made:", data)} />   {/* ComingSoon ki jagah ye lagao */}
    </AdminOrUserRoute>
  } 
/>

              {/* Admin Only */}
              <Route path="/user-create" element={<ProtectedAdminRoute><UserCreate /></ProtectedAdminRoute>} />
              <Route path="/usermanagement/user-create" element={<ProtectedAdminRoute><UserCreate /></ProtectedAdminRoute>} />

              {/* Fallback */}
              <Route path="*" element={<FallbackRoute />} />
            </Routes>
          </Layout>
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
