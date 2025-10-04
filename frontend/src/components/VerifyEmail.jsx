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
      endpoint = '/api/email/verify';
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
          if (flowParam === 'delete_account') {
            setShowLoginButton(false);
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
      <div className="container--sm card card--panel text-center">
        <h2 className="title">Verifying your request…</h2>
        <p className="message message--info">Please wait a moment.</p>
      </div>
    );
  }

  if (status === 'ok') {
    return (
      <div className="container--sm card card--panel text-center">
        <h2 className="title">✅ Success</h2>
        <p className="message message--success">{message}</p>

        {showLoginButton && (
          <button className="btn btn-lg mt-10" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="container--sm card card--panel text-center">
      <h2 className="title">❌ Verification Failed</h2>
      <p className="message message--error">{message}</p>
      <Link to="/login" className="btn btn-ghost mt-10">
        Back to Login
      </Link>
    </div>
  );
};

export default VerifyEmail;
