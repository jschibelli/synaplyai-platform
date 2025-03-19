import React, { useState } from 'react';
import { TokenUsageChart } from './charts/TokenUsageChart';
import { HistoricalUsageGraph } from './charts/HistoricalUsageGraph';
import { useTokenUsage } from '../../hooks/useTokenUsage';
import { useTenantContext } from '../../hooks/useTenantContext';
import { transformTokenUsageData, groupHistoricalUsageData } from '../../utils/analytics/transformUsageData';
import { ProgressBar } from '../common/ProgressBar';
import { DateRangePicker } from './controls/DateRangePicker';
import { CSVExporter } from './controls/CSVExporter';

interface UsageAnalyticsDashboardProps {
  className?: string;
}

export const UsageAnalyticsDashboard: React.FC<UsageAnalyticsDashboardProps> = ({ 
  className = '' 
}) => {
  const { tenantId } = useTenantContext();
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date()
  });

  const { 
    tokenUsage, 
    historicalUsage, 
    isLoading, 
    error,
    refreshUsage
  } = useTokenUsage(tenantId, dateRange.startDate, dateRange.endDate);

  const processedData = transformTokenUsageData(tokenUsage);
  const groupedHistoricalData = groupHistoricalUsageData(
    historicalUsage, 
    dateRange.startDate, 
    dateRange.endDate
  );

  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
  };

  const handleExportData = () => {
    if (!tokenUsage || !historicalUsage.length) return;
    
    const exportData = {
      summary: {
        used: tokenUsage.used,
        limit: tokenUsage.limit,
        percentUsed: processedData.percentUsed,
        plan: tokenUsage.plan,
        resetDate: tokenUsage.resetDate
      },
      modelBreakdown: tokenUsage.modelBreakdown,
      historicalUsage: historicalUsage
    };

    CSVExporter.exportToCSV(exportData, `usage-report-${tenantId}-${new Date().toISOString().slice(0,10)}`);
  };

  if (isLoading) {
    return (
      <div className={`usage-analytics-dashboard p-4 ${className}`}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
            <p className="mt-4 text-gray-500">Loading usage analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`usage-analytics-dashboard p-4 ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading analytics</h3>
          <p className="text-red-700 text-sm mt-1">{error.message}</p>
          <button 
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            onClick={refreshUsage}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tokenUsage) {
    return (
      <div className={`usage-analytics-dashboard p-4 ${className}`}>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-gray-800 font-medium">No usage data available</h3>
          <p className="text-gray-600 mt-2">There is no token usage data available for this time period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`usage-analytics-dashboard p-4 ${className}`}>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6">
        <h2 className="text-2xl font-semibold mb-4 md:mb-0">Usage Analytics</h2>
        <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={handleDateRangeChange}
          />
          <button
            onClick={handleExportData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center justify-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Total Usage</h3>
          <div className="text-3xl font-bold mb-2">{processedData.total.toLocaleString()}</div>
          <div className="text-gray-500">tokens used</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Available</h3>
          <div className="text-3xl font-bold mb-2">{processedData.available.toLocaleString()}</div>
          <div className="text-gray-500">tokens remaining</div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Usage Status</h3>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xl font-bold">{processedData.percentUsed}%</span>
            <span className="text-gray-500">of allocation</span>
          </div>
          <ProgressBar 
            percentage={processedData.percentUsed} 
            theme={processedData.percentUsed > 90 ? 'danger' : processedData.percentUsed > 75 ? 'warning' : 'success'} 
            height={8}
          />
          <div className="text-sm text-gray-500 mt-2">
            Resets on {processedData.resetDate?.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Token Usage by Model</h3>
          <div className="h-80">
            <TokenUsageChart data={processedData.byModel} title="" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Historical Usage</h3>
          <div className="h-80">
            <HistoricalUsageGraph data={groupedHistoricalData} title="" />
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Usage Details</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prompt Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completion Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {processedData.byModel.map((model, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{model.modelId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{model.promptTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{model.completionTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{model.totalTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${calculateCost(model).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Helper function to calculate cost
const calculateCost = (model: { modelId: string; promptTokens: number; completionTokens: number }) => {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.01, output: 0.03 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-opus': { input: 0.015, output: 0.075 }
  };

  const defaultPrice = { input: 0.005, output: 0.015 };
  const price = pricing[model.modelId] || defaultPrice;
  
  return (model.promptTokens / 1000 * price.input) + (model.completionTokens / 1000 * price.output);
};