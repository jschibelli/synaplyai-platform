import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { BillingInterface } from '../components/subscription/BillingInterface';
import { PlanComparison } from '../components/subscription/PlanComparison';
import { TenantContext } from '../hooks/useTenantContext';

export default function SubscriptionPage() {
  // Mock tenant data for development
  const [mockTenant] = useState({
    tenantId: 'demo-tenant-123',
    organizationName: 'Demo Organization',
    subscription: {
      plan: 'Professional',
      status: 'active'
    }
  });
  
  // State to control which tab is active
  const [activeTab, setActiveTab] = useState('plans');
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Head>
        <title>Subscription Management | AI Creation Assistant</title>
      </Head>
      
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
            <nav className="flex space-x-4">
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
              <Link href="/dashboard" className="text-blue-600 hover:text-blue-800">
                Dashboard
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <TenantContext.Provider value={mockTenant}>
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('plans')}
                className={`${
                  activeTab === 'plans'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Plan Options
              </button>
              <button
                onClick={() => setActiveTab('billing')}
                className={`${
                  activeTab === 'billing'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Billing & Payments
              </button>
              <button
                onClick={() => setActiveTab('subscription')}
                className={`${
                  activeTab === 'subscription'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Subscription Details
              </button>
            </nav>
          </div>
          
          {/* Tab Content */}
          <div className="bg-white shadow rounded-lg">
            {activeTab === 'plans' && (
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
                <PlanComparison />
              </div>
            )}
            
            {activeTab === 'billing' && (
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Billing Information</h2>
                <BillingInterface />
              </div>
            )}
            
            {activeTab === 'subscription' && (
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Manage Your Subscription</h2>
                <SubscriptionManagement />
              </div>
            )}
          </div>
        </TenantContext.Provider>
      </main>
    </div>
  );
}