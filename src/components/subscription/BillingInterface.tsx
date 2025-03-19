import React, { useState, useEffect } from 'react';
import { useTenantContext } from '../../hooks/useTenantContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface BillingRecord {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  invoiceUrl?: string;
}

interface PaymentMethod {
  id: string;
  type: 'credit_card' | 'paypal' | 'bank_transfer';
  lastFour?: string;
  expiryDate?: string;
  isDefault: boolean;
  cardBrand?: string;
}

export const BillingInterface: React.FC = () => {
  const { tenantId } = useTenantContext();
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState({
    cardNumber: '',
    expiryDate: '',
    cvc: ''
  });

  // Fetch billing information
  useEffect(() => {
    const fetchBillingData = async () => {
      try {
        setIsLoading(true);
        const historyResponse = await fetch(`/api/billing/history?tenantId=${tenantId}`);
        const methodsResponse = await fetch(`/api/billing/payment-methods?tenantId=${tenantId}`);
        
        if (!historyResponse.ok || !methodsResponse.ok) {
          throw new Error('Failed to fetch billing information');
        }
        
        const historyData = await historyResponse.json();
        const methodsData = await methodsResponse.json();
        
        setBillingHistory(historyData);
        setPaymentMethods(methodsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load billing information');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBillingData();
  }, [tenantId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setNewPaymentMethod({
      ...newPaymentMethod,
      [id.replace('card-', '')]: value
    });
  };

  const handleAddPaymentMethod = async () => {
    try {
      const response = await fetch('/api/billing/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId,
          cardNumber: newPaymentMethod.cardNumber,
          expiryDate: newPaymentMethod.expiryDate,
          cvc: newPaymentMethod.cvc
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add payment method');
      }

      const newMethod = await response.json();
      
      // Update state with the new payment method
      setPaymentMethods([...paymentMethods, newMethod]);
      
      // Reset form
      setNewPaymentMethod({
        cardNumber: '',
        expiryDate: '',
        cvc: ''
      });
      
      setIsAddingPayment(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    }
  };

  const handleRemovePaymentMethod = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/billing/payment-methods/${paymentMethodId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove payment method');
      }
      
      // Remove from state
      setPaymentMethods(prevMethods => 
        prevMethods.filter(method => method.id !== paymentMethodId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove payment method');
    }
  };

  const handleSetDefaultPaymentMethod = async (paymentMethodId: string) => {
    try {
      const response = await fetch(`/api/billing/payment-methods/default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tenantId,
          paymentMethodId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to set default payment method');
      }
      
      // Update state
      setPaymentMethods(prevMethods => 
        prevMethods.map(method => ({
          ...method,
          isDefault: method.id === paymentMethodId
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default payment method');
    }
  };

  const getCardIcon = (brand?: string) => {
    if (!brand) return '💳';
    
    switch (brand.toLowerCase()) {
      case 'visa': return '💳 Visa';
      case 'mastercard': return '💳 Mastercard';
      case 'amex': return '💳 Amex';
      case 'discover': return '💳 Discover';
      default: return '💳';
    }
  };

  const getPaymentMethodIcon = (type: string) => {
    switch (type) {
      case 'credit_card': return '💳';
      case 'paypal': return 'PayPal';
      case 'bank_transfer': return '🏦';
      default: return '💳';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Paid</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'failed':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Failed</span>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="billing-interface">
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button 
            className="ml-4 text-sm underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Payment Methods Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
          <button
            onClick={() => setIsAddingPayment(!isAddingPayment)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-expanded={isAddingPayment}
          >
            {isAddingPayment ? (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Payment Method
              </>
            )}
          </button>
        </div>
        
        {isAddingPayment ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4 shadow-sm">
            <h4 className="text-sm font-medium text-gray-800 mb-3">Add New Payment Method</h4>
            
            <div className="mb-4">
              <label htmlFor="card-cardNumber" className="block text-sm font-medium text-gray-700">Card Number</label>
              <input
                type="text"
                id="card-cardNumber"
                value={newPaymentMethod.cardNumber}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="4242 4242 4242 4242"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="card-expiryDate" className="block text-sm font-medium text-gray-700">Expiry Date</label>
                <input
                  type="text"
                  id="card-expiryDate"
                  value={newPaymentMethod.expiryDate}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="MM/YY"
                />
              </div>
              <div>
                <label htmlFor="card-cvc" className="block text-sm font-medium text-gray-700">CVC</label>
                <input
                  type="text"
                  id="card-cvc"
                  value={newPaymentMethod.cvc}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="123"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleAddPaymentMethod}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Add Card
              </button>
            </div>
          </div>
        ) : (
          <>
            {paymentMethods.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center shadow-sm">
                <p className="text-gray-500 mb-4">No payment methods found.</p>
                <button 
                  onClick={() => setIsAddingPayment(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add Your First Payment Method
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <ul className="divide-y divide-gray-200">
                  {paymentMethods.map(method => (
                    <li key={method.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="mr-4 text-xl">
                          {method.type === 'credit_card' 
                            ? getCardIcon(method.cardBrand)
                            : getPaymentMethodIcon(method.type)}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">
                            {method.type === 'credit_card' 
                              ? `•••• •••• •••• ${method.lastFour}`
                              : method.type === 'paypal' 
                                ? 'PayPal Account' 
                                : 'Bank Account'}
                          </h4>
                          {method.expiryDate && (
                            <p className="text-xs text-gray-500">Expires {method.expiryDate}</p>
                          )}
                          {method.isDefault && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {!method.isDefault && (
                          <button
                            onClick={() => handleSetDefaultPaymentMethod(method.id)}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => handleRemovePaymentMethod(method.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                          disabled={method.isDefault && paymentMethods.length > 1}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Billing History Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing History</h3>
        
        {billingHistory.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center shadow-sm">
            <p className="text-gray-500">No billing history available.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {billingHistory.map(record => (
                    <tr key={record.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(record.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(record.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {record.invoiceUrl && (
                          <a 
                            href={record.invoiceUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View Invoice
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
