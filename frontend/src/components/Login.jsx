import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const emailRef = useRef(null);
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setMessage('Please enter your email and password.');
      setEmail('');
      setPassword('');
      emailRef.current?.focus();
      return;
    }

    if (!emailRegex.test(email)) {
      setMessage('Please enter a valid email address.');
      setEmail('');
      setPassword('');
      emailRef.current?.focus();
      return;
    }

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/login_web`, { email, password });

      if (res.data.status === 'success') {
        const role = res.data.role || '';
        const application = res.data.application || '';
        const expiryTime = Date.now() + 60 * 1000; // 1 min (test)

        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userRole', role);
        localStorage.setItem('userApplication', application);
        localStorage.setItem('authExpiry', expiryTime.toString());

        setIsAuthenticated(true, email, role, application);
        setMessage('');
        navigate('/');
      } else {
        setMessage(res.data.message || 'Unknown error.');
        setEmail('');
        setPassword('');
        emailRef.current?.focus();
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Server or network error.');
      setEmail('');
      setPassword('');
      emailRef.current?.focus();
    }
  };

  // Choix de style de message (rouge si erreur, bleu sinon)
  const isError = !!message && /error|invalid|please|unknown|server|network/i.test(message);
  const messageClass = isError ? 'message message--error' : 'message message--info';

  return (
    <div className="container--sm card card--panel">
      <h2 className="title" style={{ marginBottom: 12 }}>Login</h2>

      {message && <p className={messageClass}>{message}</p>}

      <form onSubmit={handleSubmit} className="form">
        <input
          ref={emailRef}
          type="text"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="input"
        />

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input"
            /* un peu d'espace à droite pour l'icône */
            style={{ paddingRight: 40 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="eye-btn"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>

        <button type="submit" className="btn btn-lg">Login</button>
      </form>

      <p className="mt-10">
        <Link to="/forgot-password" style={{ fontSize: 14 }}>Forgot password?</Link>
      </p>
      <p className="mt-10">
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
};

export default Login;
