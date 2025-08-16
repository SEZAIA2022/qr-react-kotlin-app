import React, { useState, useEffect, useRef } from 'react'; 
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const VerifyOtp = ({ setOtpEmail }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  const emailFromState = location.state?.email;
  const previousPageFromState = location.state?.previousPage;

  useEffect(() => {
    const handlePopState = (event) => {
      navigate('/login', { replace: true });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  useEffect(() => {
    if (emailFromState) {
      sessionStorage.setItem('otpEmail', emailFromState);
    }
    if (previousPageFromState) {
      sessionStorage.setItem('previousPage', previousPageFromState);
    }
  }, [emailFromState, previousPageFromState]);

  const email = emailFromState || sessionStorage.getItem('otpEmail');
  const previousPage = previousPageFromState || sessionStorage.getItem('previousPage');

  useEffect(() => {
    if (countdown === 0) {
      clearInterval(countdownRef.current);
      setCanResend(true);
    }
  }, [countdown]);

  const startCountdown = (seconds) => {
    setCountdown(seconds);
    setCanResend(false);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!email) {
      toast.error('Email is required to verify OTP.');
      setLoading(false);
      return;
    }

    try {
      const endpoint =
        previousPage === 'forget' ? '/api/verify_forget_web' : '/api/verify_otp';

      const res = await axios.post(`${process.env.REACT_APP_API_URL}${endpoint}`, {
        email,
        otp,
      });

      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Verification successful.');
        setOtpEmail(null);

        sessionStorage.removeItem('otpEmail');
        sessionStorage.removeItem('previousPage');

        if (previousPage === 'forget') {
          navigate('/create-new-password', { state: { email }, replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } else {
        toast.error(res.data.message || 'Verification failed.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Server error.');
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (!canResend || !email) return;

    setResendLoading(true);
    setCanResend(false);

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/resend_otp_web`, {
        email,
        previous_page: previousPage,
        application_name: 'myAppWeb',
      });

      toast.success(res.data.message || 'OTP resent successfully.');
      startCountdown(30);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend OTP.');
      setCanResend(true);
    }

    setResendLoading(false);
  };

  return (
    <div style={containerStyle}>
      <h2>Verify OTP</h2>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>

      <p style={{ marginTop: 15, fontSize: 14 }}>
        Didn’t receive the OTP?{' '}
        <span
          onClick={!canResend || resendLoading ? null : handleResend}
          style={{
            color: !canResend || resendLoading ? '#6c757d' : '#007bff',
            textDecoration: !canResend || resendLoading ? 'none' : 'underline',
            cursor: !canResend || resendLoading ? 'default' : 'pointer',
            fontWeight: 'bold',
            userSelect: 'none',
          }}
        >
          {resendLoading
            ? 'Resending...'
            : canResend
            ? 'Resend OTP'
            : `Please wait ${countdown}s`}
        </span>
      </p>

      {/* ToastContainer pour afficher les toasts */}
      <ToastContainer position="top-center" autoClose={4000} />
    </div>
  );
};

// Styles (inchangés)
const containerStyle = {
  maxWidth: '400px',
  margin: '30px auto',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
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

export default VerifyOtp;
