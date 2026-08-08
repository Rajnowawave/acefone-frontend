// src/pages/UserCreate.jsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Form,
  Input,
  Button,
  Select,
  message,
  Card,
  Typography,
  Space,
  Tag,
  Divider,
  Row,
  Col,
  Progress,
  Alert,
  Tooltip,
  Badge,
  Avatar,
  Table,
  Modal,
  Empty,
  Spin,
  Dropdown,
  ConfigProvider,
} from "antd";
import {
  UserAddOutlined,
  MailOutlined,
  LockOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  UserOutlined,
  ShopOutlined,
  EyeInvisibleOutlined,
  EyeTwoTone,
  InfoCircleOutlined,
  ThunderboltOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  KeyOutlined,
  SwapOutlined,
  MoreOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  FilterOutlined,
  SettingOutlined,
  CopyOutlined,
  UserSwitchOutlined,
  UsergroupAddOutlined,
  StopOutlined,
  PlayCircleOutlined,
  StarFilled,
  TrophyOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  orderBy,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "../context/AuthContext";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { confirm } = Modal;

/* ─────────────────────────────────────────────
   Role Config
───────────────────────────────────────────── */
const ROLE_CONFIG = {
  admin: {
    label: "Super Admin",
    color: "#1e2d5a",
    gradient: "linear-gradient(135deg, #1e2d5a 0%, #2c3e6b 50%, #3d5080 100%)",
    bgGradient: "linear-gradient(135deg, #f0f3ff 0%, #e8edff 100%)",
    bgSolid: "#f0f3ff",
    border: "#c7d0f0",
    shadow: "0 8px 32px rgba(30, 45, 90, 0.15)",
    icon: <CrownOutlined />,
    badge: <TrophyOutlined />,
    description: "Complete system control with all administrative privileges",
    permissions: [
      "System Dashboard",
      "Advanced Analytics",
      "User Management",
      "Client Management",
      "Follow-Up System",
      "Broker Management",
      "Security Settings",
      "System Configuration",
    ],
    features: ["Full Access", "User Creation", "System Config", "Analytics"],
  },
  user: {
    label: "Team Member",
    color: "#2c3e6b",
    gradient: "linear-gradient(135deg, #2c3e6b 0%, #3d5080 50%, #4a5f96 100%)",
    bgGradient: "linear-gradient(135deg, #f4f6ff 0%, #eef1ff 100%)",
    bgSolid: "#f4f6ff",
    border: "#d4d9f0",
    shadow: "0 8px 32px rgba(44, 62, 107, 0.15)",
    icon: <UserOutlined />,
    badge: <StarFilled />,
    description: "Core team access for daily operations and client management",
    permissions: [
      "Client Dashboard",
      "Lead Management",
      "Follow-Up System",
      "Broker Coordination",
      "Basic Analytics",
      "Profile Settings",
    ],
    features: ["Client Access", "Lead Management", "Reports", "Communications"],
  },
  client: {
    label: "Client User",
    color: "#27694f",
    gradient: "linear-gradient(135deg, #27694f 0%, #2d7a5c 50%, #358a6a 100%)",
    bgGradient: "linear-gradient(135deg, #f0faf6 0%, #e6f7f0 100%)",
    bgSolid: "#f0faf6",
    border: "#b8dfd0",
    shadow: "0 8px 32px rgba(39, 105, 79, 0.15)",
    icon: <ShopOutlined />,
    badge: <RocketOutlined />,
    description: "Streamlined client portal with essential business tools",
    permissions: [
      "Personal Dashboard",
      "Lead Tracking",
      "Basic Reports",
      "Profile Management",
    ],
    features: ["Limited Access", "Lead View", "Basic Reports", "Profile"],
  },
};

/* ─────────────────────────────────────────────
   Password Strength Calculator
───────────────────────────────────────────── */
const calculatePasswordStrength = (password) => {
  if (!password) return { strength: 0, label: "", color: "", gradient: "" };

  let strength = 0;
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    longLength: password.length >= 12,
  };

  Object.values(checks).forEach((passed) => {
    if (passed) strength += 16.67;
  });

  let label = "";
  let color = "";
  let gradient = "";

  if (strength < 20) {
    label = "Very Weak";
    color = "#c0392b";
    gradient = "linear-gradient(90deg, #f5b7b1, #c0392b)";
  } else if (strength < 40) {
    label = "Weak";
    color = "#b5621e";
    gradient = "linear-gradient(90deg, #f5cba7, #b5621e)";
  } else if (strength < 60) {
    label = "Fair";
    color = "#9a7d0a";
    gradient = "linear-gradient(90deg, #f9e79f, #9a7d0a)";
  } else if (strength < 80) {
    label = "Good";
    color = "#27694f";
    gradient = "linear-gradient(90deg, #a9dfbf, #27694f)";
  } else {
    label = "Excellent";
    color = "#1e5631";
    gradient = "linear-gradient(90deg, #76d7a0, #1e5631)";
  }

  return { strength, label, color, gradient, checks };
};

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
const UserCreate = () => {
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState("user");
  const [passwordValue, setPasswordValue] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [userStats, setUserStats] = useState({
    total: 0,
    admin: 0,
    user: 0,
    client: 0,
    activeUsers: 0,
    newThisMonth: 0,
  });
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("create");
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [roleChanging, setRoleChanging] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [pageLoading, setPageLoading] = useState(true);

  const { isAdmin, currentUser } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const initializeComponent = async () => {
      setPageLoading(true);
      await fetchUsers();
      setTimeout(() => setPageLoading(false), 600);
    };
    initializeComponent();
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const stats = {
        total: 0,
        admin: 0,
        user: 0,
        client: 0,
        activeUsers: 0,
        newThisMonth: 0,
      };
      const users = [];
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      snap.docs.forEach((d) => {
        const data = d.data();
        const createdAt = data.createdAt?.toDate?.()
          ? data.createdAt.toDate()
          : new Date();

        stats.total++;
        if (data.isActive !== false) stats.activeUsers++;
        if (
          createdAt.getMonth() === currentMonth &&
          createdAt.getFullYear() === currentYear
        ) {
          stats.newThisMonth++;
        }

        if (data.role === "admin") stats.admin++;
        else if (data.role === "client") stats.client++;
        else stats.user++;

        users.push({
          key: d.id,
          id: d.id,
          ...data,
          createdAt,
          lastLoginAt: data.lastLoginAt?.toDate?.()
            ? data.lastLoginAt.toDate()
            : null,
        });
      });

      users.sort((a, b) => b.createdAt - a.createdAt);
      setUserStats(stats);
      setAllUsers(users);
      setFilteredUsers(users);
    } catch (err) {
      console.error("Error fetching users:", err);
      messageApi.error("Failed to fetch users");
    } finally {
      setUsersLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    fetchUsers();
  }, [successCount, fetchUsers]);

  useEffect(() => {
    let filtered = [...allUsers];
    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(lower) ||
          u.email?.toLowerCase().includes(lower) ||
          ROLE_CONFIG[u.role]?.label?.toLowerCase().includes(lower)
      );
    }
    if (roleFilter !== "all") {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    setFilteredUsers(filtered);
  }, [searchText, roleFilter, allUsers]);

  const passwordStrength = calculatePasswordStrength(passwordValue);

  /* ─── Submit Handler ─── */
  const handleSubmit = async (values) => {
    if (!isAdmin) {
      messageApi.error("Only administrators can create users!");
      return;
    }
    setLoading(true);
    try {
      const emailQuery = query(
        collection(db, "users"),
        where("email", "==", values.email)
      );
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty) {
        messageApi.error("This email is already registered in the system!");
        setLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      await updateProfile(cred.user, { displayName: values.displayName });
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: values.email,
        displayName: values.displayName,
        role: values.role,
        isAdmin: values.role === "admin",
        isActive: true,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || "system",
        profileComplete: false,
        lastActivity: serverTimestamp(),
      });

      messageApi.success({
        content: `✅ ${ROLE_CONFIG[values.role].label} "${values.displayName}" created successfully!`,
        duration: 4,
      });
      setSuccessCount((c) => c + 1);
      form.resetFields();
      setPasswordValue("");
      setSelectedRole("user");
    } catch (err) {
      console.error("Error creating user:", err);
      const errorMsgs = {
        "auth/email-already-in-use": "This email is already registered!",
        "auth/invalid-email": "Please enter a valid email address!",
        "auth/weak-password": "Password is too weak!",
        "auth/operation-not-allowed": "Operation not allowed.",
      };
      messageApi.error({
        content: errorMsgs[err.code] || `Creation failed: ${err.message}`,
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  /* ─── Role Change ─── */
  const handleRoleChange = async (values) => {
    if (!selectedUser) return;
    setRoleChanging(true);
    try {
      await updateDoc(doc(db, "users", selectedUser.id), {
        role: values.newRole,
        isAdmin: values.newRole === "admin",
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "system",
      });
      messageApi.success({
        content: `✅ Role updated to ${ROLE_CONFIG[values.newRole].label} for "${selectedUser.displayName}"`,
        duration: 3,
      });
      setRoleModalVisible(false);
      roleForm.resetFields();
      setSelectedUser(null);
      setSuccessCount((c) => c + 1);
    } catch (err) {
      messageApi.error("Failed to update user role");
    } finally {
      setRoleChanging(false);
    }
  };

  /* ─── Password Change ─── */
  const handlePasswordChange = async (values) => {
    if (!selectedUser) return;
    setPasswordChanging(true);
    try {
      await updateDoc(doc(db, "users", selectedUser.id), {
        passwordChangeRequested: true,
        passwordChangedAt: serverTimestamp(),
        passwordChangedBy: auth.currentUser?.uid || "system",
      });
      messageApi.success({
        content: `🔐 Password update requested for "${selectedUser.displayName}"`,
        duration: 3,
      });
      setPasswordModalVisible(false);
      passwordForm.resetFields();
      setSelectedUser(null);
    } catch (err) {
      messageApi.error("Failed to process password change");
    } finally {
      setPasswordChanging(false);
    }
  };

  /* ─── Toggle Active ─── */
  const handleToggleActive = async (user) => {
    try {
      await updateDoc(doc(db, "users", user.id), {
        isActive: !user.isActive,
        updatedAt: serverTimestamp(),
      });
      messageApi.success({
        content: `User "${user.displayName}" ${!user.isActive ? "activated" : "deactivated"} successfully`,
        duration: 3,
      });
      setSuccessCount((c) => c + 1);
    } catch (err) {
      messageApi.error("Failed to update user status");
    }
  };

  /* ─── Delete User ─── */
  const handleDeleteUser = (user) => {
    confirm({
      title: "Delete User Account",
      icon: <ExclamationCircleOutlined style={{ color: "#c0392b" }} />,
      content: (
        <div>
          <p style={{ marginBottom: 16 }}>
            Are you sure you want to permanently delete{" "}
            <strong>{user.displayName}</strong>?
          </p>
          <Alert
            message="⚠️ This action cannot be undone"
            description="The user's account and all associated data will be permanently removed."
            type="error"
            showIcon
            style={{ borderRadius: 8 }}
          />
        </div>
      ),
      okText: "Yes, Delete User",
      okType: "danger",
      cancelText: "Cancel",
      centered: true,
      width: 480,
      async onOk() {
        try {
          await deleteDoc(doc(db, "users", user.id));
          messageApi.success({
            content: `User "${user.displayName}" deleted successfully`,
            duration: 3,
          });
          setSuccessCount((c) => c + 1);
        } catch (err) {
          messageApi.error("Failed to delete user");
        }
      },
    });
  };

  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    messageApi.success("Email copied to clipboard!");
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatDate = (date) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /* ─── Table Columns ─── */
  const columns = [
    {
      title: "User Profile",
      dataIndex: "displayName",
      key: "displayName",
      fixed: "left",
      width: 280,
      render: (text, record) => (
        <div className="uc-user-cell">
          <div className="uc-avatar-wrap">
            <Avatar
              size={46}
              style={{
                background: ROLE_CONFIG[record.role]?.gradient,
                fontWeight: 800,
                fontSize: 15,
                border: `2px solid ${ROLE_CONFIG[record.role]?.border}`,
              }}
            >
              {getInitials(text)}
            </Avatar>
            <div
              className="uc-status-dot"
              style={{
                background: record.isActive !== false ? "#27694f" : "#c0392b",
              }}
            />
          </div>
          <div className="uc-user-info">
            <div className="uc-user-name">{text || "No Name"}</div>
            <div className="uc-user-email">
              <MailOutlined className="uc-email-icon" />
              <Text
                copyable={{
                  text: record.email,
                  tooltips: ["Copy email", "Copied!"],
                }}
                className="uc-email-text"
              >
                {record.email}
              </Text>
            </div>
            <div className="uc-user-id">ID: {record.id.slice(0, 8)}...</div>
          </div>
        </div>
      ),
    },
    {
      title: "Role & Status",
      dataIndex: "role",
      key: "role",
      width: 190,
      render: (role, record) => {
        const config = ROLE_CONFIG[role] || ROLE_CONFIG.user;
        return (
          <div className="uc-role-cell">
            <Tag
              className="uc-role-tag"
              style={{
                background: config.bgGradient,
                color: config.color,
                border: `1px solid ${config.border}`,
              }}
            >
              <span style={{ marginRight: 5 }}>{config.icon}</span>
              {config.label}
            </Tag>
            <div className="uc-status-row">
              <div
                className="uc-status-indicator"
                style={{
                  background: record.isActive !== false ? "#27694f" : "#c0392b",
                }}
              />
              <span className="uc-status-text">
                {record.isActive !== false ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Activity",
      key: "activity",
      width: 200,
      sorter: (a, b) => a.createdAt - b.createdAt,
      render: (_, record) => (
        <div className="uc-activity-cell">
          <div className="uc-activity-row">
            <span className="uc-activity-label">Created:</span>
            <span className="uc-activity-value">{formatDate(record.createdAt)}</span>
          </div>
          <div className="uc-activity-row">
            <span className="uc-activity-label">Last Login:</span>
            <span className="uc-activity-value">{formatDate(record.lastLoginAt)}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="Change Role">
            <button
              className="uc-action-btn uc-role-btn"
              onClick={() => {
                setSelectedUser(record);
                roleForm.setFieldsValue({ newRole: record.role });
                setRoleModalVisible(true);
              }}
            >
              <UserSwitchOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Reset Password">
            <button
              className="uc-action-btn uc-key-btn"
              onClick={() => {
                setSelectedUser(record);
                passwordForm.resetFields();
                setPasswordModalVisible(true);
              }}
            >
              <KeyOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Copy Email">
            <button
              className="uc-action-btn uc-copy-btn"
              onClick={() => copyEmail(record.email)}
            >
              <CopyOutlined />
            </button>
          </Tooltip>
          <Tooltip title={record.isActive !== false ? "Deactivate" : "Activate"}>
            <button
              className={`uc-action-btn ${record.isActive !== false ? "uc-deact-btn" : "uc-act-btn"}`}
              onClick={() => handleToggleActive(record)}
            >
              {record.isActive !== false ? <StopOutlined /> : <PlayCircleOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="Delete User">
            <button
              className="uc-action-btn uc-del-btn"
              onClick={() => handleDeleteUser(record)}
              disabled={record.id === auth.currentUser?.uid}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  /* ─── User Card (Grid View) ─── */
  const UserCard = ({ user }) => {
    const config = ROLE_CONFIG[user.role] || ROLE_CONFIG.user;
    return (
      <div
        className="uc-card"
        style={{ borderColor: config.border, boxShadow: config.shadow }}
      >
        <div
          className="uc-card-header"
          style={{ background: config.bgGradient }}
        >
          <Dropdown
            menu={{
              items: [
                {
                  key: "role",
                  label: "Change Role",
                  icon: <UserSwitchOutlined />,
                  onClick: () => {
                    setSelectedUser(user);
                    roleForm.setFieldsValue({ newRole: user.role });
                    setRoleModalVisible(true);
                  },
                },
                {
                  key: "password",
                  label: "Reset Password",
                  icon: <KeyOutlined />,
                  onClick: () => {
                    setSelectedUser(user);
                    passwordForm.resetFields();
                    setPasswordModalVisible(true);
                  },
                },
                {
                  key: "copy",
                  label: "Copy Email",
                  icon: <CopyOutlined />,
                  onClick: () => copyEmail(user.email),
                },
                { type: "divider" },
                {
                  key: "delete",
                  label: "Delete User",
                  icon: <DeleteOutlined />,
                  danger: true,
                  disabled: user.id === auth.currentUser?.uid,
                  onClick: () => handleDeleteUser(user),
                },
              ],
            }}
            trigger={["click"]}
          >
            <button className="uc-card-more">
              <MoreOutlined />
            </button>
          </Dropdown>

          <div className="uc-card-avatar-section">
            <div className="uc-card-avatar-wrap">
              <Avatar
                size={68}
                style={{
                  background: config.gradient,
                  fontWeight: 900,
                  fontSize: 26,
                  border: "3px solid white",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                }}
              >
                {getInitials(user.displayName)}
              </Avatar>
              <div
                className="uc-card-status-badge"
                style={{
                  background: user.isActive !== false ? "#27694f" : "#c0392b",
                }}
              >
                {user.isActive !== false ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              </div>
            </div>
            <div className="uc-card-user-info">
              <div className="uc-card-name">{user.displayName || "No Name"}</div>
              <Tag
                className="uc-card-role-tag"
                style={{
                  background: "rgba(255,255,255,0.92)",
                  color: config.color,
                  border: `1px solid ${config.border}`,
                }}
              >
                {config.icon}
                <span style={{ marginLeft: 5 }}>{config.label}</span>
              </Tag>
            </div>
          </div>
        </div>

        <div className="uc-card-body">
          <div className="uc-card-info-row">
            <MailOutlined className="uc-card-icon" />
            <Text copyable={{ text: user.email, tooltips: ["Copy", "Copied!"] }} className="uc-card-info-text">
              {user.email}
            </Text>
          </div>
          <div className="uc-card-info-row">
            <InfoCircleOutlined className="uc-card-icon" />
            <span className="uc-card-info-text">Created: {formatDate(user.createdAt)}</span>
          </div>

          <div className="uc-card-divider" />

          <div className="uc-card-actions">
            <button
              className={`uc-card-action-btn ${user.isActive !== false ? "uc-deact" : "uc-act"}`}
              onClick={() => handleToggleActive(user)}
            >
              {user.isActive !== false ? <StopOutlined /> : <PlayCircleOutlined />}
              <span>{user.isActive !== false ? "Deactivate" : "Activate"}</span>
            </button>
            <button
              className="uc-card-action-btn uc-delete"
              onClick={() => handleDeleteUser(user)}
              disabled={user.id === auth.currentUser?.uid}
            >
              <DeleteOutlined />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (pageLoading) {
    return (
      <div className="uc-loading">
        <div className="uc-loading-box">
          <div className="uc-loading-icon">
            <div className="uc-pulse" />
            <div className="uc-pulse" style={{ animationDelay: "0.3s" }} />
            <UsergroupAddOutlined className="uc-loading-svg" />
          </div>
          <div className="uc-loading-title">Loading User Management</div>
          <div className="uc-loading-sub">Please wait...</div>
          <div className="uc-progress-bar">
            <div className="uc-progress-fill" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#2c3e6b",
          colorBgContainer: "#ffffff",
          borderRadius: 10,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
      }}
    >
      <div className="uc-page">
        {contextHolder}

        {/* ── HEADER ── */}
        <div className="uc-header">
          <div className="uc-header-top">
            <div className="uc-header-title-group">
              <div className="uc-title-icon">
                <UsergroupAddOutlined />
              </div>
              <div>
                <h1 className="uc-page-title">User Management</h1>
                <p className="uc-page-subtitle">Complete user administration and access control</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="uc-stats-grid">
            {[
              {
                label: "Total Users",
                value: userStats.total,
                icon: <TeamOutlined />,
                sub: `+${userStats.newThisMonth} this month`,
                color: "#1e2d5a",
              },
              {
                label: "Administrators",
                value: userStats.admin,
                icon: <CrownOutlined />,
                sub: "Full Access",
                color: "#2c3e6b",
              },
              {
                label: "Team Members",
                value: userStats.user,
                icon: <UserOutlined />,
                sub: "Standard",
                color: "#3d5080",
              },
              {
                label: "Clients",
                value: userStats.client,
                icon: <ShopOutlined />,
                sub: "Limited",
                color: "#27694f",
              },
              {
                label: "Active Users",
                value: userStats.activeUsers,
                icon: <CheckCircleOutlined />,
                sub: `${userStats.total ? Math.round((userStats.activeUsers / userStats.total) * 100) : 0}% active`,
                color: "#1e5631",
              },
            ].map((stat, i) => (
              <div className="uc-stat-card" key={i} style={{ "--stat-color": stat.color }}>
                <div className="uc-stat-icon">{stat.icon}</div>
                <div className="uc-stat-body">
                  <div className="uc-stat-value">{stat.value}</div>
                  <div className="uc-stat-label">{stat.label}</div>
                  <div className="uc-stat-sub">{stat.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="uc-main-card">
          <div className="uc-tabs">
            <button
              className={`uc-tab ${activeTab === "create" ? "uc-tab-active" : ""}`}
              onClick={() => setActiveTab("create")}
            >
              <UserAddOutlined />
              <span>Create User</span>
              <span className="uc-tab-badge-new">New</span>
            </button>
            <button
              className={`uc-tab ${activeTab === "manage" ? "uc-tab-active" : ""}`}
              onClick={() => setActiveTab("manage")}
            >
              <SettingOutlined />
              <span>Manage Users</span>
              <span className="uc-tab-count">{userStats.total}</span>
            </button>

            {activeTab === "manage" && (
              <div className="uc-tab-extra">
                <button
                  className="uc-view-btn"
                  onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")}
                >
                  {viewMode === "table" ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                  <span>{viewMode === "table" ? "Grid" : "Table"}</span>
                </button>
                <button
                  className="uc-refresh-btn"
                  onClick={fetchUsers}
                  disabled={usersLoading}
                >
                  <ReloadOutlined className={usersLoading ? "uc-spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>
            )}
          </div>

          {/* ── CREATE TAB ── */}
          {activeTab === "create" && (
            <div className="uc-tab-content">
              <div className="uc-create-layout">
                {/* Form */}
                <div className="uc-form-section">
                  <div className="uc-form-card">
                    <div className="uc-form-card-header">
                      <div className="uc-form-card-icon">
                        <ThunderboltOutlined />
                      </div>
                      <span className="uc-form-card-title">User Account Details</span>
                      <span className="uc-required-badge">Required</span>
                    </div>

                    <Form
                      form={form}
                      layout="vertical"
                      onFinish={handleSubmit}
                      initialValues={{ role: "user" }}
                      requiredMark={false}
                    >
                      {/* Full Name */}
                      <div className="uc-field-group">
                        <label className="uc-field-label">
                          <UserOutlined className="uc-field-icon" />
                          Full Name <span className="uc-req">*</span>
                        </label>
                        <Form.Item
                          name="displayName"
                          rules={[
                            { required: true, message: "Please enter full name" },
                            { min: 3, message: "Minimum 3 characters" },
                            { max: 50, message: "Maximum 50 characters" },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            placeholder="Enter complete full name"
                            prefix={<UserOutlined className="uc-input-icon" />}
                            className="uc-input"
                            size="large"
                          />
                        </Form.Item>
                      </div>

                      {/* Email */}
                      <div className="uc-field-group">
                        <label className="uc-field-label">
                          <MailOutlined className="uc-field-icon" />
                          Email Address <span className="uc-req">*</span>
                        </label>
                        <Form.Item
                          name="email"
                          rules={[
                            { required: true, message: "Please enter email" },
                            { type: "email", message: "Please enter a valid email" },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            placeholder="Enter professional email address"
                            prefix={<MailOutlined className="uc-input-icon" />}
                            className="uc-input"
                            size="large"
                          />
                        </Form.Item>
                      </div>

                      {/* Password */}
                      <div className="uc-field-group">
                        <label className="uc-field-label">
                          <LockOutlined className="uc-field-icon" />
                          Password <span className="uc-req">*</span>
                        </label>
                        <Form.Item
                          name="password"
                          rules={[
                            { required: true, message: "Please enter password" },
                            { min: 8, message: "Minimum 8 characters" },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            placeholder="Create a secure password"
                            prefix={<LockOutlined className="uc-input-icon" />}
                            iconRender={(visible) =>
                              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                            }
                            className="uc-input"
                            size="large"
                            onChange={(e) => setPasswordValue(e.target.value)}
                          />
                        </Form.Item>
                      </div>

                      {/* Password Strength */}
                      {passwordValue && (
                        <div className="uc-strength-box">
                          <div className="uc-strength-header">
                            <span className="uc-strength-label">Password Strength</span>
                            <span
                              className="uc-strength-tag"
                              style={{
                                background: passwordStrength.gradient,
                                color: "#fff",
                              }}
                            >
                              {passwordStrength.label}
                            </span>
                          </div>
                          <div className="uc-strength-bar-track">
                            <div
                              className="uc-strength-bar-fill"
                              style={{
                                width: `${passwordStrength.strength}%`,
                                background: passwordStrength.gradient,
                              }}
                            />
                          </div>
                          <div className="uc-checks-grid">
                            {passwordStrength.checks &&
                              Object.entries(passwordStrength.checks).map(([key, passed]) => (
                                <div key={key} className="uc-check-item">
                                  {passed ? (
                                    <CheckCircleOutlined className="uc-check-pass" />
                                  ) : (
                                    <CloseCircleOutlined className="uc-check-fail" />
                                  )}
                                  <span
                                    className="uc-check-text"
                                    style={{ color: passed ? "#27694f" : "#9b9690" }}
                                  >
                                    {key === "length"
                                      ? "8+ characters"
                                      : key === "longLength"
                                      ? "12+ characters"
                                      : key === "lowercase"
                                      ? "Lowercase"
                                      : key === "uppercase"
                                      ? "Uppercase"
                                      : key === "numbers"
                                      ? "Numbers"
                                      : "Special chars"}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Role */}
                      <div className="uc-field-group">
                        <label className="uc-field-label">
                          <TeamOutlined className="uc-field-icon" />
                          Access Role <span className="uc-req">*</span>
                          <Tooltip title="Select the appropriate access level for this user">
                            <InfoCircleOutlined className="uc-tooltip-icon" />
                          </Tooltip>
                        </label>
                        <Form.Item
                          name="role"
                          rules={[{ required: true, message: "Please select a role" }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            placeholder="Choose user role and permissions"
                            onChange={(val) => setSelectedRole(val)}
                            className="uc-select"
                            size="large"
                            optionLabelProp="label"
                          >
                            {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                              <Option key={key} value={key} label={config.label}>
                                <div className="uc-role-option">
                                  <div
                                    className="uc-role-option-icon"
                                    style={{
                                      background: config.bgSolid,
                                      color: config.color,
                                      border: `1px solid ${config.border}`,
                                    }}
                                  >
                                    {config.icon}
                                  </div>
                                  <div className="uc-role-option-body">
                                    <div className="uc-role-option-title">{config.label}</div>
                                    <div className="uc-role-option-desc">{config.description}</div>
                                    <div className="uc-role-option-tags">
                                      {config.features.map((f, i) => (
                                        <span key={i} className="uc-feature-pill">{f}</span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </div>

                      {/* Submit */}
                      <Form.Item style={{ marginBottom: 0, marginTop: 28 }}>
                        <button
                          type="submit"
                          className="uc-submit-btn"
                          disabled={loading}
                          style={{
                            background: ROLE_CONFIG[selectedRole]?.gradient,
                          }}
                        >
                          {loading ? (
                            <>
                              <div className="uc-btn-spinner" />
                              Creating Account...
                            </>
                          ) : (
                            <>
                              <UserAddOutlined />
                              Create {ROLE_CONFIG[selectedRole]?.label || "User"} Account
                            </>
                          )}
                        </button>
                      </Form.Item>
                    </Form>
                  </div>
                </div>

                {/* Preview */}
                <div className="uc-preview-section">
                  <div
                    className="uc-preview-card"
                    style={{
                      border: `2px solid ${ROLE_CONFIG[selectedRole]?.border}`,
                      boxShadow: ROLE_CONFIG[selectedRole]?.shadow,
                    }}
                  >
                    <div className="uc-preview-header">
                      <div
                        className="uc-preview-header-icon"
                        style={{
                          background: ROLE_CONFIG[selectedRole]?.bgSolid,
                          color: ROLE_CONFIG[selectedRole]?.color,
                        }}
                      >
                        <SafetyCertificateOutlined />
                      </div>
                      <span className="uc-preview-header-title">Role Preview</span>
                    </div>

                    <div
                      className="uc-role-display"
                      style={{ background: ROLE_CONFIG[selectedRole]?.bgGradient }}
                    >
                      <Avatar
                        size={72}
                        style={{
                          background: ROLE_CONFIG[selectedRole]?.gradient,
                          border: "3px solid white",
                          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                          fontSize: 28,
                        }}
                        icon={ROLE_CONFIG[selectedRole]?.icon}
                      />
                      <div className="uc-role-display-body">
                        <Tag
                          className="uc-selected-role-tag"
                          style={{
                            background: "white",
                            color: ROLE_CONFIG[selectedRole]?.color,
                            border: `2px solid ${ROLE_CONFIG[selectedRole]?.border}`,
                          }}
                        >
                          {ROLE_CONFIG[selectedRole]?.badge}
                          <span style={{ marginLeft: 6 }}>
                            {ROLE_CONFIG[selectedRole]?.label}
                          </span>
                        </Tag>
                        <p className="uc-role-desc">
                          {ROLE_CONFIG[selectedRole]?.description}
                        </p>
                      </div>
                    </div>

                    <div className="uc-preview-divider" />

                    <div className="uc-section-title">Key Features</div>
                    <div className="uc-features-list">
                      {ROLE_CONFIG[selectedRole]?.features.map((f, i) => (
                        <div key={i} className="uc-feature-item">
                          <CheckCircleOutlined
                            style={{ color: ROLE_CONFIG[selectedRole]?.color }}
                          />
                          <span className="uc-feature-text">{f}</span>
                        </div>
                      ))}
                    </div>

                    <div className="uc-preview-divider" />

                    <div className="uc-section-title">
                      Accessible Pages ({ROLE_CONFIG[selectedRole]?.permissions.length})
                    </div>
                    <div className="uc-permissions-list">
                      {ROLE_CONFIG[selectedRole]?.permissions.map((p, i) => (
                        <div key={i} className="uc-permission-item">
                          <CheckCircleOutlined
                            style={{ color: ROLE_CONFIG[selectedRole]?.color, fontSize: 13 }}
                          />
                          <span className="uc-permission-text">{p}</span>
                        </div>
                      ))}
                    </div>

                    <div className="uc-preview-divider" />

                    <div className="uc-section-title">All Roles Overview</div>
                    <div className="uc-roles-comparison">
                      {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                        <div
                          key={key}
                          className="uc-comparison-item"
                          style={{
                            background: selectedRole === key ? config.bgGradient : "transparent",
                            border: `1.5px solid ${selectedRole === key ? config.border : "#e8e5de"}`,
                          }}
                          onClick={() => setSelectedRole(key)}
                        >
                          <div className="uc-comparison-left">
                            <div
                              className="uc-comparison-icon"
                              style={{ background: config.bgSolid, color: config.color }}
                            >
                              {config.icon}
                            </div>
                            <div>
                              <div
                                className="uc-comparison-title"
                                style={{ color: selectedRole === key ? config.color : "#4a4740" }}
                              >
                                {config.label}
                              </div>
                              <div className="uc-comparison-meta">
                                {config.permissions.length} pages
                              </div>
                            </div>
                          </div>
                          <span
                            className="uc-comparison-badge"
                            style={{ background: config.color }}
                          >
                            {config.permissions.length}
                          </span>
                        </div>
                      ))}
                    </div>

                    {selectedRole === "admin" && (
                      <div className="uc-role-alert uc-alert-info">
                        <InfoCircleOutlined />
                        <span>
                          <strong>Administrator:</strong> Full system access including user management and configuration.
                        </span>
                      </div>
                    )}
                    {selectedRole === "client" && (
                      <div className="uc-role-alert uc-alert-warn">
                        <InfoCircleOutlined />
                        <span>
                          <strong>Client:</strong> Limited access to essential client features only.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MANAGE TAB ── */}
          {activeTab === "manage" && (
            <div className="uc-tab-content">
              {/* Search & Filter */}
              <div className="uc-search-section">
                <div className="uc-search-wrap">
                  <SearchOutlined className="uc-search-icon" />
                  <input
                    className="uc-search-input"
                    placeholder="Search users by name, email, or role..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                  {searchText && (
                    <button className="uc-search-clear" onClick={() => setSearchText("")}>
                      ×
                    </button>
                  )}
                </div>
                <Select
                  value={roleFilter}
                  onChange={setRoleFilter}
                  className="uc-filter-select"
                  size="large"
                >
                  <Option value="all">All Roles</Option>
                  {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                    <Option key={key} value={key}>
                      <span style={{ color: config.color }}>{config.icon}</span>
                      <span style={{ marginLeft: 8 }}>{config.label}</span>
                    </Option>
                  ))}
                </Select>
              </div>

              <div className="uc-results-info">
                Showing <strong>{filteredUsers.length}</strong> of{" "}
                <strong>{allUsers.length}</strong> users
                {searchText && (
                  <span className="uc-search-match"> matching "{searchText}"</span>
                )}
              </div>

              {viewMode === "table" ? (
                <div className="uc-table-wrap">
                  <Table
                    columns={columns}
                    dataSource={filteredUsers}
                    loading={usersLoading}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total, range) =>
                        `${range[0]}-${range[1]} of ${total} users`,
                    }}
                    scroll={{ x: 1000 }}
                    locale={{
                      emptyText: (
                        <div className="uc-empty">
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="No users found"
                          />
                        </div>
                      ),
                    }}
                  />
                </div>
              ) : (
                <div className="uc-grid-wrap">
                  {filteredUsers.length === 0 ? (
                    <div className="uc-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No users found"
                      />
                    </div>
                  ) : (
                    <div className="uc-cards-grid">
                      {filteredUsers.map((user) => (
                        <UserCard key={user.id} user={user} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── ROLE MODAL ── */}
        <Modal
          title={
            <div className="uc-modal-header">
              <div className="uc-modal-icon">
                <UserSwitchOutlined />
              </div>
              <div>
                <div className="uc-modal-title">Change User Role</div>
                <div className="uc-modal-sub">
                  {selectedUser?.displayName} ({selectedUser?.email})
                </div>
              </div>
            </div>
          }
          open={roleModalVisible}
          onCancel={() => {
            setRoleModalVisible(false);
            setSelectedUser(null);
            roleForm.resetFields();
          }}
          footer={null}
          centered
          width={520}
          className="uc-modal"
        >
          {selectedUser && (
            <div className="uc-modal-content">
              <div className="uc-current-role-box">
                <span className="uc-modal-section-label">Current Role</span>
                <div className="uc-current-role-display">
                  <Avatar
                    size={44}
                    style={{
                      background: ROLE_CONFIG[selectedUser.role]?.gradient,
                      border: `2px solid ${ROLE_CONFIG[selectedUser.role]?.border}`,
                    }}
                    icon={ROLE_CONFIG[selectedUser.role]?.icon}
                  />
                  <Tag
                    style={{
                      background: ROLE_CONFIG[selectedUser.role]?.bgSolid,
                      color: ROLE_CONFIG[selectedUser.role]?.color,
                      border: `1px solid ${ROLE_CONFIG[selectedUser.role]?.border}`,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {ROLE_CONFIG[selectedUser.role]?.label}
                  </Tag>
                </div>
              </div>

              <Form
                form={roleForm}
                layout="vertical"
                onFinish={handleRoleChange}
                size="large"
              >
                <div className="uc-field-group">
                  <label className="uc-field-label">
                    <SwapOutlined className="uc-field-icon" />
                    New Role <span className="uc-req">*</span>
                  </label>
                  <Form.Item
                    name="newRole"
                    rules={[{ required: true, message: "Please select a new role" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select placeholder="Select new role" size="large" className="uc-select">
                      {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                        <Option key={key} value={key}>
                          <div className="uc-role-option">
                            <div
                              className="uc-role-option-icon"
                              style={{
                                background: config.bgSolid,
                                color: config.color,
                              }}
                            >
                              {config.icon}
                            </div>
                            <div>
                              <div className="uc-role-option-title">{config.label}</div>
                              <div className="uc-role-option-meta">
                                {config.permissions.length} pages access
                              </div>
                            </div>
                          </div>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </div>

                <div className="uc-modal-actions">
                  <button
                    type="button"
                    className="uc-modal-cancel"
                    onClick={() => {
                      setRoleModalVisible(false);
                      setSelectedUser(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="uc-modal-confirm"
                    disabled={roleChanging}
                  >
                    {roleChanging ? (
                      <>
                        <div className="uc-btn-spinner" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckOutlined />
                        Update Role
                      </>
                    )}
                  </button>
                </div>
              </Form>
            </div>
          )}
        </Modal>

        {/* ── PASSWORD MODAL ── */}
        <Modal
          title={
            <div className="uc-modal-header">
              <div className="uc-modal-icon uc-modal-icon-amber">
                <KeyOutlined />
              </div>
              <div>
                <div className="uc-modal-title">Reset Password</div>
                <div className="uc-modal-sub">
                  {selectedUser?.displayName} ({selectedUser?.email})
                </div>
              </div>
            </div>
          }
          open={passwordModalVisible}
          onCancel={() => {
            setPasswordModalVisible(false);
            setSelectedUser(null);
            passwordForm.resetFields();
          }}
          footer={null}
          centered
          width={480}
          className="uc-modal"
        >
          <div className="uc-modal-content">
            <div className="uc-security-notice">
              <InfoCircleOutlined />
              <span>
                Password changes require Firebase Admin SDK for complete security. This will create a change request.
              </span>
            </div>

            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={handlePasswordChange}
              size="large"
            >
              <div className="uc-field-group">
                <label className="uc-field-label">
                  <LockOutlined className="uc-field-icon" />
                  New Password <span className="uc-req">*</span>
                </label>
                <Form.Item
                  name="newPassword"
                  rules={[
                    { required: true, message: "Please enter new password" },
                    { min: 8, message: "Minimum 8 characters" },
                  ]}
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    placeholder="Enter new secure password"
                    prefix={<LockOutlined className="uc-input-icon" />}
                    iconRender={(visible) =>
                      visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                    }
                    className="uc-input"
                    size="large"
                  />
                </Form.Item>
              </div>

              <div className="uc-field-group">
                <label className="uc-field-label">
                  <LockOutlined className="uc-field-icon" />
                  Confirm Password <span className="uc-req">*</span>
                </label>
                <Form.Item
                  name="confirmPassword"
                  dependencies={["newPassword"]}
                  rules={[
                    { required: true, message: "Please confirm password" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("newPassword") === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error("Passwords do not match!"));
                      },
                    }),
                  ]}
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    placeholder="Confirm new password"
                    prefix={<LockOutlined className="uc-input-icon" />}
                    iconRender={(visible) =>
                      visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                    }
                    className="uc-input"
                    size="large"
                  />
                </Form.Item>
              </div>

              <div className="uc-modal-actions">
                <button
                  type="button"
                  className="uc-modal-cancel"
                  onClick={() => {
                    setPasswordModalVisible(false);
                    setSelectedUser(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="uc-modal-confirm uc-modal-confirm-amber"
                  disabled={passwordChanging}
                >
                  {passwordChanging ? (
                    <>
                      <div className="uc-btn-spinner" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <KeyOutlined />
                      Reset Password
                    </>
                  )}
                </button>
              </div>
            </Form>
          </div>
        </Modal>

        {/* ── STYLES ── */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

          /* ═══════════════════════════════════════
             CSS VARIABLES
          ═══════════════════════════════════════ */
          :root {
            --uc-bg-base: #f4f3f0;
            --uc-bg-card: #ffffff;
            --uc-bg-section: #fafaf8;
            --uc-bg-input: #ffffff;
            --uc-bg-hover: #f8f7f4;

            --uc-border-subtle: #e8e5de;
            --uc-border-normal: #d9d5cc;
            --uc-border-focus: #2c3e6b;

            --uc-navy: #1e2d5a;
            --uc-navy-mid: #2c3e6b;
            --uc-navy-light: #3d5080;
            --uc-navy-glow: rgba(44, 62, 107, 0.10);
            --uc-navy-pale: rgba(44, 62, 107, 0.05);

            --uc-green: #27694f;
            --uc-green-pale: rgba(39, 105, 79, 0.06);
            --uc-green-border: rgba(39, 105, 79, 0.22);

            --uc-amber: #b5621e;
            --uc-amber-pale: rgba(181, 98, 30, 0.06);
            --uc-amber-border: rgba(181, 98, 30, 0.22);

            --uc-red: #c0392b;
            --uc-red-pale: rgba(192, 57, 43, 0.06);
            --uc-red-border: rgba(192, 57, 43, 0.22);

            --uc-text-primary: #1a1916;
            --uc-text-secondary: #4a4740;
            --uc-text-muted: #9b9690;

            --uc-shadow-card: 0 2px 48px rgba(30, 45, 90, 0.09);
            --uc-shadow-sm: 0 1px 4px rgba(30, 45, 90, 0.06);
            --uc-shadow-md: 0 4px 20px rgba(30, 45, 90, 0.10);
            --uc-shadow-btn: 0 6px 28px rgba(30, 45, 90, 0.26);

            --uc-radius-sm: 6px;
            --uc-radius-md: 12px;
            --uc-radius-lg: 18px;
            --uc-radius-xl: 24px;
            --uc-radius-full: 999px;

            --uc-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
          }

          /* ═══════════════════════════════════════
             PAGE
          ═══════════════════════════════════════ */
          .uc-page {
            min-height: 100vh;
            background: var(--uc-bg-base);
            background-image:
              radial-gradient(ellipse 70% 50% at 50% -5%, rgba(44,62,107,0.06) 0%, transparent 60%),
              radial-gradient(ellipse 50% 40% at 95% 100%, rgba(193,127,62,0.07) 0%, transparent 50%);
            font-family: 'Plus Jakarta Sans', sans-serif;
            color: var(--uc-text-primary);
            padding: 28px;
          }

          /* ═══════════════════════════════════════
             LOADING
          ═══════════════════════════════════════ */
          .uc-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--uc-bg-base);
            font-family: 'Plus Jakarta Sans', sans-serif;
          }

          .uc-loading-box {
            text-align: center;
            padding: 48px 40px;
            background: var(--uc-bg-card);
            border-radius: var(--uc-radius-xl);
            border: 1px solid var(--uc-border-subtle);
            box-shadow: var(--uc-shadow-card);
            max-width: 340px;
            width: 90%;
          }

          .uc-loading-icon {
            position: relative;
            width: 70px;
            height: 70px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .uc-pulse {
            position: absolute;
            width: 70px;
            height: 70px;
            border-radius: 50%;
            border: 2px solid var(--uc-navy-mid);
            animation: ucPulse 1.8s ease-out infinite;
          }

          @keyframes ucPulse {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(1.5); opacity: 0; }
          }

          .uc-loading-svg {
            font-size: 28px;
            color: var(--uc-navy);
            position: relative;
            z-index: 1;
          }

          .uc-loading-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--uc-navy);
            margin-bottom: 6px;
          }

          .uc-loading-sub {
            font-size: 0.82rem;
            color: var(--uc-text-muted);
            margin-bottom: 20px;
          }

          .uc-progress-bar {
            height: 3px;
            background: var(--uc-border-subtle);
            border-radius: var(--uc-radius-full);
            overflow: hidden;
          }

          .uc-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--uc-navy-light), var(--uc-navy));
            border-radius: var(--uc-radius-full);
            animation: ucProgress 1.5s ease-in-out infinite;
          }

          @keyframes ucProgress {
            0% { width: 0%; margin-left: 0; }
            50% { width: 65%; margin-left: 15%; }
            100% { width: 0%; margin-left: 100%; }
          }

          /* ═══════════════════════════════════════
             HEADER
          ═══════════════════════════════════════ */
          .uc-header {
            margin-bottom: 24px;
          }

          .uc-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 12px;
          }

          .uc-header-title-group {
            display: flex;
            align-items: center;
            gap: 16px;
          }

          .uc-title-icon {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, var(--uc-navy) 0%, var(--uc-navy-light) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            box-shadow: var(--uc-shadow-btn);
            flex-shrink: 0;
          }

          .uc-page-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.85rem;
            font-weight: 700;
            color: var(--uc-navy);
            margin: 0 0 4px 0;
            letter-spacing: 0.01em;
            line-height: 1.2;
          }

          .uc-page-subtitle {
            font-size: 0.82rem;
            color: var(--uc-text-muted);
            margin: 0;
            letter-spacing: 0.02em;
          }

          /* ═══════════════════════════════════════
             STATS
          ═══════════════════════════════════════ */
          .uc-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
            gap: 14px;
          }

          .uc-stat-card {
            background: linear-gradient(135deg, var(--stat-color, #1e2d5a) 0%, color-mix(in srgb, var(--stat-color, #1e2d5a) 75%, black) 100%);
            border-radius: var(--uc-radius-md);
            padding: 18px 16px;
            box-shadow: 0 4px 20px rgba(30,45,90,0.15);
            display: flex;
            align-items: center;
            gap: 14px;
            transition: transform var(--uc-transition), box-shadow var(--uc-transition);
            overflow: hidden;
            position: relative;
          }

          .uc-stat-card::before {
            content: '';
            position: absolute;
            top: -20px;
            right: -20px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(255,255,255,0.06);
          }

          .uc-stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(30,45,90,0.22);
          }

          .uc-stat-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: rgba(255,255,255,0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            flex-shrink: 0;
          }

          .uc-stat-body { flex: 1; min-width: 0; }

          .uc-stat-value {
            font-family: 'Playfair Display', serif;
            font-size: 1.8rem;
            font-weight: 700;
            color: white;
            line-height: 1;
            margin-bottom: 3px;
          }

          .uc-stat-label {
            font-size: 0.68rem;
            font-weight: 700;
            color: rgba(255,255,255,0.85);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .uc-stat-sub {
            font-size: 0.65rem;
            color: rgba(255,255,255,0.7);
            margin-top: 4px;
          }

          /* ═══════════════════════════════════════
             MAIN CARD & TABS
          ═══════════════════════════════════════ */
          .uc-main-card {
            background: var(--uc-bg-card);
            border: 1px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-xl);
            box-shadow: var(--uc-shadow-card);
            overflow: hidden;
          }

          .uc-tabs {
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--uc-border-subtle);
            padding: 0 28px;
            background: var(--uc-bg-section);
            position: relative;
            flex-wrap: wrap;
            gap: 4px;
            min-height: 60px;
          }

          .uc-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 16px 20px;
            border: none;
            background: transparent;
            color: var(--uc-text-muted);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.82rem;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all var(--uc-transition);
            letter-spacing: 0.03em;
            white-space: nowrap;
            position: relative;
            bottom: -1px;
          }

          .uc-tab:hover {
            color: var(--uc-navy);
            background: var(--uc-navy-pale);
          }

          .uc-tab-active {
            color: var(--uc-navy) !important;
            border-bottom-color: var(--uc-navy) !important;
            font-weight: 700 !important;
          }

          .uc-tab-badge-new {
            background: linear-gradient(135deg, #b5621e, #c17f3e);
            color: white;
            font-size: 0.58rem;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: var(--uc-radius-full);
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .uc-tab-count {
            background: var(--uc-navy);
            color: white;
            font-size: 0.65rem;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: var(--uc-radius-full);
            min-width: 22px;
            text-align: center;
          }

          .uc-tab-extra {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .uc-view-btn,
          .uc-refresh-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            border: 1.5px solid var(--uc-border-normal);
            border-radius: var(--uc-radius-md);
            background: var(--uc-bg-card);
            color: var(--uc-text-secondary);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--uc-transition);
          }

          .uc-view-btn:hover {
            border-color: var(--uc-navy-mid);
            background: var(--uc-navy-pale);
            color: var(--uc-navy);
          }

          .uc-refresh-btn {
            background: linear-gradient(135deg, var(--uc-navy), var(--uc-navy-light));
            color: white;
            border-color: transparent;
            box-shadow: var(--uc-shadow-sm);
          }

          .uc-refresh-btn:hover:not(:disabled) {
            box-shadow: 0 4px 16px rgba(30,45,90,0.28);
            transform: translateY(-1px);
          }

          .uc-refresh-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .uc-spin {
            animation: ucSpin 0.8s linear infinite;
          }

          @keyframes ucSpin { to { transform: rotate(360deg); } }

          /* ═══════════════════════════════════════
             TAB CONTENT
          ═══════════════════════════════════════ */
          .uc-tab-content {
            padding: 28px;
          }

          /* ═══════════════════════════════════════
             CREATE LAYOUT
          ═══════════════════════════════════════ */
          .uc-create-layout {
            display: grid;
            grid-template-columns: 1fr 420px;
            gap: 24px;
            align-items: start;
          }

          /* ═══════════════════════════════════════
             FORM CARD
          ═══════════════════════════════════════ */
          .uc-form-card {
            background: var(--uc-bg-card);
            border: 1px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-lg);
            box-shadow: var(--uc-shadow-sm);
            overflow: hidden;
          }

          .uc-form-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 18px 24px;
            border-bottom: 1px solid var(--uc-border-subtle);
            background: var(--uc-bg-section);
          }

          .uc-form-card-icon {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            background: linear-gradient(135deg, #eceffe, #dde0ff);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--uc-navy);
            font-size: 15px;
            flex-shrink: 0;
          }

          .uc-form-card-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--uc-navy);
            flex: 1;
          }

          .uc-required-badge {
            background: var(--uc-red);
            color: white;
            font-size: 0.6rem;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: var(--uc-radius-full);
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          /* Form content padding */
          .uc-form-card .ant-form {
            padding: 24px;
          }

          /* ═══════════════════════════════════════
             FIELD GROUPS & LABELS
          ═══════════════════════════════════════ */
          .uc-field-group {
            margin-bottom: 20px;
          }

          .uc-field-label {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--uc-text-secondary);
            margin-bottom: 8px;
            cursor: default;
          }

          .uc-field-icon {
            color: var(--uc-navy-mid);
            font-size: 13px;
          }

          .uc-req {
            color: var(--uc-red);
            margin-left: 1px;
          }

          .uc-tooltip-icon {
            color: var(--uc-text-muted);
            font-size: 13px;
            cursor: help;
          }

          /* ═══════════════════════════════════════
             INPUTS
          ═══════════════════════════════════════ */
          .uc-input.ant-input-affix-wrapper,
          .uc-input.ant-input {
            border: 1.5px solid var(--uc-border-normal) !important;
            border-radius: var(--uc-radius-md) !important;
            height: 46px !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 0.87rem !important;
            font-weight: 500 !important;
            color: var(--uc-text-primary) !important;
            background: var(--uc-bg-input) !important;
            box-shadow: var(--uc-shadow-sm) !important;
            transition: border-color var(--uc-transition), box-shadow var(--uc-transition) !important;
          }

          .uc-input.ant-input-affix-wrapper:focus,
          .uc-input.ant-input-affix-wrapper-focused {
            border-color: var(--uc-border-focus) !important;
            box-shadow: 0 0 0 3px var(--uc-navy-glow), var(--uc-shadow-sm) !important;
          }

          .uc-input-icon {
            color: var(--uc-text-muted);
            font-size: 14px;
          }

          .uc-select .ant-select-selector {
            border: 1.5px solid var(--uc-border-normal) !important;
            border-radius: var(--uc-radius-md) !important;
            min-height: 46px !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 0.87rem !important;
            font-weight: 500 !important;
            background: var(--uc-bg-input) !important;
            box-shadow: var(--uc-shadow-sm) !important;
          }

          .uc-select.ant-select-focused .ant-select-selector {
            border-color: var(--uc-border-focus) !important;
            box-shadow: 0 0 0 3px var(--uc-navy-glow) !important;
          }

          /* ═══════════════════════════════════════
             PASSWORD STRENGTH
          ═══════════════════════════════════════ */
          .uc-strength-box {
            background: var(--uc-bg-section);
            border: 1.5px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-md);
            padding: 16px 18px;
            margin-bottom: 20px;
          }

          .uc-strength-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }

          .uc-strength-label {
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--uc-text-muted);
          }

          .uc-strength-tag {
            font-size: 0.68rem;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: var(--uc-radius-full);
            border: none;
            letter-spacing: 0.04em;
          }

          .uc-strength-bar-track {
            height: 5px;
            background: var(--uc-border-subtle);
            border-radius: var(--uc-radius-full);
            overflow: hidden;
            margin-bottom: 12px;
          }

          .uc-strength-bar-fill {
            height: 100%;
            border-radius: var(--uc-radius-full);
            transition: width 0.5s ease;
          }

          .uc-checks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 6px;
          }

          .uc-check-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: var(--uc-radius-sm);
            background: rgba(255,255,255,0.6);
          }

          .uc-check-pass { color: var(--uc-green); font-size: 12px; }
          .uc-check-fail { color: var(--uc-red); font-size: 12px; }

          .uc-check-text {
            font-size: 0.7rem;
            font-weight: 600;
          }

          /* ═══════════════════════════════════════
             ROLE OPTION (Select Dropdown)
          ═══════════════════════════════════════ */
          .uc-role-option {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 6px;
          }

          .uc-role-option-icon {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
          }

          .uc-role-option-body { flex: 1; }

          .uc-role-option-title {
            font-weight: 700;
            font-size: 0.88rem;
            color: var(--uc-text-primary);
            margin-bottom: 3px;
          }

          .uc-role-option-desc {
            font-size: 0.72rem;
            color: var(--uc-text-muted);
            line-height: 1.4;
            margin-bottom: 6px;
          }

          .uc-role-option-meta {
            font-size: 0.68rem;
            color: var(--uc-text-muted);
          }

          .uc-role-option-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }

          .uc-feature-pill {
            font-size: 0.6rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: var(--uc-radius-full);
            background: var(--uc-bg-section);
            color: var(--uc-text-secondary);
            border: 1px solid var(--uc-border-subtle);
          }

          /* ═══════════════════════════════════════
             SUBMIT BUTTON
          ═══════════════════════════════════════ */
          .uc-submit-btn {
            width: 100%;
            height: 52px;
            border: none;
            border-radius: var(--uc-radius-md);
            color: white;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.85rem;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow: var(--uc-shadow-btn);
            transition: all var(--uc-transition);
            position: relative;
            overflow: hidden;
          }

          .uc-submit-btn::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%);
            transform: translateX(-100%);
            transition: transform 0.5s ease;
          }

          .uc-submit-btn:hover:not(:disabled)::after { transform: translateX(100%); }
          .uc-submit-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 10px 36px rgba(30,45,90,0.32);
          }

          .uc-submit-btn:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            transform: none;
          }

          .uc-btn-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: rgba(255,255,255,0.9);
            border-radius: 50%;
            animation: ucSpin 0.7s linear infinite;
          }

          /* ═══════════════════════════════════════
             PREVIEW SECTION
          ═══════════════════════════════════════ */
          .uc-preview-section {
            position: sticky;
            top: 100px;
          }

          .uc-preview-card {
            background: var(--uc-bg-card);
            border-radius: var(--uc-radius-lg);
            overflow: hidden;
            transition: border-color var(--uc-transition), box-shadow var(--uc-transition);
          }

          .uc-preview-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 20px;
            border-bottom: 1px solid var(--uc-border-subtle);
            background: var(--uc-bg-section);
          }

          .uc-preview-header-icon {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            flex-shrink: 0;
          }

          .uc-preview-header-title {
            font-family: 'Playfair Display', serif;
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--uc-navy);
          }

          .uc-role-display {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 20px;
            transition: background var(--uc-transition);
          }

          .uc-role-display-body { flex: 1; }

          .uc-selected-role-tag.ant-tag {
            font-weight: 700;
            font-size: 0.82rem;
            padding: 6px 14px;
            border-radius: var(--uc-radius-full);
            display: inline-flex;
            align-items: center;
            margin-bottom: 8px;
          }

          .uc-role-desc {
            font-size: 0.78rem;
            color: var(--uc-text-secondary);
            line-height: 1.5;
            margin: 0;
          }

          .uc-preview-divider {
            height: 1px;
            background: var(--uc-border-subtle);
            margin: 0 20px;
          }

          .uc-section-title {
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--uc-text-muted);
            display: block;
            padding: 14px 20px 8px;
          }

          .uc-features-list,
          .uc-permissions-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 0 20px 14px;
          }

          .uc-feature-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            border-radius: var(--uc-radius-sm);
            background: var(--uc-bg-section);
          }

          .uc-feature-text {
            font-size: 0.82rem;
            color: var(--uc-text-secondary);
            font-weight: 600;
          }

          .uc-permission-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: var(--uc-radius-sm);
            background: var(--uc-bg-section);
            border: 1px solid var(--uc-border-subtle);
          }

          .uc-permission-text {
            font-size: 0.75rem;
            color: var(--uc-text-secondary);
          }

          /* Roles Comparison */
          .uc-roles-comparison {
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding: 0 20px 14px;
          }

          .uc-comparison-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 14px;
            border-radius: var(--uc-radius-md);
            cursor: pointer;
            transition: all var(--uc-transition);
          }

          .uc-comparison-item:hover { opacity: 0.85; }

          .uc-comparison-left {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .uc-comparison-icon {
            width: 32px;
            height: 32px;
            border-radius: 9px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
          }

          .uc-comparison-title {
            font-size: 0.82rem;
            font-weight: 700;
            display: block;
            margin-bottom: 2px;
          }

          .uc-comparison-meta {
            font-size: 0.65rem;
            color: var(--uc-text-muted);
          }

          .uc-comparison-badge {
            font-size: 0.68rem;
            font-weight: 700;
            color: white;
            padding: 2px 8px;
            border-radius: var(--uc-radius-full);
            min-width: 24px;
            text-align: center;
          }

          /* Role Alerts */
          .uc-role-alert {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin: 0 20px 16px;
            padding: 12px 14px;
            border-radius: var(--uc-radius-md);
            font-size: 0.78rem;
            line-height: 1.5;
          }

          .uc-alert-info {
            background: var(--uc-navy-pale);
            border: 1px solid rgba(44,62,107,0.18);
            color: var(--uc-navy-mid);
          }

          .uc-alert-warn {
            background: var(--uc-amber-pale);
            border: 1px solid var(--uc-amber-border);
            color: var(--uc-amber);
          }

          /* ═══════════════════════════════════════
             SEARCH SECTION
          ═══════════════════════════════════════ */
          .uc-search-section {
            display: flex;
            gap: 14px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            align-items: center;
          }

          .uc-search-wrap {
            position: relative;
            flex: 1;
            min-width: 240px;
            max-width: 460px;
          }

          .uc-search-icon {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--uc-text-muted);
            font-size: 15px;
            pointer-events: none;
            z-index: 1;
          }

          .uc-search-input {
            width: 100%;
            height: 44px;
            padding: 0 40px 0 42px;
            border: 1.5px solid var(--uc-border-normal);
            border-radius: var(--uc-radius-md);
            background: var(--uc-bg-input);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--uc-text-primary);
            outline: none;
            box-shadow: var(--uc-shadow-sm);
            transition: border-color var(--uc-transition), box-shadow var(--uc-transition);
          }

          .uc-search-input:focus {
            border-color: var(--uc-border-focus);
            box-shadow: 0 0 0 3px var(--uc-navy-glow);
          }

          .uc-search-input::placeholder {
            color: var(--uc-text-muted);
            font-weight: 400;
          }

          .uc-search-clear {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--uc-text-muted);
            font-size: 1rem;
            cursor: pointer;
            line-height: 1;
            padding: 2px 6px;
            border-radius: var(--uc-radius-xs);
            transition: color var(--uc-transition);
          }

          .uc-search-clear:hover { color: var(--uc-red); }

          .uc-filter-select.ant-select {
            min-width: 170px;
          }

          .uc-filter-select .ant-select-selector {
            border: 1.5px solid var(--uc-border-normal) !important;
            border-radius: var(--uc-radius-md) !important;
            height: 44px !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 0.82rem !important;
            background: var(--uc-bg-input) !important;
          }

          .uc-results-info {
            font-size: 0.8rem;
            color: var(--uc-text-muted);
            margin-bottom: 16px;
            font-weight: 500;
          }

          .uc-search-match {
            color: var(--uc-navy-mid);
            font-weight: 600;
          }

          /* ═══════════════════════════════════════
             TABLE
          ═══════════════════════════════════════ */
          .uc-table-wrap {
            border: 1px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-md);
            overflow: hidden;
            box-shadow: var(--uc-shadow-sm);
          }

          .uc-table-wrap .ant-table-thead > tr > th {
            background: linear-gradient(135deg, var(--uc-bg-section), var(--uc-bg-hover)) !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-weight: 700 !important;
            font-size: 0.68rem !important;
            text-transform: uppercase !important;
            letter-spacing: 0.08em !important;
            color: var(--uc-text-muted) !important;
            border-bottom: 1px solid var(--uc-border-subtle) !important;
            padding: 14px 16px !important;
          }

          .uc-table-wrap .ant-table-tbody > tr > td {
            padding: 14px 16px !important;
            border-bottom: 1px solid var(--uc-border-subtle) !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 0.85rem !important;
          }

          .uc-table-wrap .ant-table-tbody > tr:hover > td {
            background: var(--uc-bg-hover) !important;
          }

          /* User Cell */
          .uc-user-cell {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .uc-avatar-wrap {
            position: relative;
            flex-shrink: 0;
          }

          .uc-status-dot {
            position: absolute;
            bottom: -1px;
            right: -1px;
            width: 13px;
            height: 13px;
            border-radius: 50%;
            border: 2px solid white;
          }

          .uc-user-info { flex: 1; min-width: 0; }

          .uc-user-name {
            font-weight: 700;
            font-size: 0.9rem;
            color: var(--uc-navy);
            margin-bottom: 3px;
          }

          .uc-user-email {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 3px;
          }

          .uc-email-icon {
            font-size: 11px;
            color: var(--uc-text-muted);
            flex-shrink: 0;
          }

          .uc-email-text {
            font-size: 0.75rem !important;
            color: var(--uc-text-muted) !important;
            font-weight: 500 !important;
          }

          .uc-user-id {
            font-size: 0.65rem;
            color: var(--uc-text-muted);
            font-family: monospace;
          }

          /* Role Cell */
          .uc-role-cell {
            display: flex;
            flex-direction: column;
            gap: 7px;
          }

          .uc-role-tag.ant-tag {
            font-weight: 700;
            font-size: 0.68rem;
            padding: 4px 10px;
            border-radius: var(--uc-radius-full);
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin: 0;
          }

          .uc-status-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .uc-status-indicator {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .uc-status-text {
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--uc-text-muted);
          }

          /* Activity Cell */
          .uc-activity-cell {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }

          .uc-activity-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
          }

          .uc-activity-label {
            font-size: 0.62rem;
            font-weight: 700;
            color: var(--uc-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            white-space: nowrap;
          }

          .uc-activity-value {
            font-size: 0.72rem;
            color: var(--uc-text-secondary);
            font-weight: 500;
          }

          /* Action Buttons */
          .uc-action-btn {
            width: 32px;
            height: 32px;
            border: 1.5px solid var(--uc-border-normal);
            border-radius: var(--uc-radius-sm);
            background: var(--uc-bg-input);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all var(--uc-transition);
            color: var(--uc-text-muted);
          }

          .uc-action-btn:hover { transform: translateY(-1px); box-shadow: var(--uc-shadow-sm); }
          .uc-action-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

          .uc-role-btn:hover { border-color: var(--uc-navy-mid); background: var(--uc-navy-pale); color: var(--uc-navy); }
          .uc-key-btn:hover { border-color: var(--uc-amber-border); background: var(--uc-amber-pale); color: var(--uc-amber); }
          .uc-copy-btn:hover { border-color: var(--uc-border-focus); background: var(--uc-navy-pale); color: var(--uc-navy-mid); }
          .uc-deact-btn:hover { border-color: var(--uc-amber-border); background: var(--uc-amber-pale); color: var(--uc-amber); }
          .uc-act-btn:hover { border-color: var(--uc-green-border); background: var(--uc-green-pale); color: var(--uc-green); }
          .uc-del-btn:hover { border-color: var(--uc-red-border); background: var(--uc-red-pale); color: var(--uc-red); }

          /* ═══════════════════════════════════════
             GRID VIEW / CARDS
          ═══════════════════════════════════════ */
          .uc-cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 16px;
          }

          .uc-card {
            background: var(--uc-bg-card);
            border: 1px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-lg);
            overflow: hidden;
            transition: all var(--uc-transition);
          }

          .uc-card:hover {
            transform: translateY(-3px);
            box-shadow: var(--uc-shadow-md) !important;
          }

          .uc-card-header {
            padding: 20px 20px 16px;
            position: relative;
          }

          .uc-card-more {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 30px;
            height: 30px;
            border-radius: 8px;
            background: rgba(255,255,255,0.88);
            border: 1px solid rgba(255,255,255,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 15px;
            color: var(--uc-text-secondary);
            transition: all var(--uc-transition);
          }

          .uc-card-more:hover {
            background: white;
            box-shadow: var(--uc-shadow-sm);
          }

          .uc-card-avatar-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
          }

          .uc-card-avatar-wrap { position: relative; }

          .uc-card-status-badge {
            position: absolute;
            bottom: -3px;
            right: -3px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 11px;
            border: 2px solid white;
          }

          .uc-card-user-info { text-align: center; }

          .uc-card-name {
            font-weight: 700;
            font-size: 0.95rem;
            color: var(--uc-navy);
            margin-bottom: 7px;
          }

          .uc-card-role-tag.ant-tag {
            font-weight: 600;
            font-size: 0.68rem;
            padding: 3px 10px;
            border-radius: var(--uc-radius-full);
            display: inline-flex;
            align-items: center;
          }

          .uc-card-body { padding: 16px 20px 20px; }

          .uc-card-info-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
          }

          .uc-card-icon {
            font-size: 13px;
            color: var(--uc-text-muted);
            flex-shrink: 0;
          }

          .uc-card-info-text {
            font-size: 0.75rem;
            color: var(--uc-text-muted);
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .uc-card-divider {
            height: 1px;
            background: var(--uc-border-subtle);
            margin: 14px 0;
          }

          .uc-card-actions {
            display: flex;
            gap: 8px;
          }

          .uc-card-action-btn {
            flex: 1;
            height: 34px;
            border-radius: var(--uc-radius-sm);
            border: 1.5px solid var(--uc-border-normal);
            background: var(--uc-bg-input);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.72rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all var(--uc-transition);
            color: var(--uc-text-secondary);
          }

          .uc-card-action-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          .uc-card-action-btn.uc-deact:hover {
            border-color: var(--uc-amber-border);
            background: var(--uc-amber-pale);
            color: var(--uc-amber);
          }

          .uc-card-action-btn.uc-act:hover {
            border-color: var(--uc-green-border);
            background: var(--uc-green-pale);
            color: var(--uc-green);
          }

          .uc-card-action-btn.uc-delete {
            color: var(--uc-red);
            border-color: var(--uc-red-border);
          }

          .uc-card-action-btn.uc-delete:hover {
            background: var(--uc-red-pale);
          }

          /* ═══════════════════════════════════════
             EMPTY STATE
          ═══════════════════════════════════════ */
          .uc-empty {
            padding: 48px 20px;
            text-align: center;
          }
            

          /* ═══════════════════════════════════════
             MODALS
          ═══════════════════════════════════════ */
          .uc-modal .ant-modal-content {
            border-radius: var(--uc-radius-xl) !important;
            overflow: hidden !important;
            box-shadow: 0 20px 60px rgba(30,45,90,0.18) !important;
          }

          .uc-modal .ant-modal-header {
            padding: 20px 24px 16px !important;
            border-bottom: 1px solid var(--uc-border-subtle) !important;
            background: var(--uc-bg-section) !important;
          }

          .uc-modal .ant-modal-header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent 0%, var(--uc-navy-light) 30%, var(--uc-navy) 50%, var(--uc-navy-light) 70%, transparent 100%);
          }

          .uc-modal .ant-modal-body {
            padding: 20px 24px !important;
          }

          .uc-modal-header {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .uc-modal-icon {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            background: var(--uc-navy-pale);
            color: var(--uc-navy);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 19px;
            border: 1px solid rgba(44,62,107,0.15);
            flex-shrink: 0;
          }

          .uc-modal-icon-amber {
            background: var(--uc-amber-pale);
            color: var(--uc-amber);
            border-color: var(--uc-amber-border);
          }

          .uc-modal-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--uc-navy);
            line-height: 1.2;
          }

          .uc-modal-sub {
            font-size: 0.75rem;
            color: var(--uc-text-muted);
            margin-top: 3px;
          }

          .uc-modal-content { padding: 4px 0; }

          .uc-current-role-box {
            padding: 16px 18px;
            background: var(--uc-bg-section);
            border: 1px solid var(--uc-border-subtle);
            border-radius: var(--uc-radius-md);
            margin-bottom: 20px;
          }

          .uc-modal-section-label {
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--uc-text-muted);
            display: block;
            margin-bottom: 10px;
          }

          .uc-current-role-display {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .uc-modal-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 24px;
          }

          .uc-modal-cancel {
            padding: 10px 22px;
            border: 1.5px solid var(--uc-border-normal);
            border-radius: var(--uc-radius-md);
            background: var(--uc-bg-input);
            color: var(--uc-text-secondary);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.82rem;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--uc-transition);
            height: 42px;
          }

          .uc-modal-cancel:hover {
            border-color: var(--uc-navy-mid);
            background: var(--uc-navy-pale);
            color: var(--uc-navy);
          }

          .uc-modal-confirm {
            padding: 10px 22px;
            border: none;
            border-radius: var(--uc-radius-md);
            background: linear-gradient(135deg, var(--uc-navy), var(--uc-navy-light));
            color: white;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 0.82rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 7px;
            box-shadow: var(--uc-shadow-btn);
            transition: all var(--uc-transition);
            height: 42px;
          }

          .uc-modal-confirm:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(30,45,90,0.3);
          }

          .uc-modal-confirm:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            transform: none;
          }

          .uc-modal-confirm-amber {
            background: linear-gradient(135deg, var(--uc-amber), #c97020) !important;
            box-shadow: 0 6px 24px rgba(181,98,30,0.3) !important;
          }

          /* Security Notice */
          .uc-security-notice {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 14px;
            background: var(--uc-navy-pale);
            border: 1px solid rgba(44,62,107,0.15);
            border-radius: var(--uc-radius-md);
            margin-bottom: 20px;
            font-size: 0.78rem;
            color: var(--uc-navy-mid);
            line-height: 1.5;
          }

          /* ═══════════════════════════════════════
             ANT DESIGN OVERRIDES
          ═══════════════════════════════════════ */
          .uc-page .ant-form-item-explain-error {
            font-size: 0.72rem !important;
            margin-top: 4px !important;
            color: var(--uc-red) !important;
          }

          .uc-page .ant-pagination-item-active {
            border-color: var(--uc-navy) !important;
            background: var(--uc-navy) !important;
          }

          .uc-page .ant-pagination-item-active a {
            color: white !important;
          }

          .uc-page .ant-tag {
            border-radius: var(--uc-radius-full);
          }

          /* ═══════════════════════════════════════
             SCROLLBAR
          ═══════════════════════════════════════ */
          .uc-page ::-webkit-scrollbar { width: 5px; height: 5px; }
          .uc-page ::-webkit-scrollbar-track { background: var(--uc-bg-base); }
          .uc-page ::-webkit-scrollbar-thumb { background: var(--uc-border-normal); border-radius: 99px; }
          .uc-page ::-webkit-scrollbar-thumb:hover { background: var(--uc-navy-light); }

          /* ═══════════════════════════════════════
             RESPONSIVE
          ═══════════════════════════════════════ */
          @media (max-width: 1100px) {
            .uc-create-layout {
              grid-template-columns: 1fr;
            }
            .uc-preview-section {
              position: static;
            }
          }

          @media (max-width: 768px) {
            .uc-page { padding: 16px; }
            .uc-page-title { font-size: 1.4rem; }
            .uc-tab-content { padding: 16px; }
            .uc-tabs { padding: 0 16px; }
            .uc-stats-grid { grid-template-columns: repeat(2, 1fr); }
            .uc-tab { padding: 12px 14px; font-size: 0.75rem; }
            .uc-search-section { flex-direction: column; align-items: stretch; }
            .uc-search-wrap { max-width: 100%; }
            .uc-cards-grid { grid-template-columns: 1fr; }
            .uc-modal .ant-modal-content { border-radius: var(--uc-radius-lg) !important; }
          }

          @media (max-width: 480px) {
            .uc-stats-grid { grid-template-columns: 1fr 1fr; }
            .uc-header-title-group { gap: 10px; }
            .uc-title-icon { width: 44px; height: 44px; font-size: 18px; }
            .uc-page-title { font-size: 1.2rem; }
            .uc-stat-value { font-size: 1.4rem; }
          }

          /* Selection */
          ::selection { background: rgba(44,62,107,0.15); color: var(--uc-navy); }
        `}</style>
      </div>
    </ConfigProvider>
  );
};

export default UserCreate;