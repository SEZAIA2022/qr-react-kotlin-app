import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ForgetPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // ⏱️ état pour le timer
  const [cooldown, setCooldown] = useState(0);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Décrémentation automatique du timer
  useEffect(() => {
    let interval;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});

    if (!email) {
      setMessage('Email is required.');
      return;
    }
    if (!emailRegex.test(email)) {
      setFieldErrors({ email: 'Invalid email format.' });
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/password/forgot', { email });
      setMessage('If the account exists, a reset email has been sent.');
      setCooldown(30); // ✅ 30 secondes avant de pouvoir recliquer
    } catch (err) {
      setMessage('If the account exists, a reset email has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Forgot Password</h2>
      {message && <p style={messageStyle}>{message}</p>}

      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        {fieldErrors.email && (
          <p style={{ color: 'red', fontSize: '13px', marginTop: '-10px' }}>
            {fieldErrors.email}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || cooldown > 0}
          style={{
            ...buttonStyle,
            backgroundColor: loading || cooldown > 0 ? '#6c757d' : '#007bff',
            cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? 'Sending…'
            : cooldown > 0
            ? `Resend in ${cooldown}s`
            : 'Send reset link'}
        </button>
      </form>

      <p style={{ marginTop: '10px' }}>
        Remember your password? <Link to="/login">Login</Link>
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
const formStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const inputStyle = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
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
const messageStyle = { color: 'green', fontWeight: 'bold' };

export default ForgetPassword;
