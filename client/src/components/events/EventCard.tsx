import { format, isToday, isTomorrow } from "date-fns";
import type { Event, EventCategory } from "@shared/schema";
import { categoryLabels } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  MapPin, 
  Navigation, 
  ChevronRight,
  UtensilsCrossed,
  Music,
  ShoppingBag,
  Store,
  Users,
  Pin
} from "lucide-react";

const categoryColors: Record<EventCategory, { bg: string; text: string; icon: string }> = {
  food_truck: { bg: "#ff6b35", text: "#ff6b35", icon: "#ff6b35" },
  performer: { bg: "#8b5cf6", text: "#8b5cf6", icon: "#8b5cf6" },
  market: { bg: "#16a34a", text: "#16a34a", icon: "#16a34a" },
  vendor: { bg: "#16a34a", text: "#16a34a", icon: "#16a34a" },
  community: { bg: "#06b6d4", text: "#06b6d4", icon: "#06b6d4" },
  other: { bg: "#16a34a", text: "#16a34a", icon: "#16a34a" }
};

const CategoryIcon = ({ category }: { category: EventCategory }) => {
  const iconProps = { className: "h-8 w-8" };
  switch (category) {
    case "food_truck":
      return <UtensilsCrossed {...iconProps} />;
    case "performer":
      return <Music {...iconProps} />;
    case "market":
      return <ShoppingBag {...iconProps} />;
    case "vendor":
      return <Store {...iconProps} />;
    case "community":
      return <Users {...iconProps} />;
    default:
      return <Pin {...iconProps} />;
  }
};

interface EventCardProps {
  event: Event;
  userLocation?: [number, number] | null;
  onSelect: (event: Event) => void;
  onGetDirections: (event: Event) => void;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatEventDate(date: Date): string {
  if (isToday(date)) {
    return `Today at ${format(date, "h:mm a")}`;
  }
  if (isTomorrow(date)) {
    return `Tomorrow at ${format(date, "h:mm a")}`;
  }
  return format(date, "EEE, MMM d 'at' h:mm a");
}

export function EventCard({ event, userLocation, onSelect, onGetDirections }: EventCardProps) {
  const startDate = new Date(event.startDate);
  const distance = userLocation 
    ? calculateDistance(userLocation[0], userLocation[1], event.latitude, event.longitude)
    : null;
  const colors = categoryColors[event.category as EventCategory] ?? categoryColors["other"];

  return (
    <Card 
      className="card-lift cursor-pointer transition-all duration-200 overflow-visible border-0 shadow-sm hover:shadow-md"
      onClick={() => onSelect(event)}
      data-testid={`card-event-${event.id}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {event.imageUrl ? (
            <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-muted ring-2 ring-border/50">
              <img 
                src={event.imageUrl} 
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div 
              className="w-24 h-24 rounded-xl flex-shrink-0 flex items-center justify-center ring-2 transition-transform duration-200"
              style={{ 
                backgroundColor: colors.bg + "12", 
                color: colors.icon,
                borderColor: colors.bg + "25"
              }}
            >
              <CategoryIcon category={event.category as EventCategory} />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <Badge 
                variant="secondary" 
                className="text-xs flex-shrink-0 font-medium px-2.5 py-0.5"
                style={{ 
                  backgroundColor: colors.bg + "15", 
                  color: colors.text,
                  border: `1.5px solid ${colors.bg}40`
                }}
              >
                {categoryLabels[event.category as EventCategory]}
              </Badge>
              {distance !== null && (
                <Badge variant="outline" className="text-xs flex-shrink-0 font-normal">
                  {distance < 1 ? `${Math.round(distance * 5280)} ft` : `${distance.toFixed(1)} mi`}
                </Badge>
              )}
            </div>
            
            <h3 className="font-bold text-base leading-tight mb-2 line-clamp-2 text-gray-900 dark:text-white">
              {event.name}
            </h3>
            
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="p-1 rounded-md bg-primary/10">
                  <Clock className="h-3 w-3 text-primary" />
                </div>
                <span className="truncate font-medium">{formatEventDate(startDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="p-1 rounded-md bg-accent/10">
                  <MapPin className="h-3 w-3 text-accent" />
                </div>
                <span className="truncate">{event.address}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-xl border-2 hover:border-primary hover:bg-primary/5"
              onClick={(e) => {
                e.stopPropagation();
                onGetDirections(event);
              }}
              data-testid={`button-quick-directions-${event.id}`}
            >
              <Navigation className="h-4 w-4" />
            </Button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
