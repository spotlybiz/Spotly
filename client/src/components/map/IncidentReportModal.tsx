import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { 
  AlertTriangle, 
  Construction, 
  ShieldAlert, 
  Ban, 
  Car,
  X,
  Loader2
} from "lucide-react";
import type { IncidentType } from "@shared/schema";

const incidentOptions: { type: IncidentType; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { type: "accident", label: "Accident", icon: AlertTriangle, color: "#ef4444" },
  { type: "road_closed", label: "Road Closed", icon: Ban, color: "#dc2626" },
  { type: "construction", label: "Construction", icon: Construction, color: "#f97316" },
  { type: "police", label: "Police", icon: ShieldAlert, color: "#16a34a" },
  { type: "hazard", label: "Hazard", icon: AlertTriangle, color: "#eab308" },
  { type: "congestion", label: "Heavy Traffic", icon: Car, color: "#f59e0b" },
];

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  isDarkMode: boolean;
}

export function IncidentReportModal({ 
  isOpen, 
  onClose, 
  latitude, 
  longitude,
  isDarkMode 
}: IncidentReportModalProps) {
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const reportMutation = useMutation({
    mutationFn: async (data: { type: IncidentType; latitude: number; longitude: number; description?: string }) => {
      return apiRequest("POST", "/api/traffic/incidents", data);
    },
    onSuccess: () => {
      // Invalidate all incident queries (they have bounds in the URL)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && queryKey.startsWith('/api/traffic/incidents');
        }
      });
      onClose();
      setSelectedType(null);
      setDescription("");
    }
  });

  const handleSubmit = () => {
    if (!selectedType) return;
    
    reportMutation.mutate({
      type: selectedType,
      latitude,
      longitude,
      description: description.trim() || undefined
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
      <Card className={`w-full max-w-sm p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Report Incident
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-incident-modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {incidentOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => setSelectedType(option.type)}
              className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                selectedType === option.type
                  ? `border-current`
                  : isDarkMode 
                    ? 'border-gray-600 hover:border-gray-500' 
                    : 'border-gray-200 hover:border-gray-300'
              }`}
              style={{ 
                borderColor: selectedType === option.type ? option.color : undefined,
                color: selectedType === option.type ? option.color : undefined
              }}
              data-testid={`button-incident-${option.type}`}
            >
              <option.icon 
                className="h-6 w-6" 
                style={{ color: option.color }}
              />
              <span className={`text-xs font-medium ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {option.label}
              </span>
            </button>
          ))}
        </div>

        <Textarea
          placeholder="Add details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`mb-4 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
          rows={2}
          data-testid="input-incident-description"
        />

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            data-testid="button-cancel-incident"
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!selectedType || reportMutation.isPending}
            data-testid="button-submit-incident"
          >
            {reportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Report
          </Button>
        </div>
      </Card>
    </div>
  );
}
