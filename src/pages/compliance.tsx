import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { TenantContext } from '../hooks/useTenantContext';

export default function CompliancePage() {
  // Mock tenant data for development
  const [mockTenant] = useState({
    tenantId: 'demo-tenant-123',
    organizationName: 'Demo Organization',
    subscription: {
      plan: 'Professional',
      status: 'active'
    }
  });
  
  // Mock filter settings
  const [filterSettings, setFilterSettings] = useState({
    enableContentFiltering: true,
    sensitiveInfoDetection: true,
    profanityFilter: true,
    toxicityFilter: false,
    confidentialInfoFilter: true,
    filterStrength: 'medium',
  });
  
  // Mock compliance events
  const [events] = useState([
    { id: 1, timestamp: '2023-03-15T14:32:45Z', type: 'content.filtered', description: 'Content filtered due to policy violation', severity: 'medium' },
    { id: 2, timestamp: '2023-03-14T09:12:33Z', type: 'circuit.opened', description: 'Circuit breaker opened for AI service', severity: 'high' },
    { id: 3, timestamp: '2023-03-13T16:45:12Z', type: 'usage.limit.exceeded', description: 'Daily usage limit exceeded', severity: 'low' },
    { id: 4, timestamp: '2023-03-12T11:22:18Z', type: 'content.filtered', description: 'Content filtered due to policy violation', severity: 'medium' },
  ]);
  
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked, value } = e.target;
    setFilterSettings({
      ...filterSettings,
      [name]: e.target.type === 'checkbox' ? checked : value,
    });
  };
  
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">High</span>;
      case 'medium':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Medium</span>;
      case 'low':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Low</span>;
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Head>
        <title>Compliance Settings | AI Creation Assistant</title>
      </Head>
      
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Compliance Settings</h1>
            <nav className="flex space-x-4">
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
              <Link href="/dashboard" className="text-blue-600 hover:text-blue-800">
                Dashboard
              </Link>
              <Link href="/subscription" className="text-blue-600 hover:text-blue-800">
                Subscription
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <TenantContext.Provider value={mockTenant}>
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Content Filtering Settings</h2>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="enableContentFiltering"
                      checked={filterSettings.enableContentFiltering}
                      onChange={handleFilterChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-gray-700">Enable Content Filtering</span>
                  </label>
                  <span className="text-sm text-gray-500">Main control for all filtering features</span>
                </div>
              </div>
              
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="sensitiveInfoDetection"
                      checked={filterSettings.sensitiveInfoDetection}
                      onChange={handleFilterChange}
                      disabled={!filterSettings.enableContentFiltering}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <span className="ml-2 text-gray-700">Sensitive Information Detection</span>
                  </label>
                  <span className="text-sm text-gray-500">Detects PII, credit cards, SSNs</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="profanityFilter"
                      checked={filterSettings.profanityFilter}
                      onChange={handleFilterChange}
                      disabled={!filterSettings.enableContentFiltering}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <span className="ml-2 text-gray-700">Profanity Filter</span>
                  </label>
                  <span className="text-sm text-gray-500">Blocks inappropriate language</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="toxicityFilter"
                      checked={filterSettings.toxicityFilter}
                      onChange={handleFilterChange}
                      disabled={!filterSettings.enableContentFiltering}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <span className="ml-2 text-gray-700">Toxicity Filter</span>
                  </label>
                  <span className="text-sm text-gray-500">Advanced ML model for harmful content</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="confidentialInfoFilter"
                      checked={filterSettings.confidentialInfoFilter}
                      onChange={handleFilterChange}
                      disabled={!filterSettings.enableContentFiltering}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <span className="ml-2 text-gray-700">Confidential Information Filter</span>
                  </label>
                  <span className="text-sm text-gray-500">Detects company confidential data</span>
                </div>
                
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter Strength</label>
                  <select
                    name="filterStrength"
                    value={filterSettings.filterStrength}
                    onChange={(e) => setFilterSettings({...filterSettings, filterStrength: e.target.value})}
                    disabled={!filterSettings.enableContentFiltering}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:opacity-50"
                  >
                    <option value="low">Low - Minimal filtering</option>
                    <option value="medium">Medium - Balanced filtering</option>
                    <option value="high">High - Strict filtering</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
          
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Compliance Events</h2>
            <div className="bg-white shadow overflow-hidden rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {event.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {event.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getSeverityBadge(event.severity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4">Circuit Breaker Status</h2>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900">AI Service</h3>
                  <div className="mt-2 flex justify-between items-center">
                    <span>Status:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Open
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    Circuit opened 2 hours ago due to high error rate
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900">Content Filtering</h3>
                  <div className="mt-2 flex justify-between items-center">
                    <span>Status:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Closed
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    Normal operations, no issues detected
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900">Usage Tracking</h3>
                  <div className="mt-2 flex justify-between items-center">
                    <span>Status:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Half-Open
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    Testing limited traffic after recent failures
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TenantContext.Provider>
      </main>
    </div>
  );
}