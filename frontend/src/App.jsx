import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import Toolbar from './components/Toolbar';
import QuestionForm from './components/QuestionForm';
import QrGenerator from './components/QrGenerator';
import StaticPage from './components/StaticPage';
import HelpPage from './components/HelpPage';

import Signup from './components/Signup';
import Login from './components/Login';
import VerifyOtp from './components/VerifyOtp';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState(null);  // <-- Nouveau state pour email connecté
  const [otpEmail, setOtpEmail] = useState(null);

  const PrivateRoute = ({ children }) => {
    return isAuthenticated ? children : <Navigate to="/login" replace />;
  };

  return (
    <Router>
      <Toolbar />
      <NavBar isAuthenticated={isAuthenticated} />
      <main style={mainStyle}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth routes */}
          <Route
            path="/login"
            element={<Login setIsAuthenticated={setIsAuthenticated} setUserEmail={setUserEmail} />}
          />
          <Route
            path="/signup"
            element={
              otpEmail ? (
                <Navigate to="/verify-otp" replace />
              ) : (
                <Signup setOtpEmail={setOtpEmail} />
              )
            }
          />
          <Route
            path="/verify-otp"
            element={
              otpEmail ? (
                <VerifyOtp
                  email={otpEmail}
                  setOtpEmail={setOtpEmail}
                  onVerified={() => setOtpEmail(null)}
                />
              ) : (
                <Navigate to="/signup" replace />
              )
            }
          />

          {/* Private routes */}
          <Route
            path="/qr-generator"
            element={
              <PrivateRoute>
                <QrGenerator userEmail={userEmail} />
              </PrivateRoute>
            }
          />
          <Route
            path="/questions"
            element={
              <PrivateRoute>
                <QuestionForm />
              </PrivateRoute>
            }
          />
          <Route
            path="/static_page"
            element={
              <PrivateRoute>
                <StaticPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/help_page"
            element={
              <PrivateRoute>
                <HelpPage />
              </PrivateRoute>
            }
          />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </Router>
  );
}

// Navbar modifiée pour afficher Logout si connecté
const NavBar = ({ isAuthenticated }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    window.alert("Déconnexion réussie");
    navigate("/login");
    window.location.reload();
  };

  return (
    <nav style={navStyle}>
      {isAuthenticated ? (
        <>
          <CustomLink to="/qr-generator" active={location.pathname === '/qr-generator'}>
            QR generator
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/questions" active={location.pathname === '/questions'}>
            Questions
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/static_page" active={location.pathname === '/static_page'}>
            Static Page
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/help_page" active={location.pathname === '/help_page'}>
            Help center
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#dc3545',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
              marginLeft: '10px',
            }}
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <CustomLink to="/login" active={location.pathname === '/login'}>
            Login
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/signup" active={location.pathname === '/signup'}>
            Sign Up
          </CustomLink>
        </>
      )}
    </nav>
  );
};

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
