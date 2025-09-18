import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [application, setApplication] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('green');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // At least 8 chars, one uppercase, one number, one special
  const strongPwd = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});

    // Client-side checks
    const errs = {};
    if (!email) errs.email = 'Email is required.';
    else if (!emailRegex.test(email)) errs.email = 'Please enter a valid email address.';

    if (!city) errs.city = 'City is required.';
    if (!country) errs.country = 'Country is required.';
    if (!application) errs.application = 'Application is required.';

    if (!password) errs.password = 'Password is required.';
    else if (!strongPwd.test(password)) {
      errs.password = 'Min 8 chars, include an uppercase, a number, and a special character.';
    }
    if (!confirmPassword) errs.confirm_password = 'Please confirm your password.';
    else if (password !== confirmPassword) {
      errs.confirm_password = 'Passwords do not match.';
    }

    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setMessage('Please fix the highlighted errors.');
      setMessageColor('red');
      return;
    }

    setLoading(true);
    try {
      // Relative path → Nginx will proxy to Flask
      const res = await axios.post('/api/signup', {
        email,
        city,
        country,
        application,
        password,
        confirm_password: confirmPassword,
      });

      // Backend returns neutral success message
      setMessage(res.data?.message || 'If the email is valid, a verification link has been sent.');
      setMessageColor('green');

      // Do NOT navigate anywhere; user must click the email link
      // Optionally clear sensitive fields
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const { response } = err;
      if (response?.status === 400 && Array.isArray(response.data?.errors)) {
        // Map backend validation array to fieldErrors
        const be = {};
        response.data.errors.forEach((e) => {
          if (e.field) be[e.field] = e.message || 'Invalid value.';
        });
        setFieldErrors(be);
        setMessage(response.data?.message || 'Validation errors.');
        setMessageColor('red');
      } else {
        setMessage(
          response?.data?.message || 'Signup error occurred. Please try again later.'
        );
        setMessageColor('red');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Create Account</h2>
      {message && <p style={{ ...messageStyle, color: messageColor }}>{message}</p>}

      <form onSubmit={handleSubmit} style={formStyle} noValidate>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.email}
          required
        />
        {fieldErrors.email && <p style={errorText}>{fieldErrors.email}</p>}

        <input
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.city}
          required
        />
        {fieldErrors.city && <p style={errorText}>{fieldErrors.city}</p>}

        <input
          type="text"
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.country}
          required
        />
        {fieldErrors.country && <p style={errorText}>{fieldErrors.country}</p>}

        <input
          type="text"
          placeholder="Application"
          value={application}
          onChange={(e) => setApplication(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.application}
          required
        />
        {fieldErrors.application && <p style={errorText}>{fieldErrors.application}</p>}

        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 40 }}
            aria-invalid={!!fieldErrors.password}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            style={eyeButtonStyle}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {fieldErrors.password && <p style={errorText}>{fieldErrors.password}</p>}

        <div style={{ position: 'relative' }}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 40 }}
            aria-invalid={!!fieldErrors.confirm_password}
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((s) => !s)}
            style={eyeButtonStyle}
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {fieldErrors.confirm_password && <p style={errorText}>{fieldErrors.confirm_password}</p>}

        <button type="submit" disabled={loading} style={{ ...buttonStyle, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Signing up…' : 'Sign Up'}
        </button>
      </form>

      <p style={{ marginTop: 10 }}>
        Already have an account? <Link to="/login">Log in</Link>
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
const formStyle = { display: 'flex', flexDirection: 'column', gap: 15 };
const inputStyle = {
  padding: '10px',
  fontSize: 16,
  borderRadius: 8,
  border: '1.5px solid #ccc',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};
const eyeButtonStyle = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
};
const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 16,
};
const messageStyle = { fontWeight: 'bold', marginTop: 8 };
const errorText = { color: 'red', fontSize: 13, marginTop: -10 };

export default Signup;
