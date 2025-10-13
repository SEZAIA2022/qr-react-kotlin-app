import React, { useState, useEffect } from 'react';
import axios from 'axios';

const LIMIT = 12; // 12 éléments par page

const QrGenerator = () => {
  const [count, setCount] = useState(1);

  // Génération (courant)
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageGen, setPageGen] = useState(0);

  // Historique
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pageHist, setPageHist] = useState(0);

  // Contexte / erreurs
  const [errorMsg, setErrorMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [role, setRole] = useState('');
  const [application, setApplication] = useState('');

  useEffect(() => {
    const storedRole = localStorage.getItem('userRole') || '';
    const storedApp  = localStorage.getItem('userApplication') || '';
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
    setPageGen(0); // reset pagination
  
    console.log("hello " + application);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/generate_qr`, {
        count: numCount,
        application,
      });
      setResults(res.data || []);
      setShowHistory(false);
    } catch {
      setErrorMsg('Error generating QR codes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setErrorMsg('');
    setLoadingHistory(true);
    setResults([]); // masque la liste de génération
    setPageHist(0); // reset pagination
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/qr_history`, {
        params: { application },
      });
      setHistory(res.data?.data || []);
      setShowHistory(true);
    } catch {
      setErrorMsg('Error fetching QR code history. Please try again.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const printQRCode = (qr) => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <body style="
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          font-family: Arial;
        ">
          <img src="${process.env.REACT_APP_API_URL}${qr.image_path}" alt="QR code" width="300" height="300" />
        </body>
      </html>

    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  // ===== Pagination (génération) =====
  const totalGen = results.length;
  const totalPagesGen = Math.max(1, Math.ceil(totalGen / LIMIT));
  const pageGenClamped = Math.min(pageGen, totalPagesGen - 1);
  const genStart = pageGenClamped * LIMIT;
  const genEnd   = Math.min(totalGen, genStart + LIMIT);
  const pageResults = results.slice(genStart, genEnd);

  // ===== Pagination (historique) =====
  const totalHist = history.length;
  const totalPagesHist = Math.max(1, Math.ceil(totalHist / LIMIT));
  const pageHistClamped = Math.min(pageHist, totalPagesHist - 1);
  const histStart = pageHistClamped * LIMIT;
  const histEnd   = Math.min(totalHist, histStart + LIMIT);
  const pageHistory = history.slice(histStart, histEnd);

  const msgClass = errorMsg ? 'message message--error' : 'message message--info';

  return (
    <div className="container--xl card card--panel">
      <h2 className="title">QR Code Generator</h2>

      {/* Switcher centré */}
      <div className="segmented-bar">
        <div className="segmented segmented--pill" role="tablist" aria-label="QR views">
          <button
            type="button"
            role="tab"
            aria-selected={!showHistory}
            className={`segmented__btn ${!showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(false)}
          >
            Generate QR Codes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showHistory}
            className={`segmented__btn ${showHistory ? 'active' : ''}`}
            onClick={fetchHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? 'Loading...' : 'View History'}
          </button>
        </div>
      </div>

      {!showHistory ? (
        <>
          {/* Count + Generate */}
          <div className="qr-inputrow">
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="input"
              placeholder="1"
              aria-label="Number of QR codes to generate"
            />
            <button
              type="button"
              onClick={generateQR}
              disabled={loading}
              className={`btn btn--primary ${loading ? 'btn--muted' : ''}`}
              aria-busy={loading}
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {errorMsg && <p className={msgClass}>{errorMsg}</p>}
          {loading && <p className="message message--info">Generation in progress… ⏳</p>}

          {results.length > 0 && (
            <>
              {/* Pagination haut */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageGen((p) => Math.max(0, p - 1))}
                  disabled={pageGenClamped === 0}
                >
                  ← Previous
                </button>
                <span>{genStart + 1}-{genEnd} of {totalGen}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageGen((p) => (p + 1 < totalPagesGen ? p + 1 : p))}
                  disabled={pageGenClamped >= totalPagesGen - 1}
                >
                  Next →
                </button>
              </div>

              <div className="results">
                {pageResults.map((qr) => (
                  <div key={qr.code} className="qr-item">
                    <p className="qr-name">{qr.image_path.split('/').pop()}</p>
                    <div className="qr-box">
                      <img
                        src={`${process.env.REACT_APP_API_URL}${qr.image_path}?v=${qr.code}`}
                        alt={`QR code for ${qr.code}`}
                        className="qr-image img-fade"
                        onLoad={(e) => e.currentTarget.classList.add('loaded')}
                      />
                    </div>
                    <button
                      type="button"
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

              {/* Pagination bas */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageGen((p) => Math.max(0, p - 1))}
                  disabled={pageGenClamped === 0}
                >
                  ← Previous
                </button>
                <span>Page {pageGenClamped + 1}/{totalPagesGen}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageGen((p) => (p + 1 < totalPagesGen ? p + 1 : p))}
                  disabled={pageGenClamped >= totalPagesGen - 1}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {errorMsg && <p className={msgClass}>{errorMsg}</p>}
          {loadingHistory && <p className="message message--info">Loading history… ⏳</p>}
          {!loadingHistory && history.length === 0 && (
            <p className="message message--info">No QR codes in history.</p>
          )}

          {history.length > 0 && (
            <>
              {/* Pagination haut */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => Math.max(0, p - 1))}
                  disabled={pageHistClamped === 0}
                >
                  ← Previous
                </button>
                <span>{histStart + 1}-{histEnd} of {totalHist}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => (p + 1 < totalPagesHist ? p + 1 : p))}
                  disabled={pageHistClamped >= totalPagesHist - 1}
                >
                  Next →
                </button>
              </div>

              <div className="results">
                {pageHistory.map((qr) => (
                  <div key={qr.code} className="qr-item">
                    <p className="qr-name">
                      {qr.image_path.split('/').pop()} —{' '}
                      <span className={`status ${qr.status === 'active' ? 'status--ok' : 'status--warn'}`}>
                        {qr.status}
                      </span>
                    </p>
                    <div className="qr-box">
                      <img
                        src={`${process.env.REACT_APP_API_URL}${qr.image_path}`}
                        alt={`QR code for ${qr.code}`}
                        className="qr-image img-fade"
                        onLoad={(e) => e.currentTarget.classList.add('loaded')}
                      />
                    </div>
                    <button type="button" className="download-btn" onClick={() => printQRCode(qr)}>
                      Print
                    </button>
                  </div>
                ))}
              </div>

              {/* Pagination bas */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => Math.max(0, p - 1))}
                  disabled={pageHistClamped === 0}
                >
                  ← Previous
                </button>
                <span>Page {pageHistClamped + 1}/{totalPagesHist}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => (p + 1 < totalPagesHist ? p + 1 : p))}
                  disabled={pageHistClamped >= totalPagesHist - 1}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default QrGenerator;
