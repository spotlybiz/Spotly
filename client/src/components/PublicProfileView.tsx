import { useQuery } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import { categoryLabels, type EventCategory } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  X, 
  User, 
  Building2, 
  Shield, 
  Calendar, 
  Heart, 
  Eye,
  MapPin,
  Star,
  ChevronRight
} from "lucide-react";

interface PublicProfile {
  id: string;
  displayName: string;
  accountType: string;
  trustScore: number;
  createdAt: string | null;
  eventsCreated: number;
  likesReceived: number;
  totalViews: number;
  events: Event[];
}

interface PublicProfileViewProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onEventSelect?: (event: Event) => void;
}

const categoryColors: Record<EventCategory, string> = {
  food_truck: "#f97316",
  performer: "#8b5cf6",
  market: "#16a34a",
  vendor: "#16a34a",
  community: "#06b6d4",
  other: "#6b7280"
};

export function PublicProfileView({ userId, isOpen, onClose, onEventSelect }: PublicProfileViewProps) {
  const { data: profile, isLoading } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    enabled: isOpen && !!userId,
  });

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isBusinessAccount = profile?.accountType === "business";
  const displayName = profile?.displayName || "User";
  const memberSince = profile?.createdAt ? format(new Date(profile.createdAt), "MMMM yyyy") : "Unknown";

  const getTrustColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-amber-500";
    return "text-red-500";
  };

  const getTrustLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    return "Low";
  };

  return (
    <div 
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
      data-testid="public-profile-overlay"
    >
      <div 
        className="w-full max-w-lg bg-background rounded-t-3xl max-h-[85vh] overflow-hidden apple-sheet-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apple-handle-bar" />
        
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full"
            onClick={onClose}
            data-testid="button-close-public-profile"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto max-h-[calc(85vh-60px)]">
          {isLoading ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
            </div>
          ) : profile ? (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className={`text-xl font-semibold text-white ${isBusinessAccount ? 'bg-gradient-to-br from-emerald-500 to-green-500' : 'bg-gradient-to-br from-green-500 to-emerald-500'}`}>
                    {isBusinessAccount ? <Building2 className="h-7 w-7" /> : displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold">{displayName}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isBusinessAccount ? (
                      <Badge variant="secondary" className="text-xs">
                        <Building2 className="h-3 w-3 mr-1" />
                        Business
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        Individual
                      </Badge>
                    )}
                    <span>Member since {memberSince}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4 text-center bg-gradient-to-br from-emerald-50 to-pink-50 dark:from-emerald-900/20 dark:to-pink-900/20 border-0">
                  <div className="flex items-center justify-center mb-2">
                    <Shield className={`h-5 w-5 ${getTrustColor(profile.trustScore)}`} />
                  </div>
                  <p className={`text-2xl font-bold ${getTrustColor(profile.trustScore)}`}>{profile.trustScore}</p>
                  <p className="text-xs text-muted-foreground">Trust Score</p>
                  <p className={`text-xs font-medium ${getTrustColor(profile.trustScore)}`}>{getTrustLabel(profile.trustScore)}</p>
                </Card>

                <Card className="p-4 text-center bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-0">
                  <div className="flex items-center justify-center mb-2">
                    <Calendar className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">{profile.eventsCreated}</p>
                  <p className="text-xs text-muted-foreground">Events</p>
                  <p className="text-xs font-medium text-green-600">Created</p>
                </Card>

                <Card className="p-4 text-center bg-gradient-to-br from-green-50 to-orange-50 dark:from-green-900/20 dark:to-orange-900/20 border-0">
                  <div className="flex items-center justify-center mb-2">
                    <Heart className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">{profile.likesReceived}</p>
                  <p className="text-xs text-muted-foreground">Likes</p>
                  <p className="text-xs font-medium text-green-600">Received</p>
                </Card>
              </div>

              <div className="flex items-center gap-4 py-3 px-4 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-2 flex-1">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Views</span>
                </div>
                <span className="font-semibold">{profile.totalViews.toLocaleString()}</span>
              </div>

              {profile.events && profile.events.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Events by {displayName}
                  </h4>
                  <div className="space-y-2">
                    {profile.events.slice(0, 5).map((event) => (
                      <button
                        key={event.id}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover-elevate bg-card"
                        onClick={() => onEventSelect?.(event)}
                        data-testid={`public-profile-event-${event.id}`}
                      >
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: categoryColors[event.category as EventCategory] }}
                        >
                          <MapPin className="h-5 w-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-sm line-clamp-1">{event.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {categoryLabels[event.category as EventCategory]} • {format(new Date(event.startDate), "MMM d")}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                    {profile.events.length > 5 && (
                      <p className="text-center text-sm text-muted-foreground py-2">
                        +{profile.events.length - 5} more events
                      </p>
                    )}
                  </div>
                </div>
              )}

              {(!profile.events || profile.events.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No events yet</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>User not found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
