import React, { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './style.css';

import Toolbar from './components/Toolbar';
import QuestionForm from './components/QuestionForm';
import QrGenerator from './components/QrGenerator';
import StaticPage from './components/StaticPage';
import HelpPage from './components/HelpPage';
import ProblemTypeForm from './components/ProblemTypeForm';

import Signup from './components/Signup';
import Login from './components/Login';
import VerifyEmail from './components/VerifyEmail';
import UserRegister from './components/UserRegister';
import ForgetPassword from './components/ForgetPassword';
import CreateNewPassword from './components/CreateNewPassword';
import AdminDashboard from './components/AdminDashboard';
import UserRegisterWeb from './components/UserRegisterWeb';
import PasswordSuccess from './components/PasswordSuccess';
import DownloadApp from './components/DownloadApp';

import './style.css';
import RepportPage from './components/RepportPage';

function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}

function App() {
  const getInitialAuth = () => {
    const expiry = localStorage.getItem('authExpiry');
    const isAuth = localStorage.getItem('isAuthenticated') === 'true';
    const now = Date.now();
    if (isAuth && expiry && now < parseInt(expiry, 10)) {
      return true;
    } else {
      localStorage.clear();
      return false;
    }
  };

  const [isAuthenticated, setIsAuthenticated] = useState(getInitialAuth);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail'));
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole'));
  const [userApplication, setUserApplication] = useState(() => localStorage.getItem('userApplication'));
  const [otpEmail, setOtpEmail] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
  if (isAuthenticated && ['/login', '/signup', '/verify-otp'].includes(location.pathname)) {
    if (userRole?.toLowerCase() === 'admin') {
      navigate('/admin-dashboard', { replace: true });
    } else {
      navigate('/qr-generator', { replace: true });
    }
  }
}, [isAuthenticated, userRole, location.pathname, navigate]);


  useEffect(() => {
    const checkAuthExpiry = () => {
      const expiry = localStorage.getItem('authExpiry');
      if (expiry && Date.now() >= parseInt(expiry, 10)) {
        localStorage.clear();
        setIsAuthenticated(false);
        setUserEmail(null);
        setUserRole(null);
        setUserApplication(null);
        navigate('/login', { replace: true });
      }
    };
    const intervalId = setInterval(checkAuthExpiry, 60 * 1000); // vérification toutes les 1 minute
    checkAuthExpiry();
    return () => clearInterval(intervalId);
  }, [navigate]);

  useEffect(() => {
  if (isAuthenticated && ['/login', '/signup', '/verify-otp'].includes(location.pathname)) {
    if (userRole?.toLowerCase() === 'admin') {
      navigate('/admin-dashboard', { replace: true });
    } else {
      navigate('/qr-generator', { replace: true });
    }
  }
}, [isAuthenticated, userRole, location.pathname, navigate]);



  
  const handleLogin = (email, role, application) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    setUserRole(role);
    setUserApplication(application);

    const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes en ms
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userRole', role);
    localStorage.setItem('userApplication', application);
    localStorage.setItem('authExpiry', expiryTime.toString());
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setUserEmail(null);
    setUserRole(null);
    setUserApplication(null);
    navigate('/login', { replace: true });
  };

  const PrivateRoute = ({ children }) => {
    return isAuthenticated ? children : <Navigate to="/login" replace />;
  };
  const authReady = !isAuthenticated || (userEmail && userRole && userApplication);
  if (!authReady) return null; // ou un loader/spinner

  return (
    <>
      <Toolbar userApplication={userApplication} />

      <NavBar isAuthenticated={isAuthenticated} onLogout={handleLogout} />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isAuthenticated ? "/qr-generator" : "/login"} replace />}
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/qr-generator" replace />
              ) : (
                <Login
                  setIsAuthenticated={(auth, email, role, application) => {
                    if (auth) {
                      handleLogin(email, role, application);
                    }
                  }}
                />
              )
            }
          />
          <Route
            path="/signup"
            element={
              isAuthenticated ? (
                <Navigate to="/qr-generator" replace />
              ) : otpEmail ? (
                <Navigate to="/verify-otp" replace />
              ) : (
                <Signup setOtpEmail={setOtpEmail} />
              )
            }
          />
          <Route path="/download" element={<DownloadApp />} />

           <Route path="/verify" element={<VerifyEmail />} />

          <Route
            path="/admin-dashboard"
            element={
              isAuthenticated && userRole?.toLowerCase() === 'admin' ? (
                <AdminDashboard userEmail={userEmail} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="/password-success" element={<PasswordSuccess />} />
          <Route path="/forgot-password" element={<ForgetPassword setOtpEmail={setOtpEmail}/>} />
          <Route path="/create-new-password" element={<CreateNewPassword setOtpEmail={setOtpEmail}/>} />
          <Route
            path="/qr-generator"
            element={
              <PrivateRoute>
                <QrGenerator userEmail={userEmail} userRole={userRole} userApplication={userApplication} />
              </PrivateRoute>
            }
          />
          <Route path="/questions" element={<PrivateRoute><QuestionForm /></PrivateRoute>} />
          <Route path="/static_page" element={<PrivateRoute><StaticPage /></PrivateRoute>} />
          <Route path="/help_page" element={<PrivateRoute><HelpPage /></PrivateRoute>} />
          <Route path="/report" element={<PrivateRoute><RepportPage /></PrivateRoute>} />


          <Route path="/problem-types" element={<PrivateRoute><ProblemTypeForm /></PrivateRoute>} />
          <Route path="/user_register" element={<PrivateRoute><UserRegister /></PrivateRoute>} />
          <Route
            path="/user_register_web"
            element={
              <PrivateRoute>
                <UserRegisterWeb />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to={isAuthenticated ? "/qr-generator" : "/login"} replace />} />
        </Routes>
      </main>
    </>
  );
}


const NavBar = ({ isAuthenticated, onLogout }) => {
  const location = useLocation();

  // 👉 Ne pas afficher la barre sur les pages de vérification et de succès
  const HIDE_ALL = ['/verify', '/password-success'];

  if (HIDE_ALL.includes(location.pathname)) {
    return null; // rien n'est rendu, la navbar disparaît totalement
  }

  const isAdminSection = ['/admin-dashboard', '/user_register_web']
    .includes(location.pathname);

  return (
    <nav className="app-nav">
      {isAuthenticated ? (
        isAdminSection ? (
          <>
            <CustomLink
              to="/admin-dashboard"
              active={location.pathname === '/admin-dashboard'}
            >
              Admin Dashboard
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/user_register_web"
              active={location.pathname === '/user_register_web'}
              style={{
                marginRight: '10px',
                fontWeight: 'bold',
                fontSize: '16px',
                color: '#007bff',
                textDecoration:
                  location.pathname === '/user_register_web'
                    ? 'underline'
                    : 'none',
              }}
            >
              Register user
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <button
              onClick={onLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#dc3545',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <CustomLink
              to="/qr-generator"
              active={location.pathname === '/qr-generator'}
            >
              QR generator
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/questions"
              active={location.pathname === '/questions'}
            >
              Questions
            </CustomLink>


            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/report"
              active={location.pathname === '/report'}
            >
              Report 
            </CustomLink>



            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/problem-types"
              active={location.pathname === '/problem-types'}
            >
              Problem types
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/static_page"
              active={location.pathname === '/static_page'}
            >
              Static page
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/help_page"
              active={location.pathname === '/help_page'}
            >
              Help center
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <CustomLink
              to="/user_register"
              active={location.pathname === '/user_register'}
            >
              Register user
            </CustomLink>
            <span style={{ margin: '0 8px' }}>|</span>
            <button
              onClick={onLogout}
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
        )
      ) : (
        <>
          <CustomLink to="/login" active={location.pathname === '/login'}>
            Login
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/signup" active={location.pathname === '/signup'}>
            Sign Up
          </CustomLink>
          <span style={{ margin: '0 8px' }}>|</span>
          <CustomLink to="/download" active={location.pathname === '/download'}>Download App</CustomLink>

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




export default AppWrapper;
