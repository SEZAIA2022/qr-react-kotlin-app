import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const VerifyEmail = () => {
  const { search } = useLocation();
  const navigate = useNavigate();

  const qp = new URLSearchParams(search);
  const token = qp.get('token') || '';
  const flowParam = (qp.get('flow') || '').toLowerCase(); // "register_user" | "change_email" | "delete_account"

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'ok' | 'fail'
  const [message, setMessage] = useState('');
  const [showLoginButton, setShowLoginButton] = useState(true);

  useEffect(() => {
    if (!token) {
      setStatus('fail');
      setMessage('Missing verification token.');
      return;
    }

    // Choisir l’endpoint selon le flow
    let endpoint = '/api/email/verify'; // défaut: vérification d'inscription
    if (flowParam === 'register_user') {
      endpoint = '/api/email/verify';             // ou '/api/email/verify_register' si c’est ton backend
    } else if (flowParam === 'change_email') {
      endpoint = '/api/verify_change_email';
    } else if (flowParam === 'delete_account') {
      endpoint = '/api/verify_delete_account';
    }

    (async () => {
      try {
        const res = await axios.post(endpoint, { token });
        const ok = res.status === 200 && res.data;

        if (ok) {
          setStatus('ok');

          // Message par défaut selon le flow
          let defaultMsg = 'Your email has been verified.';
          if (flowParam === 'change_email') defaultMsg = 'Your email address has been changed successfully.';
          if (flowParam === 'delete_account') defaultMsg = 'Your account has been deleted.';

          setMessage(res.data.message || defaultMsg);

          // Afficher le bouton login seulement si ça a du sens
          // (pas pour delete_account ; pour change_email oui ; pour register_user à toi de voir)
          if (flowParam === 'delete_account') {
            setShowLoginButton(false);
          } else if (flowParam === 'register_user') {
            // tu peux mettre false si tu veux rediriger automatiquement vers /login
            setShowLoginButton(true);
          } else {
            setShowLoginButton(true);
          }
        } else {
          setStatus('fail');
          setMessage((res.data && res.data.message) || 'Invalid or expired link.');
        }
      } catch (err) {
        const apiMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Verification failed.';
        setStatus('fail');
        setMessage(apiMsg);
      }
    })();
  }, [token, flowParam]);

  if (status === 'verifying') {
    return (
      <div style={containerStyle}>
        <h2>Verifying your request…</h2>
        <p>Please wait a moment.</p>
      </div>
    );
  }

  if (status === 'ok') {
    return (
      <div style={containerStyle}>
        <h2>✅ Success</h2>
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
      <Link to="/login" style={{ color: '#007bff', fontWeight: 'bold' }}>
        Back to Login
      </Link>
    </div>
  );
};

// Styles
const containerStyle = {
  maxWidth: '420px',
  margin: '50px auto',
  padding: '22px',
  backgroundColor: '#f9faff',
  borderRadius: '10px',
  boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  textAlign: 'center',
};
const buttonStyle = {
  marginTop: '18px',
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 600,
  border: 'none',
  padding: '12px 18px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '16px',
};

export default VerifyEmail;
