/**
 * geo.ts — Minimal geographic utilities
 * Haversine distance, bearing, and route-snapping helpers.
 * All geometry is in Mapbox [lng, lat] order unless noted otherwise.
 */

/** Distance in metres between two WGS-84 coordinates (lat/lng order). */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compass bearing in degrees (0=N, 90=E) from point 1 to point 2. */
export function bearingBetween(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const x = Math.sin(Δλ) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(x, y) * (180 / Math.PI) + 360) % 360;
}

/**
 * Minimum perpendicular distance (metres) from a point to a polyline.
 * geometry is [[lng, lat], ...] (Mapbox order).
 */
export function distanceToRoute(
  lat: number, lng: number,
  geometry: [number, number][],
): number {
  if (!geometry || geometry.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 0; i < geometry.length - 1; i++) {
    const [lng1, lat1] = geometry[i];
    const [lng2, lat2] = geometry[i + 1];
    const dx = lng2 - lng1, dy = lat2 - lat1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
      ((lng - lng1) * dx + (lat - lat1) * dy) / lenSq,
    ));
    const d = haversineDistance(lat, lng, lat1 + t * dy, lng1 + t * dx);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Split route geometry at the closest point to the user.
 * Returns { traveled, remaining } both in [[lng, lat], ...] format.
 */
export function splitRouteAtUser(
  geometry: [number, number][],
  userLat: number,
  userLng: number,
): { traveled: [number, number][]; remaining: [number, number][] } {
  if (!geometry || geometry.length < 2) {
    return { traveled: [], remaining: geometry ?? [] };
  }

  let minDist = Infinity;
  let bestIdx = 0;
  let bestFrac = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const [lng1, lat1] = geometry[i];
    const [lng2, lat2] = geometry[i + 1];
    const dx = lng2 - lng1, dy = lat2 - lat1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
      ((userLng - lng1) * dx + (userLat - lat1) * dy) / lenSq,
    ));
    const projLng = lng1 + t * dx;
    const projLat = lat1 + t * dy;
    const d = haversineDistance(userLat, userLng, projLat, projLng);
    if (d < minDist) { minDist = d; bestIdx = i; bestFrac = t; }
  }

  const [lng1, lat1] = geometry[bestIdx];
  const [lng2, lat2] = geometry[bestIdx + 1];
  const snapLng = lng1 + bestFrac * (lng2 - lng1);
  const snapLat = lat1 + bestFrac * (lat2 - lat1);
  const snap: [number, number] = [snapLng, snapLat];

  const traveled: [number, number][] = [...geometry.slice(0, bestIdx + 1), snap];
  const remaining: [number, number][] = [snap, ...geometry.slice(bestIdx + 1)];

  return { traveled, remaining };
}

/** Format metres to a US distance string ("350 ft" / "1.2 mi"). */
export function formatDistance(metres: number): string {
  const feet = metres * 3.28084;
  if (feet < 500) return `${Math.round(feet / 10) * 10} ft`;
  const miles = metres / 1609.34;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Format seconds to "X min" or "X h Y min". */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}
