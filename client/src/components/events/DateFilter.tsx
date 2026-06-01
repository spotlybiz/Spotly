import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Calendar, Sun, CalendarDays, CalendarRange } from "lucide-react";

export type DateFilterOption = "all" | "today" | "tomorrow" | "this_week" | "this_weekend";

const dateOptions: { value: DateFilterOption; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "Any Time", icon: <Calendar className="h-4 w-4" /> },
  { value: "today", label: "Today", icon: <Sun className="h-4 w-4" /> },
  { value: "tomorrow", label: "Tomorrow", icon: <CalendarDays className="h-4 w-4" /> },
  { value: "this_weekend", label: "This Weekend", icon: <CalendarRange className="h-4 w-4" /> },
  { value: "this_week", label: "This Week", icon: <CalendarRange className="h-4 w-4" /> },
];

interface DateFilterProps {
  selectedDate: DateFilterOption;
  onDateChange: (date: DateFilterOption) => void;
}

export function DateFilter({ selectedDate, onDateChange }: DateFilterProps) {
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 px-4 py-2">
        {dateOptions.map((option) => (
          <Button
            key={option.value}
            variant={selectedDate === option.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "rounded-full flex-shrink-0 gap-1.5",
              selectedDate === option.value && "shadow-sm"
            )}
            onClick={() => onDateChange(option.value)}
            data-testid={`button-date-${option.value}`}
          >
            {option.icon}
            <span>{option.label}</span>
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" className="invisible" />
    </ScrollArea>
  );
}
