import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Form, Input, Button, message, Card, Typography, Checkbox, Tooltip } from "antd";
import { 
  EyeInvisibleOutlined, 
  EyeTwoTone, 
  UserOutlined, 
  LockOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined
} from "@ant-design/icons";
import "./Login.css";

const { Title, Text } = Typography;

const Login = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [validationErrors, setValidationErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [keyboardShortcut, setKeyboardShortcut] = useState('');
  const [savedEmails, setSavedEmails] = useState([]); // For multiple saved emails
  const [showSavedEmails, setShowSavedEmails] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";
  
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const submitButtonRef = useRef(null);

  // Use AuthContext
  const { login, user, loading: authLoading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, from]);

  // Cookie/LocalStorage helper functions
  const saveEmailToStorage = (email, remember = true) => {
    if (remember) {
      // Save current email
      localStorage.setItem('rememberedEmail', email);
      localStorage.setItem('rememberMe', 'true');
      
      // Save to list of saved emails (max 5)
      let savedEmailsList = JSON.parse(localStorage.getItem('savedEmails') || '[]');
      
      // Remove if already exists
      savedEmailsList = savedEmailsList.filter(savedEmail => savedEmail !== email);
      
      // Add to beginning
      savedEmailsList.unshift(email);
      
      // Keep only last 5 emails
      if (savedEmailsList.length > 5) {
        savedEmailsList = savedEmailsList.slice(0, 5);
      }
      
      localStorage.setItem('savedEmails', JSON.stringify(savedEmailsList));
    } else {
      localStorage.removeItem('rememberedEmail');
      localStorage.setItem('rememberMe', 'false');
    }
  };

  const loadSavedEmails = () => {
    const savedEmailsList = JSON.parse(localStorage.getItem('savedEmails') || '[]');
    setSavedEmails(savedEmailsList);
    
    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedRememberMe = localStorage.getItem('rememberMe') === 'true';
    
    return { savedEmail, savedRememberMe };
  };

  const clearSavedEmail = (emailToRemove) => {
    let savedEmailsList = JSON.parse(localStorage.getItem('savedEmails') || '[]');
    savedEmailsList = savedEmailsList.filter(email => email !== emailToRemove);
    localStorage.setItem('savedEmails', JSON.stringify(savedEmailsList));
    setSavedEmails(savedEmailsList);
    
    // If removing the currently remembered email
    if (localStorage.getItem('rememberedEmail') === emailToRemove) {
      if (savedEmailsList.length > 0) {
        localStorage.setItem('rememberedEmail', savedEmailsList[0]);
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.setItem('rememberMe', 'false');
      }
    }
  };

  // Initialize component
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    
    // Load saved credentials
    const { savedEmail, savedRememberMe } = loadSavedEmails();
    
    if (savedEmail && savedRememberMe) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
      form.setFieldsValue({ email: savedEmail });
      
      // Auto-validate email
      setTimeout(() => {
        validateField('email', savedEmail);
      }, 100);
    }
    
    // Focus on appropriate input
    setTimeout(() => {
      if (savedEmail && savedRememberMe) {
        passwordInputRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          setKeyboardShortcut('Ctrl+Enter');
          setTimeout(() => setKeyboardShortcut(''), 2000);
          if (isFormValid && !submitting) {
            handleSubmit();
          }
        }
      }
      
      // Escape to hide saved emails dropdown
      if (e.key === 'Escape' && showSavedEmails) {
        setShowSavedEmails(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormValid, submitting, showSavedEmails]);

  // Real-time form validation
  const validateField = useCallback((field, value) => {
    const errors = { ...validationErrors };
    
    switch (field) {
      case 'email':
        if (!value) {
          errors.email = { type: 'required', message: 'Email is required' };
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.email = { type: 'format', message: 'Please enter a valid email address' };
        } else {
          delete errors.email;
        }
        break;
        
      case 'password':
        if (!value) {
          errors.password = { type: 'required', message: 'Password is required' };
        } else if (value.length < 6) {
          errors.password = { type: 'length', message: 'Password must be at least 6 characters' };
        } else {
          delete errors.password;
        }
        break;
        
      default:
        break;
    }
    
    setValidationErrors(errors);
    
    // Check if form is valid
    const requiredFields = ['email', 'password'];
    const formValid = Object.keys(errors).length === 0 && 
                     requiredFields.every(field => formData[field]);
    setIsFormValid(formValid);
    
    return !errors[field];
  }, [validationErrors, formData]);

  // Handle input changes
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Update form fields
    form.setFieldsValue({ [field]: value });
    
    // Validate field with debounce
    setTimeout(() => {
      validateField(field, value);
    }, 300);
  }, [validateField, form]);

  // Handle saved email selection
  const handleSavedEmailSelect = (selectedEmail) => {
    setFormData(prev => ({ ...prev, email: selectedEmail }));
    form.setFieldsValue({ email: selectedEmail });
    setShowSavedEmails(false);
    setRememberMe(true);
    
    // Validate the selected email
    validateField('email', selectedEmail);
    
    // Focus on password field
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 100);
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!isFormValid || submitting) return;
    
    setSubmitting(true);
    
    // Add form submitting class for styling
    const formElement = document.querySelector('.advanced-login-form');
    formElement?.classList.add('submitting');
    
    try {
      // Use AuthContext login method
      await login(formData.email, formData.password);
      
      // Save email to storage (always save successful login emails)
      saveEmailToStorage(formData.email, rememberMe);
      
      message.success({
        content: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Welcome back! Redirecting to dashboard...</span>
          </div>
        ),
        duration: 2.5,
        style: { 
          marginTop: '20vh',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }
      });
      
      // Navigation will be handled by useEffect when user state changes
      
    } catch (err) {
      // Remove submitting class on error
      formElement?.classList.remove('submitting');
      setSubmitting(false);
      
      let errorMessage = "Login failed. Please try again.";
      
      if (err.code === 'auth/user-not-found') {
        errorMessage = "No account found with this email address.";
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = "Incorrect password. Please try again.";
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = "Too many failed attempts. Please try again later.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Please enter a valid email address.";
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password. Please check your credentials.";
      }
      
      message.error({
        content: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            <span>{errorMessage}</span>
          </div>
        ),
        duration: 4,
        style: { 
          marginTop: '20vh',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }
      });
      
      // Shake animation on error
      const form = document.querySelector('.advanced-login-form');
      form?.classList.add('shake-animation');
      setTimeout(() => form?.classList.remove('shake-animation'), 600);
    }
  };

  // Handle form finish
  const onFinish = (values) => {
    handleSubmit();
  };

  const getInputStatus = (field) => {
    if (!formData[field]) return '';
    if (validationErrors[field]) return 'error';
    return 'success';
  };

  // Show loading if auth is initializing
  if (authLoading) {
    return (
      <div className="advanced-login-container">
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-login-container">
      {/* Background Elements */}
      <div className="background-elements">
        {/* Geometric Shapes */}
        <div className="geometric-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>

        {/* NEW: Infinity Symbols Animation */}
        <div className="infinity-symbols">
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
          <div className="infinity-symbol"></div>
        </div>

        {/* Floating Dots */}
        <div className="floating-dots">
          {[...Array(20)].map((_, i) => (
            <div key={i} className={`dot dot-${i + 1}`}></div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className={`login-wrapper ${isLoaded ? 'loaded' : ''}`}>
        <div className="login-container-inner">
          
          {/* Header */}
          <div className="login-header">
            <div className="company-logo">
              
            </div>
          </div>

          {/* Main Login Card */}
          <Card className="advanced-login-card" variant="borderless">
            
            {/* Card Header */}
            <div className="card-header-section">
                <div className="floating-logo">
                  <img src="adinath-logo.png" alt="Adinath Logo" />
                </div>
              </div>
            {/* Login Form */}
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              className="advanced-login-form"
              size="large"
              autoComplete="on"
            >
              
              {/* Email Field with Saved Emails Dropdown */}
              <Form.Item
  name="email"
  label="Email Address"
  validateStatus={getInputStatus("email")}
  help={validationErrors.email?.message}
>
  <div className="custom-input-wrapper">
    <UserOutlined className="left-icon" />
    <Input
      ref={emailInputRef}
      placeholder="Enter your email"
      value={formData.email}
      onChange={(e) => handleInputChange("email", e.target.value)}
      onFocus={() => setFocusedField("email")}
      onBlur={() => setFocusedField("")}
      className="custom-input"
    />
  </div>
</Form.Item>


              {/* Password Field */}
              <Form.Item
  name="password"
  label="Password"
  validateStatus={getInputStatus("password")}
  help={validationErrors.password?.message}
>
  <div className="custom-input-wrapper">
    <LockOutlined className="left-icon" />
    <Input.Password
      ref={passwordInputRef}
      placeholder="Enter your password"
      value={formData.password}
      onChange={(e) => handleInputChange("password", e.target.value)}
      onFocus={() => setFocusedField("password")}
      onBlur={() => setFocusedField("")}
      className="custom-input"
    />
  </div>
</Form.Item>


              {/* Form Options */}
              <div className="form-options">
  <Checkbox
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
  >
    Remember me
  </Checkbox>
</div>


              {/* Submit Button */}
              <Button
  htmlType="submit"
  type="primary"
  loading={submitting}
  disabled={!isFormValid}
  className="custom-submit-btn"
  block
>
  Sign in
</Button>


              {/* Keyboard Shortcut Indicator */}
              {keyboardShortcut && (
                <div className="keyboard-shortcut-indicator">
                  <InfoCircleOutlined /> {keyboardShortcut} pressed
                </div>
              )}

            </Form>

          </Card>

        </div>
      </div>

    </div>
  );
};

export default Login;
