import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { TenantContext } from '../hooks/useTenantContext';

export default function Dashboard() {
  // Mock tenant data for development
  const [mockTenant] = useState({
    tenantId: 'demo-tenant-123',
    organizationName: 'Demo Organization',
    subscription: {
      plan: 'Professional',
      status: 'active'
    }
  });

  // Mock token usage data
  const [tokenUsage] = useState({
    used: 125000,
    limit: 500000,
    resetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    modelBreakdown: [
      { modelId: 'gpt-4o', promptTokens: 75000, completionTokens: 25000 },
      { modelId: 'gpt-3.5-turbo', promptTokens: 15000, completionTokens: 10000 }
    ]
  });

  // Mock usage history
  const [usageHistory] = useState([
    { date: '2023-03-01', tokens: 42000 },
    { date: '2023-03-02', tokens: 38000 },
    { date: '2023-03-03', tokens: 45000 },
    { date: '2023-03-04', tokens: 39000 },
    { date: '2023-03-05', tokens: 43000 },
    { date: '2023-03-06', tokens: 47000 },
    { date: '2023-03-07', tokens: 51000 }
  ]);

  // Mock circuit breaker status
  const [circuitStatus] = useState([
    { service: 'AI Service', status: 'Open', statusClass: 'bg-red-100 text-red-800', lastChange: '2 hours ago', message: 'Circuit opened due to high error rate' },
    { service: 'Database Service', status: 'Closed', statusClass: 'bg-green-100 text-green-800', lastChange: '1 day ago', message: 'Operating normally' },
    { service: 'Usage Tracking', status: 'Half-Open', statusClass: 'bg-yellow-100 text-yellow-800', lastChange: '30 minutes ago', message: 'Testing limited traffic after recent failures' }
  ]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Head>
        <title>Dashboard | AI Creation Assistant</title>
      </Head>
      
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <nav className="flex space-x-4">
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
              <Link href="/subscription" className="text-blue-600 hover:text-blue-800">
                Subscription
              </Link>
              <Link href="/compliance" className="text-blue-600 hover:text-blue-800">
                Compliance
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <TenantContext.Provider value={mockTenant}>
          {/* Token Usage Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Token Usage Status</h2>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="mb-4">
                <div className="flex justify-between text-sm font-medium">
                  <span>Token Usage: {tokenUsage.used.toLocaleString()} / {tokenUsage.limit.toLocaleString()}</span>
                  <span>{Math.round((tokenUsage.used / tokenUsage.limit) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${Math.min(100, (tokenUsage.used / tokenUsage.limit) * 100)}%` }}>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Resets on {tokenUsage.resetDate.toLocaleDateString()}
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Token Usage by Model</h3>
                <div className="space-y-4">
                  {tokenUsage.modelBreakdown.map((model, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm">
                        <span>{model.modelId}</span>
                        <span>{(model.promptTokens + model.completionTokens).toLocaleString()} tokens</span>
                      </div>
                      <div className="flex text-xs text-gray-500 mt-1">
                        <div>Prompt: {model.promptTokens.toLocaleString()}</div>
                        <div className="mx-2">|</div>
                        <div>Completion: {model.completionTokens.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Usage Analytics Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="h-64 flex items-end justify-between space-x-2">
                {usageHistory.map((day, index) => {
                  const percentage = (day.tokens / 60000) * 100;
                  return (
                    <div key={index} className="flex flex-col items-center flex-1">
                      <div 
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${percentage}%` }}
                      ></div>
                      <div className="text-xs mt-2 text-gray-600">{day.date.split('-')[2]}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-sm text-gray-500 text-center">
                Past 7 days token usage
              </div>
            </div>
          </div>
          
          {/* System Status Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">System Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {circuitStatus.map((circuit, index) => (
                <div key={index} className="bg-white shadow rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-medium mb-4">{circuit.service}</h3>
                  <div className="flex items-center mb-2">
                    <span className="mr-2">Status:</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${circuit.statusClass}`}>
                      {circuit.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>Last change: {circuit.lastChange}</p>
                    <p className="mt-2">{circuit.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TenantContext.Provider>
      </main>
    </div>
  );
}