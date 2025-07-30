import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const Signup = ({ setOtpEmail }) => {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [application, setApplication] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});

    // Vérification des champs vides
    if (!email || !city || !country || !application || !password || !confirmPassword) {
      setMessage('All fields are required.');
      return;
    }

    // Vérification format email
    if (!emailRegex.test(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }

    // Vérification correspondance mot de passe
    if (password !== confirmPassword) {
      setFieldErrors({ confirm_password: 'Passwords do not match.' });
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/signup`, {
        email,
        city,
        country,
        application,
        password,
        confirm_password: confirmPassword,
      });

      if (res.data.message === 'OTP sent to your email.') {
        setOtpEmail(email);
        sessionStorage.setItem('otpEmail', email);
        sessionStorage.setItem('previousPage', 'signup');
        navigate('/verify-otp', { state: { previousPage: 'signup', email }, replace: true });
      } else {
        setMessage('Unexpected response from server.');
      }
    } catch (err) {
      if (err.response) {
        const { status, data } = err.response;
        if (status === 400 && data.errors) {
          const errors = {};
          data.errors.forEach(err => {
            errors[err.field] = err.message;
          });
          setFieldErrors(errors);
        } else {
          setMessage(data.message || 'Signup error occurred.');
        }
      } else {
        setMessage('Network error. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderFieldError = (field) => {
    return fieldErrors[field] ? (
      <p style={{ color: 'red', fontSize: '13px', marginTop: '-10px' }}>{fieldErrors[field]}</p>
    ) : null;
  };

  return (
    <div style={containerStyle}>
      <h2>Create Account</h2>
      {message && <p style={messageStyle}>{message}</p>}

      <form onSubmit={handleSubmit} style={formStyle} noValidate>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.email}
          aria-describedby="email-error"
          required
        />
        {renderFieldError('email')}

        <input
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.city}
          aria-describedby="city-error"
          required
        />
        {renderFieldError('city')}

        <input
          type="text"
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.country}
          aria-describedby="country-error"
          required
        />
        {renderFieldError('country')}

        <input
          type="text"
          placeholder="Application"
          value={application}
          onChange={(e) => setApplication(e.target.value)}
          style={inputStyle}
          aria-invalid={!!fieldErrors.application}
          aria-describedby="application-error"
          required
        />
        {renderFieldError('application')}

        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: '40px' }}
            aria-invalid={!!fieldErrors.password}
            aria-describedby="password-error"
            required
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
        {renderFieldError('password')}

        <div style={{ position: 'relative' }}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: '40px' }}
            aria-invalid={!!fieldErrors.confirm_password}
            aria-describedby="confirm-password-error"
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            style={eyeButtonStyle}
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {renderFieldError('confirm_password')}

        <button type="submit" style={{ ...buttonStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>

      <p style={{ marginTop: '10px' }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
};

const containerStyle = {
  maxWidth: '400px',
  margin: 'auto',
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
};
const formStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const inputStyle = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box'
};
const eyeButtonStyle = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '18px'
};
const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px'
};
const messageStyle = { color: 'red', fontWeight: 'bold' };

export default Signup;
