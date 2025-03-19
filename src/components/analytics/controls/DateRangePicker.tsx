import React, { useState, useEffect, useRef } from 'react';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (startDate: Date, endDate: Date) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Handle clicks outside the picker to close it
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleApply = () => {
    onChange(localStartDate, localEndDate);
    setShowPicker(false);
  };

  const formatDateString = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const presetRanges = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 }
  ];

  const handlePresetClick = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    setLocalStartDate(start);
    setLocalEndDate(end);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="px-4 py-2 border border-gray-300 rounded-md text-sm bg-white flex items-center"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>
          {formatDateString(startDate)} - {formatDateString(endDate)}
        </span>
      </button>

      {showPicker && (
        <div className="absolute mt-2 right-0 p-4 bg-white shadow-lg rounded-md border border-gray-200 z-10 w-80">
          <div className="flex justify-between mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={localStartDate.toISOString().split('T')[0]}
                onChange={(e) => setLocalStartDate(new Date(e.target.value))}
                max={localEndDate.toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={localEndDate.toISOString().split('T')[0]}
                onChange={(e) => setLocalEndDate(new Date(e.target.value))}
                min={localStartDate.toISOString().split('T')[0]}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Quick Select</h4>
            <div className="grid grid-cols-3 gap-2">
              {presetRanges.map((range) => (
                <button
                  key={range.days}
                  className="text-xs py-1 px-2 bg-gray-100 hover:bg-gray-200 rounded"
                  onClick={() => handlePresetClick(range.days)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className="mr-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              onClick={() => setShowPicker(false)}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};