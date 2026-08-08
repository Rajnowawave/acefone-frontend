// src/components/ProtectedAdminRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin, message as antdMessage } from "antd";
import { useAuth } from "../context/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const ProtectedAdminRoute = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const location = useLocation();
  const [messageApi, contextHolder] = antdMessage.useMessage();

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            const adminStatus = userData.role === "admin";
            setIsAdmin(adminStatus);

            if (!adminStatus) {
              messageApi.warning(
                "Access denied! Admin privileges required."
              );
            }
          } else {
            setIsAdmin(false);
            messageApi.error("User data not found.");
          }
        } catch (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
          messageApi.error("Error verifying permissions.");
        }
      } else {
        setIsAdmin(false);
      }
      setCheckingAdmin(false);
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading, messageApi]);

  if (authLoading || checkingAdmin) {
    return (
      <>
        {contextHolder}
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <Spin size="large" />
          <p
            style={{
              color: "#666",
              margin: 0,
              fontSize: "14px",
            }}
          >
            Checking permissions...
          </p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {contextHolder}
        <Navigate
          to="/login"
          replace
          state={{ from: location }}
        />
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        {contextHolder}
        <Navigate to="/" replace />
      </>
    );
  }

  return (
    <>
      {contextHolder}
      {children}
    </>
  );
};

export default ProtectedAdminRoute;