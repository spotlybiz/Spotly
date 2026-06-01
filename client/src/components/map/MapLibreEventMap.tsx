/**
 * EventMap — clean Mapbox GL JS map
 *
 * Features:
 *   - Category-coloured event pin markers
 *   - User location dot + accuracy ring (GeoJSON layers)
 *   - Route line: remaining (green) + traveled (gray)
 *   - Destination marker
 *   - Dropped-pin from search
 *   - Camera follow (navigation: pitch+bearing, browse: flat)
 *   - Dark / light style
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Event, EventCategory } from '@shared/schema';
import type { RouteData } from '@/hooks/useNavigation';
import { splitRouteAtUser } from '@/lib/geo';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  food_truck: '#ef4444',
  market:     '#f97316',
  performer:  '#8b5cf6',
  vendor:     '#22c55e',
  community:  '#ec4899',
  other:      '#16a34a',
};

const CATEGORY_LETTERS: Record<string, string> = {
  food_truck: 'F',
  market:     'M',
  performer:  'P',
  vendor:     'V',
  community:  'C',
  other:      'O',
};

const LIGHT_STYLE  = 'mapbox://styles/mapbox/streets-v12';
const DARK_STYLE   = 'mapbox://styles/mapbox/dark-v11';
const NAV_ZOOM        = 17.5;
const NAV_PITCH       = 50;
const BROWSE_ZOOM     = 15;
const EASE_MS         = 200;   // tight GPS-tick ease during active navigation
const BROWSE_EASE_MS  = 400;   // smoother ease in browse mode
const NAV_ENTRY_MS    = 750;   // animated fly-in when navigation starts

// Padding that biases the camera center upward so the user dot sits
// in the lower ~30% of the screen — standard heading-up nav layout.
// Values are in CSS pixels.
const NAV_PAD = { top: 320, bottom: 60, left: 40, right: 40 } as const;
const NO_PAD  = { top: 0,   bottom: 0,  left: 0,  right: 0  } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventMapProps {
  events: Event[];
  userLocation: [number, number] | null;  // [lat, lng]
  heading?: number | null;
  route?: RouteData | null;
  isNavigating?: boolean;
  isFollowingUser?: boolean;
  showRoutePreview?: boolean;
  selectedEvent?: Event | null;
  isDarkMode?: boolean;
  className?: string;
  droppedPin?: { lat: number; lng: number; name: string } | null;
  onEventSelect: (event: Event) => void;
  onMarkerClick?: (event: Event) => void;
  onMapReady?: (map: mapboxgl.Map) => void;
  onMapDrag?: () => void;
  onMapClick?: () => void;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  // Accepted but unused (legacy compat — no-ops)
  speed?: number | null;
  accuracy?: number | null;
  onStartNavigation?: (event: Event) => void;
  onRouteProgressUpdate?: any;
  onRerouteNeeded?: any;
  cameraOffset?: any;
  compassHeading?: number | null;
  compassAccuracy?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createPinElement(category: string, selected: boolean): HTMLElement {
  const color  = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  const letter = CATEGORY_LETTERS[category] ?? 'O';
  const el = document.createElement('div');
  el.style.cssText = `
    width:36px;height:44px;cursor:pointer;display:flex;flex-direction:column;
    align-items:center;transition:transform .15s ease;
    transform:${selected ? 'scale(1.3)' : 'scale(1)'};
    filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));
  `;
  el.innerHTML = `
    <div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:${color};border:2.5px solid #fff;
      display:flex;align-items:center;justify-content:center;
      transform:rotate(-45deg);
    ">
      <span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:12px;line-height:1">
        ${letter}
      </span>
    </div>
    <div style="
      width:5px;height:5px;border-radius:50%;
      background:${color};margin-top:2px;opacity:.55;
    "></div>
  `;
  return el;
}

function emptyLineFeature() {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates: [] as [number,number][] },
    properties: {},
  };
}

/**
 * Build a small SVG arrow pointing up (north) as a PNG data-URL.
 * We rotate it on the layer via 'icon-rotate'.
 */
function buildArrowImage(): HTMLImageElement {
  const size = 64;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <!-- direction cone / chevron pointing UP -->
      <polygon points="32,4 46,36 32,28 18,36" fill="#22c55e" opacity="0.85"/>
    </svg>`;
  const img = new Image(size, size);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img;
}

/** Add all route + user sources/layers. Called on 'style.load' (fires on init & setStyle). */
function addSourcesAndLayers(map: mapboxgl.Map) {
  if (!map.getSource('route-remaining-src')) {
    map.addSource('route-remaining-src', { type: 'geojson', data: emptyLineFeature() });
  }
  if (!map.getSource('route-traveled-src')) {
    map.addSource('route-traveled-src',  { type: 'geojson', data: emptyLineFeature() });
  }
  if (!map.getSource('user-src')) {
    map.addSource('user-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }

  if (!map.getLayer('route-casing')) {
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route-remaining-src',
      paint: { 'line-color': '#1a5c28', 'line-width': 9, 'line-opacity': 0.9 },
      layout: { 'line-cap': 'round', 'line-join': 'round' } });
  }
  if (!map.getLayer('route-line')) {
    map.addLayer({ id: 'route-line', type: 'line', source: 'route-remaining-src',
      paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-opacity': 1 },
      layout: { 'line-cap': 'round', 'line-join': 'round' } });
  }
  if (!map.getLayer('route-traveled')) {
    map.addLayer({ id: 'route-traveled', type: 'line', source: 'route-traveled-src',
      paint: { 'line-color': '#9ca3af', 'line-width': 5, 'line-opacity': 0.55 },
      layout: { 'line-cap': 'round', 'line-join': 'round' } });
  }
  if (!map.getLayer('user-accuracy')) {
    map.addLayer({ id: 'user-accuracy', type: 'circle', source: 'user-src',
      paint: {
        'circle-radius': ['coalesce', ['get', 'accR'], 30],
        'circle-color': '#22c55e',
        'circle-opacity': 0.12,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#22c55e',
        'circle-stroke-opacity': 0.25,
      } });
  }
  if (!map.getLayer('user-dot')) {
    map.addLayer({ id: 'user-dot', type: 'circle', source: 'user-src',
      paint: {
        'circle-radius': 9,
        'circle-color': '#22c55e',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 1,
      } });
  }

  // Heading arrow — rotated SVG icon on top of the dot
  if (!map.hasImage('user-arrow')) {
    const img = buildArrowImage();
    img.onload = () => {
      if (!map.hasImage('user-arrow')) map.addImage('user-arrow', img);
    };
  }
  if (!map.getLayer('user-heading')) {
    map.addLayer({
      id: 'user-heading',
      type: 'symbol',
      source: 'user-src',
      layout: {
        'icon-image': 'user-arrow',
        'icon-size': 0.55,
        'icon-rotate': ['coalesce', ['get', 'heading'], 0],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      // Only show when we have a valid heading (feature has heading property)
      filter: ['has', 'heading'],
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventMap({
  events,
  userLocation,
  heading,
  route,
  isNavigating = false,
  isFollowingUser = true,
  showRoutePreview = false,
  selectedEvent,
  isDarkMode = false,
  className = '',
  droppedPin,
  onEventSelect,
  onMarkerClick,
  onMapReady,
  onMapDrag,
  onMapClick,
  recenterRef,
}: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken,  setMapboxToken]  = useState('');
  const [isStyleReady, setIsStyleReady] = useState(false);
  const [webGLError,   setWebGLError]   = useState<string | null>(null);

  const eventMarkersRef    = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const droppedPinRef      = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef      = useRef<mapboxgl.Marker | null>(null);
  // Capture the FIRST valid location so map init doesn't re-run on every GPS update
  const initialCenterRef   = useRef<[number, number] | null>(null);

  // Keep latest values in refs for callbacks that close over stale state
  const isFollowingRef  = useRef(isFollowingUser);
  isFollowingRef.current = isFollowingUser;
  const headingRef = useRef(heading);
  headingRef.current = heading;
  const isNavigatingRef = useRef(isNavigating);
  isNavigatingRef.current = isNavigating;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // Detect transition into / out of navigation mode for the fly-in animation
  const prevIsNavigatingRef = useRef(isNavigating);

  // ── 1. Fetch Mapbox token ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.mapboxToken) {
          mapboxgl.accessToken = cfg.mapboxToken;
          setMapboxToken(cfg.mapboxToken);
        }
      })
      .catch(err => console.error('[map] token fetch failed:', err));
  }, []);

  // Latch the first valid user location so it can be used as the initial map center
  // without putting userLocation in the init effect's dependency array.
  useEffect(() => {
    if (!initialCenterRef.current && userLocation) {
      initialCenterRef.current = userLocation;
    }
  }, [userLocation]);

  // ── 2. Map initialisation — runs ONCE when token + initial location are ready ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxToken) return;
    // Wait until we have a starting centre; default to [0,0] if GPS unavailable
    const center: [number, number] = initialCenterRef.current
      ? [initialCenterRef.current[1], initialCenterRef.current[0]]
      : [0, 0];

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: isDarkMode ? DARK_STYLE : LIGHT_STYLE,
        center,
        zoom: BROWSE_ZOOM,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
      });
    } catch (err) {
      console.error('[map] init failed:', err);
      setWebGLError('WebGL is required to display the map.');
      return;
    }

    // style.load fires both on initial load AND after setStyle()
    map.on('style.load', () => {
      addSourcesAndLayers(map);
      setIsStyleReady(true);
      onMapReady?.(map);
    });

    map.on('dragstart', () => { if (isFollowingRef.current) onMapDrag?.(); });
    map.on('click', () => onMapClick?.());
    map.on('error', (e) => console.error('[map] error:', e.error));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setIsStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]); // ← only token triggers init; location changes handled separately

  // ── 3. Dark mode style switch ──────────────────────────────────────────────
  const isDarkModeRef = useRef(isDarkMode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady) return;
    if (isDarkMode === isDarkModeRef.current) return;
    isDarkModeRef.current = isDarkMode;
    setIsStyleReady(false);
    map.setStyle(isDarkMode ? DARK_STYLE : LIGHT_STYLE);
  }, [isDarkMode, isStyleReady]);

  // ── 4. User dot + heading arrow ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady || !userLocation) return;
    const src = map.getSource('user-src') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    // Accuracy ring radius in pixels (roughly 15 m)
    const mpp = 156543.03392 / Math.pow(2, map.getZoom()) * Math.cos(userLocation[0] * Math.PI / 180);
    const accR = Math.max(12, Math.min(100, 15 / mpp));

    // Include heading so the arrow layer can rotate; omit property if unknown
    // so the filter ['has', 'heading'] hides the arrow when heading is unavailable
    const properties: Record<string, number> = { accR };
    if (headingRef.current != null) {
      properties.heading = headingRef.current;
    }

    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [userLocation[1], userLocation[0]] },
        properties,
      }],
    });
  }, [userLocation, heading, isStyleReady]);

  // ── 5. Route lines ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady) return;

    const rSrc = map.getSource('route-remaining-src') as mapboxgl.GeoJSONSource | undefined;
    const tSrc = map.getSource('route-traveled-src')  as mapboxgl.GeoJSONSource | undefined;
    if (!rSrc || !tSrc) return;

    const empty = emptyLineFeature();

    if (!route || (!isNavigating && !showRoutePreview)) {
      rSrc.setData(empty);
      tSrc.setData(empty);
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    if (isNavigating && userLocation) {
      const { traveled, remaining } = splitRouteAtUser(route.geometry, userLocation[0], userLocation[1]);
      rSrc.setData({ ...empty, geometry: { type: 'LineString', coordinates: remaining } });
      tSrc.setData({ ...empty, geometry: { type: 'LineString', coordinates: traveled } });
    } else {
      rSrc.setData({ ...empty, geometry: { type: 'LineString', coordinates: route.geometry } });
      tSrc.setData(empty);
    }

    // Destination marker
    const last = route.geometry.at(-1);
    if (last) {
      if (!destMarkerRef.current) {
        const el = document.createElement('div');
        el.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)';
        destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([last[0], last[1]])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([last[0], last[1]]);
      }
    }
  }, [route, isNavigating, showRoutePreview, userLocation, isStyleReady]);

  // ── 6. Event markers ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady) return;

    const currentIds = new Set(events.map(e => e.id));

    // Remove stale
    for (const [id, marker] of eventMarkersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); eventMarkersRef.current.delete(id); }
    }

    for (const event of events) {
      const isSelected = selectedEvent?.id === event.id;
      const existing = eventMarkersRef.current.get(event.id);

      if (existing) {
        const el = existing.getElement();
        (el as HTMLElement).style.transform = isSelected ? 'scale(1.3)' : 'scale(1)';
        continue;
      }

      const el = createPinElement(event.category, isSelected);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onMarkerClick?.(event);
        onEventSelect(event);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([event.longitude, event.latitude])
        .addTo(map);
      eventMarkersRef.current.set(event.id, marker);
    }
  }, [events, selectedEvent, isStyleReady, onEventSelect, onMarkerClick]);

  // ── 7. Dropped pin ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady) return;

    if (!droppedPin) {
      droppedPinRef.current?.remove();
      droppedPinRef.current = null;
      return;
    }

    if (droppedPinRef.current) {
      droppedPinRef.current.setLngLat([droppedPin.lng, droppedPin.lat]);
    } else {
      const el = document.createElement('div');
      el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      droppedPinRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([droppedPin.lng, droppedPin.lat])
        .addTo(map);
    }
  }, [droppedPin, isStyleReady]);

  // ── 8. Camera following — heading-up navigation ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReady || !isFollowingUser || !userLocation) return;

    const justEnteredNav  = isNavigating && !prevIsNavigatingRef.current;
    const justExitedNav   = !isNavigating && prevIsNavigatingRef.current;
    prevIsNavigatingRef.current = isNavigating;

    if (isNavigating) {
      const bear = heading ?? 0;

      if (justEnteredNav) {
        // Animated fly-in when navigation first starts:
        // pitch up, rotate to heading, shift user to lower third
        map.flyTo({
          center:   [userLocation[1], userLocation[0]],
          bearing:  bear,
          pitch:    NAV_PITCH,
          zoom:     NAV_ZOOM,
          padding:  NAV_PAD,
          duration: NAV_ENTRY_MS,
          curve:    1.2,
        });
      } else {
        // Continuous smooth follow — tight ease so it keeps up with GPS ticks
        map.easeTo({
          center:   [userLocation[1], userLocation[0]],
          bearing:  bear,
          pitch:    NAV_PITCH,
          zoom:     NAV_ZOOM,
          padding:  NAV_PAD,
          duration: EASE_MS,
          easing:   (t) => t,   // linear for position; smoothing done in useSmoothLocation
        });
      }
    } else {
      if (justExitedNav) {
        // Fly back to north-up centered view when navigation ends
        map.flyTo({
          center:   [userLocation[1], userLocation[0]],
          bearing:  0,
          pitch:    0,
          zoom:     BROWSE_ZOOM,
          padding:  NO_PAD,
          duration: NAV_ENTRY_MS,
          curve:    1.2,
        });
      } else {
        map.easeTo({
          center:   [userLocation[1], userLocation[0]],
          bearing:  0,
          pitch:    0,
          zoom:     BROWSE_ZOOM,
          padding:  NO_PAD,
          duration: BROWSE_EASE_MS,
          easing:   (t) => t * (2 - t),
        });
      }
    }
  }, [userLocation, heading, isFollowingUser, isNavigating, isStyleReady]);

  // ── 9. Recenter ref ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = () => {
      const map = mapRef.current;
      const loc = userLocationRef.current;
      if (!map || !loc) return;
      const nav = isNavigatingRef.current;
      map.flyTo({
        center:   [loc[1], loc[0]],
        bearing:  nav ? (headingRef.current ?? 0) : 0,
        pitch:    nav ? NAV_PITCH  : 0,
        zoom:     nav ? NAV_ZOOM   : BROWSE_ZOOM,
        padding:  nav ? NAV_PAD    : NO_PAD,
        duration: 700,
        curve:    1.2,
      });
    };
    return () => { if (recenterRef) recenterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterRef]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (webGLError) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-900 ${className}`}>
        <div className="text-center p-6">
          <p className="text-gray-600 dark:text-gray-400 font-medium">{webGLError}</p>
          <p className="text-sm text-gray-400 mt-2">Try a different browser or device.</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}

// Legacy name alias
export { EventMap as MapboxEventMap };
