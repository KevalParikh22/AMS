import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

// Renders a QR image for the given value (participant ID). White background
// is forced so codes stay scannable in dark mode and when printed.
export default function QrCode({ value, size = 128, style }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(String(value), {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    }).then(url => {
      if (!cancelled) setDataUrl(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [value, size]);

  if (!dataUrl) return <div style={{ width: size, height: size, ...style }} />;
  return (
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      style={{ borderRadius: '8px', backgroundColor: '#fff', ...style }}
    />
  );
}
