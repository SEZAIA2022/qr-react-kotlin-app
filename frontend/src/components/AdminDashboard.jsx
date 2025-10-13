import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
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
    } catch {
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
    } catch {
      alert('Network or server error.');
    }
  };

  return (
    <div className="container--xl card card--panel">
      <h1 className="title" style={{ marginBottom: 20 }}>Admin Dashboard</h1>

      {loading ? (
        <p className="message message--info">Loading users...</p>
      ) : error ? (
        <p className="message message--error">{error}</p>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Application</th>
                <th>Type</th>
                <th>Email</th>
                <th>City</th>
                <th>Country</th>
                <th>Status</th>
                <th>Role</th>
                <th>QR Code Count</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td>{user.application}</td>
                  <td>{user.role === 'admin' ? '-' : user.type}</td>
                  <td>{user.email}</td>
                  <td>{user.city || '-'}</td>
                  <td>{user.country || '-'}</td>
                  <td>
                    {user.is_activated === 1 ? 'Active' : 'Not active'}
                  </td>
                  <td>{user.role}</td>
                  <td>{user.role === 'admin' ? '-' : user.qrcode_count}</td>
                  <td>
                    <button
                      className="btn btn--danger btn--sm"
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

export default AdminDashboard;
