import React, { useState } from 'react';
import axios from 'axios';

const UserRegisterWeb = () => {
  const [formData, setFormData] = useState({
    email: '',
    application: '',
    city: '',
    country: '',
    role: 'user',
  });

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!formData.email || !formData.application || !formData.role) {
      setIsError(true);
      setMessage('Please fill in all required fields.');
      return;
    }

    const dataToSend = {
      email: formData.email,
      application: formData.application,
      role: formData.role,
    };

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/user_register_web`,
        dataToSend
      );

      if (response.data.status === 'success') {
        setIsError(false);
        setMessage('User registered successfully!');
        setFormData({
          email: '',
          application: '',
          city: '',
          country: '',
          role: 'user',
        });
      } else {
        setIsError(true);
        setMessage(response.data.message || 'Registration failed.');
      }
    } catch (error) {
      setIsError(true);
      setMessage('Server or network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '20px' }}>Add New User</h2>

      <form onSubmit={handleSubmit} style={formStyle} noValidate>
        <input
          type="email"
          name="email"
          placeholder="Email *"
          value={formData.email}
          onChange={handleChange}
          style={inputStyle}
          required
        />

        <input
          type="text"
          name="application"
          placeholder="Application *"
          value={formData.application}
          onChange={handleChange}
          style={inputStyle}
          required
        />

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Select a role:</legend>
          <div style={radioGroupStyle}>
            {['user', 'admin'].map(role => (
              <label key={role} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={formData.role === role}
                  onChange={handleChange}
                />
                <span style={{ marginLeft: '6px', textTransform: 'capitalize' }}>
                  {role}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

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

export default UserRegisterWeb;
