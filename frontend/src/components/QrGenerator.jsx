import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QrGenerator = ({ userEmail }) => {
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [role, setRole] = useState("");
  const [application, setApplication] = useState("");

  useEffect(() => {
    const storedRole = localStorage.getItem('userRole') || '';
    const storedApp = localStorage.getItem('userApplication') || '';
    setRole(storedRole);
    setApplication(storedApp);
  }, []);

  const generateQR = async () => {
    const numCount = parseInt(count, 10);
    if (isNaN(numCount) || numCount < 1) {
      setErrorMsg("Please enter a valid number (≥ 1).");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    setResults([]);

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/generate_qr`, { count: numCount });
      setResults(res.data);
    } catch (error) {
      console.error("Error generating QR codes :", error);
      setErrorMsg("Error generating QR codes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '20px' }}>QR Code generator</h2>

      {userEmail && (
        <p style={{ fontWeight: '600', marginBottom: '10px' }}>
          Connecté en tant que : <strong>{userEmail}</strong>
        </p>
      )}

      {(role || application) && (
        <p style={{ marginBottom: '20px', fontWeight: '500', color: '#555' }}>
          Role: <strong>{role || 'N/A'}</strong> — Application: <strong>{application || 'N/A'}</strong>
        </p>
      )}

      <div style={inputContainerStyle}>
        <input
          type="number"
          min="1"
          value={count}
          onChange={e => setCount(e.target.value)}
          style={inputStyle}
          aria-label="Nombre de QR codes à générer"
        />
        <button
          onClick={generateQR}
          disabled={loading}
          style={buttonStyle}
          aria-busy={loading}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {errorMsg && <p style={errorStyle}>{errorMsg}</p>}

      {loading && <p style={loadingStyle}>Generation in progress… ⏳</p>}

      {results.length > 0 && (
        <div style={resultsContainerStyle}>
          {results.map(qr => (
            <div key={qr.code} style={qrItemStyle}>
              <p style={{ fontWeight: '600', marginBottom: '8px' }}>{qr.code}</p>
              <img
                src={`${process.env.REACT_APP_API_URL}${qr.image_path}`}
                alt={`QR code pour ${qr.code}`}
                width="150"
                height="150"
                style={qrImageStyle}
                onLoad={e => e.currentTarget.classList.add('loaded')}
              />
              <button
                style={downloadBtnStyle}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `${process.env.REACT_APP_API_URL}${qr.image_path}`;
                  link.download = `${qr.code}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        img {
          opacity: 0;
          transition: opacity 0.4s ease-in;
        }
        img.loaded {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

const containerStyle = {
  maxWidth: '600px',
  margin: '30px auto 40px',
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '10px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  textAlign: 'center',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const inputContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '15px',
};

const inputStyle = {
  width: '90px',
  padding: '8px 12px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  textAlign: 'center',
  outlineColor: '#007bff',
};

const buttonStyle = {
  padding: '9px 18px',
  fontSize: '16px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#007bff',
  color: '#fff',
  cursor: 'pointer',
  transition: 'background-color 0.3s',
  fontWeight: '600',
};

const errorStyle = {
  color: '#d9534f',
  fontWeight: '600',
  marginBottom: '15px',
};

const loadingStyle = {
  color: '#555',
  fontStyle: 'italic',
  marginTop: '10px',
};

const resultsContainerStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '25px',
  marginTop: '25px',
};

const qrItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: '150px',
  padding: '15px',
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
};

const qrImageStyle = {
  border: '1.5px solid #ccc',
  borderRadius: '12px',
  marginBottom: '10px',
};

const downloadBtnStyle = {
  padding: '7px 16px',
  fontSize: '14px',
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background-color 0.3s',
  fontWeight: '600',
};

export default QrGenerator;
