import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const CreateNewPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Récupère l'email passé depuis /verify-otp
  const email = location.state?.email || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (pwd) => {
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return pwdRegex.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    if (!password || !confirmPassword) {
      setMessage('Please fill in both fields.');
      setMessageType('error');
      return;
    }

    if (!validatePassword(password)) {
      setMessage('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.');
      setMessageType('error');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      setMessageType('error');
      return;
    }

    if (!email) {
      setMessage('Missing email information. Please restart the password reset process.');
      setMessageType('error');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/change_password_web_forget`, {
        email,
        new_password: password,
        confirm_password: confirmPassword
      });

      if (res.status === 200) {
        setMessage('Password updated successfully. Redirecting to login...');
        setMessageType('success');
        setTimeout(() => {
            navigate('/login', { replace: true });
        }, 3000);
     } else {
        setMessage(res.data.message || 'Unexpected error occurred.');
        setMessageType('error');
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Server error.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Create New Password</h2>

      {message && (
        <p style={{ ...messageStyle, color: messageType === 'error' ? 'red' : 'green' }}>
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
          required
        />
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Saving...' : 'Save Password'}
        </button>
      </form>

      <p style={{ marginTop: '10px' }}>
        Remembered your password? <Link to="/login">Login</Link>
      </p>
    </div>
  );
};

// Styles
const containerStyle = {
  maxWidth: '400px',
  margin: 'auto',
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
};

const inputStyle = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  fontFamily: 'inherit',
};

const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px',
};

const messageStyle = {
  fontWeight: 'bold',
  marginBottom: '10px',
};

export default CreateNewPassword;
