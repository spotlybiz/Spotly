import { useState, useRef, useEffect, useCallback, memo, type ChangeEvent, type KeyboardEvent } from "react";
import { Search, X, MapPin, Fuel, Coffee, Store, Utensils, Pill, Building2, ShoppingCart, Hotel, Dumbbell, Car, Trees, Book, Scissors, Heart, ParkingCircle, Music, ShoppingBag, Users, Truck, Calendar } from "lucide-react";
import { searchMapboxPlaces, searchAppEvents, type UnifiedSearchResult } from "@/lib/universalSearch";

interface LocationSearchOverlayProps {
  userLocation: [number, number] | null;
  onSelectResult: (result: { lat: number; lng: number; name: string; address: string; type: string }) => void;
  onSelectEvent?: (event: any) => void;
  className?: string;
}

const DEBOUNCE_MS = 80;

const BRAND_ICONS: Record<string, typeof MapPin> = {
  chevron: Fuel, shell: Fuel, exxon: Fuel, mobil: Fuel, bp: Fuel, texaco: Fuel, arco: Fuel,
  "76": Fuel, valero: Fuel, sunoco: Fuel, marathon: Fuel, citgo: Fuel, speedway: Fuel, wawa: Fuel,
  quiktrip: Fuel, "circle k": Fuel, "7-eleven": Fuel, costco: Fuel,
  walmart: Store, target: Store, "home depot": Store, lowes: Store,
  kroger: ShoppingCart, safeway: ShoppingCart, "whole foods": ShoppingCart, "trader joe": ShoppingCart,
  starbucks: Coffee, dunkin: Coffee, "peets": Coffee, "dutch bros": Coffee,
  mcdonalds: Utensils, "burger king": Utensils, wendys: Utensils, chipotle: Utensils, subway: Utensils,
  cvs: Pill, walgreens: Pill, "rite aid": Pill,
  "wells fargo": Building2, "bank of america": Building2, chase: Building2,
  marriott: Hotel, hilton: Hotel, hyatt: Hotel,
  "planet fitness": Dumbbell, "24 hour fitness": Dumbbell, ymca: Dumbbell,
  autozone: Car, "jiffy lube": Car,
};

function getResultIcon(name: string, category?: string, resultType?: string): typeof MapPin {
  if (resultType === 'event') return Calendar;
  if (resultType === 'food_truck') return Truck;
  if (resultType === 'vendor') return ShoppingBag;
  if (resultType === 'performer') return Music;

  const lower = name.toLowerCase();
  for (const [brand, icon] of Object.entries(BRAND_ICONS)) {
    if (lower.includes(brand)) return icon;
  }
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes("fuel") || cat.includes("gas")) return Fuel;
    if (cat.includes("pharmacy")) return Pill;
    if (cat.includes("cafe") || cat.includes("coffee")) return Coffee;
    if (cat.includes("restaurant") || cat.includes("fast_food")) return Utensils;
    if (cat.includes("supermarket") || cat.includes("grocery")) return ShoppingCart;
    if (cat.includes("shop") || cat.includes("store")) return Store;
    if (cat.includes("bank")) return Building2;
    if (cat.includes("hospital") || cat.includes("clinic")) return Heart;
    if (cat.includes("hotel")) return Hotel;
    if (cat.includes("gym") || cat.includes("fitness")) return Dumbbell;
    if (cat.includes("parking")) return ParkingCircle;
    if (cat.includes("park")) return Trees;
    if (cat.includes("library")) return Book;
    if (cat.includes("salon") || cat.includes("hair")) return Scissors;
    if (cat.includes("car") || cat.includes("auto")) return Car;
    if (cat.includes("food_truck")) return Truck;
    if (cat.includes("market")) return ShoppingBag;
    if (cat.includes("performer")) return Music;
    if (cat.includes("community")) return Users;
  }
  return MapPin;
}

function getResultBadgeColor(resultType: string): string {
  switch (resultType) {
    case 'event':      return 'bg-gradient-to-br from-green-500 to-emerald-500';
    case 'food_truck': return 'bg-gradient-to-br from-orange-500 to-red-500';
    case 'vendor':     return 'bg-gradient-to-br from-green-500 to-green-600';
    case 'performer':  return 'bg-gradient-to-br from-indigo-500 to-emerald-500';
    default:           return 'bg-gradient-to-br from-green-500 to-emerald-500';
  }
}

const ResultItem = memo(({ result, onSelect }: { result: UnifiedSearchResult; onSelect: () => void }) => {
  const IconComponent = getResultIcon(result.name, result.category, result.type);
  const badgeColor = getResultBadgeColor(result.type);
  const isSpecialType = ['event', 'food_truck', 'vendor', 'performer'].includes(result.type);

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors border-b border-black/5 dark:border-white/10 last:border-b-0"
      data-testid={`search-result-${result.id}`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          isSpecialType ? badgeColor : IconComponent !== MapPin ? 'bg-gradient-to-br from-green-500 to-emerald-500' : 'bg-gray-100 dark:bg-gray-700'
        }`}
      >
        <IconComponent className={`w-4 h-4 ${isSpecialType || IconComponent !== MapPin ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[15px] font-medium text-gray-900 dark:text-white truncate">{result.name}</div>
        <div className="text-[13px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
          {result.type === 'event'      && <span className="text-emerald-500 font-medium">Event</span>}
          {result.type === 'food_truck' && <span className="text-orange-500 font-medium">Food Truck</span>}
          {result.type === 'vendor'     && <span className="text-green-500 font-medium">Vendor</span>}
          {result.type === 'performer'  && <span className="text-indigo-500 font-medium">Performer</span>}
          {['event', 'food_truck', 'vendor', 'performer'].includes(result.type) && result.address && ' · '}
          {result.address || result.type}
        </div>
      </div>
      {result.distanceText && (
        <div className="text-[13px] text-gray-500 dark:text-gray-400 flex-shrink-0">{result.distanceText}</div>
      )}
    </button>
  );
});

ResultItem.displayName = "ResultItem";

export function LocationSearchOverlay({
  userLocation,
  onSelectResult,
  onSelectEvent,
  className = "",
}: LocationSearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef      = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<NodeJS.Timeout | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      setIsDropdownOpen(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setIsDropdownOpen(true);

    try {
      const [eventResults, placeResults] = await Promise.all([
        searchAppEvents(searchQuery, userLocation, abortRef.current.signal),
        searchMapboxPlaces(searchQuery, userLocation, abortRef.current.signal),
      ]);

      const combined = [...eventResults, ...placeResults];
      const seen = new Set<string>();
      const deduped = combined.filter((r) => {
        const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const typeOrder: Record<string, number> = {
        event: 0, food_truck: 1, vendor: 2, performer: 3, business: 4, address: 5, area: 6,
      };
      const sorted = deduped
        .sort((a, b) => {
          const ao = typeOrder[a.type] ?? 10, bo = typeOrder[b.type] ?? 10;
          return ao !== bo ? ao - bo : a.distance - b.distance;
        })
        .slice(0, 10);

      setResults(sorted);
      setIsDropdownOpen(sorted.length > 0);
    } catch (error) {
      if ((error as Error).name !== "AbortError") console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userLocation]);

  const debouncedSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => executeSearch(searchQuery), DEBOUNCE_MS);
  }, [executeSearch]);

  useEffect(() => {
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    if (query.length >= 2) debouncedSearch(query);
    else { setResults([]); setIsDropdownOpen(false); }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsDropdownOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleSelectResult = useCallback((result: UnifiedSearchResult) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (abortRef.current)    { abortRef.current.abort();           abortRef.current = null; }
    justSelectedRef.current = true;
    setIsDropdownOpen(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();

    const isUserEvent = ['event', 'food_truck', 'vendor', 'performer'].includes(result.type);
    if (isUserEvent && onSelectEvent) {
      onSelectEvent({
        id: result.id.replace(/^event_/, ''),
        name: result.name,
        category: result.category || result.type,
        latitude: result.lat,
        longitude: result.lng,
        address: result.address,
        startDate: result.eventData?.startDate || new Date().toISOString(),
        endDate:   result.eventData?.endDate   || new Date().toISOString(),
        description: result.eventData?.description || "",
      });
    } else {
      onSelectResult({ lat: result.lat, lng: result.lng, name: result.name, address: result.address, type: result.type });
    }
  }, [onSelectResult, onSelectEvent]);

  const handleSearchSubmit = useCallback(() => {
    if (results.length > 0) {
      handleSelectResult(results[0]);
      inputRef.current?.blur();
    } else if (query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      executeSearch(query);
    }
  }, [query, executeSearch, results, handleSelectResult]);

  const showClearButton = query.length > 0;

  return (
    <div
      ref={containerRef}
      className={`fixed left-4 right-4 z-[9999] ${className}`}
      style={{ top: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
    >
      {/* Search pill */}
      <div
        className={`
          flex items-center gap-2 px-4 h-12
          bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl
          rounded-full shadow-lg shadow-black/10
          border border-white/20 dark:border-gray-700/50
          transition-shadow duration-200
          ${isFocused ? "shadow-xl shadow-black/15 ring-2 ring-[#16a34a]/30" : ""}
        `}
      >
        <button
          onClick={handleSearchSubmit}
          className="flex-shrink-0 p-1 -ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          data-testid="button-search-submit"
          aria-label="Search"
        >
          <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onFocus={() => { setIsFocused(true); if (results.length > 0) setIsDropdownOpen(true); }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") { e.preventDefault(); handleSearchSubmit(); }
            else if (e.key === "Escape") { setIsDropdownOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Search places, events, food trucks…"
          className="flex-1 bg-transparent border-none outline-none text-[16px] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-testid="input-search"
        />

        <button
          onClick={handleClear}
          className={`
            flex-shrink-0 p-1 -mr-1 rounded-full
            hover:bg-black/5 dark:hover:bg-white/10
            transition-all duration-150
            ${showClearButton ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"}
          `}
          data-testid="button-clear-search"
          aria-label="Clear search"
          tabIndex={showClearButton ? 0 : -1}
        >
          <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Results dropdown */}
      {isDropdownOpen && results.length > 0 && (
        <div
          className="mt-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/15 border border-white/20 dark:border-gray-700/50 overflow-hidden max-h-[60vh] overflow-y-auto"
          data-testid="search-results-dropdown"
        >
          {results.map((result) => (
            <ResultItem key={result.id} result={result} onSelect={() => handleSelectResult(result)} />
          ))}
        </div>
      )}

      {/* No results */}
      {isDropdownOpen && results.length === 0 && !isLoading && query.length >= 2 && (
        <div className="mt-2 p-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/15 border border-white/20 dark:border-gray-700/50 text-center text-[14px] text-gray-500 dark:text-gray-400">
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}
