import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const ForgetPassword = ({ setOtpEmail }) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      console.log(process.env.REACT_APP_API_URL)
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/forgot_password_web`, {
        email,
      });
    console.log("Response:", res);
    console.log("Response data:", res.data);
      if (res.data.status === 'success') {
        setOtpEmail(email);        // Stocke l'email pour la vérification OTP
        sessionStorage.setItem('otpEmail', email);
        sessionStorage.setItem('previousPage', 'forget');
        navigate('/verify-otp', { state: { previousPage: 'forget', email }, replace: true });

      } else {
        setMessage(res.data.message || 'Unexpected server response.');
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setMessage(err.response.data.message);
      } else {
        setMessage('Network or server error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderFieldError = (field) => {
    return fieldErrors[field] ? (
      <p style={{ color: 'red', fontSize: '13px', marginTop: '-10px' }}>
        {fieldErrors[field]}
      </p>
    ) : null;
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
        {renderFieldError('email')}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Sending...' : 'Send OTP'}
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

const messageStyle = {
  color: 'red',
  fontWeight: 'bold',
};

export default ForgetPassword;
