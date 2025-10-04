import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QrGenerator = () => {
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [role, setRole] = useState('');
  const [application, setApplication] = useState('');

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
      setErrorMsg('Please enter a valid number (≥ 1).');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    setResults([]);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/generate_qr`, {
        count: numCount,
        application,
      });
      setResults(res.data);
      setShowHistory(false);
    } catch (error) {
      setErrorMsg('Error generating QR codes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setErrorMsg('');
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/qr_history`, {
        params: { application },
      });
      setHistory(res.data.data || []);
      setShowHistory(true);
      setResults([]);
    } catch (error) {
      setErrorMsg('Error fetching QR code history. Please try again.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const printQRCode = (qr) => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>Print QR Code</title></head>
        <body style="text-align:center; font-family: Arial;">
          <h2>QR Code: ${qr.image_path.split('/').pop()}</h2>
          <img src="${process.env.REACT_APP_API_URL}${qr.image_path}" alt="QR code" width="300" height="300" />
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const msgClass = errorMsg ? 'message message--error' : 'message message--info';

  return (
    <div className="container--md card card--panel">
      <h2 className="title">QR Code Generator</h2>

      {/* Switcher Generate / History */}
      <div className="segmented mt-10">
        <button
          className={`segmented__btn ${!showHistory ? 'active' : ''}`}
          onClick={() => setShowHistory(false)}
        >
          Generate QR Codes
        </button>
        <button
          className={`segmented__btn ${showHistory ? 'active' : ''}`}
          onClick={fetchHistory}
          disabled={loadingHistory}
        >
          {loadingHistory ? 'Loading...' : 'View History'}
        </button>
      </div>

      {!showHistory && (
        <>
          <div className="qr-inputrow">
            <input
              type="number"
              min="1"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="input qr-inputrow__field"
              aria-label="Number of QR codes to generate"
            />
            <button
              onClick={generateQR}
              disabled={loading}
              className={`btn btn-lg ${loading ? 'btn--muted' : ''}`}
              aria-busy={loading}
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>

          {errorMsg && <p className={msgClass}>{errorMsg}</p>}
          {loading && <p className="message message--info">Generation in progress… ⏳</p>}

          {results.length > 0 && (
            <div className="results">
              {results.map((qr) => (
                <div key={qr.code} className="qr-item">
                  <p className="qr-name">{qr.image_path.split('/').pop()}</p>

                  <img
                    src={`${process.env.REACT_APP_API_URL}${qr.image_path}?v=${qr.code}`}
                    alt={`QR code for ${qr.code}`}
                    width="150"
                    height="150"
                    className="qr-image img-fade"
                    onLoad={(e) => e.currentTarget.classList.add('loaded')}
                  />
                  <button
                    className="download-btn"
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
          {errorMsg && <p className={msgClass}>{errorMsg}</p>}
          {loadingHistory && <p className="message message--info">Loading history… ⏳</p>}
          {!loadingHistory && history.length === 0 && (
            <p className="message message--info">No QR codes in history.</p>
          )}

          <div className="results">
            {history.map((qr) => (
              <div key={qr.code} className="qr-item">
                <p className="qr-name">
                  {qr.image_path.split('/').pop()} —{' '}
                  <span className={`status ${qr.status === 'active' ? 'status--ok' : 'status--warn'}`}>
                    {qr.status}
                  </span>
                </p>

                <img
                  src={`${process.env.REACT_APP_API_URL}${qr.image_path}`}
                  alt={`QR code for ${qr.code}`}
                  width="150"
                  height="150"
                  className="qr-image img-fade"
                  onLoad={(e) => e.currentTarget.classList.add('loaded')}
                />
                <button className="download-btn" onClick={() => printQRCode(qr)}>
                  Print
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default QrGenerator;
