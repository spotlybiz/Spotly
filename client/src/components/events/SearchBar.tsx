import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ 
  value, 
  onChange, 
  onLocationSearch,
  placeholder = "Search events or places...",
  className 
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onLocationSearch && value.trim()) {
      onLocationSearch(value.trim());
    }
  };

  return (
    <div 
      className={cn(
        "relative flex items-center transition-all duration-200",
        className
      )}
    >
      <div 
        className={cn(
          "relative flex-1 flex items-center bg-background border rounded-full shadow-lg transition-all duration-200",
          isFocused && "ring-2 ring-primary/20 border-primary"
        )}
      >
        <Search className="absolute left-4 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-10 pr-10 h-12 border-0 bg-transparent focus-visible:ring-0 text-base rounded-full"
          data-testid="input-search"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 h-8 w-8 rounded-full"
            onClick={handleClear}
            data-testid="button-clear-search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
