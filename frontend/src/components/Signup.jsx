import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
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
      const res = await axios.post('/api/signup', {
        email,
        city,
        country,
        password,
        confirm_password: confirmPassword,
      });

      setMessage(res.data?.message || 'If the email is valid, a verification link has been sent.');
      setMessageColor('green');

      // clear sensitive fields
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const { response } = err;
      if (response?.status === 400 && Array.isArray(response.data?.errors)) {
        const be = {};
        response.data.errors.forEach((e) => {
          if (e.field) be[e.field] = e.message || 'Invalid value.';
        });
        setFieldErrors(be);
        setMessage(response.data?.message || 'Validation errors.');
        setMessageColor('red');
      } else {
        setMessage(response?.data?.message || 'Signup error occurred. Please try again later.');
        setMessageColor('red');
      }
    } finally {
      setLoading(false);
    }
  };

  // message style via classes
  const isError = messageColor === 'red' || /error|invalid|required|fail/i.test(message);
  const messageClass = isError ? 'message message--error' : 'message message--success';

  return (
    <div className="container--sm card card--panel">
      <h2 className="title">Create Account</h2>

      {message && <p className={messageClass}>{message}</p>}

      <form onSubmit={handleSubmit} className="form" noValidate>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          aria-invalid={!!fieldErrors.email}
          required
        />
        {fieldErrors.email && <p className="error-text">{fieldErrors.email}</p>}

        <input
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input"
          aria-invalid={!!fieldErrors.city}
          required
        />
        {fieldErrors.city && <p className="error-text">{fieldErrors.city}</p>}

        <input
          type="text"
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="input"
          aria-invalid={!!fieldErrors.country}
          required
        />
        {fieldErrors.country && <p className="error-text">{fieldErrors.country}</p>}

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input input--with-eye"
            aria-invalid={!!fieldErrors.password}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="eye-btn"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {fieldErrors.password && <p className="error-text">{fieldErrors.password}</p>}

        <div className="relative">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input input--with-eye"
            aria-invalid={!!fieldErrors.confirm_password}
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((s) => !s)}
            className="eye-btn"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {fieldErrors.confirm_password && <p className="error-text">{fieldErrors.confirm_password}</p>}

        <button
          type="submit"
          disabled={loading}
          className={`btn btn-lg ${loading ? 'btn--muted' : ''}`}
        >
          {loading ? 'Signing up…' : 'Sign Up'}
        </button>
      </form>

      <p className="mt-10">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
};

export default Signup;
