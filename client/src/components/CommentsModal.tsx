import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Loader2, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Event } from "@shared/schema";

interface Comment {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: string;
  userEmail: string;
}

interface CommentsModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentsModal({ event, isOpen, onClose }: CommentsModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/events", event?.id, "comments"],
    queryFn: async () => {
      if (!event?.id) return [];
      const res = await fetch(`/api/events/${event.id}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isOpen && !!event?.id,
  });

  const commentMutation = useMutation({
    mutationFn: async ({ eventId, content }: { eventId: string; content: string }) => {
      return apiRequest("POST", `/api/events/${eventId}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", event?.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/engagement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-stats"] });
      setNewComment("");
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest("DELETE", `/api/events/${event?.id}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", event?.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/engagement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-stats"] });
    },
  });

  const handleSubmitComment = useCallback(() => {
    if (!event?.id || !newComment.trim()) return;
    commentMutation.mutate({ eventId: event.id, content: newComment.trim() });
  }, [event?.id, newComment, commentMutation]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setViewportHeight(vh);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", handleResize);
      vv.addEventListener("scroll", handleResize);
    }
    window.addEventListener("resize", handleResize);

    handleResize();

    return () => {
      if (vv) {
        vv.removeEventListener("resize", handleResize);
        vv.removeEventListener("scroll", handleResize);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  }, [handleSubmitComment]);

  if (!isOpen || !event) return null;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-end justify-center"
      onClick={handleBackdropClick}
      style={{ touchAction: "none" }}
      data-testid="comments-modal-backdrop"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{
          maxHeight: `${Math.min(viewportHeight * 0.85, viewportHeight - 20)}px`,
          height: `${Math.min(viewportHeight * 0.85, 600)}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="comments-modal-content"
      >
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <h2 className="font-semibold">Comments</h2>
            <span className="text-sm text-gray-500">({comments.length})</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-comments"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Event Title */}
        <div className="px-4 py-2 border-b bg-gray-50 dark:bg-gray-800 shrink-0">
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
            {event.name}
          </p>
        </div>

        {/* Comments List - Scrollable */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {commentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No comments yet</p>
              <p className="text-sm">Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="flex gap-3"
                data-testid={`comment-${comment.id}`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-pink-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                  {comment.userEmail[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate max-w-[150px]">
                      {comment.userEmail.split("@")[0]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(comment.createdAt)}
                    </span>
                    {user?.id === comment.userId && (
                      <button
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                        className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-1"
                        data-testid={`button-delete-comment-${comment.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 break-words">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar - Fixed at bottom */}
        {user ? (
          <div
            className="border-t bg-white dark:bg-gray-900 p-3 shrink-0"
            style={{ paddingBottom: `max(12px, env(safe-area-inset-bottom))` }}
          >
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                className="min-h-[44px] max-h-[100px] resize-none text-base flex-1"
                maxLength={500}
                rows={1}
                data-testid="input-comment"
              />
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || commentMutation.isPending}
                size="icon"
                className="shrink-0 h-11 w-11"
                data-testid="button-submit-comment"
              >
                {commentMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1 text-right">
              {newComment.length}/500
            </p>
          </div>
        ) : (
          <div className="border-t p-4 text-center text-sm text-gray-500 shrink-0">
            Please log in to comment
          </div>
        )}
      </div>
    </div>
  );
}
