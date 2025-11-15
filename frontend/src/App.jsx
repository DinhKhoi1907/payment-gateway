import React, { useState } from 'react';
import MomoPayment from './MomoPayment';
import SepayConfirm from './SepayConfirm';
import PayPalPayment from './PayPalPayment';
import Error404 from './Error404';

function App() {
  const isMomoRoute = window.location.pathname.includes('/momo');
  const isSepayConfirm = window.location.pathname.includes('/sepay/confirm');
  const isPayPalRoute = window.location.pathname.includes('/paypal') || window.location.pathname.includes('/payment/paypal');
  const is404 = window.location.pathname === '/404';
  const is400 = window.location.pathname === '/400';
  const isError404 = window.location.pathname === '/error/404';
  const isError400 = window.location.pathname === '/error/400';
  
  if (isMomoRoute) {
    return <MomoPayment />;
  }
  if (isSepayConfirm) {
    return <SepayConfirm />;
  }
  if (isPayPalRoute) {
    return <PayPalPayment />;
  }
  if (is400) {
    return <Error404 errorCode="400" />;
  }
  if (isError400) {
    return <Error404 errorCode="400" />;
  }
  if (is404) {
    return <Error404 errorCode="404" />;
  }
  if (isError404) {
    return <Error404 errorCode="404" />;
  }

  if (window.location.pathname !== '/') {
    return <Error404 errorCode="404" />;
  }
  const [formData, setFormData] = useState({
    orderId: 'SEPAY_TEST_' + Date.now(),
    amount: 100000,
    paymentMethod: 'sepay',
    userId: '1',
    email: 'test@example.com',
    phone: '0123456789',
  });

  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sepayFormFields, setSepayFormFields] = useState(null);
  const [sepayPaymentUrl, setSepayPaymentUrl] = useState('');

  // Generate signature for test (sử dụng test secret key)
  // Phải match với cách NestJS verify signature
  const generateSignature = (payload) => {
    // Test secret key - chỉ dùng cho development
    // Sử dụng LARAVEL_SECRET_KEY từ env
    const testSecretKey = '1c433c40ad53058f8c145a34570aed3e023343b72856912b8e30904d29928436';
    
    // Tạo payload theo đúng thứ tự như NestJS expect 
    // NestJS tạo theo thứ tự: order_id, payment_method, idempotency_key, amount, currency, customer_data, description
    const signaturePayload = {};
    
    // Luôn có order_id và payment_method
    signaturePayload.order_id = payload.order_id;
    signaturePayload.payment_method = payload.payment_method;
    
    // Các field optional theo thứ tự
    if (payload.idempotency_key) {
      signaturePayload.idempotency_key = payload.idempotency_key;
    }
    if (payload.amount !== undefined && payload.amount !== null) {
      signaturePayload.amount = payload.amount;
    }
    if (payload.currency) {
      signaturePayload.currency = payload.currency;
    }
    if (payload.customer_data) {
      signaturePayload.customer_data = payload.customer_data;
    }
    if (payload.description) {
      signaturePayload.description = payload.description;
    }
    
    const payloadStr = JSON.stringify(signaturePayload);
    console.log('Signature payload string:', payloadStr);
    
    // Sử dụng Web Crypto API để tạo HMAC-SHA256
    return new Promise((resolve, reject) => {
      if (!window.crypto || !window.crypto.subtle) {
        reject(new Error('Web Crypto API not available'));
        return;
      }
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode(testSecretKey);
      const messageData = encoder.encode(payloadStr);
      
      window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      ).then(cryptoKey => {
        return window.crypto.subtle.sign('HMAC', cryptoKey, messageData);
      }).then(signatureBuffer => {
        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('Generated signature:', hashHex);
        resolve(hashHex);
      }).catch(err => {
        console.error('Signature generation error:', err);
        reject(err);
      });
    });
  };

  const handleCreatePayment = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    setSepayFormFields(null);
    setSepayPaymentUrl('');

    try {
      // Tạo payload với đầy đủ thông tin (fast-path)
      // Đảm bảo payment_method có giá trị (required field)
      const paymentMethod = formData.paymentMethod || 'sepay';
      const orderId = formData.orderId || 'ORDER_' + Date.now();
      
      const payload = {
        order_id: orderId,
        payment_method: paymentMethod, // REQUIRED - phải có giá trị
        amount: parseInt(formData.amount) || 100000,
        currency: 'VND',
        customer_data: {
          user_id: formData.userId || '1',
          email: formData.email || 'test@example.com',
          phone: formData.phone || '0123456789',
        },
        description: `Thanh toan don hang ${orderId}`,
      };
      
      console.log('Full payload before signature:', payload);

      // Generate signature
      const signature = await generateSignature(payload);
      
      console.log('Payload:', payload);
      console.log('Signature:', signature);

      // Gọi API để tạo payment
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-signature': signature, // NestJS expect lowercase
        },
        body: JSON.stringify(payload),
      });
      
      console.log('Response status:', response.status);
      console.log('Request sent with signature:', signature);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('API Response:', data);
      
      setResponse(data);

      // Nếu có qr_code_url, redirect đến trang confirm
      if (data.qr_code_url && data.payment_id) {
        window.location.href = `/sepay/confirm?paymentId=${data.payment_id}&qr=${encodeURIComponent(data.qr_code_url)}`;
        return;
      }

      // Nếu có checkout_url, có thể redirect
      if (data.checkout_url) {
        // Có thể tự động redirect hoặc hiển thị button
        setSepayPaymentUrl(data.checkout_url);
      }

      // Tạo form fields từ response (fallback)
      const formFields = data.form_fields || {};
      if (Object.keys(formFields).length > 0) {
        setSepayFormFields(formFields);
      }
    } catch (err) {
      console.error('Payment creation error:', err);
      let errorMessage = 'Failed to create payment';
      if (err.message) {
        errorMessage += ': ' + err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitToSepay = () => {
    if (sepayPaymentUrl && sepayFormFields) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = sepayPaymentUrl;
      form.target = '_blank';

      for (const key in sepayFormFields) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = sepayFormFields[key];
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetToSampleData = () => {
    setFormData({
      orderId: 'SEPAY_TEST_' + Date.now(),
      amount: 100000,
      paymentMethod: 'sepay',
      userId: '1',
      email: 'test@example.com',
      phone: '0123456789',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-400 to-purple-600 text-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <header className="text-center text-white mb-10">
          <h1 className="text-4xl font-bold drop-shadow">🏦 Sepay Payment</h1>
          <p className="text-lg opacity-90">React + Vite + Tailwind</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-semibold mb-4">📝 Payment Form</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreatePayment();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block mb-1 font-medium">Order ID</label>
                <input
                  type="text"
                  name="orderId"
                  value={formData.orderId}
                  onChange={handleInputChange}
                  required
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Amount (VND)</label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  required
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Payment Method</label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="sepay">Sepay (Bank Transfer)</option>
                  <option value="momo">MoMo</option>
                  <option value="paypal">PayPal</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-medium">User ID</label>
                <input
                  type="text"
                  name="userId"
                  value={formData.userId}
                  onChange={handleInputChange}
                  required
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full border-2 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg text-white font-semibold bg-gradient-to-r from-indigo-900 to-indigo-700 hover:from-indigo-800 hover:to-indigo-600 disabled:opacity-60"
                >
                  {loading ? 'Creating Payment…' : '🚀 Create Payment'}
                </button>
                
                <button
                  type="button"
                  onClick={resetToSampleData}
                  className="w-full py-2 rounded-lg text-white font-medium bg-gray-500 hover:bg-gray-600"
                >
                  🔄 Reset to Sample Data
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-semibold mb-4">📊 Response</h2>

            {error && <div className="text-red-600 font-medium">❌ Error: {error}</div>}

            {response && (
              <div className="bg-gray-50 border rounded-lg p-4 mt-4">
                <h3 className="font-semibold mb-2">API Response:</h3>
                <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(response, null, 2)}</pre>
              </div>
            )}

            {response && (
              <div className="bg-gray-50 border rounded-lg p-4 mt-4">
                <h3 className="font-semibold mb-2">✅ Payment Created Successfully!</h3>
                
                {response.qr_code_url && (
                  <div className="mb-4">
                    <p className="mb-2 text-sm"><strong>QR Code URL:</strong></p>
                    <p className="text-xs break-all text-gray-600 mb-2">{response.qr_code_url}</p>
                    <a 
                      href={`/sepay/confirm?paymentId=${response.payment_id}&qr=${encodeURIComponent(response.qr_code_url)}`}
                      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Xem trang thanh toán
                    </a>
                  </div>
                )}
                
                {response.checkout_url && (
                  <div className="mb-4">
                    <p className="mb-2 text-sm"><strong>Checkout URL:</strong></p>
                    <p className="text-xs break-all text-gray-600 mb-2">{response.checkout_url}</p>
                    <a 
                      href={response.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                    >
                      Mở trang Sepay
                    </a>
                  </div>
                )}

                {response.payment_id && (
                  <div className="mb-4">
                    <p className="text-sm"><strong>Payment ID:</strong> {response.payment_id}</p>
                  </div>
                )}

                {sepayFormFields && Object.keys(sepayFormFields).length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">Form Fields:</p>
                    <pre className="text-xs whitespace-pre-wrap bg-white p-2 rounded border overflow-auto max-h-40">
                      {JSON.stringify(sepayFormFields, null, 2)}
                    </pre>
                    {sepayPaymentUrl && (
                      <button
                        onClick={handleSubmitToSepay}
                        className="w-full mt-3 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400"
                      >
                        🏦 Submit to Sepay
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;


