import React from 'react';
import { isMobile } from 'react-device-detect';
import { QRCodeCanvas } from 'qrcode.react';

const DownloadApp = () => {
const apkLink = '';

const handleMobileClick = () => {
window.location.href = apkLink; // Téléchargement direct sur mobile
};

return ( <div className="container--sm card card--panel">
<h2 className="title" style={{ marginBottom: 12 }}>Install Assist by Scan</h2>
  {isMobile ? (
    <div className="mobile-download">
      <p>Tap the button below to download the app:</p>
      <button className="btn btn-lg" onClick={handleMobileClick}>
        Download APK
      </button>
    </div>
  ) : (
    <div className="desktop-download" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p>Scan this QR code with your Android device to download the app:</p>
      <QRCodeCanvas value={apkLink} size={200} />
      <div className="qr-caption">Assist by Scan</div>
    </div>
  )}
</div>

);
};

export default DownloadApp;
