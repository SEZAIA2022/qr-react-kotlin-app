import React from 'react';
import { CheckCircle } from 'react-feather'; // icône simple (npm install react-feather)

const containerStyle = {
  maxWidth: '420px',
  margin: '80px auto',
  padding: '40px 30px',
  background: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  textAlign: 'center',
};

const iconWrapper = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  backgroundColor: '#e6f4ea',
  marginBottom: '20px',
};

const titleStyle = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#2e7d32', // vert succès
  marginBottom: '12px',
};

const textStyle = {
  fontSize: '16px',
  color: '#4a4a4a',
  lineHeight: 1.6,
  marginBottom: '8px',
};

export default function PasswordSuccess() {
  return (
    <div style={containerStyle}>
      <div style={iconWrapper}>
        <CheckCircle size={40} color="#2e7d32" />
      </div>

      <h2 style={titleStyle}>Password changed</h2>

      <p style={textStyle}>
        Your password has been successfully changed.
      </p>
      <p style={textStyle}>
        You can close this page and reopen the application
        to log in.
      </p>
    </div>
  );
}
