'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  fetchFiles,
  fetchTrash,
  uploadFiles,
  downloadFile,
  softDeleteFile,
  hardDeleteFile,
  restoreFile,
  getBucketAccess,
  setBucketAccess,
  setFileVisibility,
} from '@/lib/api';
import ViewModal from '@/components/ViewModal';

export default function GalleryPage() {
  const { user, logout, getToken, tryRefresh } = useAuth();
  const [tab, setTab] = useState('files');
  const [files, setFiles] = useState([]);
  const [trashFiles, setTrashFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [viewKey, setViewKey] = useState(null);
  const [actionKey, setActionKey] = useState(null);
  const [bucketPublic, setBucketPublic] = useState(null);
  const [bucketAccessLoading, setBucketAccessLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [filesRes, trashRes] = await Promise.all([
        fetchFiles(getToken, tryRefresh),
        fetchTrash(getToken, tryRefresh),
      ]);
      setFiles(filesRes.files || []);
      setTrashFiles(trashRes.files || []);
    } catch (e) {
      setError(e.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [getToken, tryRefresh]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    getBucketAccess(getToken, tryRefresh)
      .then((data) => setBucketPublic(data.public))
      .catch(() => setBucketPublic(false));
  }, [getToken, tryRefresh]);

  const handleBucketAccessToggle = async () => {
    if (bucketPublic == null) return;
    setBucketAccessLoading(true);
    setError(null);
    try {
      await setBucketAccess(!bucketPublic, getToken, tryRefresh);
      setBucketPublic(!bucketPublic);
    } catch (e) {
      setError(e.message || 'Failed to update bucket access');
    } finally {
      setBucketAccessLoading(false);
    }
  };

  const handleSetVisibility = async (key, isPublic) => {
    setActionKey(key);
    setError(null);
    try {
      await setFileVisibility(key, isPublic, getToken, tryRefresh);
      await loadFiles();
    } catch (e) {
      setError(e.message || 'Failed to update visibility');
    } finally {
      setActionKey(null);
    }
  };

  const handleUpload = async (e) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    const fileList = Array.from(selected);
    setUploading(true);
    setError(null);
    try {
      await uploadFiles(fileList, getToken, tryRefresh);
      await loadFiles();
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleView = (key) => setViewKey(key);
  const handleDownload = async (key) => {
    setActionKey(key);
    setError(null);
    try {
      await downloadFile(key, getToken, tryRefresh);
    } catch (e) {
      setError(e.message || 'Download failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleSoftDelete = async (key) => {
    setActionKey(key);
    setError(null);
    try {
      await softDeleteFile(key, getToken, tryRefresh);
      await loadFiles();
    } catch (e) {
      setError(e.message || 'Failed to move to recycle bin');
    } finally {
      setActionKey(null);
    }
  };

  const handleHardDelete = async (key, fromTrash) => {
    setActionKey(key);
    setError(null);
    try {
      await hardDeleteFile(key, getToken, fromTrash, tryRefresh);
      await loadFiles();
    } catch (e) {
      setError(e.message || 'Failed to delete permanently');
    } finally {
      setActionKey(null);
    }
  };

  const handleRestore = async (key) => {
    setActionKey(key);
    setError(null);
    try {
      await restoreFile(key, getToken, tryRefresh);
      await loadFiles();
    } catch (e) {
      setError(e.message || 'Failed to restore');
    } finally {
      setActionKey(null);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (key) => /\.(jpe?g|png|gif|webp)$/i.test(key);
  const isVideo = (key) => /\.(mp4|webm|ogg|mov)$/i.test(key);

  const list = tab === 'trash' ? trashFiles : files;
  const isTrash = tab === 'trash';

  return (
    <div className="gallery-page">
      <header className="gallery-header">
        <h1>My Gallery</h1>
        <div className="header-actions">
          <span className="username">{user?.username}</span>
          <button type="button" className="btn btn-outline" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </header>

      <section className="upload-section" aria-label="Upload files">
        <label className="upload-label">
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            className="upload-input"
          />
          <span className="btn btn-primary">
            {uploading ? 'Uploading…' : 'Upload files (images, video, or bulk)'}
          </span>
        </label>
        <div className="bucket-access-row">
          <span className="bucket-access-label">Bucket:</span>
          <span className="bucket-access-value">{bucketPublic == null ? '…' : bucketPublic ? 'Public' : 'Private'}</span>
          {bucketPublic != null && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleBucketAccessToggle}
              disabled={bucketAccessLoading}
            >
              {bucketAccessLoading ? 'Updating…' : bucketPublic ? 'Set private' : 'Set public'}
            </button>
          )}
          {bucketPublic != null && (
            <span className="bucket-access-hint">
              {bucketPublic
                ? 'Only files marked Public can be opened via direct link.'
                : 'No anonymous access. Set bucket Public and mark files Public to share links.'}
            </span>
          )}
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <section aria-label="File list">
        <div className="tabs">
          <button
            type="button"
            className={tab === 'files' ? 'active' : ''}
            onClick={() => setTab('files')}
          >
            Files ({files.length})
          </button>
          <button
            type="button"
            className={tab === 'trash' ? 'active' : ''}
            onClick={() => setTab('trash')}
          >
            Recycle bin ({trashFiles.length})
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            {isTrash
              ? 'Recycle bin is empty. Deleted files will appear here until you empty them.'
              : 'No files yet. Use the upload button above to add images or videos.'}
          </div>
        ) : (
          <ul className="file-grid">
            {list.map((f) => {
              const key = f.key;
              const name = key.replace(/^trash\//, '').split('/').pop() || key;
              const busy = actionKey === key;
              const isPublic = !!f.isPublic;
              return (
                <li key={key} className="file-card">
                  <div className="file-card-clickable">
                    <div className="file-preview">
                      <div className="file-placeholder">
                        {isImage(key) ? (
                          <span className="file-type-icon file-type-icon--image" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                            </svg>
                            <span className="file-placeholder-ext">{name.slice(0, 2).toUpperCase() || '?'}</span>
                          </span>
                        ) : isVideo(key) ? (
                          <span className="file-type-icon file-type-icon--play" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                              <path d="M8 5v14l11-7L8 5z" />
                            </svg>
                          </span>
                        ) : (
                          <span className="file-type-icon file-type-icon--doc" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                            </svg>
                            <span className="file-placeholder-ext">{name.slice(0, 2).toUpperCase() || '?'}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="file-info">
                      <button
                        type="button"
                        className="file-name-btn"
                        onClick={(e) => { e.stopPropagation(); handleView(key); }}
                        title="Preview"
                      >
                        {name}
                      </button>
                      {!isTrash && (
                        <span className={`file-badge ${isPublic ? 'public' : 'private'}`}>
                          {isPublic ? 'Public' : 'Private'}
                        </span>
                      )}
                      <span className="file-meta">{formatSize(f.size)}</span>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleView(key)}
                      disabled={busy}
                      title="Preview"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleDownload(key)}
                      disabled={busy}
                    >
                      Download
                    </button>
                    {!isTrash && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleSetVisibility(key, !isPublic)}
                        disabled={busy}
                        title={isPublic ? 'Make private (only you via app)' : 'Allow direct link when bucket is Public'}
                      >
                        {isPublic ? 'Make private' : 'Make public'}
                      </button>
                    )}
                    {isTrash ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          onClick={() => handleRestore(key)}
                          disabled={busy}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleHardDelete(key, true)}
                          disabled={busy}
                        >
                          Delete permanently
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleSoftDelete(key)}
                          disabled={busy}
                        >
                          To recycle bin
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleHardDelete(key, false)}
                          disabled={busy}
                        >
                          Delete permanently
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {viewKey && (
        <ViewModal
          fileKey={viewKey}
          getToken={getToken}
          tryRefresh={tryRefresh}
          onClose={() => setViewKey(null)}
          onDownload={() => handleDownload(viewKey)}
        />
      )}
    </div>
  );
}
