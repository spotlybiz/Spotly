import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Event, EventWithEngagement } from "@shared/schema";
import { categoryLabels, type EventCategory } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentsModal } from "@/components/CommentsModal";
import { 
  MessageCircle, 
  Heart, 
  Share2, 
  MapPin, 
  Clock, 
  Users, 
  TrendingUp,
  Bell,
  Calendar,
  Loader2
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const categoryColors: Record<EventCategory, string> = {
  food_truck: "#f97316",
  performer: "#8b5cf6",
  market: "#16a34a",
  vendor: "#16a34a",
  community: "#22c55e",
  other: "#6b7280"
};

interface CommunityTabProps {
  onEventSelect: (event: Event) => void;
  isDarkMode: boolean;
  onModalStateChange?: (isOpen: boolean) => void;
}

export function CommunityTab({ onEventSelect, isDarkMode, onModalStateChange }: CommunityTabProps) {
  const [activeSection, setActiveSection] = useState<"feed" | "trending" | "nearby">("feed");
  const [selectedEventForComments, setSelectedEventForComments] = useState<EventWithEngagement | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Notify parent when modal state changes
  useEffect(() => {
    onModalStateChange?.(selectedEventForComments !== null);
  }, [selectedEventForComments, onModalStateChange]);

  const { data: events = [], isLoading } = useQuery<EventWithEngagement[]>({
    queryKey: ["/api/events/engagement"],
  });

  const likeMutation = useMutation({
    mutationFn: async ({ eventId, isLiked }: { eventId: string; isLiked: boolean }) => {
      if (isLiked) {
        return apiRequest("DELETE", `/api/events/${eventId}/like`);
      } else {
        return apiRequest("POST", `/api/events/${eventId}/like`);
      }
    },
    onSuccess: () => {
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

  const shareMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("POST", `/api/events/${eventId}/share`, { shareType: "copy_link" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/engagement"] });
    },
  });

  const handleLike = (event: EventWithEngagement, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast({
        title: "Login required",
        description: "Please log in to like events",
        variant: "destructive",
      });
      return;
    }
    likeMutation.mutate({ eventId: event.id, isLiked: event.isLikedByUser });
  };

  const handleComment = (event: EventWithEngagement, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEventForComments(event);
  };

  const handleShare = async (event: EventWithEngagement, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const shareUrl = `${window.location.origin}/?event=${event.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.name,
          text: event.description || `Check out ${event.name}!`,
          url: shareUrl,
        });
        shareMutation.mutate(event.id);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          await navigator.clipboard.writeText(shareUrl);
          shareMutation.mutate(event.id);
          toast({
            title: "Link copied!",
            description: "Event link has been copied to clipboard",
          });
        }
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      shareMutation.mutate(event.id);
      toast({
        title: "Link copied!",
        description: "Event link has been copied to clipboard",
      });
    }
  };

  const recentEvents = [...events]
    .sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime())
    .slice(0, 10);

  const trendingEvents = [...events]
    .sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount))
    .slice(0, 5);

  return (
    <div className={`h-full overflow-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Community</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeSection === "feed" ? "default" : "outline"}
            onClick={() => setActiveSection("feed")}
            className="rounded-full"
            data-testid="button-community-feed"
          >
            <MessageCircle className="h-4 w-4 mr-1" />
            Activity
          </Button>
          <Button
            size="sm"
            variant={activeSection === "trending" ? "default" : "outline"}
            onClick={() => setActiveSection("trending")}
            className="rounded-full"
            data-testid="button-community-trending"
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Trending
          </Button>
          <Button
            size="sm"
            variant={activeSection === "nearby" ? "default" : "outline"}
            onClick={() => setActiveSection("nearby")}
            className="rounded-full"
            data-testid="button-community-nearby"
          >
            <Users className="h-4 w-4 mr-1" />
            Nearby
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <Card className="p-6 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">No Activity Yet</h3>
            <p className="text-sm text-gray-500">Be the first to discover events in your area!</p>
          </Card>
        )}

        {!isLoading && activeSection === "feed" && (
          <>
            <Card className="p-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Stay in the Loop</h3>
                  <p className="text-sm text-white/80">Get notified about new events near you</p>
                </div>
              </div>
            </Card>

            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Recent Activity
            </h2>

            {recentEvents.map((event) => (
              <Card 
                key={event.id} 
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onEventSelect(event)}
                data-testid={`card-activity-${event.id}`}
              >
                <div className="flex gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback 
                      style={{ backgroundColor: categoryColors[event.category as EventCategory] }}
                      className="text-white text-xs"
                    >
                      {event.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{event.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDistanceToNow(new Date(event.createdAt || event.startDate), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className="text-xs shrink-0"
                        style={{ 
                          backgroundColor: categoryColors[event.category as EventCategory] + "20", 
                          color: categoryColors[event.category as EventCategory] 
                        }}
                      >
                        {categoryLabels[event.category as EventCategory]}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                      {event.description || "No description provided"}
                    </p>
                    <div className="flex items-center gap-4 mt-3">
                      <button 
                        className={`flex items-center gap-1 transition-colors ${
                          event.isLikedByUser 
                            ? 'text-red-500' 
                            : 'text-gray-500 hover:text-red-500'
                        }`}
                        onClick={(e) => handleLike(event, e)}
                        disabled={likeMutation.isPending}
                        data-testid={`button-like-${event.id}`}
                      >
                        <Heart className={`h-4 w-4 ${event.isLikedByUser ? 'fill-current' : ''}`} />
                        <span className="text-xs">{event.likeCount || 0}</span>
                      </button>
                      <button 
                        className="flex items-center gap-1 text-gray-500 hover:text-green-500 transition-colors"
                        onClick={(e) => handleComment(event, e)}
                        data-testid={`button-comment-${event.id}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span className="text-xs">{event.commentCount || 0}</span>
                      </button>
                      <button 
                        className="flex items-center gap-1 text-gray-500 hover:text-green-500 transition-colors"
                        onClick={(e) => handleShare(event, e)}
                        data-testid={`button-share-${event.id}`}
                      >
                        <Share2 className="h-4 w-4" />
                        <span className="text-xs">{event.shareCount || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {!isLoading && activeSection === "trending" && (
          <>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Popular This Week
            </h2>

            {trendingEvents.length === 0 && (
              <Card className="p-6 text-center">
                <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">No Trending Events</h3>
                <p className="text-sm text-gray-500">Be the first to like and share events!</p>
              </Card>
            )}

            {trendingEvents.map((event, index) => (
              <Card 
                key={event.id} 
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onEventSelect(event)}
                data-testid={`card-trending-${event.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{event.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Heart className="h-3 w-3 text-red-400" />
                      <span>{event.likeCount}</span>
                      <MessageCircle className="h-3 w-3 text-green-400 ml-2" />
                      <span>{event.commentCount}</span>
                    </div>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className="text-xs"
                    style={{ 
                      backgroundColor: categoryColors[event.category as EventCategory] + "20", 
                      color: categoryColors[event.category as EventCategory] 
                    }}
                  >
                    {categoryLabels[event.category as EventCategory]}
                  </Badge>
                </div>
              </Card>
            ))}
          </>
        )}

        {!isLoading && activeSection === "nearby" && (
          <>
            <Card className="p-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Connect Locally</h3>
                  <p className="text-sm text-white/80">See what your neighbors are discovering</p>
                </div>
              </div>
            </Card>

            <h2 className="font-semibold text-gray-900 dark:text-white">Community Highlights</h2>

            {events.slice(0, 6).map((event) => (
              <Card 
                key={event.id} 
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onEventSelect(event)}
                data-testid={`card-nearby-${event.id}`}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: categoryColors[event.category as EventCategory] + "20" }}
                  >
                    <MapPin 
                      className="h-6 w-6"
                      style={{ color: categoryColors[event.category as EventCategory] }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{event.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(event.startDate), "EEE, MMM d 'at' h:mm a")}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {event.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {event.commentCount}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      <CommentsModal
        event={selectedEventForComments}
        isOpen={!!selectedEventForComments}
        onClose={() => setSelectedEventForComments(null)}
      />
    </div>
  );
}
