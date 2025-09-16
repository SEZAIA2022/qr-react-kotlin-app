import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminDashboard = ({ userEmail }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/get_all_user_web`);
      if (res.data.status === 'success') {
        setUsers(res.data.users);
      } else {
        setError('Error fetching users.');
      }
    } catch (err) {
      setError('Network or server error.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      const res = await axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_user_web/${id}`);
      if (res.data.success) {
        setUsers(users.filter(user => user.id !== id));
      } else {
        alert(res.data.message || 'Error deleting user.');
      }
    } catch (err) {
      alert('Network or server error.');
    }
  };

  return (
    <div style={containerStyle}>
      <h1>Admin Dashboard</h1>
      
      {loading ? (
        <p>Loading users...</p>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        <div style={responsiveWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Application</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Country</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>QR Code Count</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td style={tdStyle}>{index + 1}</td> 
                  <td style={tdStyle}>{user.application}</td>
                  <td style={tdStyle}>{user.email}</td>
                  <td style={tdStyle}>{user.city || '-'}</td>
                  <td style={tdStyle}>{user.country || '-'}</td>
                  <td style={tdStyle}> {user.is_activated === 1 ? 'Activated' : 'Not activated' || '-'}</td>
                  <td style={tdStyle}>{user.role}</td>
                  <td style={tdStyle}>{user.qrcode_count}</td>
                  <td style={tdStyle}>
                    <button 
                      style={deleteBtnStyle} 
                      onClick={() => handleDelete(user.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Styles
const responsiveWrapperStyle = {
  width: '100%',
  overflowX: 'auto',
};
const containerStyle = {
  maxWidth: '900px',
  margin: '40px auto',
  padding: '20px',
  backgroundColor: '#eef2ff',
  borderRadius: '8px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '20px',
};

const thStyle = {
  borderBottom: '2px solid #007bff',
  textAlign: 'left',
  padding: '10px',
  backgroundColor: '#d6e0ff',
};

const tdStyle = {
  borderBottom: '1px solid #ccc',
  padding: '10px',
};

const deleteBtnStyle = {
  backgroundColor: '#dc3545',
  color: 'white',
  border: 'none',
  padding: '6px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
};

export default AdminDashboard;
