import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');
  const [application, setApplication] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [refreshUsers, setRefreshUsers] = useState(false);

  const roles = ['admin', 'user'];

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication') || '';
    setApplication(storedApp);
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        if (!application) return;
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/get_users`,
          { params: { application } }
        );
        if (response.data.success) setUsers(response.data.users);
        else toast.error('Failed to load users.');
      } catch {
        toast.error('Error fetching users.');
      }
    };
    fetchUsers();
  }, [refreshUsers, application]);

  const handleSubmit = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !username || !role || !application) {
      toast.error('All fields are required.');
      return;
    }
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/register_user`, {
        email, username, role, application,
      });
      if (response.data.success) {
        toast.success(response.data.message || '✅ User registered successfully.');
        setEmail('');
        setUsername('');
        setRole('user');
        setRefreshUsers(prev => !prev);
      } else {
        toast.error(response.data.message || 'Registration error.');
      }
    } catch (error) {
      if (error.response?.data?.message) toast.error(error.response.data.message);
      else toast.error('❌ Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/delete_user`, { id });
      if (response.data.success) {
        toast.success(response.data.message || 'User deleted successfully.');
        setRefreshUsers(prev => !prev);
      } else {
        toast.error(response.data.message || 'Failed to delete user.');
      }
    } catch {
      toast.error('Error deleting user.');
    }
  };

  return (
    <div className="container--md card card--panel">
      <h2 className="title">Add a user</h2>

      <form
        className="form"
        onSubmit={e => { e.preventDefault(); if (!loading) handleSubmit(); }}
        noValidate
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="input"
          required
          autoComplete="email"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="input"
          required
          autoComplete="username"
        />

        <fieldset className="fieldset">
          <legend className="legend">Select a role:</legend>
          <div className="radio-group">
            {roles.map(r => (
              <label key={r} className="radio-label">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={e => setRole(e.target.value)}
                  required
                />
                <span style={{ marginLeft: 6, textTransform: 'capitalize' }}>{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={loading} className={`btn btn-lg ${loading ? 'btn--muted' : ''}`}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      <h2 className="title mt-20">Users List</h2>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Role</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center" style={{ padding: '15px' }}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td className="text-center">
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="btn btn--danger btn--sm"
                      title="Delete user"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default UserRegister;
