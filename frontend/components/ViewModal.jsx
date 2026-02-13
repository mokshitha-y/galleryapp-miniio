'use client';

import { useState, useEffect } from 'react';
import { getPresignedUrl } from '@/lib/api';

/** Get file type from key (uses filename after last /, ignores public/ trash/ for extension). */
function getPreviewType(key) {
  const base = (key || '').replace(/^trash\//, '').replace(/^public\//, '').split('/').pop() || '';
  const ext = base.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|ico|svg)$/i.test(base)) return 'image';
  if (/\.(mp4|webm|ogg|mov|avi|m4v|mkv)$/i.test(base)) return 'video';
  if (/\.pdf$/i.test(base)) return 'pdf';
  if (/\.(txt|text|md|json|csv|xml|html|htm)$/i.test(base)) return 'text';
  return 'other';
}

export default function ViewModal({ fileKey, getToken, tryRefresh, onClose, onDownload }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPresignedUrl(fileKey, getToken, tryRefresh, 3600)
      .then(setUrl)
      .catch(() => setError('Could not load file'));
  }, [fileKey, getToken, tryRefresh]);

  const handleDownload = () => {
    if (onDownload) onDownload(fileKey);
  };

  const handleOpenInNewTab = () => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const type = getPreviewType(fileKey);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="view-modal-title">
      <div className="modal-content view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="view-modal-toolbar">
          <span id="view-modal-title" className="view-modal-title">Preview</span>
          <div className="view-modal-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={handleDownload} disabled={!url}>
              Download
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={handleOpenInNewTab} disabled={!url}>
              Open in new tab
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="view-modal-body">
          {error && <p className="error-banner">{error}</p>}
          {url && type === 'image' && <img src={url} alt="" />}
          {url && type === 'video' && <video src={url} controls autoPlay />}
          {url && type === 'pdf' && (
            <iframe src={url} title="PDF preview" className="view-modal-iframe" />
          )}
          {url && type === 'text' && (
            <iframe src={url} title="Text preview" className="view-modal-iframe" />
          )}
          {url && type === 'other' && (
            <div className="view-modal-other">
              <p className="view-modal-other-message">Preview not available for this file type. Use &quot;Download&quot; or &quot;Open in new tab&quot; above to open the file.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
