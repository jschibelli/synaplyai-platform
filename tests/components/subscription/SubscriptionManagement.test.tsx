import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SubscriptionManagement } from '../../../src/components/subscription/SubscriptionManagement';
import { useTenantContext } from '../../../src/hooks/useTenantContext';

// Mock the tenant context hook
jest.mock('../../../src/hooks/useTenantContext', () => ({
  useTenantContext: jest.fn()
}));

// Mock components
jest.mock('../../../src/components/subscription/PlanComparison', () => ({
  PlanComparison: () => <div data-testid="plan-comparison">Plan Comparison</div>
}));

jest.mock('../../../src/components/subscription/BillingInterface', () => ({
  BillingInterface: () => <div data-testid="billing-interface">Billing Interface</div>
}));

// Mock fetch
global.fetch = jest.fn();

describe('SubscriptionManagement', () => {
  const mockTenantContext = { tenantId: 'test-tenant-1' };
  const mockSubscription = {
    plan: 'standard',
    billingCycle: 'monthly',
    nextBillingDate: '2025-04-01',
    tokenAllocation: 1000000,
    usedTokens: 450000,
    features: ['Access to GPT-4', 'Unlimited projects', '24/7 support'],
    price: 49.99
  };

  beforeEach(() => {
    (useTenantContext as jest.Mock).mockReturnValue(mockTenantContext);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSubscription
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', () => {
    render(<SubscriptionManagement />);
    expect(screen.getByText('Loading subscription details...')).toBeInTheDocument();
  });

  test('renders subscription details after loading', async () => {
    render(<SubscriptionManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Your Subscription')).toBeInTheDocument();
    });

    expect(screen.getByText('Standard Plan')).toBeInTheDocument();
    expect(screen.getByText('Monthly billing')).toBeInTheDocument();
    expect(screen.getByText('$49.99')).toBeInTheDocument();
    expect(screen.getByText('Access to GPT-4')).toBeInTheDocument();
  });

  test('switches between tabs', async () => {
    render(<SubscriptionManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Your Subscription')).toBeInTheDocument();
    });

    // Click on Plans tab
    fireEvent.click(screen.getByText('Plans'));
    expect(screen.getByTestId('plan-comparison')).toBeInTheDocument();
    
    // Click on Billing tab
    fireEvent.click(screen.getByText('Billing'));
    expect(screen.getByTestId('billing-interface')).toBeInTheDocument();
    
    // Back to Overview
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Your Subscription')).toBeInTheDocument();
  });

  test('handles API errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    
    render(<SubscriptionManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Error loading subscription')).toBeInTheDocument();
    });
    
    expect(screen.getByText('API Error')).toBeInTheDocument();
  });

  test('displays empty state when no subscription exists', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => null
    });
    
    render(<SubscriptionManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('No Subscription Found')).toBeInTheDocument();
    });
    
    expect(screen.getByText('View Plans')).toBeInTheDocument();
  });
});