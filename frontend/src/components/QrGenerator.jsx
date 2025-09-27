import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QrGenerator = ({ userEmail }) => {
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [role, setRole] = useState("");
  const [application, setApplication] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/generate_qr`, {
        count: numCount,
        application: application
      });
      setResults(res.data);
      setShowHistory(false);
    } catch (error) {
      console.error("Error generating QR codes:", error);
      setErrorMsg("Error generating QR codes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setErrorMsg("");
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/qr_history`, {
        params: { application }
      });
      setHistory(res.data.data || []);
      setShowHistory(true);
      setResults([]);
    } catch (error) {
      console.error("Error fetching QR code history:", error);
      setErrorMsg("Error fetching QR code history. Please try again.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const printQRCode = (qr) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>Print QR Code</title></head>
        <body style="text-align:center; font-family: Arial;">
          <h2>QR Code: ${qr.image_path.split('/').pop()}</h2>
          <img src="${process.env.REACT_APP_API_URL}${qr.image_path}" alt="QR code" width="300" height="300" />
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '20px' }}>QR Code Generator</h2>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setShowHistory(false)}
          style={{ ...buttonStyle, marginRight: '10px', backgroundColor: showHistory ? '#6c757d' : '#007bff' }}
        >
          Generate QR Codes
        </button>
        <button
          onClick={fetchHistory}
          style={{ ...buttonStyle, backgroundColor: showHistory ? '#007bff' : '#6c757d' }}
          disabled={loadingHistory}
        >
          {loadingHistory ? "Loading..." : "View History"}
        </button>
      </div>

      {!showHistory && (
        <>
          <div style={inputContainerStyle}>
            <input
              type="number"
              min="1"
              value={count}
              onChange={e => setCount(e.target.value)}
              style={inputStyle}
              aria-label="Number of QR codes to generate"
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
                  <p style={{ fontWeight: '600', marginBottom: '8px' }}>
                    {qr.image_path.split('/').pop()}
                  </p>

                  <img
                    src={`${process.env.REACT_APP_API_URL}${qr.image_path}?v=${qr.code}`}
                    alt={`QR code for ${qr.code}`}
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
        </>
      )}

      {showHistory && (
        <>
          {errorMsg && <p style={errorStyle}>{errorMsg}</p>}
          {loadingHistory && <p style={loadingStyle}>Loading history… ⏳</p>}

          {history.length === 0 && !loadingHistory && <p>No QR codes in history.</p>}

          <div style={resultsContainerStyle}>
            {history.map(qr => (
              <div key={qr.code} style={qrItemStyle}>
                <p style={{ fontWeight: '600', marginBottom: '8px' }}>
                    {qr.image_path.split('/').pop()} — <span style={{ color: qr.status === 'active' ? 'green' : 'red' }}>
                    {qr.status}
                  </span>
                </p>

                <img
                  src={`${process.env.REACT_APP_API_URL}${qr.image_path}`}
                  alt={`QR code for ${qr.code}`}
                  width="150"
                  height="150"
                  style={qrImageStyle}
                  onLoad={e => e.currentTarget.classList.add('loaded')}
                />
                <button
                  style={downloadBtnStyle}
                  onClick={() => printQRCode(qr)}
                >
                  Print
                </button>
              </div>
            ))}
          </div>
        </>
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

// Styles
const containerStyle = {
  maxWidth: '650px',
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
