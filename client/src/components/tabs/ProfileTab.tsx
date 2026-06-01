import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import { categoryLabels, type EventCategory, accountTypeLimits } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  User, 
  MapPin, 
  Calendar, 
  Heart, 
  Settings, 
  Bell, 
  Shield, 
  HelpCircle,
  ChevronRight,
  LogOut,
  Star,
  Bookmark,
  Clock,
  Award,
  Loader2,
  Building2,
  Check,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const categoryColors: Record<EventCategory, string> = {
  food_truck: "#f97316",
  performer: "#8b5cf6",
  market: "#16a34a",
  vendor: "#16a34a",
  community: "#06b6d4",
  other: "#6b7280"
};

interface ProfileTabProps {
  onEventSelect: (event: Event) => void;
  isDarkMode: boolean;
}

export function ProfileTab({ onEventSelect, isDarkMode }: ProfileTabProps) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"overview" | "events" | "settings">("overview");
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const { data: myEvents = [], isLoading: isLoadingMyEvents } = useQuery<Event[]>({
    queryKey: ["/api/my-events"],
    enabled: !!user,
  });

  const { data: allEvents = [], isLoading: isLoadingEvents } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: userStats } = useQuery<{ likesGiven: number; commentsMade: number; totalViews: number }>({
    queryKey: ["/api/my-stats"],
    enabled: !!user,
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      await apiRequest("DELETE", `/api/events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event deleted",
        description: "Your event has been removed successfully.",
      });
      setDeletingEventId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message || "Could not delete the event. Please try again.",
        variant: "destructive",
      });
      setDeletingEventId(null);
    },
  });

  const handleDeleteEvent = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    if (deletingEventId === eventId) {
      deleteEventMutation.mutate(eventId);
    } else {
      setDeletingEventId(eventId);
      setTimeout(() => setDeletingEventId(null), 3000);
    }
  };
  
  const isLoading = isLoadingMyEvents || isLoadingEvents;

  const isBusinessAccount = user?.accountType === "business";
  const accountLimits = accountTypeLimits[user?.accountType || "individual"];
  const maxActiveEvents = accountLimits.maxActiveEvents;
  const eventsPerDay = accountLimits.eventsPerDay;
  
  // Count active events (not expired)
  const activeEvents = myEvents.filter(e => new Date(e.endDate) >= new Date());
  
  // Count events created today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventsCreatedToday = myEvents.filter(e => {
    const createdAt = new Date(e.createdAt!);
    createdAt.setHours(0, 0, 0, 0);
    return createdAt.getTime() === today.getTime();
  }).length;
  
  const stats = {
    eventsCreated: myEvents.length,
    likesGiven: userStats?.likesGiven || 0,
    commentsMade: userStats?.commentsMade || 0,
    totalViews: userStats?.totalViews || 0,
    trustScore: user?.trustScore || 100
  };

  if (!user) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-6 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-6">
            <User className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Join Spotly</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Create an account to save your favorite events, connect with your community, and share discoveries.
          </p>
          <div className="space-y-3">
            <Link href="/signup">
              <Button className="w-full" size="lg" data-testid="button-signup">
                Create Account
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" className="w-full" size="lg" data-testid="button-login">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="bg-gradient-to-br from-green-600 to-emerald-500 px-4 py-6 text-white">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-white">
            <AvatarFallback className="bg-white/20 text-white text-xl">
              {user.email?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{user.email?.split("@")[0]}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                {user.accountType === "business" ? "Business" : "Explorer"}
              </Badge>
              {user.isEmailVerified && (
                <Badge variant="secondary" className="bg-green-500/30 text-white border-0 text-xs">
                  Verified
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-6">
          <div className="text-center">
            <p className="text-2xl font-bold">{stats.eventsCreated}</p>
            <p className="text-xs text-white/70">Created</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{stats.likesGiven}</p>
            <p className="text-xs text-white/70">Likes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{stats.commentsMade}</p>
            <p className="text-xs text-white/70">Comments</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{stats.trustScore}</p>
            <p className="text-xs text-white/70">Trust</p>
          </div>
        </div>
      </div>

      <div className="flex border-b dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeSection === "overview" 
              ? "text-green-600 border-b-2 border-green-600" 
              : "text-gray-600 dark:text-gray-400"
          }`}
          onClick={() => setActiveSection("overview")}
          data-testid="button-profile-overview"
        >
          Overview
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeSection === "events" 
              ? "text-green-600 border-b-2 border-green-600" 
              : "text-gray-600 dark:text-gray-400"
          }`}
          onClick={() => setActiveSection("events")}
          data-testid="button-profile-events"
        >
          My Events
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeSection === "settings" 
              ? "text-green-600 border-b-2 border-green-600" 
              : "text-gray-600 dark:text-gray-400"
          }`}
          onClick={() => setActiveSection("settings")}
          data-testid="button-profile-settings"
        >
          Settings
        </button>
      </div>

      <div className="p-4 space-y-4">
        {activeSection === "overview" && (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isBusinessAccount ? 'bg-gradient-to-br from-emerald-500 to-green-500' : 'bg-gradient-to-br from-green-500 to-emerald-500'}`}>
                  {isBusinessAccount ? (
                    <Building2 className="h-5 w-5 text-white" />
                  ) : (
                    <User className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {isBusinessAccount ? "Business Account" : "Individual Account"}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Your account type</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Active Events</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-active-events">
                    {activeEvents.length} / {maxActiveEvents}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Today's Events</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-daily-events">
                    {eventsCreatedToday} / {eventsPerDay}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-yellow-500" />
                Achievements
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">First Event</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
                    <MapPin className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Explorer</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700 opacity-50">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
                    <Heart className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Popular</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-green-500" />
                Saved Events
              </h3>
              {isLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isLoading && allEvents.slice(0, 3).map((event) => (
                <div 
                  key={event.id}
                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-2 -mx-2"
                  onClick={() => onEventSelect(event)}
                  data-testid={`saved-event-${event.id}`}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: categoryColors[event.category as EventCategory] + "20" }}
                  >
                    <MapPin 
                      className="h-5 w-5"
                      style={{ color: categoryColors[event.category as EventCategory] }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{event.name}</p>
                    <p className="text-xs text-gray-500">{format(new Date(event.startDate), "MMM d, h:mm a")}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              ))}
              {!isLoading && allEvents.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No saved events yet</p>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-500" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-green-500" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">You discovered 3 new events nearby</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Heart className="h-4 w-4 text-green-500" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">You saved Farmers Market</p>
                </div>
              </div>
            </Card>
          </>
        )}

        {activeSection === "events" && (
          <>
            {myEvents.length === 0 ? (
              <Card className="p-6 text-center">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">No Events Yet</h3>
                <p className="text-sm text-gray-500 mb-4">Create your first event and share it with your community!</p>
                <Button data-testid="button-create-first-event">Create Event</Button>
              </Card>
            ) : (
              myEvents.map((event) => (
                <Card 
                  key={event.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onEventSelect(event)}
                  data-testid={`my-event-${event.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: categoryColors[event.category as EventCategory] + "20" }}
                    >
                      <MapPin 
                        className="h-6 w-6"
                        style={{ color: categoryColors[event.category as EventCategory] }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{event.name}</p>
                          <p className="text-sm text-gray-500">{format(new Date(event.startDate), "EEE, MMM d 'at' h:mm a")}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge 
                            variant={event.status === "approved" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {event.status}
                          </Badge>
                          <Button
                            size="icon"
                            variant={deletingEventId === event.id ? "destructive" : "ghost"}
                            className="h-8 w-8"
                            onClick={(e) => handleDeleteEvent(e, event.id)}
                            disabled={deleteEventMutation.isPending && deletingEventId === event.id}
                            data-testid={`button-delete-event-${event.id}`}
                          >
                            {deleteEventMutation.isPending && deletingEventId === event.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{event.description}</p>
                      {deletingEventId === event.id && !deleteEventMutation.isPending && (
                        <p className="text-xs text-red-500 mt-2">Click again to confirm deletion</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </>
        )}

        {activeSection === "settings" && (
          <>
            <Card className="overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-testid="button-notifications">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 dark:text-white">Notifications</p>
                  <p className="text-sm text-gray-500">Manage your notification preferences</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
              <Separator />
              <button className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-testid="button-privacy">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 dark:text-white">Privacy & Security</p>
                  <p className="text-sm text-gray-500">Control your privacy settings</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
              <Separator />
              <button className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-testid="button-help">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <HelpCircle className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 dark:text-white">Help & Support</p>
                  <p className="text-sm text-gray-500">Get help or send feedback</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
            </Card>

            <Button 
              variant="outline" 
              className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
