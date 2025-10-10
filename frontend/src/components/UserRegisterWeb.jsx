import React, { useState } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UserRegisterWeb = () => {
  const [formData, setFormData] = useState({
    email: '',
    application: '',
    role: 'user',
    type: ''
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.application || !formData.role || !formData.type) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const dataToSend = {
      email: formData.email,
      application: formData.application,
      role: formData.role,
      type: formData.type,
    };

    setLoading(true);
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/user_register_web`,
        dataToSend
      );

      if (response.data.status === 'success') {
        toast.success('✅ User registered successfully!');
        setFormData({
          email: '',
          application: '',
          role: 'user',
          type: '',
        });
      } else {
        toast.error(response.data.message || 'Registration failed.');
      }
    } catch {
      toast.error('❌ Server or network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container--md card card--panel">
      <h2 className="title">Add New User</h2>

      <form onSubmit={handleSubmit} className="form" noValidate>
        <input
          type="email"
          name="email"
          placeholder="Email *"
          value={formData.email}
          onChange={handleChange}
          className="input"
          required
        />

        <input
          type="text"
          name="application"
          placeholder="Application *"
          value={formData.application}
          onChange={handleChange}
          className="input"
          required
        />

        <fieldset className="fieldset">
          <legend className="legend">Select a role:</legend>
          <div className="radio-group">
            {['user', 'admin'].map((role) => (
              <label key={role} className="radio-label">
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
        <fieldset className="fieldset">
          <legend className="legend">Select a type:</legend>
          <div className="radio-group">
            {['scan', 'direct', 'both'].map((type) => (
              <label key={type} className="radio-label">
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={formData.type === type}
                  onChange={handleChange}
                />
                <span style={{ marginLeft: '6px', textTransform: 'capitalize' }}>
                  {type}
                </span>
              </label>
            ))}
          </div>
        </fieldset>


        <button type="submit" disabled={loading} className={`btn btn-lg ${loading ? 'btn--muted' : ''}`}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default UserRegisterWeb;
