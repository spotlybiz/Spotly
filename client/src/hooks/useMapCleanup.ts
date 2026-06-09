import { useEffect } from 'react';

export function useMapCleanup(mapRef: any) {
  useEffect(() => {
    return () => {
      if (mapRef?.current) {
        // Properly destroy map instance
        mapRef.current.remove?.();
        mapRef.current = null;
      }
    };
  }, [mapRef]);
}