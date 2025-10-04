import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ForgetPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Timer de cooldown pour éviter le spam
  useEffect(() => {
    let interval;
    if (cooldown > 0) {
      interval = setInterval(() => setCooldown(prev => prev - 1), 1000);
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
      setCooldown(30);
    } catch {
      setMessage('If the account exists, a reset email has been sent.');
    } finally {
      setLoading(false);
    }
  };

  const isError = /invalid|required/i.test(message);
  const messageClass = isError ? 'message message--error' : 'message message--info';

  return (
    <div className="container--sm card card--panel">
      <h2 className="title" style={{ marginBottom: 12 }}>Forgot Password</h2>

      {message && <p className={messageClass}>{message}</p>}

      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />

        {fieldErrors.email && (
          <p className="error-text">{fieldErrors.email}</p>
        )}

        <button
          type="submit"
          disabled={loading || cooldown > 0}
          className={`btn btn-lg ${loading || cooldown > 0 ? 'btn--muted' : ''}`}
        >
          {loading
            ? 'Sending…'
            : cooldown > 0
            ? `Resend in ${cooldown}s`
            : 'Send reset link'}
        </button>
      </form>

      <p className="mt-10">
        Remember your password? <Link to="/login">Login</Link>
      </p>
    </div>
  );
};

export default ForgetPassword;
