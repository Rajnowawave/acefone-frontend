// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  GithubAuthProvider,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

const AuthContext = createContext();

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isUser, setIsUser] = useState(false);
  const [userRole, setUserRole] = useState(null);

  /* ────────────────────────────────────────
     Firestore se role check karo
     3 roles: admin, user, client
  ──────────────────────────────────────── */
  const checkUserRole = async (firebaseUser) => {
    if (!firebaseUser) {
      setIsAdmin(false);
      setIsClient(false);
      setIsUser(false);
      setUserRole(null);
      return null;
    }

    try {
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        const role = data.role || "user";

        setUserRole(role);
        setIsAdmin(role === "admin");
        setIsClient(role === "client");
        setIsUser(role === "user");

        return role;
      } else {
        setIsAdmin(false);
        setIsClient(false);
        setIsUser(true);
        setUserRole("user");
        return "user";
      }
    } catch (err) {
      console.error("checkUserRole error:", err);
      setIsAdmin(false);
      setIsClient(false);
      setIsUser(true);
      setUserRole("user");
      return "user";
    }
  };

  /* ────────────────────────────────────────
     Firestore me user document banao / update karo
  ──────────────────────────────────────── */
  const createUserDocument = async (firebaseUser) => {
    if (!firebaseUser) return;

    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName:
            firebaseUser.displayName ||
            firebaseUser.email?.split("@")[0] ||
            "User",
          photoURL: firebaseUser.photoURL || "",
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          role: "user",
          isAdmin: false,
          isActive: true,
        });
      } else {
        await setDoc(
          userRef,
          { lastLoginAt: serverTimestamp() },
          { merge: true }
        );
      }

      await checkUserRole(firebaseUser);
    } catch (err) {
      console.error("createUserDocument error:", err);
    }
  };

  /* ────────────────────────────────────────
     Auth Methods
  ──────────────────────────────────────── */
  const signup = async (email, password, displayName = "") => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      if (displayName) await updateProfile(result.user, { displayName });
      await createUserDocument(result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      const result = await signInWithEmailAndPassword(auth, email, password);
      await createUserDocument(result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    try {
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);
      await createUserDocument(result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithGithub = async () => {
    try {
      setError(null);
      const result = await signInWithPopup(auth, githubProvider);
      await createUserDocument(result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setIsAdmin(false);
      setIsClient(false);
      setIsUser(false);
      setUserRole(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const resetPassword = async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateUserProfile = async (updates) => {
    try {
      setError(null);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, updates);
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          { ...updates, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const makeUserAdmin = async (userId) => {
    if (!isAdmin) throw new Error("Only admins can promote users");
    await setDoc(
      doc(db, "users", userId),
      {
        role: "admin",
        isAdmin: true,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      },
      { merge: true }
    );
  };

  const changeUserRole = async (userId, newRole) => {
    if (!isAdmin) throw new Error("Only admins can change roles");
    if (userId === user?.uid)
      throw new Error("Cannot change your own role");
    await setDoc(
      doc(db, "users", userId),
      {
        role: newRole,
        isAdmin: newRole === "admin",
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      },
      { merge: true }
    );
  };

  const removeAdminRights = async (userId) => {
    if (!isAdmin) throw new Error("Only admins can remove admin rights");
    if (userId === user?.uid)
      throw new Error("Cannot remove your own admin rights");
    await setDoc(
      doc(db, "users", userId),
      {
        role: "user",
        isAdmin: false,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      },
      { merge: true }
    );
  };

  /* ────────────────────────────────────────
     Auth state listener
  ──────────────────────────────────────── */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);

        if (firebaseUser) {
          await checkUserRole(firebaseUser);
        } else {
          setIsAdmin(false);
          setIsClient(false);
          setIsUser(false);
          setUserRole(null);
        }
      } catch (err) {
        console.error("onAuthStateChanged error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    user,
    loading,
    error,
    isAdmin,
    isClient,
    isUser,
    userRole,
    currentUser: user,
    signup,
    login,
    loginWithGoogle,
    loginWithGithub,
    logout,
    resetPassword,
    updateUserProfile,
    makeUserAdmin,
    changeUserRole,
    removeAdminRights,
    setError,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export default AuthContext;