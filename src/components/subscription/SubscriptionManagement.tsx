import React, { useState, useEffect } from 'react';
import { PlanComparison } from './PlanComparison';
import { BillingInterface } from './BillingInterface';
import { useTenantContext } from '../../hooks/useTenantContext';
import { ProgressBar } from '../common/ProgressBar';

interface Subscription {
  plan: string;
  billingCycle: string;
  nextBillingDate: string;
  tokenAllocation: number;
  usedTokens: number;
  features: string[];
  price: number;
}

type Tab = 'overview' | 'plans' | 'billing';

export const SubscriptionManagement: React.FC = () => {
  const { tenantId } = useTenantContext();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription?tenantId=${tenantId}`);
        if (response.ok) {
          const data = await response.json();
          setSubscription(data);
        } else {
          throw new Error(`Failed to fetch subscription: ${response.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };
    
    fetchSubscription();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="subscription-management loading">
        <div className="loading-spinner"></div>
        <p>Loading subscription details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="subscription-management error">
        <h2>Error loading subscription</h2>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="subscription-management empty-state">
        <h2>No Subscription Found</h2>
        <p>You don't have an active subscription yet. Select a plan to get started.</p>
        <button 
          className="primary-button"
          onClick={() => setActiveTab('plans')}
        >
          View Plans
        </button>
      </div>
    );
  }

  const tokenUsagePercentage = Math.round((subscription.usedTokens / subscription.tokenAllocation) * 100);
  
  return (
    <div className="subscription-management">
      <div className="tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''} 
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'plans' ? 'active' : ''} 
          onClick={() => setActiveTab('plans')}
        >
          Plans
        </button>
        <button 
          className={activeTab === 'billing' ? 'active' : ''} 
          onClick={() => setActiveTab('billing')}
        >
          Billing
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="subscription-overview">
            <h2>Your Subscription</h2>
            
            <div className="subscription-card">
              <div className="plan-header">
                <h3>{`${subscription.plan.charAt(0).toUpperCase()}${subscription.plan.slice(1)} Plan`}</h3>
                <span className="price">${subscription.price}</span>
              </div>
              
              <div className="billing-info">
                <p>{`${subscription.billingCycle.charAt(0).toUpperCase()}${subscription.billingCycle.slice(1)} billing`}</p>
                <p>Next billing: {new Date(subscription.nextBillingDate).toLocaleDateString()}</p>
              </div>
              
              <div className="token-usage">
                <h4>Token Usage</h4>
                <ProgressBar 
                  percentage={tokenUsagePercentage} 
                  theme={tokenUsagePercentage > 90 ? 'danger' : tokenUsagePercentage > 70 ? 'warning' : 'success'} 
                />
                <div className="token-details">
                  <span>{subscription.usedTokens.toLocaleString()} used</span>
                  <span>{subscription.tokenAllocation.toLocaleString()} allocated</span>
                </div>
              </div>
              
              <div className="features">
                <h4>Features</h4>
                <ul>
                  {subscription.features.map((feature, index) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
              
              <div className="actions">
                <button className="secondary-button" onClick={() => setActiveTab('plans')}>
                  Change Plan
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'plans' && <PlanComparison />}
        {activeTab === 'billing' && <BillingInterface />}
      </div>
    </div>
  );
};