import React, { useState, useEffect } from 'react';
import { useTenantContext } from '../../hooks/useTenantContext';
import { formatCurrency } from '../../utils/formatters';
import { ProgressBar } from '../common/ProgressBar';

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  tokenAllocation: number;
  features: {
    name: string;
    included: boolean;
  }[];
  popular?: boolean;
}

export const PlanComparison: React.FC = () => {
  const { tenantId } = useTenantContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/subscription/plans?tenantId=${tenantId}`);
        const currentPlanResponse = await fetch(`/api/subscription/current?tenantId=${tenantId}`);
        
        if (!response.ok || !currentPlanResponse.ok) {
          throw new Error('Failed to fetch plans');
        }
        
        const plansData = await response.json();
        const currentPlanData = await currentPlanResponse.json();
        
        setPlans(plansData);
        setCurrentPlan(currentPlanData.planId);
        setBillingCycle(currentPlanData.billingCycle || 'monthly');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plans');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPlans();
  }, [tenantId]);
  
  const handleUpgrade = async (planId: string) => {
    if (currentPlan === planId) return;
    
    try {
      setIsUpgrading(true);
      const response = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId,
          planId,
          billingCycle
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to upgrade plan');
      }
      
      // Update current plan
      setCurrentPlan(planId);
      
      // Show success message
      alert('Plan successfully upgraded!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade plan');
    } finally {
      setIsUpgrading(false);
    }
  };

  const getPrice = (plan: Plan) => {
    return billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  };
  
  const getSavingsPercent = (plan: Plan) => {
    return Math.round(((plan.monthlyPrice * 12) - plan.yearlyPrice) / (plan.monthlyPrice * 12) * 100);
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="plan-comparison">
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              billingCycle === 'monthly' 
                ? 'bg-white shadow text-blue-700' 
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              billingCycle === 'yearly' 
                ? 'bg-white shadow text-blue-700' 
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Annual Billing
            <span className="ml-1 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
              Save up to 20%
            </span>
          </button>
        </div>
      </div>
      
      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isCurrentPlan = currentPlan === plan.id;
          
          return (
            <div 
              key={plan.id} 
              className={`relative overflow-hidden rounded-lg border ${
                isCurrentPlan ? 'border-blue-500 shadow-md' : 'border-gray-200'
              } ${plan.popular ? 'transform md:-translate-y-4' : ''}`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 -mt-1 -mr-1 w-24 h-24 overflow-hidden">
                  <div className="absolute transform rotate-45 bg-blue-600 text-white shadow-md text-center text-sm font-semibold py-1 right-[-35px] top-[32px] w-[170px]">
                    Popular
                  </div>
                </div>
              )}
              
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                
                <div className="mt-4">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-extrabold text-gray-900">
                      {formatCurrency(getPrice(plan))}
                    </span>
                    <span className="ml-1 text-base text-gray-500">
                      /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>
                  
                  {billingCycle === 'yearly' && (
                    <p className="mt-1 text-sm text-green-600">
                      Save {getSavingsPercent(plan)}% with annual billing
                    </p>
                  )}
                </div>
                
                <div className="mt-6">
                  <p className="text-gray-500 text-sm mb-2">
                    {formatCurrency(plan.tokenAllocation / 1000000)} million tokens per month
                  </p>
                  <ProgressBar
                    percentage={0}
                    theme="success"
                    height={6}
                  />
                </div>
                
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <div className="flex-shrink-0">
                        {feature.included ? (
                          <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span className={`ml-2 text-sm ${feature.included ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
                
                <div className="mt-6">
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={isCurrentPlan || isUpgrading}
                    className={`w-full px-4 py-2 rounded-md font-medium text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      isCurrentPlan 
                        ? 'bg-gray-100 text-gray-800 cursor-default' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isUpgrading 
                      ? 'Processing...'
                      : isCurrentPlan 
                        ? 'Current Plan' 
                        : getPrice(plan) > getPrice(plans.find(p => p.id === currentPlan) as Plan) 
                          ? 'Upgrade Plan' 
                          : 'Downgrade Plan'
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-12">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Enterprise Plan</h4>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-medium text-gray-900">Need a custom solution?</p>
              <p className="mt-1 text-gray-500">
                Contact us for custom token allocations, dedicated support, and enterprise-grade security features.
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <a
                href="#contact-sales"
                className="inline-flex items-center px-5 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};