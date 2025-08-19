import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [application, setApplication] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [refreshUsers, setRefreshUsers] = useState(false);

  const roles = ['admin', 'user'];

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication') || '';
    setApplication(storedApp);
  }, []);

  // Charger la liste des utilisateurs
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        if (!application) return;
        console.log(application);
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/get_users`,
          { params: { application } }   
        );

        if (response.data.success) {
          setUsers(response.data.users);
        } else {
          toast.error('Failed to load users.');
        }
      } catch (error) {
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
        email,
        username,
        role,
        application,
      });

      if (response.data.success) {
        toast.success(response.data.message || '✅ User registered successfully.');
        setEmail('');
        setUsername('');
        setRole('');
        setRefreshUsers(prev => !prev); // Rafraîchir la liste des utilisateurs
      } else {
        toast.error(response.data.message || 'Registration error.');
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('❌ Registration failed. Please try again.');
      }
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
        setRefreshUsers(prev => !prev); // Rafraîchir la liste après suppression
      } else {
        toast.error(response.data.message || 'Failed to delete user.');
      }
    } catch (error) {
      toast.error('Error deleting user.');
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
                <span style={{ marginLeft: 6, textTransform: 'capitalize' }}>{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      <h2 style={{ margin: '40px 0 20px' }}>Users List</h2>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Username</th>
            <th style={thStyle}>Application</th>
            <th style={thStyle}>Role</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', padding: '15px' }}>
                No users found.
              </td>
            </tr>
          ) : (
            users.map(user => (
              <tr key={user.id}>
                <td style={tdStyle}>{user.email}</td>
                <td style={tdStyle}>{user.username}</td>
                <td style={tdStyle}>{user.application}</td>
                <td style={tdStyle}>{user.role}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleDelete(user.id)}
                    style={deleteButtonStyle}
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

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
};

// Styles

const containerStyle = {
  maxWidth: '800px',
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

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '10px',
};

const thStyle = {
  borderBottom: '2px solid #007bff',
  padding: '10px',
  textAlign: 'left',
  backgroundColor: '#e6f0ff',
};

const tdStyle = {
  borderBottom: '1px solid #ddd',
  padding: '10px',
};

const deleteButtonStyle = {
  backgroundColor: '#dc3545',
  color: '#fff',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '5px',
  cursor: 'pointer',
  fontWeight: '600',
};

export default UserRegister;
