import { useState, useEffect, useCallback, useRef } from "react";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Navigation, Check, Loader2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationPickerProps {
  initialLocation?: [number, number] | null;
  userLocation?: [number, number] | null;
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}

interface PlaceSuggestion {
  displayName: string;
  latitude: number;
  longitude: number;
}

const LIGHT_STYLE = 'mapbox://styles/mapbox/streets-v12';
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';

export function LocationPicker({ 
  initialLocation, 
  userLocation, 
  onLocationSelect, 
  onClose 
}: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [centerCoords, setCenterCoords] = useState<[number, number]>(
    initialLocation || userLocation || [0, 0]
  );
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize the Mapbox map after fetching the access token from the backend
  useEffect(() => {
    if (!mapContainer.current) return;

    let map: mapboxgl.Map;
    let observer: MutationObserver;

    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (!cfg.mapboxToken || !mapContainer.current) return;
        mapboxgl.accessToken = cfg.mapboxToken;

        const isDarkMode = document.documentElement.classList.contains('dark');

        map = new mapboxgl.Map({
          container: mapContainer.current,
          style: isDarkMode ? DARK_STYLE : LIGHT_STYLE,
          center: [centerCoords[1], centerCoords[0]],
          zoom: 16,
          attributionControl: false,
        });

        mapRef.current = map;

        map.on('moveend', () => {
          const center = map.getCenter();
          setCenterCoords([center.lat, center.lng]);
        });

        // Watch for theme changes
        observer = new MutationObserver(() => {
          if (mapRef.current) {
            const nowDark = document.documentElement.classList.contains('dark');
            mapRef.current.setStyle(nowDark ? DARK_STYLE : LIGHT_STYLE);
          }
        });
        observer.observe(document.documentElement, { attributes: true });
      })
      .catch(err => console.error('Failed to init LocationPicker map:', err));

    return () => {
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Reverse geocode center coordinates using backend (Mapbox)
  useEffect(() => {
    if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);

    geocodeTimeoutRef.current = setTimeout(async () => {
      setIsReverseGeocoding(true);
      try {
        const response = await fetch(
          `/api/reverse-geocode?lat=${centerCoords[0]}&lng=${centerCoords[1]}`
        );
        const data = await response.json();
        setCurrentAddress(data.address || `${centerCoords[0].toFixed(5)}, ${centerCoords[1].toFixed(5)}`);
      } catch {
        setCurrentAddress(`${centerCoords[0].toFixed(5)}, ${centerCoords[1].toFixed(5)}`);
      }
      setIsReverseGeocoding(false);
    }, 500);

    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    };
  }, [centerCoords]);

  // Forward geocode search using backend (Mapbox)
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/address-autocomplete?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setSearchResults(data.suggestions || []);
      setShowResults(true);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, handleSearch]);

  const handleResultSelect = (result: PlaceSuggestion) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [result.longitude, result.latitude],
        zoom: 17,
        duration: 1000,
      });
    }

    setCenterCoords([result.latitude, result.longitude]);
    setCurrentAddress(result.displayName.split(", ").slice(0, 3).join(", "));
    setShowResults(false);
    setSearchQuery("");
  };

  const handleUseMyLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation[1], userLocation[0]],
        zoom: 17,
        duration: 1000,
      });
      setCenterCoords(userLocation);
    }
  };

  const handleConfirmLocation = () => {
    setIsConfirming(true);
    setTimeout(() => {
      onLocationSelect(centerCoords[0], centerCoords[1], currentAddress);
    }, 200);
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-picker-title"
    >
      <div 
        className="absolute top-0 left-0 right-0 z-[10001] p-3 space-y-2 bg-gradient-to-b from-white/98 via-white/95 to-transparent dark:from-gray-900/98 dark:via-gray-900/95 dark:to-transparent"
        style={{ paddingBottom: '32px' }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close location picker"
            data-testid="button-close-location-picker"
            className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 id="location-picker-title" className="text-lg font-semibold flex-1 text-foreground">Choose Location</h2>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for an address or place..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
            data-testid="input-location-search"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {showResults && searchResults.length > 0 && (
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg max-h-60 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={index}
                className="w-full text-left px-4 py-3 active:bg-gray-50 dark:active:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-start gap-3 transition-colors"
                onClick={() => handleResultSelect(result)}
                data-testid={`location-search-result-${index}`}
              >
                <MapPin className="h-4 w-4 mt-1 text-primary shrink-0" />
                <span className="text-sm text-foreground line-clamp-2">{result.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {userLocation && !showResults && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUseMyLocation}
            className="w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-sm"
            data-testid="button-use-current-location"
          >
            <Navigation className="h-4 w-4 mr-2" />
            Use my current location
          </Button>
        )}
      </div>

      <div className="flex-1 relative">
        <div ref={mapContainer} className="h-full w-full" />

        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-[1000]"
          style={{ marginTop: '-8px' }}
        >
          <div className="relative">
            <div 
              className={cn(
                "w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg transition-transform duration-200",
                isConfirming && "scale-125"
              )}
            >
              <MapPin className="h-6 w-6 text-white" />
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-primary" />
            </div>
            <div 
              className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] w-4 h-1 bg-black/20 rounded-full blur-sm"
            />
          </div>
        </div>
      </div>

      <div 
        className="absolute bottom-0 left-0 right-0 z-[10001] p-4 space-y-3 bg-gradient-to-t from-white/98 via-white/95 to-transparent dark:from-gray-900/98 dark:via-gray-900/95 dark:to-transparent"
        style={{ paddingTop: '32px' }}
      >
        <div className="flex items-center gap-2 min-h-[24px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-3 shadow-sm">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          {isReverseGeocoding ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Getting address...</span>
            </div>
          ) : (
            <span className="text-sm text-foreground line-clamp-1" data-testid="text-current-address">
              {currentAddress || "Move the map to select location"}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center">
          {centerCoords[0].toFixed(5)}, {centerCoords[1].toFixed(5)}
        </div>

        <Button
          onClick={handleConfirmLocation}
          className="w-full rounded-xl shadow-sm"
          size="lg"
          disabled={!currentAddress || isReverseGeocoding}
          data-testid="button-confirm-location"
        >
          <Check className="h-4 w-4 mr-2" />
          Confirm Location
        </Button>
      </div>
    </div>
  );
}
