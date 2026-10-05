'use client';

import { useState } from 'react';
import { fileTypeLabel } from '../lib/labels';

export type MediaItem = {
  id: string;
  type: string;
  objectKey: string;
  viewUrl?: string;
};

export function MediaViewer({ items }: { items: MediaItem[] }) {
  const [active, setActive] = useState<MediaItem | null>(null);

  if (!items.length) return <div className="emptyBox">Файлов пока нет</div>;

  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          className="mediaTile"
          type="button"
          onClick={() => setActive(item)}
        >
          <span>{fileTypeLabel(item.type)}</span>
          <small>{item.objectKey}</small>
        </button>
      ))}
      {active && (
        <div className="mediaOverlay" role="dialog" aria-modal="true">
          <div className="mediaDialog">
            <div className="tableHeader">
              <h2>{fileTypeLabel(active.type)}</h2>
              <button className="smallButton" type="button" onClick={() => setActive(null)}>
                Закрыть
              </button>
            </div>
            <div className="mediaPreview">
              {active.viewUrl ? (
                isImage(active.viewUrl, active.objectKey) ? (
                  <img
                    src={active.viewUrl}
                    alt={fileTypeLabel(active.type)}
                    draggable={false}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                ) : (
                  <iframe
                    src={active.viewUrl}
                    title={fileTypeLabel(active.type)}
                    sandbox="allow-same-origin"
                    referrerPolicy="no-referrer"
                  />
                )
              ) : (
                <div className="emptyBox">Файл недоступен для просмотра</div>
              )}
            </div>
            <div className="mediaCaption">{active.objectKey}</div>
          </div>
        </div>
      )}
    </>
  );
}

function isImage(url: string, objectKey: string) {
  const value = `${url} ${objectKey}`.toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((ext) => value.includes(ext));
}
