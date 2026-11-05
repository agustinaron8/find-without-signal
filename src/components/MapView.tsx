import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { MAP_STYLE_URL } from '../config';
import { accuracyCircle, type LatLng } from '../lib/geo';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color?: string;
}

export interface MapOverlay {
  position?: LatLng & { accuracy: number };
  track?: LatLng[];
  destination?: LatLng;
}

interface MapViewProps {
  points: MapPoint[];
  overlay?: MapOverlay;
  draggable?: boolean;
  onTap?: (lat: number, lng: number) => void;
  onDragPoint?: (id: string, lat: number, lng: number) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-64.18, -34.6];
const DEFAULT_ZOOM = 3;
const SINGLE_POINT_ZOOM = 15;
const DEFAULT_COLOR = '#38bdf8';

const line = (coordinates: number[][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates },
});

function applyOverlay(map: MapLibreMap, overlay: MapOverlay) {
  const { position, track = [], destination } = overlay;
  const features: Record<string, GeoJSON.Feature | GeoJSON.FeatureCollection> = {
    'me-accuracy': {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: position ? [accuracyCircle(position, position.accuracy)] : [],
      },
    },
    'me-track': line(track.map((p) => [p.lng, p.lat])),
    'me-destination': line(
      position && destination
        ? [
            [position.lng, position.lat],
            [destination.lng, destination.lat],
          ]
        : [],
    ),
    'me-position': {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: position ? [position.lng, position.lat] : [] },
    },
  };

  if (!map.getSource('me-position')) {
    Object.entries(features).forEach(([id, data]) => map.addSource(id, { type: 'geojson', data }));
    map.addLayer({ id: 'me-accuracy', type: 'fill', source: 'me-accuracy', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'me-track', type: 'line', source: 'me-track', paint: { 'line-color': '#7c3aed', 'line-width': 4 } });
    map.addLayer({
      id: 'me-destination',
      type: 'line',
      source: 'me-destination',
      paint: { 'line-color': '#dc2626', 'line-width': 3, 'line-dasharray': [2, 2] },
    });
    map.addLayer({
      id: 'me-position',
      type: 'circle',
      source: 'me-position',
      paint: { 'circle-radius': 9, 'circle-color': '#2563eb', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
    });
    return;
  }
  Object.entries(features).forEach(([id, data]) => (map.getSource(id) as GeoJSONSource).setData(data));
}

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

export default function MapView({ points, overlay, draggable, onTap, onDragPoint, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onTap, onDragPoint });
  const initialPointsRef = useRef(points);
  const overlayRef = useRef(overlay);
  const loadedRef = useRef(false);
  const framedRef = useRef(false);
  const [problem, setProblem] = useState<'no-map' | 'missing-tiles' | null>(null);

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
    let styleLoaded = false;
    map.on('style.load', () => {
      styleLoaded = true;
    });
    map.on('load', () => {
      loadedRef.current = true;
      setProblem((current) => (current === 'no-map' ? null : current));
      if (overlayRef.current) applyOverlay(map, overlayRef.current);
    });
    map.on('error', (e: { sourceId?: string; tile?: unknown }) => {
      if (!styleLoaded || (e.sourceId && !e.tile)) setProblem('no-map');
      else if (e.tile) setProblem((current) => current ?? 'missing-tiles');
    });

    return () => {
      map.remove();
      markers.clear();
      mapRef.current = null;
      loadedRef.current = false;
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

  useEffect(() => {
    overlayRef.current = overlay;
    const map = mapRef.current;
    if (!map || !overlay) return;
    if (loadedRef.current) applyOverlay(map, overlay);
    // Frame "me and my destination" once; after that the map belongs to the user.
    if (overlay.position && !framedRef.current) {
      framedRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([overlay.position.lng, overlay.position.lat]);
      if (overlay.destination) bounds.extend([overlay.destination.lng, overlay.destination.lat]);
      map.fitBounds(bounds, { padding: 70, duration: 0, maxZoom: SINGLE_POINT_ZOOM });
    }
  }, [overlay]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className ?? ''}`}>
      {/* Inline because MapLibre's stylesheet forces `position: relative` over any class. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {problem && (
        <p className="absolute inset-x-3 top-3 rounded-lg bg-slate-950/90 p-3 text-sm text-amber-200">
          {problem === 'no-map'
            ? 'No se pudo cargar el mapa. Sin señal solo se ve si bajaste la zona antes. La brújula funciona igual.'
            : 'Falta el mapa de esta zona. Sin señal solo se ve lo que bajaste antes. La brújula funciona igual.'}
        </p>
      )}
    </div>
  );
}
