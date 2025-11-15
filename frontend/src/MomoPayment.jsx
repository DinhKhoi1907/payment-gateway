import React, { useState } from 'react';

const MomoPayment = () => {
  const [formData, setFormData] = useState({
    orderId: `MOMO_ORDER_${Date.now()}`,
    amount: '150000',
    userId: '1',
    email: 'test@example.com',
    phone: '0123456789',
  });

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [momoFormFields, setMomoFormFields] = useState(null);
  const [momoPaymentUrl, setMomoPaymentUrl] = useState('');

  const handleCreatePayment = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    setMomoFormFields(null);
    setMomoPaymentUrl('');

    try {
      // Gọi API để tạo MoMo payment
      const requestData = {
        order_id: formData.orderId || 'MOMO_ORDER_' + Date.now(),
        amount: parseInt(formData.amount) || 150000,
        currency: 'VND',
        customer_data: {
          user_id: formData.userId || '1',
          email: formData.email || 'test@example.com',
          phone: formData.phone || '0123456789',
        },
        return_url: 'http://localhost:8000/thank-you',
      };

      console.log('MoMo API Request:', requestData);

      const response = await fetch('/api/payments/momo/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      console.log('MoMo API Response status:', response.status);
      console.log('MoMo API Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('MoMo API Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('MoMo API Response:', data);
      
      setResponse(data);

      // Tạo form fields từ response (MoMo format)
      const formFields = {
        accessKey: data.accessKey || '',
        partnerCode: data.partnerCode || '',
        requestType: data.requestType || 'captureWallet',
        notifyUrl: data.notifyUrl || '',
        returnUrl: data.returnUrl || '',
        orderId: data.orderId || '',
        amount: data.amount || '',
        orderInfo: data.orderInfo || '',
        requestId: data.requestId || '',
        extraData: data.extraData || '',
        signature: data.signature || '',
        payUrl: data.payUrl || '', // URL từ MoMo API
      };

      setMomoPaymentUrl('https://test-payment.momo.vn/v2/gateway/pay');
      setMomoFormFields(formFields);

    } catch (err) {
      console.error('MoMo payment creation error:', err);
      setError('Failed to create MoMo payment: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

      const handleSubmitToMomo = () => {
        if (momoFormFields && momoFormFields.payUrl) {
          console.log('Redirecting to MoMo Pay URL:', momoFormFields.payUrl);
          
          // Redirect trực tiếp tới payUrl từ MoMo API
          window.open(momoFormFields.payUrl, '_blank');
        } else if (momoPaymentUrl && momoFormFields) {
          console.log('Submitting to MoMo URL:', momoPaymentUrl);
          console.log('MoMo Form Fields:', momoFormFields);
          
          // Fallback: Tạo encoded parameters theo format MoMo cũ
          const params = {
            partnerCode: momoFormFields.partnerCode,
            accessKey: momoFormFields.accessKey,
            requestId: momoFormFields.requestId,
            amount: momoFormFields.amount,
            orderId: momoFormFields.orderId,
            orderInfo: momoFormFields.orderInfo,
            returnUrl: momoFormFields.returnUrl,
            notifyUrl: momoFormFields.notifyUrl,
            extraData: momoFormFields.extraData,
          };
          
          // Tạo query string theo thứ tự alphabet
          const sortedKeys = Object.keys(params).sort();
          const queryString = sortedKeys
            .map(key => `${key}=${params[key]}`)
            .join('&');
          
          console.log('Query string:', queryString);
          
          // Encode parameters
          const encodedParams = btoa(queryString);
          console.log('Encoded params:', encodedParams);
          
          // Tạo URL với encoded parameters
          const finalUrl = `${momoPaymentUrl}?t=${encodedParams}&s=${momoFormFields.signature}`;
          console.log('Final MoMo URL:', finalUrl);
          
          // Redirect tới MoMo payment page
          window.open(finalUrl, '_blank');
        }
      };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetToSampleData = () => {
    setFormData({
      orderId: `MOMO_ORDER_${Date.now()}`,
      amount: '150000',
      userId: '1',
      email: 'test@example.com',
      phone: '0123456789',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💰</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              MoMo Payment Gateway
            </h1>
            <p className="text-gray-600">
              Test thanh toán qua ví điện tử MoMo
            </p>
          </div>

          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order ID
                </label>
                <input
                  type="text"
                  name="orderId"
                  value={formData.orderId}
                  onChange={handleInputChange}
                  placeholder="MOMO_ORDER_123"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (VND)
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  placeholder="100000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User ID
                </label>
                <input
                  type="text"
                  name="userId"
                  value={formData.userId}
                  onChange={handleInputChange}
                  placeholder="1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="test@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="0123456789"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-4">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={handleCreatePayment}
                  disabled={loading}
                  className="flex-1 bg-pink-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '⏳ Creating...' : '🚀 Create MoMo Payment'}
                </button>

                {momoFormFields && (
                  <button
                    type="button"
                    onClick={handleSubmitToMomo}
                    className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    💳 Submit to MoMo
                  </button>
                )}
              </div>
              
              <button
                type="button"
                onClick={resetToSampleData}
                className="w-full bg-gray-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-600 transition-colors"
              >
                🔄 Reset to Sample Data
              </button>
            </div>
          </form>

          {response && (
            <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                📊 MoMo Response
              </h3>
              <pre className="text-sm text-green-700 overflow-x-auto">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-lg font-semibold text-red-800 mb-2">
                ❌ Error
              </h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {momoFormFields && (
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">
                🔐 MoMo Form Fields
              </h3>
              <pre className="text-sm text-blue-700 overflow-x-auto">
                {JSON.stringify(momoFormFields, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MomoPayment;
