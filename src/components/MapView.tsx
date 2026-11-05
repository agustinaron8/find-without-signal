import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { MAP_STYLE_URL } from '../config';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color?: string;
}

interface MapViewProps {
  points: MapPoint[];
  draggable?: boolean;
  onTap?: (lat: number, lng: number) => void;
  onDragPoint?: (id: string, lat: number, lng: number) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-64.18, -34.6];
const DEFAULT_ZOOM = 3;
const SINGLE_POINT_ZOOM = 15;
const DEFAULT_COLOR = '#38bdf8';

function createMarkerElement(name: string, color: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flex flex-col items-center';
  const label = document.createElement('span');
  label.className = 'mb-1 max-w-32 truncate rounded bg-slate-950/90 px-1.5 py-0.5 text-xs font-semibold text-white';
  // Names come from shared links, so they must never be parsed as HTML.
  label.textContent = name;
  const dot = document.createElement('span');
  dot.className = 'h-5 w-5 rounded-full border-2 border-white shadow';
  dot.style.background = color;
  root.append(label, dot);
  return root;
}

export default function MapView({ points, draggable, onTap, onDragPoint, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onTap, onDragPoint });
  const initialPointsRef = useRef(points);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onTap, onDragPoint };
  }, [onTap, onDragPoint]);

  useEffect(() => {
    const initial = initialPointsRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: MAP_STYLE_URL,
      center: initial[0] ? [initial[0].lng, initial[0].lat] : DEFAULT_CENTER,
      zoom: initial[0] ? SINGLE_POINT_ZOOM : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const markers = markersRef.current;

    if (initial.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      initial.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: SINGLE_POINT_ZOOM });
    }

    map.on('click', (e) => {
      // Marker tap events bubble up to the map; they must not create a new point.
      if ((e.originalEvent.target as Element).closest('.maplibregl-marker')) return;
      callbacksRef.current.onTap?.(e.lngLat.lat, e.lngLat.lng);
    });
    map.on('load', () => setFailed(false));
    map.on('error', () => {
      if (!map.isStyleLoaded()) setFailed(true);
    });

    return () => {
      map.remove();
      markers.clear();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const seen = new Set(points.map((p) => p.id));

    markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    });

    points.forEach((point) => {
      const color = point.color ?? DEFAULT_COLOR;
      let marker = markers.get(point.id);
      if (!marker) {
        marker = new maplibregl.Marker({
          element: createMarkerElement(point.name, color),
          anchor: 'bottom',
          draggable,
        })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        const created = marker;
        created.on('dragend', () => {
          const { lat, lng } = created.getLngLat();
          callbacksRef.current.onDragPoint?.(point.id, lat, lng);
        });
        markers.set(point.id, marker);
      } else {
        marker.setLngLat([point.lng, point.lat]);
        const label = marker.getElement().firstElementChild;
        if (label) label.textContent = point.name;
      }
    });
  }, [points, draggable]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className ?? ''}`}>
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <p className="absolute inset-x-3 top-3 rounded-lg bg-slate-950/90 p-3 text-sm text-amber-200">
          No se pudo cargar el mapa. Sin señal solo se ve si descargaste la zona antes.
        </p>
      )}
    </div>
  );
}
