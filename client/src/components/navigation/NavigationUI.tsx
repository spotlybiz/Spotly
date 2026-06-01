/**
 * NavigationUI — navigation overlay
 *
 * Shows: top maneuver card (or rerouting banner), bottom trip bar with
 * always-visible speed gauge, optional steps sheet.
 */

import { useState, useEffect, useRef } from 'react';
import type { Event } from '@shared/schema';
import type { RouteData } from '@/hooks/useNavigation';
import { haversineDistance, formatDistance, formatDuration } from '@/lib/geo';
import {
  ArrowLeft, ArrowRight, ArrowUp, RotateCcw,
  Navigation, MapPin, Volume2, VolumeX, List, ChevronDown, RefreshCw,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NavigationUIProps {
  route: RouteData | null;
  event: Event;
  userLocation: [number, number] | null;
  currentStepIndex: number;
  isLoading: boolean;
  isRerouting: boolean;
  isFollowingUser: boolean;
  speed?: number | null;   // m/s from GPS
  onClose: () => void;
  onRecalculate: () => void;
  onRecenter: () => void;
}

// ─── Maneuver icon ─────────────────────────────────────────────────────────────

function ManeuverIcon({
  maneuver,
  modifier,
  className = 'w-7 h-7',
}: {
  maneuver: string;
  modifier?: string;
  className?: string;
}) {
  const cls = `${className} text-white`;
  if (maneuver === 'arrive')                                return <MapPin    className={cls} />;
  if (maneuver === 'depart')                                return <Navigation className={cls} />;
  if (maneuver === 'roundabout' || maneuver === 'rotary')   return <RotateCcw className={cls} />;
  if (modifier === 'uturn')                                 return <RotateCcw className={cls} />;
  if (modifier === 'left'  || modifier === 'sharp left')    return <ArrowLeft  className={cls} />;
  if (modifier === 'right' || modifier === 'sharp right')   return <ArrowRight className={cls} />;
  return <ArrowUp className={cls} />;
}

// ─── Speed gauge ───────────────────────────────────────────────────────────────

function SpeedGauge({ speedMs }: { speedMs: number | null | undefined }) {
  const mph = speedMs != null ? Math.round(speedMs * 2.237) : 0;
  return (
    <div
      className="flex flex-col items-center justify-center bg-gray-700 rounded-2xl px-3 py-2 min-w-[58px]"
      data-testid="badge-speed"
    >
      <span className="text-white font-bold text-2xl leading-none tabular-nums">
        {mph}
      </span>
      <span className="text-gray-400 text-[10px] uppercase tracking-widest mt-0.5">mph</span>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function NavigationUI({
  route,
  event,
  userLocation,
  currentStepIndex,
  isLoading,
  isRerouting,
  isFollowingUser,
  speed,
  onClose,
  onRecenter,
}: NavigationUIProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showSteps,    setShowSteps]    = useState(false);
  const lastSpokenRef = useRef(-1);

  const currentStep = route?.steps[currentStepIndex];
  const nextStep    = route?.steps[currentStepIndex + 1];

  // Distance from user to the NEXT maneuver point
  const distToNext: number | null = (() => {
    if (!userLocation || !nextStep?.coordinates[0]) return null;
    const [mLng, mLat] = nextStep.coordinates[0];
    return haversineDistance(userLocation[0], userLocation[1], mLat, mLng);
  })();

  // Remaining totals from current step onward
  const remaining = route
    ? route.steps.slice(currentStepIndex).reduce(
        (acc, s) => ({ dist: acc.dist + s.distance, dur: acc.dur + s.duration }),
        { dist: 0, dur: 0 },
      )
    : { dist: 0, dur: 0 };

  const etaStr = new Date(Date.now() + remaining.dur * 1000)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Voice guidance — speak each new step once
  useEffect(() => {
    if (!voiceEnabled || !window.speechSynthesis || !currentStep) return;
    if (currentStepIndex === lastSpokenRef.current) return;
    lastSpokenRef.current = currentStepIndex;
    const u = new SpeechSynthesisUtterance(currentStep.instruction);
    u.rate = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [currentStepIndex, voiceEnabled, currentStep]);

  if (!route && !isLoading && !isRerouting) return null;

  // ── Top card content ────────────────────────────────────────────────────────
  const renderTopCard = () => {
    // Rerouting banner — takes priority
    if (isRerouting) {
      return (
        <div className="flex items-center gap-4 p-4">
          <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-7 h-7 text-white animate-spin" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">Rerouting…</p>
            <p className="text-gray-400 text-sm truncate">Finding the best route</p>
          </div>
        </div>
      );
    }

    // Initial route loading
    if (isLoading || !route) {
      return (
        <div className="flex items-center gap-4 p-4">
          <div className="w-14 h-14 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0 animate-pulse">
            <Navigation className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">Calculating route…</p>
            <p className="text-gray-400 text-sm truncate">{event.name}</p>
          </div>
        </div>
      );
    }

    // Normal maneuver card
    if (currentStep) {
      return (
        <div className="flex items-center gap-4 p-4">
          <div className="w-14 h-14 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
            <ManeuverIcon maneuver={currentStep.maneuver} modifier={currentStep.modifier} />
          </div>
          <div className="flex-1 min-w-0">
            {distToNext !== null && (
              <p className="text-green-400 font-bold text-2xl leading-tight" data-testid="text-distance-to-turn">
                {formatDistance(distToNext)}
              </p>
            )}
            <p className="text-white font-semibold text-base leading-snug truncate" data-testid="text-current-instruction">
              {currentStep.instruction}
            </p>
            {nextStep && (
              <p className="text-gray-400 text-sm truncate mt-0.5">
                Then: {nextStep.instruction}
              </p>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {/* ── Top maneuver card ─────────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-[1010] pointer-events-none"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
        data-testid="nav-maneuver-card"
      >
        <div className="mx-3 mt-3 bg-[#1c1c1e]/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
          {renderTopCard()}
        </div>
      </div>

      {/* ── Steps sheet (slide up) ────────────────────────────────────────── */}
      {showSteps && route && (
        <div
          className="fixed inset-x-0 z-[1011] bg-[#1c1c1e]/97 backdrop-blur-sm rounded-t-2xl shadow-2xl overflow-y-auto"
          style={{
            bottom: 0,
            maxHeight: '60vh',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
          }}
          data-testid="nav-steps-sheet"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#1c1c1e]">
            <h3 className="text-white font-semibold text-base">All Steps</h3>
            <button onClick={() => setShowSteps(false)} className="p-1" data-testid="button-close-steps">
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {route.steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 px-4 py-3 ${idx === currentStepIndex ? 'bg-green-900/30' : ''}`}
                data-testid={`nav-step-${idx}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  idx < currentStepIndex ? 'bg-gray-600' : idx === currentStepIndex ? 'bg-green-600' : 'bg-gray-700'
                }`}>
                  <ManeuverIcon maneuver={step.maneuver} modifier={step.modifier} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${idx === currentStepIndex ? 'text-white' : 'text-gray-300'}`}>
                    {step.instruction}
                  </p>
                  <p className="text-xs text-gray-500">{formatDistance(step.distance)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom trip bar ───────────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-[1010] pointer-events-none"
        style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
        data-testid="nav-trip-bar"
      >
        <div className="mx-3 mb-3 bg-[#1c1c1e]/95 backdrop-blur-sm rounded-2xl shadow-2xl px-4 py-3 pointer-events-auto">
          <div className="flex items-center gap-3">

            {/* Always-visible speed gauge */}
            <SpeedGauge speedMs={speed} />

            {/* ETA + distance */}
            <div className="flex-1 min-w-0">
              <p className="text-green-400 font-bold text-xl leading-tight" data-testid="text-eta">
                {etaStr}
              </p>
              <p className="text-gray-400 text-sm truncate">
                {formatDuration(remaining.dur)} · {formatDistance(remaining.dist)}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Recenter (shown when not following) */}
              {!isFollowingUser && (
                <button
                  onClick={onRecenter}
                  className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center"
                  data-testid="button-nav-recenter"
                >
                  <Navigation className="w-5 h-5 text-white" />
                </button>
              )}

              {/* Steps list toggle */}
              <button
                onClick={() => setShowSteps(!showSteps)}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${showSteps ? 'bg-green-700' : 'bg-gray-700'}`}
                data-testid="button-nav-steps"
              >
                <List className="w-5 h-5 text-white" />
              </button>

              {/* Voice toggle */}
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${voiceEnabled ? 'bg-green-600' : 'bg-gray-700'}`}
                data-testid="button-nav-voice"
              >
                {voiceEnabled
                  ? <Volume2 className="w-5 h-5 text-white" />
                  : <VolumeX  className="w-5 h-5 text-gray-400" />}
              </button>

              {/* End navigation */}
              <button
                onClick={onClose}
                className="px-4 h-10 rounded-full bg-red-600 text-white text-sm font-semibold"
                data-testid="button-nav-end"
              >
                End
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
