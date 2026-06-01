import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { AlertCircle, X } from "lucide-react";
import { useState } from "react";

export default function VerificationBanner() {
  const { user, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !user || user.isEmailVerified || dismissed) {
    return null;
  }

  return (
    <div className="relative bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Please verify your email to post events.</span>
        <Link 
          href="/verify-email"
          className="font-medium underline hover:no-underline"
          data-testid="link-verify-banner"
        >
          Resend verification
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 p-1 hover:bg-yellow-200/50 dark:hover:bg-yellow-800/50 rounded"
          aria-label="Dismiss"
          data-testid="button-dismiss-banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
