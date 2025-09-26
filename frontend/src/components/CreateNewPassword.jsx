import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CreateNewPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const qs = new URLSearchParams(location.search);
  const token = qs.get('token') || '';
  const mode  = (qs.get('mode') || qs.get('src') || '').toLowerCase(); // "app" ou "" (web)

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);

  // Endpoints selon la source :
  // - web (par défaut) => anciens endpoints
  // - app              => nouveaux endpoints
  const VERIFY_URL = mode === 'app' ? '/api/verify_forget' : '/api/password/verify';
  const RESET_URL  = mode === 'app' ? '/api/change-password' : '/api/password/reset';

  const validatePassword = (pwd) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pwd);

  // Vérifier le token au montage (affiche le formulaire si OK)
  useEffect(() => {
    if (!token) {
      toast.error('Lien de réinitialisation manquant. Merci d’utiliser le lien reçu par e-mail.');
      navigate('/forgot-password', { replace: true });
      return;
    }
    (async () => {
      try {
        const res = await axios.post(VERIFY_URL, { token });
        // /verify_forget → { ok: true } ; /password/verify → { ok: true }
        if (res.status === 200 && (res.data?.ok || res.data?.status === 'success')) {
          setVerifying(false);
        } else {
          toast.error('Lien invalide ou expiré.');
          navigate('/forgot-password', { replace: true });
        }
      } catch (e) {
        const msg = e?.response?.data?.error || e?.response?.data?.message || 'Lien invalide ou expiré.';
        toast.error(msg);
        navigate('/forgot-password', { replace: true });
      }
    })();
  }, [token, VERIFY_URL, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirmPassword) return toast.error('Veuillez remplir les deux champs.');
    if (!validatePassword(password))
      return toast.error("Mot de passe trop faible : 8+ caractères, majuscule, chiffre, caractère spécial requis.");
    if (password !== confirmPassword) return toast.error('Les mots de passe ne correspondent pas.');
    if (!token) return toast.error('Lien de réinitialisation manquant.');

    setLoading(true);
    try {
      const res = await axios.post(RESET_URL, {
        token,
        new_password: password,
        confirm_password: confirmPassword,
      });

      if (res.status === 200) {
        if (mode === 'app') {
          // 🔁 Flux mobile → aller sur la page de succès au même style
          navigate('/password-success', { replace: true });
        } else {
          // 🌐 Flux web → comportement existant
          toast.success(res.data?.message || 'Mot de passe mis à jour. Redirection…');
          setTimeout(() => navigate('/login', { replace: true }), 1500);
        }
      } else {
        toast.error(res.data?.error || 'Erreur inattendue.');
      }
    } catch (err) {
      const code = err?.response?.data?.error || err?.response?.data?.message;
      const friendly =
        code === 'weak_password'
          ? "Mot de passe trop faible."
          : code === 'password_mismatch'
          ? 'Les mots de passe ne correspondent pas.'
          : code === 'expired'
          ? 'Le lien a expiré. Demandez un nouveau lien.'
          : 'Erreur serveur.';
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Créer un nouveau mot de passe</h2>

      {verifying ? (
        <p>Vérification du lien…</p>
      ) : (
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '40px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={eyeButtonStyle}
              aria-label={showPassword ? 'Masquer' : 'Afficher'}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '40px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={eyeButtonStyle}
              aria-label={showConfirmPassword ? 'Masquer' : 'Afficher'}
            >
              {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      <p style={{ marginTop: '10px' }}>
        Vous vous en souvenez ? <Link to="/login">Se connecter</Link>
      </p>
      <ToastContainer position="top-center" autoClose={4000} />
    </div>
  );
};

// Styles (inchangés)
const containerStyle = { maxWidth: '400px', margin: 'auto', padding: '20px', backgroundColor: '#f9faff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" };
const formStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const inputStyle = { padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1.5px solid #ccc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const eyeButtonStyle = { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' };
const buttonStyle = { backgroundColor: '#007bff', color: '#fff', fontWeight: 'bold', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' };

export default CreateNewPassword;
