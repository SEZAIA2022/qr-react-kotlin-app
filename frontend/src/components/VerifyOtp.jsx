import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const VerifyOtp = ({ email, setOtpEmail }) => {
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (countdown === 0) {
      clearInterval(countdownRef.current);
      setCanResend(true);
    }
  }, [countdown]);

  const startCountdown = (seconds) => {
    setCountdown(seconds);
    setCanResend(false);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');
    setLoading(true);

    if (!email) {
      setMessage('Email is required to verify OTP.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/verify_otp`, {
        email,
        otp,
      });
      setMessage(res.data.message);
      setMessageType('success');
      setOtpEmail(null);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Invalid OTP.');
      setMessageType('error');
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (!canResend) return;

    setMessage('');
    setMessageType('');
    setResendLoading(true);
    setCanResend(false);

    if (!email) {
      setMessage('Email is required to resend OTP.');
      setMessageType('error');
      setResendLoading(false);
      setCanResend(true);
      return;
    }

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/resend_otp`, {
        email,
        previous_page: 'SignUpActivity',
      });
      setMessage(res.data.message || 'OTP resent successfully.');
      setMessageType('success');

      // Démarrer le compte à rebours 30 secondes après un resend réussi
      startCountdown(30);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to resend OTP.');
      setMessageType('error');
      setCanResend(true); // Autoriser à nouveau en cas d'erreur
    }

    setResendLoading(false);
  };

  return (
    <div style={containerStyle}>
      <h2>Verify OTP</h2>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>

      <p style={{ marginTop: '15px', fontSize: '14px' }}>
        Didn’t receive the OTP?{' '}
        <span
          onClick={resendLoading || !canResend ? null : handleResend}
          style={{
            color: resendLoading || !canResend ? '#6c757d' : '#007bff',
            textDecoration: resendLoading || !canResend ? 'none' : 'underline',
            cursor: resendLoading || !canResend ? 'default' : 'pointer',
            fontWeight: 'bold',
            userSelect: 'none',
          }}
          aria-disabled={resendLoading || !canResend}
        >
          {resendLoading
            ? 'Resending...'
            : canResend
            ? 'Resend OTP'
            : `Please wait ${countdown} second${countdown !== 1 ? 's' : ''} before resending`}
        </span>
      </p>

      {message && (
        <p style={{ ...messageStyle, color: messageType === 'error' ? 'red' : 'green' }}>
          {message}
        </p>
      )}
    </div>
  );
};

// Styles
const containerStyle = {
  maxWidth: '400px',
  margin: '30px auto',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
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
  transition: 'background-color 0.3s',
};

const messageStyle = {
  fontWeight: 'bold',
  marginTop: '10px',
};

export default VerifyOtp;
