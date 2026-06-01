/**
 * ArrivalSheet - Bottom sheet arrival notification (NOT full-screen modal)
 * 
 * Google Maps / DoorDash style arrival UI:
 * - Bottom sheet at 25-35% of screen height
 * - Map remains fully visible and interactive above
 * - Swipe down to dismiss
 * - Clean, minimal design
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, CheckCircle2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Event } from "@shared/schema";

interface ArrivalSheetProps {
  event: Event;
  onDismiss: () => void;
  isDarkMode?: boolean;
}

export function ArrivalSheet({ event, onDismiss, isDarkMode = false }: ArrivalSheetProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTranslateY(0);
    setTimeout(onDismiss, 300);
  };

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    if (deltaY > 0) {
      setTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (translateY > 80) {
      handleDismiss();
    } else {
      setTranslateY(0);
    }
  };

  // Mouse handlers for desktop swipe
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartY.current;
    if (deltaY > 0) {
      setTranslateY(deltaY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (translateY > 80) {
      handleDismiss();
    } else {
      setTranslateY(0);
    }
  };

  return (
    <div
      ref={sheetRef}
      data-testid="sheet-arrival"
      className={`fixed bottom-0 left-0 right-0 z-[1000] transition-transform duration-300 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ 
        transform: `translateY(${translateY}px)`,
        maxHeight: '45vh',
        minHeight: '35vh',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Sheet background with glass effect */}
      <div 
        className={`h-full rounded-t-3xl shadow-2xl backdrop-blur-lg ${
          isDarkMode 
            ? 'bg-gray-900/95 border-t border-gray-700' 
            : 'bg-white/95 border-t border-gray-200'
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div 
            className={`w-10 h-1 rounded-full cursor-grab ${
              isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          />
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {/* Success indicator row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                You've Arrived!
              </h2>
              <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-sm truncate">{event.address}</span>
              </div>
            </div>
          </div>

          {/* Event info card */}
          <div className={`p-3 rounded-xl mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h3 className={`font-semibold mb-0.5 truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {event.name}
            </h3>
            {event.description && (
              <p className={`text-sm line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {event.description}
              </p>
            )}
          </div>

          {/* Action button */}
          <Button
            className="w-full bg-gradient-to-r from-green-500 to-green-500 hover:from-green-600 hover:to-green-600 text-white"
            onClick={handleDismiss}
            data-testid="button-arrival-done"
          >
            <Navigation className="h-4 w-4 mr-2" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
