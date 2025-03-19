import React, { useState } from 'react';

interface ExportControlsProps {
  onExport: (format: 'csv' | 'json' | 'pdf') => void;
  isExporting?: boolean;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
  onExport,
  isExporting = false
}) => {
  const [format, setFormat] = useState<'csv' | 'json' | 'pdf'>('csv');

  const handleExport = () => {
    onExport(format);
  };

  return (
    <div className="export-controls flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
      <div className="flex-grow">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Export Format
        </label>
        <select
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          value={format}
          onChange={(e) => setFormat(e.target.value as any)}
          disabled={isExporting}
        >
          <option value="csv">CSV (.csv)</option>
          <option value="json">JSON (.json)</option>
          <option value="pdf">PDF Report (.pdf)</option>
        </select>
      </div>
      
      <button
        className={`px-4 py-2 rounded-md ${
          isExporting 
            ? 'bg-gray-300 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        } transition-colors`}
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? 'Exporting...' : 'Export Data'}
      </button>
    </div>
  );
};