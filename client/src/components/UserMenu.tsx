import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, LogOut, AlertCircle, Building2, Calendar } from "lucide-react";

export default function UserMenu() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link 
          href="/login"
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accent"
          data-testid="button-login-header"
        >
          Sign in
        </Link>
        <Link 
          href="/signup"
          className="text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="button-signup-header"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const initials = user?.email?.substring(0, 2).toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!user?.isEmailVerified && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-500 border-2 border-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.email}</p>
            <p className="text-xs leading-none text-muted-foreground flex items-center gap-1">
              {user?.accountType === "business" ? (
                <>
                  <Building2 className="h-3 w-3" />
                  Business Account
                </>
              ) : (
                <>
                  <User className="h-3 w-3" />
                  Individual Account
                </>
              )}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!user?.isEmailVerified && (
          <>
            <DropdownMenuItem asChild className="text-yellow-600 dark:text-yellow-500 cursor-pointer" data-testid="menuitem-verify">
              <Link href="/verify-email">
                <AlertCircle className="mr-2 h-4 w-4" />
                Verify Email
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled className="opacity-60">
          <Calendar className="mr-2 h-4 w-4" />
          My Events
          <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer" data-testid="menuitem-logout">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
