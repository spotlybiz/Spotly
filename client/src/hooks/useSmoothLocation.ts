/**
 * useSmoothLocation Hook
 * 
 * Provides smooth, interpolated GPS location updates using browser geolocation.
 * Implements Google Maps-style fluid motion by animating between position updates
 * using easeOutCubic easing and requestAnimationFrame.
 * 
 * Features:
 * - Smooth interpolation between GPS updates
 * - Heading calculation from movement when device doesn't provide it
 * - Minimum distance threshold to filter GPS noise
 * - Fallback to default location (Boise, ID) if geolocation fails
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface SmoothLocation {
  lat: number;
  lng: number;
  heading: number | null;  // Degrees (0-360), null if unknown
  speed: number | null;    // Meters per second
  accuracy: number | null; // Meters
}

interface UseSmoothLocationOptions {
  /** Use high accuracy GPS (slower, more battery) */
  enableHighAccuracy?: boolean;
  /** Animation duration in ms between position updates */
  interpolationDuration?: number;
  /** Minimum meters of movement to trigger update */
  minUpdateDistance?: number;
}

interface UseSmoothLocationReturn {
  /** Smoothly interpolated display location */
  location: SmoothLocation | null;
  /** Raw GPS location (not interpolated) */
  rawLocation: SmoothLocation | null;
  /** Current heading in degrees (0-360) */
  heading: number | null;
  /** Current speed in m/s */
  speed: number | null;
  /** GPS accuracy in meters */
  accuracy: number | null;
  /** Whether GPS is actively tracking */
  isTracking: boolean;
  /** Error message if geolocation failed */
  error: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** No fallback - location stays null until real GPS arrives */

/** Minimum movement in meters to calculate heading from position history */
const MIN_HEADING_DISTANCE = 3;

/** Max position history entries for heading calculation */
const MAX_POSITION_HISTORY = 5;

/** Milliseconds before forcing update regardless of distance (500ms for walking responsiveness) */
const FORCE_UPDATE_INTERVAL = 500;

/** Speed threshold below which heading is frozen (m/s) - prevents GPS jitter */
const HEADING_FREEZE_SPEED = 1.0;

/** Stationary jitter lock radius - GPS within this distance from anchor is jitter */
const STATIONARY_LOCK_RADIUS = 3; // 3m lock (was 4m) — tighter jitter filter

/** Stationary unlock radius - must move beyond this to break out of lock (hysteresis) */
const STATIONARY_UNLOCK_RADIUS = 5; // 5m unlock (was 7m) — unlock sooner when walking

/** Speed below which user is considered stationary (m/s) - uses derived speed */
const STATIONARY_SPEED_THRESHOLD = 0.5; // 0.5 m/s (~1 mph) — was 0.6

/** Number of consecutive near-stationary readings before locking position */
const STATIONARY_LOCK_COUNT = 2; // 2 readings (was 3) — lock faster to kill jitter

/** Accuracy thresholds for adaptive smoothing */
const ACCURACY_GOOD = 8;     // meters - minimal smoothing
const ACCURACY_FAIR = 15;    // meters - moderate smoothing  
const ACCURACY_POOR = 25;    // meters - heavy smoothing

/**
 * Calculate adaptive interpolation duration based on accuracy and speed
 * Good accuracy + high speed = minimal smoothing (responsive)
 * Poor accuracy + low speed = heavy smoothing (stable)
 */
function getAdaptiveInterpolationDuration(
  accuracy: number | null,
  speed: number | null
): number {
  const acc = accuracy ?? 15; // Default to fair accuracy
  const spd = speed ?? 0;
  
  // Base duration by accuracy
  let baseDuration: number;
  if (acc <= ACCURACY_GOOD) {
    baseDuration = 150; // Good GPS - minimal smoothing
  } else if (acc <= ACCURACY_FAIR) {
    baseDuration = 250; // Fair GPS - moderate smoothing
  } else if (acc <= ACCURACY_POOR) {
    baseDuration = 350; // Poor GPS - more smoothing
  } else {
    baseDuration = 450; // Very poor GPS - heavy smoothing
  }
  
  // Reduce duration at higher speeds (more responsive at speed)
  // At 10 m/s (~22mph), reduce by 30%
  // At 20 m/s (~45mph), reduce by 50%
  const speedFactor = Math.max(0.5, 1 - spd * 0.025);
  
  // Walking speed cap: at walking pace (0.5-2 m/s), cap at 300ms max
  // This prevents laggy dot movement during walking navigation
  const walkingCap = (spd > 0.3 && spd < 3.0) ? 300 : 500;
  
  return Math.min(walkingCap, Math.round(baseDuration * speedFactor));
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Calculate haversine distance between two points in meters
 */
function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate bearing between two points in degrees (0-360)
 */
function calculateBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Smoothly interpolate between two headings, handling wrap-around at 360/0
 */
function interpolateHeading(from: number, to: number, t: number): number {
  let diff = to - from;
  
  // Handle wrap-around
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  let result = from + diff * t;
  return (result + 360) % 360;
}

/**
 * Ease-out cubic easing function for smooth deceleration
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// =============================================================================
// HOOK
// =============================================================================

export function useSmoothLocation(
  options: UseSmoothLocationOptions = {}
): UseSmoothLocationReturn {
  const {
    enableHighAccuracy = true,
    interpolationDuration: _unused = 1000, // Now using adaptive duration
    minUpdateDistance = 0.5, // Low threshold for walking responsiveness (stationary lock handles jitter)
  } = options;

  // State
  const [location, setLocation] = useState<SmoothLocation | null>(null);
  const [displayLocation, setDisplayLocation] = useState<SmoothLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for animation
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const targetLocationRef = useRef<SmoothLocation | null>(null);
  const startLocationRef = useRef<SmoothLocation | null>(null);
  const animationStartRef = useRef<number>(0);
  const currentDurationRef = useRef<number>(400); // Adaptive duration
  
  // Ref to track displayLocation for use in geolocation callback (avoids stale closure)
  const displayLocationRef = useRef<SmoothLocation | null>(null);

  const locationRef = useRef<SmoothLocation | null>(null);
  
  // Refs for heading calculation
  const previousPositionsRef = useRef<Array<{ lat: number; lng: number; time: number }>>([]);
  const hasValidLocationRef = useRef(false);
  const lastValidHeadingRef = useRef<number | null>(null); // For heading freeze
  
  // Stationary detection refs
  const stationaryCountRef = useRef(0);
  const isStationaryLockedRef = useRef(false);
  const anchorPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  // ---------------------------------------------------------------------------
  // ANIMATION
  // ---------------------------------------------------------------------------

  /**
   * Animate between start and target locations using easeOutCubic
   * Uses adaptive duration based on GPS accuracy and speed
   */
  const animate = useCallback((timestamp: number) => {
    if (!targetLocationRef.current || !startLocationRef.current) {
      animationRef.current = null;
      return;
    }

    const elapsed = timestamp - animationStartRef.current;
    const duration = currentDurationRef.current; // Use adaptive duration
    const progress = Math.min(1, elapsed / duration);
    const easedProgress = easeOutCubic(progress);

    const start = startLocationRef.current;
    const target = targetLocationRef.current;

    // Heading freeze: Keep last valid heading if speed is too low
    let targetHeading = target.heading;
    const speed = target.speed ?? 0;
    if (speed < HEADING_FREEZE_SPEED && lastValidHeadingRef.current !== null) {
      targetHeading = lastValidHeadingRef.current;
    } else if (target.heading !== null) {
      lastValidHeadingRef.current = target.heading;
    }

    // Interpolate position and heading
    const interpolated: SmoothLocation = {
      lat: start.lat + (target.lat - start.lat) * easedProgress,
      lng: start.lng + (target.lng - start.lng) * easedProgress,
      heading: start.heading !== null && targetHeading !== null
        ? interpolateHeading(start.heading, targetHeading, easedProgress)
        : targetHeading,
      speed: target.speed,
      accuracy: target.accuracy,
    };

    setDisplayLocation(interpolated);
    displayLocationRef.current = interpolated; // Keep ref in sync

    // Continue animation or finish
    if (progress < 1) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      setDisplayLocation({ ...target, heading: targetHeading });
      displayLocationRef.current = { ...target, heading: targetHeading };
      animationRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // GEOLOCATION WATCHER
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      // Success callback
      (position) => {
        const now = Date.now();
        const newLocation: SmoothLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          accuracy: position.coords.accuracy,
        };

        // Track position history for heading calculation
        const prevPositions = previousPositionsRef.current;
        prevPositions.push({ 
          lat: newLocation.lat, 
          lng: newLocation.lng, 
          time: now 
        });
        
        // Keep only recent positions
        if (prevPositions.length > MAX_POSITION_HISTORY) {
          prevPositions.shift();
        }

        // Calculate heading from movement if device doesn't provide it
        if (prevPositions.length >= 2 && newLocation.heading === null) {
          const oldest = prevPositions[0];
          const newest = prevPositions[prevPositions.length - 1];
          const distance = calculateDistance(
            oldest.lat, oldest.lng,
            newest.lat, newest.lng
          );
          
          if (distance > MIN_HEADING_DISTANCE) {
            newLocation.heading = calculateBearing(
              oldest.lat, oldest.lng,
              newest.lat, newest.lng
            );
          }
        }

        const currentLocation = locationRef.current;
        
        // STATIONARY JITTER FILTER
        // When standing still, GPS naturally drifts 2-8 meters causing the dot
        // to jump around. We detect this pattern and lock the dot position.
        // Uses derived speed (distance/time) since many devices report speed=0
        // or null even while walking, making GPS speed unreliable for detection.
        if (currentLocation) {
          const distFromCurrent = calculateDistance(
            currentLocation.lat, currentLocation.lng,
            newLocation.lat, newLocation.lng
          );
          const timeSinceLast = (now - lastUpdateRef.current) / 1000;
          const derivedSpeed = timeSinceLast > 0 ? distFromCurrent / timeSinceLast : 0;
          const gpsSpeed = newLocation.speed ?? 0;
          const effectiveSpeed = Math.max(derivedSpeed, gpsSpeed);
          
          if (effectiveSpeed < STATIONARY_SPEED_THRESHOLD) {
            if (!anchorPositionRef.current) {
              anchorPositionRef.current = { lat: currentLocation.lat, lng: currentLocation.lng };
            }
            
            const distFromAnchor = calculateDistance(
              anchorPositionRef.current.lat, anchorPositionRef.current.lng,
              newLocation.lat, newLocation.lng
            );
            
            if (distFromAnchor < STATIONARY_LOCK_RADIUS) {
              stationaryCountRef.current++;
              if (stationaryCountRef.current >= STATIONARY_LOCK_COUNT) {
                isStationaryLockedRef.current = true;
              }
            }
            
            if (isStationaryLockedRef.current) {
              // Use hysteresis: only unlock if moved beyond the larger unlock radius
              if (distFromAnchor < STATIONARY_UNLOCK_RADIUS) {
                // Still within jitter zone — freeze display at anchor, but update
                // accuracy and heading so the pulse ring and direction cone stay current
                locationRef.current = {
                  ...newLocation,
                  lat: anchorPositionRef.current.lat,
                  lng: anchorPositionRef.current.lng,
                };
                setLocation(locationRef.current);
                setError(null);
                hasValidLocationRef.current = true;
                lastUpdateRef.current = now;
                return;
              }
              // Moved beyond unlock radius — break out of lock and allow update
              // (falls through to the normal animation path below for smooth transition)
              stationaryCountRef.current = 0;
              isStationaryLockedRef.current = false;
              anchorPositionRef.current = null;
            }
          } else {
            // Moving at meaningful speed — clear stationary state
            stationaryCountRef.current = 0;
            isStationaryLockedRef.current = false;
            anchorPositionRef.current = null;
          }
        }
        
        const shouldUpdate = !currentLocation || 
          calculateDistance(currentLocation.lat, currentLocation.lng, newLocation.lat, newLocation.lng) >= minUpdateDistance ||
          now - lastUpdateRef.current > FORCE_UPDATE_INTERVAL;

        if (shouldUpdate) {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
          
          currentDurationRef.current = getAdaptiveInterpolationDuration(
            newLocation.accuracy,
            newLocation.speed
          );
          
          startLocationRef.current = displayLocationRef.current || newLocation;
          targetLocationRef.current = newLocation;
          animationStartRef.current = performance.now();
          lastUpdateRef.current = now;
          
          hasValidLocationRef.current = true;
          
          locationRef.current = newLocation;
          setLocation(newLocation);
          setError(null);

          animationRef.current = requestAnimationFrame(animate);
        }
      },
      
      // Error callback
      (err) => {
        console.log("Geolocation error:", err.message);
        setError(err.message);
      },
      
      // Options
      {
        enableHighAccuracy,
        timeout: 15000, // Give GPS chip 15s to get a satellite fix (5s was too short)
        maximumAge: 0,  // Never use a cached position
      }
    );

    // Cleanup
    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enableHighAccuracy, minUpdateDistance, animate]);

  // ---------------------------------------------------------------------------
  // RETURN
  // ---------------------------------------------------------------------------

  return {
    location: displayLocation,
    rawLocation: location,
    heading: displayLocation?.heading ?? null,
    speed: displayLocation?.speed ?? null,
    accuracy: displayLocation?.accuracy ?? null,
    isTracking,
    error,
  };
}
