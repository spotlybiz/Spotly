import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Event, EventCategory } from "@shared/schema";
import { categoryLabels } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PublicProfileView } from "@/components/PublicProfileView";
import { 
  Clock, 
  MapPin, 
  Navigation, 
  User, 
  Mail, 
  Phone, 
  Calendar,
  Share2,
  UtensilsCrossed,
  Music,
  ShoppingBag,
  Store,
  Users,
  Pin,
  X,
  Heart,
  MessageCircle,
  Eye,
  ChevronRight
} from "lucide-react";

const categoryColors: Record<EventCategory, string> = {
  food_truck: "#f97316",
  performer: "#8b5cf6",
  market: "#16a34a",
  vendor: "#16a34a",
  community: "#06b6d4",
  other: "#6b7280"
};

const CategoryIcon = ({ category }: { category: EventCategory }) => {
  const iconProps = { className: "h-16 w-16" };
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

interface EventEngagement {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLikedByUser: boolean;
}

interface EventDetailProps {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onStartNavigation?: (event: Event) => void;
  onShowRoutePreview?: (event: Event) => void;
  onOpenComments?: (event: Event) => void;
  hasUserLocation?: boolean;
}

export function EventDetail({ event, open, onClose, onStartNavigation, onShowRoutePreview, onOpenComments, hasUserLocation = false }: EventDetailProps) {
  const [sheetHeight, setSheetHeight] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch engagement data for this event
  const { data: engagement } = useQuery<EventEngagement>({
    queryKey: ["/api/events", event?.id, "engagement"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event?.id}/engagement`);
      if (!res.ok) throw new Error("Failed to fetch engagement");
      return res.json();
    },
    enabled: !!event?.id && open,
  });

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: async ({ eventId, isLiked }: { eventId: string; isLiked: boolean }) => {
      if (isLiked) {
        return apiRequest("DELETE", `/api/events/${eventId}/like`);
      } else {
        return apiRequest("POST", `/api/events/${eventId}/like`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", event?.id, "engagement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/engagement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "You need to be logged in to like events",
        variant: "destructive",
      });
    },
  });

  const handleLike = () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Please log in to like events",
        variant: "destructive",
      });
      return;
    }
    if (event) {
      likeMutation.mutate({ eventId: event.id, isLiked: engagement?.isLikedByUser || false });
    }
  };

  useEffect(() => {
    if (open && event) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSheetHeight(85);
        });
      });
    } else {
      setSheetHeight(0);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open, event]);

  if (!event || !isVisible) return null;

  const categoryColor = categoryColors[event.category as EventCategory];
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = sheetHeight;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const deltaY = dragStartY.current - e.clientY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.min(90, Math.max(10, dragStartHeight.current + deltaPercent));
    setSheetHeight(newHeight);
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (sheetHeight < 40) {
      setSheetHeight(0);
      setTimeout(() => onClose(), 300);
    } else {
      setSheetHeight(85);
    }
  };

  const handleOverlayClick = () => {
    setSheetHeight(0);
    setTimeout(() => onClose(), 300);
  };

  const getDirections = () => {
    // Use coordinates directly for accurate navigation
    const coords = `${event.latitude},${event.longitude}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${coords}`;
    window.open(url, "_blank");
  };

  const shareEvent = async () => {
    const shareData = {
      title: event.name,
      text: `Check out ${event.name} - ${event.description}`,
      url: window.location.href
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleContact = () => {
    if (event.organizerContact) {
      if (event.organizerContact.includes("@")) {
        window.location.href = `mailto:${event.organizerContact}`;
      } else if (event.organizerContact.match(/^[\d\s\-\+\(\)]+$/)) {
        window.location.href = `tel:${event.organizerContact}`;
      } else {
        window.open(event.organizerContact, "_blank");
      }
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 z-[1100] apple-blur-overlay backdrop-enter ${
          sheetHeight > 0 && !showPublicProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleOverlayClick}
        data-testid="overlay-event-detail"
      />
      
      <div 
        className={`fixed left-0 right-0 bottom-0 z-[1101] apple-sheet gpu-accelerated overflow-hidden ${
          isDragging ? '' : 'transition-all duration-300'
        } ${sheetHeight > 0 && !showPublicProfile ? 'apple-sheet-enter' : ''}`}
        style={{ 
          height: showPublicProfile ? '0vh' : `${sheetHeight}vh`,
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
          visibility: showPublicProfile ? 'hidden' : 'visible'
        }}
      >
        <div 
          className="flex flex-col items-center pt-2 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="apple-handle" />
        </div>

        <div className="h-full overflow-y-auto pb-20" style={{ height: showPublicProfile ? '0' : `calc(${sheetHeight}vh - 30px)` }}>
          <div className="relative">
            {event.imageUrl ? (
              <div className="w-full h-48 md:h-64">
                <img 
                  src={event.imageUrl} 
                  alt={event.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            ) : (
              <div 
                className="w-full h-48 md:h-64 flex items-center justify-center"
                style={{ backgroundColor: categoryColor + "20", color: categoryColor }}
              >
                <CategoryIcon category={event.category as EventCategory} />
              </div>
            )}
            
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/80 backdrop-blur-xl border-0 shadow-sm"
                onClick={shareEvent}
                data-testid="button-share-event"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/80 backdrop-blur-xl border-0 shadow-sm"
                onClick={handleOverlayClick}
                data-testid="button-close-event-detail"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="absolute bottom-4 left-4">
              <span 
                className="apple-pill text-white font-medium"
                style={{ backgroundColor: categoryColor }}
              >
                {categoryLabels[event.category as EventCategory]}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900 dark:text-white">
              {event.name}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50">
                <div className="p-2.5 rounded-xl bg-green-100/80 dark:bg-green-900/40">
                  <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Date & Time</p>
                  <p className="text-[13px] apple-secondary-text mt-0.5">
                    {format(startDate, "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-[13px] apple-secondary-text">
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50">
                <div className="p-2.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40">
                  <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Location</p>
                  <p className="text-[13px] apple-secondary-text break-words mt-0.5">
                    {event.address}
                  </p>
                </div>
              </div>
            </div>

            <div className="apple-separator" />

            <div>
              <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">About this event</h3>
              <p className="apple-secondary-text leading-relaxed text-[15px]">
                {event.description}
              </p>
            </div>

            <div className="flex items-center gap-3 py-2">
              <button 
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full hover-elevate active-elevate-2 ${
                  engagement?.isLikedByUser 
                    ? 'bg-red-50/80 dark:bg-red-900/30 text-red-500' 
                    : 'bg-gray-100/80 dark:bg-gray-800/60 apple-secondary-text'
                }`}
                onClick={handleLike}
                disabled={likeMutation.isPending}
                data-testid="button-like-event-detail"
              >
                <Heart className={`h-5 w-5 ${engagement?.isLikedByUser ? 'fill-current' : ''}`} />
                <span className="text-sm font-medium">{engagement?.likeCount || 0}</span>
              </button>
              <button 
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-100/80 dark:bg-gray-800/60 apple-secondary-text hover-elevate active-elevate-2"
                onClick={() => {
                  if (onOpenComments && event) {
                    onOpenComments(event);
                  }
                }}
                data-testid="button-see-comments"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{engagement?.commentCount || 0}</span>
                <span className="text-sm">Comments</span>
              </button>
            </div>

            <Separator />

            {/* Mini Map Preview */}
            <div>
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Event Location
              </h3>
              <div 
                ref={mapContainerRef}
                className="w-full h-40 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 relative"
                data-testid="mini-map-preview"
              >
                {/* Static map preview via Mapbox Static Images API */}
                <img 
                  src={`/api/static-map?lat=${event.latitude}&lng=${event.longitude}&zoom=14&width=400&height=200`}
                  alt="Event location map"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: categoryColor }}
                  >
                    <MapPin className="h-4 w-4 text-white" />
                  </div>
                </div>
                {/* Tap to preview overlay */}
                <button
                  className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/30 to-transparent"
                  onClick={() => {
                    if (onShowRoutePreview && event && hasUserLocation) {
                      onShowRoutePreview(event);
                    }
                  }}
                  disabled={!hasUserLocation}
                  data-testid="button-map-preview-tap"
                >
                  <span className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {hasUserLocation ? "Tap to preview route" : "Enable location to preview"}
                  </span>
                </button>
              </div>
            </div>

            {(event.organizerName || event.organizerContact || event.userId) && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Organizer</h3>
                  <div className="space-y-2">
                    {event.userId && (
                      <button
                        onClick={() => setShowPublicProfile(true)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover-elevate bg-muted/50"
                        data-testid="button-view-organizer-profile"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-sm">{event.organizerName || "Event Creator"}</p>
                          <p className="text-xs text-muted-foreground">Tap to view profile</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    {!event.userId && event.organizerName && (
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span>{event.organizerName}</span>
                      </div>
                    )}
                    {event.organizerContact && (
                      <div className="flex items-center gap-2 text-sm">
                        {event.organizerContact.includes("@") ? (
                          <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        )}
                        <button 
                          onClick={handleContact}
                          className="text-green-600 dark:text-green-400 hover:underline"
                          data-testid="button-contact-organizer"
                        >
                          {event.organizerContact}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="pt-4 pb-6 space-y-3">
              <Button 
                size="lg"
                className="w-full"
                onClick={() => {
                  // Show route preview first (like Google Maps)
                  // handleShowRoutePreviewFromDetail already closes this sheet
                  if (onShowRoutePreview && event) {
                    onShowRoutePreview(event);
                  }
                }}
                disabled={!hasUserLocation}
                data-testid="button-preview-route"
              >
                <Navigation className="h-5 w-5 mr-2" />
                {hasUserLocation ? "Preview Route" : "Enable Location for Navigation"}
              </Button>
              <Button 
                variant="outline"
                size="lg"
                className="w-full"
                onClick={getDirections}
                data-testid="button-get-directions"
              >
                <MapPin className="h-5 w-5 mr-2" />
                Open in Google Maps
              </Button>
            </div>
          </div>
        </div>
      </div>

      {event?.userId && (
        <PublicProfileView
          userId={event.userId}
          isOpen={showPublicProfile}
          onClose={() => setShowPublicProfile(false)}
          onEventSelect={(selectedEvent) => {
            setShowPublicProfile(false);
            if (selectedEvent.id !== event.id) {
              onClose();
            }
          }}
        />
      )}
    </>
  );
}
