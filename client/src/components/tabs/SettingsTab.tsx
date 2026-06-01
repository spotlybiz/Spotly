import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { 
  Bell,
  MapPin,
  Moon,
  Sun,
  Globe,
  Shield,
  HelpCircle,
  FileText,
  Mail,
  ChevronRight,
  LogOut,
  Smartphone,
  Eye,
  Volume2
} from "lucide-react";

interface SettingsTabProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export function SettingsTab({ isDarkMode, onToggleDarkMode }: SettingsTabProps) {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [locationAccess, setLocationAccess] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [showDistance, setShowDistance] = useState(true);

  const settingsSections = [
    {
      title: "Preferences",
      items: [
        {
          icon: isDarkMode ? Moon : Sun,
          label: "Dark Mode",
          description: "Switch between light and dark theme",
          type: "toggle" as const,
          value: isDarkMode,
          onChange: onToggleDarkMode
        },
        {
          icon: Bell,
          label: "Notifications",
          description: "Get alerts for nearby events",
          type: "toggle" as const,
          value: notifications,
          onChange: () => setNotifications(!notifications)
        },
        {
          icon: Volume2,
          label: "Sound Effects",
          description: "Play sounds for interactions",
          type: "toggle" as const,
          value: soundEffects,
          onChange: () => setSoundEffects(!soundEffects)
        }
      ]
    },
    {
      title: "Location & Map",
      items: [
        {
          icon: MapPin,
          label: "Location Access",
          description: "Allow access to your location",
          type: "toggle" as const,
          value: locationAccess,
          onChange: () => setLocationAccess(!locationAccess)
        },
        {
          icon: Eye,
          label: "Show Distance",
          description: "Display distance to events",
          type: "toggle" as const,
          value: showDistance,
          onChange: () => setShowDistance(!showDistance)
        },
        {
          icon: Globe,
          label: "Default Radius",
          description: "10 miles",
          type: "link" as const
        }
      ]
    },
    {
      title: "Support",
      items: [
        {
          icon: HelpCircle,
          label: "Help Center",
          description: "FAQs and guides",
          type: "link" as const
        },
        {
          icon: Mail,
          label: "Contact Us",
          description: "Get in touch with support",
          type: "link" as const
        },
        {
          icon: FileText,
          label: "Terms of Service",
          description: "Read our terms",
          type: "link" as const
        },
        {
          icon: Shield,
          label: "Privacy Policy",
          description: "How we protect your data",
          type: "link" as const
        }
      ]
    }
  ];

  return (
    <div className={`h-full overflow-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>

      <div className="p-4 space-y-6">
        {settingsSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {section.title}
            </h2>
            <Card className="divide-y dark:divide-gray-700">
              {section.items.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between p-4 ${
                    item.type === 'link' ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''
                  }`}
                  data-testid={`setting-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <item.icon className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{item.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                    </div>
                  </div>
                  {item.type === 'toggle' && (
                    <Switch
                      checked={item.value}
                      onCheckedChange={item.onChange}
                      data-testid={`switch-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  )}
                  {item.type === 'link' && (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              ))}
            </Card>
          </div>
        ))}

        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            App Info
          </h2>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Spotly</p>
                <p className="text-xs text-gray-500">Version 1.0.0</p>
              </div>
            </div>
            <Separator className="my-3" />
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Discover local events, food trucks, and community happenings near you.
            </p>
          </Card>
        </div>

        {user && (
          <Button
            variant="outline"
            className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
}
