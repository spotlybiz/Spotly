import { useState, useMemo } from "react";
import type { Event, EventCategory } from "@shared/schema";
import { isToday, isTomorrow, isThisWeek, startOfDay, endOfDay, addDays } from "date-fns";

export type DateFilterOption = "all" | "today" | "tomorrow" | "this_weekend" | "this_week";

export const categories: { value: EventCategory | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "food_truck", label: "Food Trucks" },
  { value: "performer", label: "Performers" },
  { value: "market", label: "Markets" },
  { value: "vendor", label: "Vendors" },
  { value: "community", label: "Community" },
  { value: "other", label: "Other" },
];

export const dateFilters: { value: DateFilterOption; label: string }[] = [
  { value: "all", label: "Any Time" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
];

export const distanceFilters: { value: number | null; label: string }[] = [
  { value: null, label: "Any" },
  { value: 1, label: "1 mi" },
  { value: 5, label: "5 mi" },
  { value: 10, label: "10 mi" },
  { value: 25, label: "25 mi" },
  { value: 50, label: "50 mi" },
];

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

interface UseEventFiltersParams {
  events: Event[];
  userLocation: [number, number] | null;
}

export function useEventFilters({ events, userLocation }: UseEventFiltersParams) {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateFilterOption>("all");
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    
    // Filter out expired events (endDate has passed)
    let result = events.filter(event => new Date(event.endDate) >= now);

    if (selectedCategory) {
      result = result.filter(event => event.category === selectedCategory);
    }

    if (selectedDate !== "all") {
      const now = new Date();
      result = result.filter(event => {
        const eventDate = new Date(event.startDate);
        switch (selectedDate) {
          case "today":
            return isToday(eventDate);
          case "tomorrow":
            return isTomorrow(eventDate);
          case "this_weekend":
            const friday = startOfDay(addDays(now, (5 - now.getDay() + 7) % 7));
            const sunday = endOfDay(addDays(friday, 2));
            return eventDate >= friday && eventDate <= sunday;
          case "this_week":
            return isThisWeek(eventDate, { weekStartsOn: 0 });
          default:
            return true;
        }
      });
    }

    // Distance filtering
    if (selectedDistance !== null && userLocation) {
      result = result.filter(event => {
        const dist = calculateDistance(userLocation[0], userLocation[1], event.latitude, event.longitude);
        return dist <= selectedDistance;
      });
    }

    if (userLocation) {
      result.sort((a, b) => {
        const distA = calculateDistance(userLocation[0], userLocation[1], a.latitude, a.longitude);
        const distB = calculateDistance(userLocation[0], userLocation[1], b.latitude, b.longitude);
        return distA - distB;
      });
    }

    return result;
  }, [events, selectedCategory, selectedDate, selectedDistance, userLocation]);

  const activeFiltersCount = (selectedCategory ? 1 : 0) + (selectedDate !== "all" ? 1 : 0) + (selectedDistance !== null ? 1 : 0);

  return {
    selectedCategory,
    setSelectedCategory,
    selectedDate,
    setSelectedDate,
    selectedDistance,
    setSelectedDistance,
    showFilters,
    setShowFilters,
    filteredEvents,
    activeFiltersCount,
  };
}
