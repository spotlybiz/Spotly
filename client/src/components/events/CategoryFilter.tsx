import { eventCategories, categoryLabels, type EventCategory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { 
  UtensilsCrossed, 
  Music, 
  ShoppingBag, 
  Store, 
  Users, 
  MapPin,
  Sparkles
} from "lucide-react";

const categoryIcons: Record<EventCategory | "all", React.ReactNode> = {
  all: <Sparkles className="h-4 w-4" />,
  food_truck: <UtensilsCrossed className="h-4 w-4" />,
  performer: <Music className="h-4 w-4" />,
  market: <ShoppingBag className="h-4 w-4" />,
  vendor: <Store className="h-4 w-4" />,
  community: <Users className="h-4 w-4" />,
  other: <MapPin className="h-4 w-4" />
};

const categoryColors: Record<EventCategory, { bg: string; text: string }> = {
  food_truck: { bg: "#ff6b35", text: "#ff6b35" },
  performer: { bg: "#8b5cf6", text: "#8b5cf6" },
  market: { bg: "#16a34a", text: "#16a34a" },
  vendor: { bg: "#16a34a", text: "#16a34a" },
  community: { bg: "#06b6d4", text: "#06b6d4" },
  other: { bg: "#16a34a", text: "#16a34a" }
};

interface CategoryFilterProps {
  selectedCategory: EventCategory | null;
  onCategoryChange: (category: EventCategory | null) => void;
}

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 px-4 py-3">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          className={cn(
            "rounded-full flex-shrink-0 gap-2 font-semibold px-4 transition-all duration-200",
            selectedCategory === null && "shadow-md fun-gradient border-0"
          )}
          onClick={() => onCategoryChange(null)}
          data-testid="button-filter-all"
        >
          {categoryIcons.all}
          <span>All</span>
        </Button>
        
        {eventCategories.map((category) => {
          const isSelected = selectedCategory === category;
          const colors = categoryColors[category];
          
          return (
            <Button
              key={category}
              variant="outline"
              size="sm"
              className={cn(
                "rounded-full flex-shrink-0 gap-2 px-4 font-medium transition-all duration-200 border-2",
                isSelected && "shadow-md scale-105"
              )}
              style={isSelected ? {
                backgroundColor: colors.bg + "18",
                borderColor: colors.bg,
                color: colors.text
              } : {
                borderColor: "transparent",
                backgroundColor: "hsl(var(--muted))"
              }}
              onClick={() => onCategoryChange(isSelected ? null : category)}
              data-testid={`button-filter-${category}`}
            >
              {categoryIcons[category]}
              <span>{categoryLabels[category]}</span>
            </Button>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" className="invisible" />
    </ScrollArea>
  );
}
