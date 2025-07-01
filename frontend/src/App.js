import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Toolbar from './components/Toolbar';
import QuestionForm from './components/QuestionForm';
import QrGenerator from './components/QrGenerator';

function App() {
  return (
    <Router>
      <Toolbar />
      <NavBar />
      <main style={mainStyle}>
        <Routes>
          <Route path="/" element={<Navigate to="/qr-generator" replace />} />
          <Route path="/qr-generator" element={<QrGenerator />} />
          <Route path="/questions" element={<QuestionForm />} />
        </Routes>
      </main>
    </Router>
  );
}

// Composant NavBar pour gestion plus propre des liens
const NavBar = () => {
  const location = useLocation();

  return (
    <nav style={navStyle}>
      <CustomLink to="/qr-generator" active={location.pathname === '/qr-generator'}>
        Générateur QR
      </CustomLink>
      <span style={{ margin: '0 8px' }}>|</span>
      <CustomLink to="/questions" active={location.pathname === '/questions'}>
        Questions
      </CustomLink>
    </nav>
  );
};

// Composant lien personnalisé pour style + active state + hover
const CustomLink = ({ to, active, children }) => {
  const baseStyle = {
    margin: '0 10px',
    textDecoration: 'none',
    color: active ? '#0056b3' : '#007bff',
    fontWeight: active ? '600' : '400',
    cursor: 'pointer',
    transition: 'color 0.3s ease',
  };

  return (
    <Link
      to={to}
      style={baseStyle}
      onMouseEnter={e => (e.currentTarget.style.color = '#003d80')}
      onMouseLeave={e => (e.currentTarget.style.color = active ? '#0056b3' : '#007bff')}
    >
      {children}
    </Link>
  );
};

const navStyle = {
  padding: '10px',
  textAlign: 'center',
  backgroundColor: '#f0f4ff',
  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  marginBottom: '20px',
};

const mainStyle = {
  padding: '20px',
  maxWidth: '800px',
  margin: '0 auto',
  backgroundColor: '#fff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  minHeight: '70vh',
};

export default App;
