'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Organization } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown };
  marker: (latLng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
};

type LeafletMap = {
  setView: (latLng: [number, number], zoom: number) => LeafletMap;
  on: (event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latLng: [number, number]) => LeafletMarker;
};

type InstallersSectionProps = {
  installers: Organization[];
  name: string;
  phone: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onCity: (value: string) => void;
  onAddress: (value: string) => void;
  onLat: (value: string) => void;
  onLng: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onOpen: (org: Organization) => void;
  onDelete: (org: Organization) => void;
};

export function InstallersSection({
  installers,
  name,
  phone,
  city,
  address,
  lat,
  lng,
  onName,
  onPhone,
  onCity,
  onAddress,
  onLat,
  onLng,
  onSubmit,
  onOpen,
  onDelete,
}: InstallersSectionProps) {
  return (
    <>
      <form className="wideForm" onSubmit={onSubmit}>
        <input placeholder="Наименование установщика" value={name} onChange={(event) => onName(event.target.value)} />
        <input placeholder="Номер телефона" value={phone} onChange={(event) => onPhone(normalizeKzPhone(event.target.value))} />
        <input placeholder="Город" value={city} onChange={(event) => onCity(event.target.value)} />
        <input placeholder="Адрес" value={address} onChange={(event) => onAddress(event.target.value)} />
        <input placeholder="Широта" value={lat} onChange={(event) => onLat(event.target.value)} />
        <input placeholder="Долгота" value={lng} onChange={(event) => onLng(event.target.value)} />
        <button type="submit">Добавить установщика</button>
      </form>
      <InstallerPointMap lat={lat} lng={lng} onLat={onLat} onLng={onLng} />
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Установщик</th>
              <th>Телефон</th>
              <th>Город</th>
              <th>Адрес</th>
              <th>Координаты</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!installers.length && <EmptyTableRow colSpan={7} />}
            {installers.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.contactPhone ?? '-'}</td>
                <td>{item.region ?? '-'}</td>
                <td>{item.address ?? '-'}</td>
                <td>{coords(item.lat, item.lng)}</td>
                <td><span className="pill">{statusLabel(item.status)}</span></td>
                <td>
                  <div className="actions">
                    <button className="smallButton" type="button" onClick={() => onOpen(item)}>
                      Открыть
                    </button>
                    <button className="smallButton dangerButton" type="button" onClick={() => onDelete(item)}>
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function InstallerPointMap({
  lat,
  lng,
  onLat,
  onLng,
}: {
  lat: string;
  lng: string;
  onLat: (value: string) => void;
  onLng: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onLatRef = useRef(onLat);
  const onLngRef = useRef(onLng);
  const [ready, setReady] = useState(false);
  const centerLat = Number(lat) || 51.1282;
  const centerLng = Number(lng) || 71.4304;

  useEffect(() => {
    onLatRef.current = onLat;
    onLngRef.current = onLng;
  }, [onLat, onLng]);

  useEffect(() => {
    loadLeaflet().then(() => setReady(true)).catch(() => setReady(false));
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.L || mapRef.current) return;
    const map = window.L.map(containerRef.current, { zoomControl: true }).setView([centerLat, centerLng], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    markerRef.current = window.L.marker([centerLat, centerLng], { draggable: false }).addTo(map);
    map.on('click', (event) => {
      onLatRef.current(event.latlng.lat.toFixed(6));
      onLngRef.current(event.latlng.lng.toFixed(6));
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([centerLat, centerLng]);
  }, [centerLat, centerLng]);

  return (
    <div className="osmPicker">
      <div ref={containerRef} className="osmLeafletMap" />
      <div className="mapHint">Двигайте карту, меняйте масштаб и нажмите точку установщика</div>
      {!ready && <div className="mapLoading">Загрузка карты...</div>}
    </div>
  );
}

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.L) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet-css', 'true');
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-leaflet-js]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.setAttribute('data-leaflet-js', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.body.appendChild(script);
  });
}

function normalizeKzPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '+7';
  if (digits.startsWith('7')) return `+${digits}`;
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+7${digits}`;
}

function coords(lat?: number, lng?: number) {
  return typeof lat === 'number' && typeof lng === 'number'
    ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    : '-';
}
