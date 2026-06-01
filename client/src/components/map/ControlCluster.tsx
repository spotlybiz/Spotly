import { useState, useEffect } from "react";
import { Navigation, Layers, Compass, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ControlClusterProps {
  onRecenter: () => void;
  onToggleLayers?: () => void;
  showLayers?: boolean;
  compassHeading?: number | null;
  isFollowing?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ControlCluster({
  onRecenter,
  onToggleLayers,
  showLayers = false,
  compassHeading,
  isFollowing = false,
  className = "",
  style,
}: ControlClusterProps) {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (typeof window !== "undefined" && localStorage.getItem("theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <div
      className={`flex flex-col gap-2 ${className}`}
      style={style}
    >
      {/* Recenter / Location button */}
      <Button
        size="icon"
        variant={isFollowing ? "default" : "secondary"}
        onClick={onRecenter}
        className={`rounded-full shadow-lg ${
          isFollowing
            ? "text-white"
            : "bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm"
        }`}
        style={isFollowing ? {
          background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)'
        } : undefined}
        data-testid="button-recenter"
      >
        <Navigation className="w-5 h-5" />
      </Button>

      {/* Theme toggle */}
      <Button
        size="icon"
        variant="secondary"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg"
        data-testid="button-theme-toggle"
      >
        {isDark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-green-500" />}
      </Button>

      {/* Layers toggle */}
      {onToggleLayers && (
        <Button
          size="icon"
          variant={showLayers ? "default" : "secondary"}
          onClick={onToggleLayers}
          className={`rounded-full shadow-lg ${
            showLayers
              ? "text-white"
              : "bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm"
          }`}
          style={showLayers ? {
            background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)'
          } : undefined}
          data-testid="button-layers"
        >
          <Layers className="w-5 h-5" />
        </Button>
      )}

      {/* Compass (when available) */}
      {compassHeading !== null && compassHeading !== undefined && (
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg"
        >
          <Compass
            className="w-5 h-5 text-gray-700 dark:text-gray-200 transition-transform duration-300"
            style={{
              transform: `rotate(${-compassHeading}deg)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
