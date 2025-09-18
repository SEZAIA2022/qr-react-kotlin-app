import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CreateNewPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // ⬇️ Récupérer le token dans l’URL: /reset?token=XXXX
  const token = new URLSearchParams(location.search).get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const validatePassword = (pwd) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pwd);

  // ✅ Vérifier le token au montage pour afficher/masquer le formulaire
  useEffect(() => {
    if (!token) {
      toast.error('Missing reset token. Please use the link from your email.');
      navigate('/forgot-password', { replace: true });
      return;
    }
    (async () => {
      try {
        const res = await axios.post(`/api/password/verify`, { token });
        if (res.status === 200 && res.data?.ok) {
          setVerifying(false); // token OK → afficher le formulaire
        } else {
          toast.error('Invalid or expired link.');
          navigate('/forgot-password', { replace: true });
        }
      } catch (e) {
        toast.error(e.response?.data?.error || 'Invalid or expired link.');
        navigate('/forgot-password', { replace: true });
      }
    })();
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirmPassword) return toast.error('Please fill in both fields.');
    if (!validatePassword(password)) return toast.error('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.');
    if (password !== confirmPassword) return toast.error('Passwords do not match.');
    if (!token) return toast.error('Missing reset token.');

    setLoading(true);
    try {
      const res = await axios.post(`/api/password/reset`, {
        token,
        new_password: password,
        confirm_password: confirmPassword,
      });

      if (res.status === 200) {
        toast.success(res.data.message || 'Password updated successfully. Redirecting to login...');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      } else {
        toast.error(res.data?.error || 'Unexpected error.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Server error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Create New Password</h2>

      {verifying ? (
        <p>Validating your link…</p>
      ) : (
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '40px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={eyeButtonStyle}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '40px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={eyeButtonStyle}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Saving...' : 'Save Password'}
          </button>
        </form>
      )}

      <p style={{ marginTop: '10px' }}>
        Remembered your password? <Link to="/login">Login</Link>
      </p>
      <ToastContainer position="top-center" autoClose={4000} />
    </div>
  );
};


// Styles
const containerStyle = {
  maxWidth: '400px',
  margin: 'auto',
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
};

const inputStyle = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const eyeButtonStyle = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '18px',
};

const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px',
};

export default CreateNewPassword;
