import React from 'react';

const AdminDashboard = ({ userEmail }) => {
  return (
    <div style={containerStyle}>
      <h1>Admin Dashboard</h1>
      <p>Bienvenue, <strong>{userEmail}</strong> (Admin)</p>
      {/* Ici tu peux ajouter plus de contenu admin */}
    </div>
  );
};

const containerStyle = {
  maxWidth: '600px',
  margin: '40px auto',
  padding: '20px',
  backgroundColor: '#eef2ff',
  borderRadius: '8px',
  textAlign: 'center',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

export default AdminDashboard;
