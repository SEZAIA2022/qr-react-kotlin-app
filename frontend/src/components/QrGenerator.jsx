import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from "jspdf";


const LIMIT = 12; // 12 éléments par page

const QrGenerator = () => {
  const [count, setCount] = useState(1);

  // Génération (courant)
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageGen, setPageGen] = useState(0);
  const [qrSize, setQrSize] = useState(3);

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
        size: qrSize,
      });
      const generated = res.data || [];
      setResults(generated);
      setShowHistory(false);



    } catch {
      setErrorMsg('Error generating QR codes. Please try again.');
    } finally {
      setLoading(false);
    }
  };
 
  const deleteQRCode = async (qrCode) => {
    if (!window.confirm('Do you really want to delete this QR code?')) return;


    try {
    await axios.delete(`${process.env.REACT_APP_API_URL}/api/qr/${qrCode}`);
    // Retirer le QR code supprimé de l'affichage
    setHistory((prev) => prev.filter((qr) => qr.code !== qrCode));
    } catch (err) {
    setErrorMsg('Error deleting the QR code.');
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
        <head>
          <meta charset="utf-8" />
          <title>Print QR</title>
          <style>
            @page {
              margin: 0;
              size: auto;
            }
            body {
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              flex-direction: column;
            }
            img {
              width: ${qr.size_cm}cm;
              height: ${qr.size_cm}cm;
              image-rendering: pixelated;
            }
            div {
              margin-top: 10px;
              font-style: italic;
              font-family: Arial, sans-serif;
            }
          </style>
        </head>
        <body>
          <img src="${process.env.REACT_APP_API_URL}${qr.image_path}" alt="QR code" />
          <div>Assist by scan</div>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
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
  // Convertit cm -> mm
const cmToMm = (cm) => cm * 10;

// Charge une image depuis ton API en BLOB (évite les soucis CORS/canvas)
const loadImageAsDataURL = async (url) => {
  const resp = await fetch(url, { mode: "cors" }); // ton backend doit autoriser CORS
  if (!resp.ok) throw new Error("Failed to load image: " + url);

  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result); // dataURL
    reader.readAsDataURL(blob);
  });
};

const downloadSingleQrPdf = async (qr) => {
  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();   // 210
    const pageH = pdf.internal.pageSize.getHeight();  // 297

    const sizeCm = qr.size_cm ?? qrSize;
    const qrMm = cmToMm(sizeCm);

    const imgUrl = `${process.env.REACT_APP_API_URL}${qr.image_path}?v=${qr.code}`;
    const dataUrl = await loadImageAsDataURL(imgUrl);

    // centrer le QR
    const x = (pageW - qrMm) / 2;
    const y = 45; // marge top (tu peux ajuster)

    pdf.addImage(dataUrl, "PNG", x, y, qrMm, qrMm);

    // texte dessous
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(14);
    pdf.text("Assist by scan", pageW / 2, y + qrMm + 12, { align: "center" });

    pdf.save(`${qr.code}.pdf`);
  } catch (e) {
    console.error(e);
    setErrorMsg("Single PDF download failed. Check CORS / image access.");
  }
};


const exportQrsToA4Pdf = async (qrList, sizeCm) => {
  if (!qrList?.length) return;

  setErrorMsg("");
  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();   // 210
    const pageH = pdf.internal.pageSize.getHeight();  // 297

    const margin = 10;   // mm
    const gap = 4;       // mm

    const qrMm = cmToMm(sizeCm); // ex: 1.5cm => 15mm

    // ✅ label settings
    const label = "Assist by scan";
    const fontSize = sizeCm <= 1.5 ? 7 : 9;     // petit QR => petit texte
    const lineHeight = 3.2;                      // mm (approx)
    const labelTopGap = 2.5;                     // mm sous le QR
    const labelMaxWidth = qrMm;                  // ✅ wrap dans largeur du QR

    // Pré-calcul: combien de lignes aura le texte (avec wrap)
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(fontSize);
    const labelLinesExample = pdf.splitTextToSize(label, labelMaxWidth);
    const labelBlockH = labelLinesExample.length * lineHeight;

    // ✅ Hauteur d’une cellule = QR + espace + label + gap
    const cellH = qrMm + labelTopGap + labelBlockH + gap;
    const cellW = qrMm + gap;

    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const cols = Math.max(1, Math.floor((usableW + gap) / cellW));
    const rows = Math.max(1, Math.floor((usableH + gap) / cellH));
    const perPage = cols * rows;

    // centrer la grille
    const gridW = cols * qrMm + (cols - 1) * gap;
    const gridH = rows * (qrMm + labelTopGap + labelBlockH) + (rows - 1) * gap;

    const startX = margin + (usableW - gridW) / 2;
    const startY = margin + (usableH - gridH) / 2;

    for (let i = 0; i < qrList.length; i++) {
      const indexInPage = i % perPage;

      if (i > 0 && indexInPage === 0) pdf.addPage();

      const r = Math.floor(indexInPage / cols);
      const c = indexInPage % cols;

      const x = startX + c * (qrMm + gap);
      const y = startY + r * (qrMm + labelTopGap + labelBlockH + gap);

      const imgUrl = `${process.env.REACT_APP_API_URL}${qrList[i].image_path}?v=${qrList[i].code}`;
      const dataUrl = await loadImageAsDataURL(imgUrl);

      // QR
      pdf.addImage(dataUrl, "PNG", x, y, qrMm, qrMm);

      // ✅ Texte WRAP (ne déborde plus, donc pas de fusion)
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(fontSize);

      const lines = pdf.splitTextToSize(label, labelMaxWidth);
      const textY = y + qrMm + labelTopGap + lineHeight; // première ligne
      pdf.text(lines, x + qrMm / 2, textY, { align: "center" });
    }

    const filename = `QR_${application || "app"}_${sizeCm}cm_${Date.now()}.pdf`;
    pdf.save(filename);
  } catch (e) {
    console.error(e);
    setErrorMsg("PDF export failed. Check CORS / image access.");
  }
};
;

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
            <select
              value={qrSize}
              onChange={(e) => setQrSize(parseFloat(e.target.value))}
              className="input"
              aria-label="QR code size in cm"
            >
              <option value={1.5}>1.5 cm</option>
              <option value={3}>3 cm</option>
              <option value={4.5}>4.5 cm</option>
              <option value={6}>6 cm</option>
            </select>

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
              {/* Bouton PDF A4 */}
              <div style={{ textAlign: "center", margin: "16px 0" }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => exportQrsToA4Pdf(results, qrSize)}
                >
                  Download A4 PDF
                </button>
              </div>
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
                        onClick={() => downloadSingleQrPdf(qr)}
                      >
                        Download PDF
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
                    
                    {/* Conteneur pour les boutons côte à côte */}
                    <div className="button-group">
                      <button
                        type="button"
                        className="btn btn--action"
                        onClick={() => printQRCode(qr)}
                      >
                        Print
                      </button>
                      {qr.status !== 'active' && (
                        <button
                          type="button"
                          className="btn btn--action btn--danger"
                          onClick={() => deleteQRCode(qr.code)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
