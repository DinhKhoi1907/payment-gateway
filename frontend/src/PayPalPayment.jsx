import React, { useEffect, useState, useRef } from 'react';
import { getLaravelUrl } from './utils/env';

function useQuery() {
  return React.useMemo(() => new URLSearchParams(window.location.search), []);
}

export default function PayPalPayment() {
  const query = useQuery();
  const paymentId = query.get('paymentId') || '';
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentData, setPaymentData] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const paypalButtonContainerRef = useRef(null);
  const paypalButtonsRenderedRef = useRef(false);

  // Load payment status by paymentId and use server values
  useEffect(() => {
    let isMounted = true;
    
    // Reset PayPal buttons rendered flag when paymentId changes
    paypalButtonsRenderedRef.current = false;
    
    (async () => {
      if (!paymentId) {
        if (isMounted) {
          setError('paymentId is required');
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(`/api/payments/${paymentId}/status`, {
          headers: { Accept: 'application/json' },
        });
        if (res.status === 404 || res.status === 400) {
          window.location.replace('/error/404');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          setPaymentData({
            payment_id: data.payment_id,
            order_id: data.order_id,
            amount: data.amount,
            displayCurrency: data.currency || 'USD',
            paypalCurrency: 'USD',
            status: data.status,
            expires_at: data.expires_at || null,
          });
          // initialize countdown if TTL exists
          if (data.expires_at) {
            const end = new Date(data.expires_at).getTime();
            const now = Date.now();
            const initial = Math.max(0, Math.floor((end - now) / 1000));
            setCountdown(initial);
          }
        }
      } catch (e) {
        console.error('[PayPal] Status fetch error:', e);
        if (isMounted) {
          setError(String(e.message || e));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, [paymentId]);

  // TTL countdown tick
  useEffect(() => {
    if (!paymentData?.expires_at || countdown === null) {
      return undefined;
    }
    if (countdown <= 0) {
      window.location.replace('/error/404');
      return undefined;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [paymentData?.expires_at, countdown]);

  // Initialize PayPal Buttons
  useEffect(() => {
    if (
      !paymentData ||
      !paypalButtonContainerRef.current ||
      paymentData.status === 'completed' ||
      paymentData.status === 'cancelled' ||
      paymentData.status === 'failed' ||
      (countdown !== null && countdown <= 0) ||
      paypalButtonsRenderedRef.current
    ) {
      return undefined;
    }

    // Mark as rendered before starting
    paypalButtonsRenderedRef.current = true;
    paypalButtonContainerRef.current.innerHTML = '';

    // Get PayPal client ID from environment or use test
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || 'test';
    const currency = paymentData.paypalCurrency || 'USD';

    // Load PayPal SDK with correct client ID and currency
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`;
    script.async = true;
    
    let isMounted = true;
    const currentPaymentId = paymentData.payment_id;
    const currentOrderId = paymentData.order_id;
    
    script.onload = () => {
      if (!isMounted || !paypalButtonContainerRef.current) return;
      if (window.paypal) {
        window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'paypal',
          },
          createOrder: async (data, actions) => {
            // Create order on PayPal
            try {
              const response = await fetch('/api/payments/paypal/create-order', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  payment_id: currentPaymentId,
                  order_id: currentOrderId,
                }),
              });

              if (!response.ok) {
                if (response.status === 400 || response.status === 404) {
                  window.location.replace('/error/404');
                  return '';
                }
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to create PayPal order');
              }

              const orderData = await response.json();
              console.log('[PayPal] create-order OK:', orderData);
              return orderData.orderId;
            } catch (error) {
              console.error('Error creating PayPal order:', error);
              if (isMounted) {
                setError(error.message || 'Failed to create PayPal order');
              }
              throw error;
            }
          },
          onApprove: async (data, actions) => {
            // Capture payment after user approval
            try {
              console.log('[PayPal] capture-order start', { orderID: data.orderID, payment_id: currentPaymentId });
              const response = await fetch('/api/payments/paypal/capture-order', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  orderId: data.orderID,
                  payment_id: currentPaymentId,
                }),
              });

              console.log('[PayPal] capture-order status:', response.status);
              if (!response.ok) {
                if (response.status === 400 || response.status === 404) {
                  window.location.replace('/error/404');
                  return;
                }
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to capture PayPal payment');
              }
              
              // Redirect to Laravel thank-you page after successful payment
              const laravelUrl = getLaravelUrl();
              window.location.href = `${laravelUrl}/thank-you?order_id=${currentOrderId}&payment_status=completed`;
            } catch (error) {
              console.error('Error capturing PayPal payment:', error);
              if (isMounted) {
                setError(error.message || 'Payment capture failed. Please try again.');
              }
            }
          },
          onError: (err) => {
            console.error('PayPal error:', err);
            if (isMounted) {
              setError('PayPal payment error occurred');
            }
          },
          onCancel: () => {
            // Không redirect Laravel nữa. Đánh dấu hủy và hiển thị UI phù hợp
            if (isMounted) {
              setPaymentData((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
            }
          },
        }).render(paypalButtonContainerRef.current);
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    script.onerror = () => {
      if (isMounted) {
        setError('Failed to load PayPal SDK');
        setLoading(false);
      }
    };
    
    // Remove old script if exists
    const oldScripts = document.querySelectorAll(`script[src*="paypal.com/sdk"]`);
    oldScripts.forEach((oldScript) => {
      if (oldScript !== script && document.body.contains(oldScript)) {
        document.body.removeChild(oldScript);
      }
    });
    
    document.body.appendChild(script);

    return () => {
      isMounted = false;
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (paypalButtonContainerRef.current) {
        paypalButtonContainerRef.current.innerHTML = '';
      }
      paypalButtonsRenderedRef.current = false;
    };
    // Only re-render when payment_id changes, not on countdown or status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentData?.payment_id]);

  // If already completed, redirect to Laravel thank-you page
  useEffect(() => {
    if (paymentData?.status === 'completed' && paymentData?.order_id) {
      const laravelUrl = getLaravelUrl();
      window.location.href = `${laravelUrl}/thank-you?order_id=${paymentData.order_id}&payment_status=completed`;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentData?.status, paymentData?.order_id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-700">Đang tải PayPal...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6">
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold mb-2">❌ Lỗi</h3>
            <p>{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // If already completed, show loading while redirecting
  if (paymentData?.status === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold mb-2 text-emerald-700">Payment completed</h2>
          <p className="text-gray-600 mb-6">Redirecting to order confirmation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">💳 PayPal Payment</h1>
            <p className="text-gray-600">Complete your payment securely</p>
          </div>

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Order ID</dt>
                <dd className="text-sm font-semibold text-gray-900">{paymentData?.order_id}</dd>
              </div>
              {paymentData?.expires_at && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Time remaining</dt>
                  <dd className={`text-sm font-semibold ${countdown !== null && countdown <= 60 ? 'text-red-600' : 'text-gray-900'}`}>
                    {(() => {
                      const sec = Math.max(0, countdown || 0);
                      const m = Math.floor(sec / 60);
                      const s = sec % 60;
                      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    })()}
                  </dd>
                </div>
              )}
              {paymentData?.amount && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Amount</dt>
                  <dd className="text-sm font-semibold text-blue-700">
                    {new Intl.NumberFormat(
                      paymentData.displayCurrency === 'VND' ? 'vi-VN' : 'en-US',
                      {
                        style: 'currency',
                        currency: paymentData.displayCurrency || 'USD',
                      },
                    ).format(paymentData.amount || 0)}
                  </dd>
                </div>
              )}

              {paymentData?.displayCurrency === 'VND' && (
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500">* PayPal will charge in USD</dt>
                  <dd className="text-xs text-gray-500">Converted automatically using configured rate</dd>
                </div>
              )}
              {paymentData?.description && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Description</dt>
                  <dd className="text-sm text-gray-900">{paymentData.description}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* PayPal Button Container */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Method</h2>
            {countdown !== null && countdown <= 0 ? (
              <div className="text-center text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
                Payment link expired. Please go back and create a new payment.
              </div>
            ) : (
              <div ref={paypalButtonContainerRef} className="flex justify-center">
                {loading && (
                  <div className="text-gray-500">Loading PayPal...</div>
                )}
              </div>
            )}
          </div>

          {/* Payment Info */}
          {paymentData?.payment_id && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Payment ID: {paymentData.payment_id}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

