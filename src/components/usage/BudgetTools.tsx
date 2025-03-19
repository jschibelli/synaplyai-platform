import React, { useState } from 'react';
import { useTenantContext } from '../../hooks/useTenantContext';
import { formatNumber } from '../../utils/formatters';

interface BudgetToolsProps {
  currentUsage: number;
  limit: number;
  plan: string;
}

export const BudgetTools: React.FC<BudgetToolsProps> = ({
  currentUsage,
  limit,
  plan
}) => {
  const { tenantId } = useTenantContext();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isSettingAlert, setIsSettingAlert] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(80);
  
  const tokensRemaining = limit - currentUsage;
  const percentUsed = Math.round((currentUsage / limit) * 100);
  
  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      // This would be an API call in a real app
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert(`Redirecting to upgrade page for tenant ${tenantId}`);
    } finally {
      setIsUpgrading(false);
    }
  };
  
  const handleSetAlert = async () => {
    try {
      // This would be an API call in a real app
      await fetch('/api/usage/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId,
          threshold: alertThreshold
        })
      });
      
      setIsSettingAlert(false);
      alert(`Alert set at ${alertThreshold}%`);
    } catch (error) {
      console.error('Failed to set alert:', error);
      alert('Failed to set alert. Please try again.');
    }
  };
  
  return (
    <div className="budget-tools">
      <div className="mb-2">
        <h4 className="text-sm font-medium text-gray-700">Budget Tools</h4>
      </div>
      
      {/* Estimated Usage */}
      <div className="bg-blue-50 p-3 rounded-md mb-3">
        <div className="text-xs text-blue-700 font-medium">Estimated Usage</div>
        <div className="mt-1 text-sm">
          At current rates, you'll use <span className="font-medium">{formatNumber(currentUsage * 2)}</span> tokens by the end of the billing period.
        </div>
        {percentUsed > 60 && (
          <div className="mt-2 text-xs text-blue-700">
            {percentUsed > 80 ? 
              'You might exceed your limit before the reset date.' : 
              'Consider monitoring your usage more closely.'}
          </div>
        )}
      </div>
      
      {/* Action Buttons */}
      <div className="flex flex-col space-y-2">
        <button
          onClick={handleUpgrade}
          disabled={isUpgrading}
          className={`text-sm px-3 py-2 rounded flex justify-center items-center 
            ${percentUsed > 80 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'} 
            transition-colors duration-200 ${isUpgrading ? 'opacity-75 cursor-not-allowed' : ''}`}
        >
          {isUpgrading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Processing...</span>
            </>
          ) : (
            `Upgrade to ${plan === 'standard' ? 'Professional' : 'Enterprise'} Plan`
          )}
        </button>
        
        <button
          onClick={() => setIsSettingAlert(!isSettingAlert)}
          className="text-sm px-3 py-2 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
        >
          Set Usage Alert
        </button>
      </div>
      
      {/* Alert Threshold Slider */}
      {isSettingAlert && (
        <div className="mt-3 p-3 border border-gray-200 rounded-md bg-gray-50">
          <label className="block text-sm text-gray-700 mb-2">
            Alert me when usage reaches {alertThreshold}%
          </label>
          <input
            type="range"
            min="50"
            max="95"
            value={alertThreshold}
            onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>50%</span>
            <span>95%</span>
          </div>
          <div className="mt-3 flex justify-end space-x-2">
            <button
              onClick={() => setIsSettingAlert(false)}
              className="text-xs px-2 py-1 rounded text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSetAlert}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};