import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const VerifyEmail = () => {
  const { search } = useLocation();
  const navigate = useNavigate();

  const qp = new URLSearchParams(search);
  const token = qp.get('token') || '';
  const flowParam = qp.get('flow') || ''; // "register_user" si lien depuis /register

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'ok' | 'fail'
  const [message, setMessage] = useState('');
  const [showLoginButton, setShowLoginButton] = useState(true);

  useEffect(() => {
    if (!token) {
      setStatus('fail');
      setMessage('Missing verification token.');
      return;
    }

    const endpoint =
      flowParam === 'register_user'
        ? '/api/email/verify_register'
        : '/api/email/verify';

    (async () => {
      try {
        const res = await axios.post(endpoint, { token });
        const ok = res.status === 200 && res.data && res.data.status === 'success';
        if (ok) {
          setStatus('ok');
          setMessage((res.data && res.data.message) || 'Your email has been verified.');

          // Cacher le bouton si flux register_user
          const flowFromApi = (res.data && res.data.flow) || '';
          const isRegisterFlow =
            flowParam === 'register_user' || flowFromApi === 'register_user';
          setShowLoginButton(!isRegisterFlow);
        } else {
          setStatus('fail');
          setMessage((res.data && res.data.message) || 'Invalid or expired link.');
        }
      } catch (err) {
        const apiMsg =
          (err.response && err.response.data && err.response.data.message) ||
          'Verification failed.';
        setStatus('fail');
        setMessage(apiMsg);
      }
    })();
  }, [token, flowParam]);

  if (status === 'verifying') {
    return (
      <div style={containerStyle}>
        <h2>Verifying your email…</h2>
        <p>Please wait a moment.</p>
      </div>
    );
  }

  if (status === 'ok') {
    return (
      <div style={containerStyle}>
        <h2>✅ Email Verified</h2>
        <p>{message}</p>
        {showLoginButton && (
          <button style={buttonStyle} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2>❌ Verification Failed</h2>
      <p>{message}</p>
      <Link to="/signup" style={{ color: '#007bff', fontWeight: 'bold' }}>
        Try signing up again
      </Link>
    </div>
  );
};

// Styles (JS pur)
const containerStyle = {
  maxWidth: '400px',
  margin: '50px auto',
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  textAlign: 'center',
};
const buttonStyle = {
  marginTop: '20px',
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px 20px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px',
};

export default VerifyEmail;
