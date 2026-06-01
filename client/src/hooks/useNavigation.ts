/**
 * useNavigation — clean navigation state machine
 *
 * Responsibilities:
 *   - Fetch routes from /api/route (Mapbox Directions v5 proxy)
 *   - Track current step (advance when within 30 m of next maneuver)
 *   - Detect off-route with two tiers:
 *       • Instant reroute  if >80 m off (clearly wrong road)
 *       • Delayed reroute  if >25 m off for 2 s continuously
 *   - Cancel stale in-flight reroute requests via AbortController
 *   - Detect arrival (<30 m from destination)
 *   - Manage preview routes and dropped pins from search
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Event } from '@shared/schema';
import { haversineDistance, distanceToRoute } from '@/lib/geo';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distance: number;    // metres for this step
  duration: number;    // seconds for this step
  maneuver: string;    // 'turn' | 'depart' | 'arrive' | 'roundabout' | …
  modifier?: string;   // 'left' | 'right' | 'straight' | 'uturn' | …
  coordinates: [number, number][]; // [[lng, lat], …] step geometry
}

export interface RouteData {
  distance: number;    // total metres
  duration: number;    // total seconds
  geometry: [number, number][];  // [[lng, lat], …] full polyline
  steps: RouteStep[];
}

export interface PlaceResult {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  type: 'address' | 'area' | 'poi';
}

interface NavDestination {
  lat: number;
  lng: number;
  name: string;
  event?: Event;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Mapbox best-practice thresholds
const OFF_ROUTE_INSTANT_M = 80;   // instantly reroute — clearly on the wrong road
const OFF_ROUTE_SOFT_M    = 25;   // start the sustained timer at this distance
const OFF_ROUTE_SOFT_MS   = 2000; // reroute after being >25 m off for 2 s
const ARRIVAL_M           = 30;   // metres to destination → arrival
const STEP_ADV_M          = 25;   // metres to next maneuver → advance step

// ─── API helper (supports AbortSignal for cancellation) ───────────────────────

async function apiRoute(
  startLat: number, startLng: number,
  endLat: number,   endLng: number,
  signal?: AbortSignal,
): Promise<RouteData> {
  const res = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startLat, startLng, endLat, endLng }),
    signal,
  });
  if (!res.ok) throw new Error(`Route API ${res.status}`);
  return res.json();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNavigation({ userLocation }: { userLocation: [number, number] | null }) {
  const [isNavigating,     setIsNavigating]     = useState(false);
  const [isLoadingRoute,   setIsLoadingRoute]   = useState(false);
  const [isRerouting,      setIsRerouting]      = useState(false);
  const [isFollowingUser,  setIsFollowingUser]  = useState(true);
  const [showRoutePreview, setShowRoutePreview] = useState(false);
  const [route,        setRoute]        = useState<RouteData | null>(null);
  const [previewRoute, setPreviewRoute] = useState<RouteData | null>(null);
  const [destination,  setDestination]  = useState<NavDestination | null>(null);
  const [droppedPin,   setDroppedPinState] = useState<{ lat: number; lng: number; name: string; type?: string } | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasArrived,   setHasArrived]   = useState(false);
  const [arrivedEvent, setArrivedEvent] = useState<Event | null>(null);

  const mapRecenterRef      = useRef<(() => void) | null>(null);
  const offRouteSoftStartRef = useRef<number | null>(null);  // timestamp when soft timer started
  const isRecalcRef         = useRef(false);
  const rerouteAbortRef     = useRef<AbortController | null>(null);
  const userLocationRef     = useRef(userLocation);
  userLocationRef.current   = userLocation;
  const refollowTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destinationRef      = useRef<NavDestination | null>(null);

  // Keep destinationRef in sync so callbacks always have the latest dest
  useEffect(() => { destinationRef.current = destination; }, [destination]);

  // ── Core reroute function (cancels any in-flight request first) ────────────
  const triggerReroute = useCallback(async (reason: 'instant' | 'soft') => {
    const dest = destinationRef.current;
    const loc  = userLocationRef.current;
    if (!dest || !loc || isRecalcRef.current) return;

    console.log(`[nav] rerouting (${reason})`);

    // Cancel any previous in-flight reroute
    rerouteAbortRef.current?.abort();
    const ctrl = new AbortController();
    rerouteAbortRef.current = ctrl;

    isRecalcRef.current = true;
    offRouteSoftStartRef.current = null;
    setIsRerouting(true);

    try {
      const r = await apiRoute(loc[0], loc[1], dest.lat, dest.lng, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setRoute(r);
        setCurrentStepIndex(0);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('[nav] reroute failed', e);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setIsRerouting(false);
        isRecalcRef.current = false;
        rerouteAbortRef.current = null;
      }
    }
  }, []);

  // ── Step advance + off-route + arrival ─────────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !route || !userLocation) return;
    const [uLat, uLng] = userLocation;

    // 1. Arrival check
    if (destination) {
      const d = haversineDistance(uLat, uLng, destination.lat, destination.lng);
      if (d < ARRIVAL_M) {
        setHasArrived(true);
        setArrivedEvent(destination.event ?? null);
        setIsNavigating(false);
        setRoute(null);
        setDestination(null);
        setCurrentStepIndex(0);
        setIsFollowingUser(true);
        rerouteAbortRef.current?.abort();
        return;
      }
    }

    // 2. Step advance: proximity to the START of the NEXT step's maneuver point
    const nextIdx = currentStepIndex + 1;
    if (nextIdx < route.steps.length) {
      const nextStep    = route.steps[nextIdx];
      const maneuverPt  = nextStep.coordinates[0];
      if (maneuverPt) {
        const [mLng, mLat] = maneuverPt;
        const d = haversineDistance(uLat, uLng, mLat, mLng);
        if (d < STEP_ADV_M) {
          setCurrentStepIndex(nextIdx);
          offRouteSoftStartRef.current = null;
          return;
        }
      }
    }

    // 3. Off-route detection — two tiers
    if (isRecalcRef.current) return; // reroute already in progress

    const dist = distanceToRoute(uLat, uLng, route.geometry);

    if (dist > OFF_ROUTE_INSTANT_M) {
      // Tier 1 — instant reroute (way off course)
      offRouteSoftStartRef.current = null;
      triggerReroute('instant');
      return;
    }

    if (dist > OFF_ROUTE_SOFT_M) {
      // Tier 2 — start / check the sustained timer
      if (!offRouteSoftStartRef.current) {
        offRouteSoftStartRef.current = Date.now();
      } else if (Date.now() - offRouteSoftStartRef.current >= OFF_ROUTE_SOFT_MS) {
        offRouteSoftStartRef.current = null;
        triggerReroute('soft');
      }
    } else {
      // Back on route — clear timer
      offRouteSoftStartRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, isNavigating, route, currentStepIndex, destination]);

  // ── Internal fetch (initial route load) ────────────────────────────────────
  const fetchRoute = useCallback(async (dest: NavDestination): Promise<RouteData | null> => {
    const loc = userLocationRef.current;
    if (!loc) return null;
    try {
      return await apiRoute(loc[0], loc[1], dest.lat, dest.lng);
    } catch (e) {
      console.error('[nav] route fetch failed', e);
      return null;
    }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const startNavigation = useCallback(async (event: Event) => {
    const dest: NavDestination = {
      lat: event.latitude,
      lng: event.longitude,
      name: event.name,
      event,
    };
    rerouteAbortRef.current?.abort();
    setDestination(dest);
    setIsNavigating(true);
    setIsLoadingRoute(true);
    setIsRerouting(false);
    setCurrentStepIndex(0);
    setIsFollowingUser(true);
    setShowRoutePreview(false);
    setHasArrived(false);
    setArrivedEvent(null);
    setPreviewRoute(null);
    offRouteSoftStartRef.current = null;
    isRecalcRef.current = false;

    const r = await fetchRoute(dest);
    setRoute(r);
    setIsLoadingRoute(false);
  }, [fetchRoute]);

  const stopNavigation = useCallback(() => {
    rerouteAbortRef.current?.abort();
    setIsNavigating(false);
    setIsRerouting(false);
    setRoute(null);
    setDestination(null);
    setCurrentStepIndex(0);
    setShowRoutePreview(false);
    setIsFollowingUser(true);
    offRouteSoftStartRef.current = null;
    isRecalcRef.current = false;
  }, []);

  // Public recalculate (manual trigger from UI)
  const recalculate = useCallback(() => triggerReroute('instant'), [triggerReroute]);

  const calculateRoutePreview = useCallback(async (event: Event) => {
    const loc = userLocationRef.current;
    if (!loc) return;
    setShowRoutePreview(true);
    try {
      const r = await apiRoute(loc[0], loc[1], event.latitude, event.longitude);
      setPreviewRoute(r);
    } catch (e) {
      console.error('[nav] preview route failed', e);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewRoute(null);
    setShowRoutePreview(false);
  }, []);

  const setDroppedPin = useCallback((pin: { lat: number; lng: number; name: string; type?: string } | null) => {
    setDroppedPinState(pin);
    if (!pin) { setPreviewRoute(null); setShowRoutePreview(false); return; }
    const loc = userLocationRef.current;
    if (!loc) return;
    setIsLoadingRoute(true);
    setShowRoutePreview(false);
    apiRoute(loc[0], loc[1], pin.lat, pin.lng)
      .then((r) => { setPreviewRoute(r); setShowRoutePreview(true); setIsLoadingRoute(false); })
      .catch((e) => { console.error('[nav] pin route failed', e); setIsLoadingRoute(false); });
  }, []);

  const clearPin = useCallback(() => {
    setDroppedPinState(null);
    setPreviewRoute(null);
    setShowRoutePreview(false);
  }, []);

  const navigateToPin = useCallback(async () => {
    if (!droppedPin) return;
    const dest: NavDestination = { lat: droppedPin.lat, lng: droppedPin.lng, name: droppedPin.name };
    rerouteAbortRef.current?.abort();
    setDestination(dest);
    setIsNavigating(true);
    setCurrentStepIndex(0);
    setIsFollowingUser(true);
    setShowRoutePreview(false);
    setHasArrived(false);
    setIsRerouting(false);
    setDroppedPinState(null);
    offRouteSoftStartRef.current = null;
    isRecalcRef.current = false;

    if (previewRoute) {
      setRoute(previewRoute);
      setPreviewRoute(null);
      setIsLoadingRoute(false);
    } else {
      setIsLoadingRoute(true);
      const r = await fetchRoute(dest);
      setRoute(r);
      setIsLoadingRoute(false);
    }
  }, [droppedPin, previewRoute, fetchRoute]);

  const handleMapDrag = useCallback(() => {
    setIsFollowingUser(false);
    if (refollowTimerRef.current) {
      clearTimeout(refollowTimerRef.current);
      refollowTimerRef.current = null;
    }
  }, []);

  const recenterOnUser = useCallback(() => {
    setIsFollowingUser(true);
    mapRecenterRef.current?.();
  }, []);

  const dismissArrival = useCallback(() => {
    setHasArrived(false);
    setArrivedEvent(null);
  }, []);

  const selectPlace = useCallback((place: PlaceResult) => {
    setDroppedPin({ lat: place.lat, lng: place.lng, name: place.displayName, type: place.type });
  }, [setDroppedPin]);

  const navigateToPlace = useCallback(async (place: PlaceResult): Promise<Event | null> => {
    const fakeEvent = {
      id: `place-${Date.now()}`,
      userId: '',
      name: place.displayName,
      category: 'other' as any,
      description: '',
      address: place.displayName,
      latitude: place.lat,
      longitude: place.lng,
      startDate: new Date(),
      endDate: new Date(),
      imageUrl: null,
      organizerName: null,
      organizerContact: null,
      status: 'approved',
      reportCount: 0,
      viewCount: 0,
      likeCount: 0,
      shareCount: 0,
      createdAt: new Date(),
    } as Event;
    await startNavigation(fakeEvent);
    return fakeEvent;
  }, [startNavigation]);

  const remainingDistance = route
    ? route.steps.slice(currentStepIndex).reduce((s, st) => s + st.distance, 0)
    : 0;
  const remainingDuration = route
    ? route.steps.slice(currentStepIndex).reduce((s, st) => s + st.duration, 0)
    : 0;

  return {
    isNavigating,
    isLoadingRoute,
    isRerouting,
    isFollowingUser,
    showRoutePreview,
    route,
    previewRoute,
    destination,
    droppedPin,
    currentStepIndex,
    hasArrived,
    arrivedEvent,
    showArrival: hasArrived,
    navigationEvent: destination?.event ?? null,
    remainingDistance,
    remainingDuration,
    mapRecenterRef,

    startNavigation,
    stopNavigation,
    recalculate,
    recalculateRoute: recalculate,
    calculateRoutePreview,
    clearPreview,
    setDroppedPin,
    clearPin,
    navigateToPin,
    startPinNavigation: navigateToPin,
    handleMapDrag,
    recenterOnUser,
    dismissArrival,
    handleArrivalDismiss: dismissArrival,
    selectPlace,
    navigateToPlace,
    setIsFollowingUser,

    // Legacy compat
    isOfflineNavigation: false,
    cameraOffset: undefined as undefined,
    handleRouteProgressUpdate: undefined as undefined,
    handleRerouteNeeded: recalculate,
    handleNavSheetHeightChange: undefined as undefined,
  };
}
