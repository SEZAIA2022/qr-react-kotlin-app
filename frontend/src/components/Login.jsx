import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const Login = ({ setIsAuthenticated, setUserEmail }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setMessage('Please enter your email and password.');
      return;
    }

    if (!emailRegex.test(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/login_web`, {
        email,
        password,
      });

      if (res.data.status === 'success') {
        const role = res.data.role || '';
        const application = res.data.application || '';
        const expiryTime = Date.now() + 60 * 1000; // 1 minute pour test

        // Stocker dans localStorage
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userRole', role);
        localStorage.setItem('userApplication', application);
        localStorage.setItem('authExpiry', expiryTime.toString());

        // Passer à App.js
        setIsAuthenticated(true, email, role, application);
        setMessage('');
        navigate('/qr-generator');
      } else {
        setMessage('Incorrect email or password.');
      }
    } catch (err) {
      setMessage('Server or network error.');
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Login</h2>
      {message && <p style={messageStyle}>{message}</p>}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={eyeButtonStyle}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        <button type="submit" style={buttonStyle}>Login</button>
      </form>
      <p>
        <Link to="/forgot-password" style={{ fontSize: '14px' }}>Forgot password?</Link>
      </p>

      <p>
        Don't have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
};

// Styles
const containerStyle = {
  maxWidth: '400px',
  margin: 'auto',
  padding: '20px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  backgroundColor: '#f9faff',
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
  width: '100%',
  boxSizing: 'border-box',
};

const eyeButtonStyle = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '18px',
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

export default Login;
