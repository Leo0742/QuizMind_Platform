'use client';

import type { AiHistoryFileMetadata } from '@quizmind/contracts';

interface HistoryFilePreviewProps {
  itemId: string;
  fileMetadata: AiHistoryFileMetadata;
  compact?: boolean;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extensionLabel(name: string, mimeType: string): string {
  const ext = name.split('.').pop()?.trim().toUpperCase();
  if (ext && ext.length <= 8) return ext;
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMG';
  return 'FILE';
}

function isImage(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isPdf(mimeType: string, name: string): boolean {
  return mimeType.toLowerCase().includes('pdf') || name.toLowerCase().endsWith('.pdf');
}

export function toStoredFileViewUrl(itemId: string): string {
  return `/bff/history/${encodeURIComponent(itemId)}/file/view`;
}

export function toStoredFileDownloadUrl(itemId: string): string {
  return `/bff/history/${encodeURIComponent(itemId)}/file/download`;
}

export function HistoryFilePreview({ itemId, fileMetadata, compact = false }: HistoryFilePreviewProps) {
  const viewUrl = toStoredFileViewUrl(itemId);
  const downloadUrl = toStoredFileDownloadUrl(itemId);
  const name = fileMetadata.originalName || 'attachment';
  const mimeType = fileMetadata.mimeType || 'application/octet-stream';
  const size = formatFileSize(fileMetadata.sizeBytes);

  if (isImage(mimeType)) {
    return (
      <div style={{ marginTop: compact ? 8 : 10 }}>
        <a href={viewUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ display: 'block', maxWidth: '100%' }}>
          <img
            alt={name}
            src={viewUrl}
            style={{
              width: compact ? 'min(100%, 520px)' : 'min(100%, 720px)',
              maxHeight: compact ? 260 : 340,
              borderRadius: 6,
              objectFit: 'contain',
              border: '1px solid var(--line)',
              display: 'block',
              background: 'var(--surface-muted)',
            }}
          />
        </a>
        <div className="event-row__context" style={{ marginTop: 4 }}>
          {name} &middot; {size}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        marginTop: compact ? 8 : 10,
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: compact ? '10px 12px' : '12px 14px',
        background: 'var(--surface-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        maxWidth: compact ? 520 : 720,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div aria-hidden="true" style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 10, background: isPdf(mimeType, name) ? '#ef4444' : '#6366f1', color: '#fff', fontWeight: 800, fontSize: 11 }}>
          {extensionLabel(name, mimeType)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 2 }}>{size}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
        <a className="btn-ghost" href={viewUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem' }}>Open</a>
        <a className="btn-ghost" href={downloadUrl} style={{ fontSize: '0.75rem' }}>Save</a>
      </div>
    </div>
  );
}
