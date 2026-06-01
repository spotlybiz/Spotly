import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface BottomSheetProps {
  children: ReactNode;
  snapPoints: number[];
  initialSnap?: number;
  onSnapChange?: (snapIndex: number) => void;
  headerContent?: ReactNode;
  className?: string;
}

export function BottomSheet({
  children,
  snapPoints,
  initialSnap = 0,
  onSnapChange,
  headerContent,
  className = "",
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startTranslateY = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const getSnapHeight = useCallback((index: number) => {
    if (typeof window === "undefined") return 0;
    const windowHeight = window.innerHeight;
    const snapPercent = snapPoints[index] || snapPoints[0];
    return windowHeight * (snapPercent / 100);
  }, [snapPoints]);

  const currentHeight = getSnapHeight(currentSnap);

  useEffect(() => {
    setTranslateY(0);
  }, [currentSnap]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (contentRef.current?.contains(e.target as Node)) {
      const scrollTop = contentRef.current.scrollTop;
      if (scrollTop > 0) return;
    }
    
    setIsDragging(true);
    startY.current = e.clientY;
    startTranslateY.current = translateY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [translateY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const deltaY = startY.current - e.clientY;
    const newTranslateY = startTranslateY.current + deltaY;
    
    const maxHeight = getSnapHeight(snapPoints.length - 1);
    const minHeight = getSnapHeight(0);
    const newHeight = currentHeight + newTranslateY;
    
    if (newHeight >= minHeight - 50 && newHeight <= maxHeight + 50) {
      setTranslateY(newTranslateY);
    }
  }, [isDragging, currentHeight, getSnapHeight, snapPoints.length]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const newHeight = currentHeight + translateY;
    
    let closestSnap = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < snapPoints.length; i++) {
      const snapHeight = getSnapHeight(i);
      const distance = Math.abs(newHeight - snapHeight);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSnap = i;
      }
    }
    
    const velocity = translateY / 10;
    if (Math.abs(velocity) > 5) {
      if (velocity > 0 && closestSnap < snapPoints.length - 1) {
        closestSnap++;
      } else if (velocity < 0 && closestSnap > 0) {
        closestSnap--;
      }
    }
    
    setCurrentSnap(closestSnap);
    setTranslateY(0);
    onSnapChange?.(closestSnap);
  }, [isDragging, currentHeight, translateY, snapPoints.length, getSnapHeight, onSnapChange]);

  const effectiveHeight = Math.max(0, currentHeight + translateY);

  return (
    <div
      ref={sheetRef}
      className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl z-50 ${className}`}
      style={{
        height: `${effectiveHeight}px`,
        transition: isDragging ? "none" : "height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 pt-2 pb-3 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto" />
          {headerContent && (
            <div className="mt-3 px-4">
              {headerContent}
            </div>
          )}
        </div>
        
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-safe"
          style={{
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function useBottomSheet(snapPoints: number[], initialSnap = 0) {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  
  const snapTo = useCallback((index: number) => {
    if (index >= 0 && index < snapPoints.length) {
      setCurrentSnap(index);
    }
  }, [snapPoints.length]);
  
  const expand = useCallback(() => {
    setCurrentSnap(snapPoints.length - 1);
  }, [snapPoints.length]);
  
  const collapse = useCallback(() => {
    setCurrentSnap(0);
  }, []);
  
  return {
    currentSnap,
    setCurrentSnap,
    snapTo,
    expand,
    collapse,
  };
}
