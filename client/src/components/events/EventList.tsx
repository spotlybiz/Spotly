import type { Event } from "@shared/schema";
import { EventCard } from "./EventCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Calendar, Search } from "lucide-react";

interface EventListProps {
  events: Event[];
  userLocation: [number, number] | null;
  isLoading: boolean;
  onEventSelect: (event: Event) => void;
  onGetDirections: (event: Event) => void;
  searchQuery?: string;
}

function EventListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 p-4 bg-card rounded-lg border">
          <Skeleton className="w-24 h-24 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ searchQuery }: { searchQuery?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        {searchQuery ? (
          <Search className="h-10 w-10 text-muted-foreground" />
        ) : (
          <Calendar className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
        {searchQuery ? "No matching events" : "No events nearby"}
      </h3>
      <p className="text-muted-foreground max-w-xs">
        {searchQuery 
          ? `We couldn't find any events matching "${searchQuery}". Try a different search term.`
          : "There are no events in this area yet. Be the first to add one!"
        }
      </p>
    </div>
  );
}

export function EventList({ 
  events, 
  userLocation, 
  isLoading, 
  onEventSelect, 
  onGetDirections,
  searchQuery 
}: EventListProps) {
  if (isLoading) {
    return <EventListSkeleton />;
  }

  if (events.length === 0) {
    return <EmptyState searchQuery={searchQuery} />;
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""} found
        </span>
        {userLocation && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Sorted by distance
          </span>
        )}
      </div>
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          userLocation={userLocation}
          onSelect={onEventSelect}
          onGetDirections={onGetDirections}
        />
      ))}
    </div>
  );
}
