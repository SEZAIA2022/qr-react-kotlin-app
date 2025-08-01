import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [application, setApplication] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const roles = ['admin', 'user'];

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication') || '';
    setApplication(storedApp);
  }, []);

  const handleSubmit = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !username || !role || !application) {
      setIsError(true);
      setMessage('All fields are required.');
      return;
    }

    if (!emailRegex.test(email)) {
      setIsError(true);
      setMessage('Please enter a valid email address.');
      return;
    }

    setIsError(false);
    setMessage('');
    setLoading(true);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/register_user`, {
        email,
        username,
        role,
        application,
      });

      if (response.data.success) {
        setIsError(false);
        setMessage(response.data.message || 'User registered successfully.');
        setEmail('');
        setUsername('');
        setRole('');
      } else {
        setIsError(true);
        setMessage(response.data.message || 'Registration error.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setIsError(true);
      setMessage('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '20px' }}>Add a user</h2>

      <form
        style={formStyle}
        onSubmit={e => {
          e.preventDefault();
          if (!loading) handleSubmit();
        }}
        noValidate
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
          required
          autoComplete="email"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={inputStyle}
          required
          autoComplete="username"
        />

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Select a role:</legend>
          <div style={radioGroupStyle}>
            {roles.map(r => (
              <label key={r} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={e => setRole(e.target.value)}
                  required
                />
                <span style={{ marginLeft: '6px', textTransform: 'capitalize' }}>{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      {message && (
        <p style={isError ? errorStyle : successStyle} role="alert" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
};

// Styles
const containerStyle = {
  maxWidth: '600px',
  margin: '30px auto 40px',
  padding: '20px',
  backgroundColor: '#f1f9f9',
  borderRadius: '10px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  textAlign: 'center',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  alignItems: 'center',
};

const inputStyle = {
  width: '80%',
  padding: '12px 14px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  outlineColor: '#007bff',
  boxSizing: 'border-box',
};

const fieldsetStyle = {
  border: 'none',
  padding: 0,
  margin: 0,
  width: '80%',
  textAlign: 'left',
};

const legendStyle = {
  fontWeight: '600',
  marginBottom: '8px',
  fontSize: '16px',
};

const radioGroupStyle = {
  display: 'flex',
  gap: '30px',
};

const radioLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '16px',
  cursor: 'pointer',
};

const buttonStyle = {
  padding: '12px 25px',
  fontSize: '16px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#007bff',
  color: '#fff',
  cursor: 'pointer',
  transition: 'background-color 0.3s',
  fontWeight: '600',
  width: '50%',
  minWidth: '150px',
};

const errorStyle = {
  color: '#d9534f',
  fontWeight: '600',
  marginTop: '15px',
};

const successStyle = {
  color: '#28a745',
  fontWeight: '600',
  marginTop: '15px',
};

export default UserRegister;
