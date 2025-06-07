"use client"; // Required by react-day-picker if using App Router features, good practice

import * as React from "react";
import { addDays, format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  dateRange?: DateRange;
  onDateChange: (dateRange?: DateRange) => void;
  maxDays?: number; // Optional: to limit the range selection
  disabled?: boolean;
}

export function DateRangePicker({
  className,
  dateRange,
  onDateChange,
  maxDays,
  disabled = false,
}: DateRangePickerProps) {
  const [internalDate, setInternalDate] = React.useState<DateRange | undefined>(dateRange);

  React.useEffect(() => {
    setInternalDate(dateRange); // Sync with external prop
  }, [dateRange]);

  const handleSelect = (selectedRange?: DateRange) => {
    if (selectedRange) {
      if (maxDays && selectedRange.from && selectedRange.to) {
        const diffDays = Math.ceil(Math.abs(selectedRange.to.getTime() - selectedRange.from.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > maxDays -1) { // -1 because selection is inclusive of start and end day
          // Optionally, provide feedback to user that max days exceeded
          // For now, just cap it or reset (current behavior: will select but parent can validate)
        }
      }
    }
    setInternalDate(selectedRange);
    onDateChange(selectedRange); // Propagate change up
  };

  // Handle "Clear" button click
  const handleClear = () => {
    setInternalDate(undefined);
    onDateChange(undefined);
  };


  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            disabled={disabled}
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              !internalDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {internalDate?.from ? (
              internalDate.to ? (
                <>
                  {format(internalDate.from, "LLL dd, y")} -{" "}
                  {format(internalDate.to, "LLL dd, y")}
                </>
              ) : (
                format(internalDate.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={internalDate?.from}
            selected={internalDate}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={disabled} // Ensure calendar disabled state also respects prop
          />
           {internalDate && (
            <div className="p-2 border-t flex justify-end">
              <Button variant="ghost" size="sm" onClick={handleClear}>Clear</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
