import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [application, setApplication] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');      // Un seul message (succès ou erreur)
  const [isError, setIsError] = useState(false);   // Pour gérer le style

  const roles = ['admin','user'];

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication') || '';
    setApplication(storedApp);
  }, []);

  const handleSubmit = async () => {
    // Regex simple pour validation email
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

      <div style={inputContainerStyle}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={inputStyle}
          required
        />

        <div style={radioGroupWrapperStyle}>
          <p style={radioGroupLabelStyle}>Select a role:</p>
          <div style={radioGroupStyle}>
            {roles.map((r) => (
              <label key={r} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={e => setRole(e.target.value)}
                />
                <span style={{ marginLeft: '6px' }}>{r}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
      </div>

      {message && (
        <p style={isError ? errorStyle : successStyle}>{message}</p>
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

const inputContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  alignItems: 'center',
};

const inputStyle = {
  width: '80%',
  padding: '10px 14px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  outlineColor: '#007bff',
};

const radioGroupWrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: '10px',
};

const radioGroupLabelStyle = {
  fontWeight: '500',
  margin: 0,
};

const radioGroupStyle = {
  display: 'flex',
  gap: '20px',
};

const radioLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '16px',
};

const buttonStyle = {
  padding: '10px 20px',
  fontSize: '16px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#007bff',
  color: '#fff',
  cursor: 'pointer',
  transition: 'background-color 0.3s',
  fontWeight: '600',
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
