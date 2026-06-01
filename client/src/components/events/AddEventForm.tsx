import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { insertEventSchema, eventCategories, categoryLabels, type EventCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CalendarIcon, 
  Loader2, 
  MapPin, 
  Clock,
  UtensilsCrossed,
  Music,
  ShoppingBag,
  Store,
  Users,
  Pin,
  AlertCircle,
  LogIn,
  Navigation
} from "lucide-react";
import { Link } from "wouter";
import { LocationPicker } from "./LocationPicker";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { TagInput } from "./TagInput";

const categoryIcons: Record<EventCategory, React.ReactNode> = {
  food_truck: <UtensilsCrossed className="h-5 w-5" />,
  performer: <Music className="h-5 w-5" />,
  market: <ShoppingBag className="h-5 w-5" />,
  vendor: <Store className="h-5 w-5" />,
  community: <Users className="h-5 w-5" />,
  other: <Pin className="h-5 w-5" />
};

const formSchema = insertEventSchema.extend({
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
}).omit({ latitude: true, longitude: true });

type FormData = z.infer<typeof formSchema>;

interface AddEventFormProps {
  open: boolean;
  onClose: () => void;
  userLocation?: [number, number] | null;
  hasRealLocation?: boolean;
  onEventCreated?: (lat: number, lng: number) => void;
}

export function AddEventForm({ open, onClose, userLocation, hasRealLocation, onEventCreated }: AddEventFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [eventTags, setEventTags] = useState<string[]>([]);
  const dragStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "food_truck",
      description: "",
      address: "",
      startTime: "10:00",
      endTime: "18:00",
      imageUrl: "",
      organizerName: "",
      organizerContact: "",
    },
  });

  useEffect(() => {
    if (open) {
      setDragOffset(0);
    }
  }, [open]);

  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    dragStartY.current = clientY;
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    const delta = clientY - dragStartY.current;
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (dragOffset > 150) {
      onClose();
    }
    setDragOffset(0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleDragMove(e.clientY);
      };
      const handleGlobalMouseUp = () => {
        handleDragEnd();
      };
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging]);

  const handleLocationSelect = (lat: number, lng: number, address: string) => {
    setSelectedCoords({ lat, lng });
    form.setValue("address", address);
    setUseCurrentLocation(false);
    setShowLocationPicker(false);
  };

  const createEventMutation = useMutation({
    mutationFn: async (data: FormData) => {
      let latitude: number;
      let longitude: number;
      let address = data.address;

      // Priority: 1. Selected coords from map picker, 2. Current location, 3. Geocode address
      if (selectedCoords) {
        latitude = selectedCoords.lat;
        longitude = selectedCoords.lng;
      } else if (useCurrentLocation && userLocation) {
        latitude = userLocation[0];
        longitude = userLocation[1];
        if (!address) {
          try {
            const response = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
            const geoData = await response.json();
            address = geoData.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          } catch {
            address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          }
        }
      } else {
        setIsGeocoding(true);
        const geocodeResponse = await apiRequest("POST", "/api/geocode", { address: data.address });
        const geocodeData = await geocodeResponse.json();
        
        if (!geocodeData.latitude || !geocodeData.longitude) {
          throw new Error("Could not find location. Please enter a valid address.");
        }
        
        latitude = geocodeData.latitude;
        longitude = geocodeData.longitude;
        setIsGeocoding(false);
      }

      const startDateTime = new Date(data.startDate);
      const [startHour, startMin] = data.startTime.split(":").map(Number);
      startDateTime.setHours(startHour, startMin);

      const endDateTime = new Date(data.endDate);
      const [endHour, endMin] = data.endTime.split(":").map(Number);
      endDateTime.setHours(endHour, endMin);

      const eventData = {
        name: data.name,
        category: data.category,
        description: data.description,
        address: address,
        latitude: latitude,
        longitude: longitude,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        imageUrl: data.imageUrl || null,
        organizerName: data.organizerName || null,
        organizerContact: data.organizerContact || null,
      };

      const response = await apiRequest("POST", "/api/events", eventData);
      return response.json();
    },
    onSuccess: async (data) => {
      if (eventTags.length > 0 && data.id) {
        try {
          await apiRequest("POST", `/api/events/${data.id}/tags`, { tags: eventTags });
        } catch (error) {
          console.error("Failed to add tags:", error);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/search"] });
      toast({
        title: "Event created!",
        description: "Your event has been added to the map.",
      });
      form.reset();
      setEventTags([]);
      setUseCurrentLocation(false);
      onClose();
      if (onEventCreated && data.latitude && data.longitude) {
        onEventCreated(data.latitude, data.longitude);
      }
    },
    onError: (error: Error) => {
      setIsGeocoding(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createEventMutation.mutate(data);
  };

  const handleUseMyLocation = () => {
    if (userLocation && hasRealLocation) {
      setUseCurrentLocation(true);
      form.setValue("address", "Using current location");
      toast({
        title: "Location set",
        description: "Using your current GPS location for this event.",
      });
    } else {
      toast({
        title: "GPS location unavailable",
        description: "Please allow location access in your browser settings, or enter an address manually.",
        variant: "destructive",
      });
    }
  };

  if (!open) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-[1100]"
        onClick={onClose}
        data-testid="add-event-overlay"
      />
      
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-[1101] bg-white rounded-t-2xl shadow-2xl"
        style={{
          maxHeight: '75vh',
          transform: `translateY(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 300ms ease-out',
        }}
        data-testid="add-event-sheet"
      >
        <div
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleDragEnd}
          onMouseDown={handleMouseDown}
          data-testid="add-event-drag-handle"
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          <p className="text-xs text-gray-400 mt-1">Pull down to close</p>
        </div>

        <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: 'calc(75vh - 60px)' }}>
          <div className="mb-4">
            <h2 className="text-xl font-bold">Add New Event</h2>
            <p className="text-sm text-muted-foreground">Share a local event with your community.</p>
          </div>

          {!isAuthenticated && (
            <Alert className="mb-4 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
              <LogIn className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <span className="font-medium">Sign in recommended.</span>{" "}
                Create an account to manage your events.{" "}
                <Link href="/login" className="underline hover:no-underline">Sign in</Link>
                {" "}or{" "}
                <Link href="/signup" className="underline hover:no-underline">Sign up</Link>
              </AlertDescription>
            </Alert>
          )}
          
          {isAuthenticated && user && !user.isEmailVerified && (
            <Alert className="mb-4 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <span className="font-medium">Verify your email</span> to post events.{" "}
                <Link href="/verify-email" className="underline hover:no-underline">Resend verification</Link>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-3 gap-2">
                        {eventCategories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => field.onChange(category)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                              field.value === category
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            )}
                            data-testid={`button-category-${category}`}
                          >
                            <span className="text-muted-foreground">{categoryIcons[category]}</span>
                            <span className="text-xs font-medium">{categoryLabels[category]}</span>
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Sunny's Taco Truck" 
                        {...field} 
                        data-testid="input-event-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell people what to expect..."
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="input-event-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Tags
                </label>
                <TagInput
                  value={eventTags}
                  onChange={setEventTags}
                  maxTags={10}
                  placeholder="Add tags like #music #food #outdoor"
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                          <AddressAutocomplete
                            value={field.value}
                            onChange={(value) => {
                              field.onChange(value);
                              if (selectedCoords || useCurrentLocation) {
                                setSelectedCoords(null);
                                setUseCurrentLocation(false);
                              }
                            }}
                            onSelect={(suggestion) => {
                              field.onChange(suggestion.displayName);
                              setSelectedCoords({
                                lat: suggestion.latitude,
                                lng: suggestion.longitude,
                              });
                              setUseCurrentLocation(false);
                              toast({
                                title: "Address selected",
                                description: "Location coordinates set from address.",
                              });
                            }}
                            placeholder="Start typing an address..."
                            disabled={useCurrentLocation || !!selectedCoords}
                            className={cn(
                              "pl-9", 
                              useCurrentLocation && "bg-green-50 border-green-300",
                              selectedCoords && "bg-primary/5 border-primary/30"
                            )}
                          />
                        </div>
                        {selectedCoords && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                            <MapPin className="h-3 w-3 text-primary" />
                            <span>Pinned: {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={selectedCoords ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowLocationPicker(true)}
                            className="flex-1"
                            data-testid="button-pick-on-map"
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            {selectedCoords ? "Change pin" : "Pick on map"}
                          </Button>
                          <Button
                            type="button"
                            variant={useCurrentLocation ? "default" : "outline"}
                            size="sm"
                            onClick={handleUseMyLocation}
                            className="flex-1"
                            data-testid="button-use-location"
                          >
                            <Navigation className="h-4 w-4 mr-2" />
                            {useCurrentLocation ? "Using" : "My location"}
                          </Button>
                          {(useCurrentLocation || selectedCoords) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUseCurrentLocation(false);
                                setSelectedCoords(null);
                                form.setValue("address", "");
                              }}
                              data-testid="button-clear-location"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-start-date"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[1200]" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="time" 
                            className="pl-9"
                            {...field}
                            data-testid="input-start-time"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-end-date"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[1200]" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="time" 
                            className="pl-9"
                            {...field}
                            data-testid="input-end-time"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="organizerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organizer Name (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Your name or business" 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-organizer-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="organizerContact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Info (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Phone, email, or website" 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-organizer-contact"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full"
                disabled={createEventMutation.isPending || isGeocoding}
                data-testid="button-submit-event"
              >
                {(createEventMutation.isPending || isGeocoding) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isGeocoding ? "Finding location..." : "Creating Event..."}
                  </>
                ) : (
                  "Create Event"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          initialLocation={selectedCoords ? [selectedCoords.lat, selectedCoords.lng] : null}
          userLocation={userLocation}
          onLocationSelect={handleLocationSelect}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </>
  );
}
