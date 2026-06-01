import { useState, useEffect, useRef } from "react";
import { X, Hash, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  placeholder?: string;
  disabled?: boolean;
}

interface TagSuggestion {
  id: string;
  name: string;
  usageCount: number;
}

export function TagInput({
  value = [],
  onChange,
  maxTags = 10,
  placeholder = "Add tags (press Enter)",
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (inputValue.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tags/suggest?q=${encodeURIComponent(inputValue)}&limit=5`);
        const data = await response.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Tag suggestion error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizeTag = (tag: string): string => {
    return tag.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  };

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    if (value.length >= maxTags) return;
    if (value.includes(normalized)) return;

    onChange([...value, normalized]);
    setInputValue("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        addTag(suggestions[selectedIndex].name);
      } else if (inputValue) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "," || e.key === " ") {
      if (inputValue.trim()) {
        e.preventDefault();
        addTag(inputValue);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[42px]">
        {value.map(tag => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 pr-1"
          >
            <Hash className="h-3 w-3" />
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-destructive/20 rounded-full"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              data-testid={`button-remove-tag-${tag}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
        
        {value.length < maxTags && (
          <div className="relative flex-1 min-w-[120px]">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              onKeyDown={handleKeyDown}
              onFocus={() => inputValue && setShowSuggestions(suggestions.length > 0)}
              placeholder={value.length === 0 ? placeholder : ""}
              disabled={disabled}
              className="border-0 shadow-none focus-visible:ring-0 p-0 h-6 text-sm"
              data-testid="input-tag"
            />
            {isLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div 
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-auto"
          data-testid="dropdown-tag-suggestions"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                index === selectedIndex 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-muted"
              }`}
              onClick={() => addTag(suggestion.name)}
              data-testid={`suggestion-tag-${suggestion.name}`}
            >
              <span className="flex items-center gap-1.5">
                <Hash className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{suggestion.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {suggestion.usageCount} events
              </span>
            </button>
          ))}
          {inputValue && !suggestions.some(s => s.name === normalizeTag(inputValue)) && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-1.5 hover:bg-muted border-t dark:border-gray-700"
              onClick={() => addTag(inputValue)}
              data-testid="button-create-new-tag"
            >
              <Plus className="h-3 w-3 text-primary" />
              <span>Create <strong>#{normalizeTag(inputValue)}</strong></span>
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1.5">
        {value.length}/{maxTags} tags • Press Enter, comma, or space to add
      </p>
    </div>
  );
}
