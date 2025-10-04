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

  const VERIFY_URL = mode === 'app' ? '/api/verify_forget' : '/api/password/verify';
  const RESET_URL  = mode === 'app' ? '/api/change-password' : '/api/password/reset';

  const validatePassword = (pwd) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pwd);

  useEffect(() => {
    if (!token) {
      toast.error('Lien de réinitialisation manquant. Merci d’utiliser le lien reçu par e-mail.');
      navigate('/forgot-password', { replace: true });
      return;
    }
    (async () => {
      try {
        const res = await axios.post(VERIFY_URL, { token });
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
          navigate('/password-success', { replace: true });
        } else {
          toast.success(res.data?.message || 'Mot de passe mis à jour. Redirection…');
          setTimeout(() => navigate('/login', { replace: true }), 1500);
        }
      } else {
        toast.error(res.data?.error || 'Erreur inattendue.');
      }
    } catch (err) {
      const code = err?.response?.data?.error || err?.response?.data?.message;
      const friendly =
        code === 'weak_password' ? 'Mot de passe trop faible.' :
        code === 'password_mismatch' ? 'Les mots de passe ne correspondent pas.' :
        code === 'expired' ? 'Le lien a expiré. Demandez un nouveau lien.' :
        'Erreur serveur.';
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container--sm card card--panel">
      <h2 className="title" style={{ marginBottom: 12 }}>Créer un nouveau mot de passe</h2>

      {verifying ? (
        <p className="message message--info">Vérification du lien…</p>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input input--with-eye"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="eye-btn"
              aria-label={showPassword ? 'Masquer' : 'Afficher'}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input input--with-eye"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(v => !v)}
              className="eye-btn"
              aria-label={showConfirmPassword ? 'Masquer' : 'Afficher'}
            >
              {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <button type="submit" disabled={loading} className="btn btn-lg">
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      <p className="mt-10">
        Vous vous en souvenez ? <Link to="/login">Se connecter</Link>
      </p>

      <ToastContainer position="top-center" autoClose={4000} />
    </div>
  );
};

export default CreateNewPassword;
