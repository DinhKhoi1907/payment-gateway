import React, { useEffect, useMemo, useState } from 'react';
import { getLaravelUrl } from './utils/env';

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export default function SepayConfirm() {
  const query = useQuery();
  const paymentId = query.get('paymentId') || '';
  const qrFromQuery = query.get('qr') || '';
  const [status, setStatus] = useState('pending');
  const [qrUrl, setQrUrl] = useState(qrFromQuery);
  const [lastUpdate, setLastUpdate] = useState('');
  const [gatewayResponse, setGatewayResponse] = useState(null);
  const [error, setError] = useState('');
  const [orderInfo, setOrderInfo] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState('VND');
  const [countdown, setCountdown] = useState(null);kh
  const [expiresAt, setExpiresAt] = useState(null);

  const getThankYouUrl = () => {
    const laravelUrl = getLaravelUrl();
    const orderId = orderInfo?.order_id || '';
    if (orderId) {
      return `${laravelUrl}/thank-you?order_id=${orderId}`;
    }
    return `${laravelUrl}/thank-you`;
  };

  useEffect(() => {
    let timer;
    async function fetchStatus() {
      try {
        if (!paymentId) return;
        const res = await fetch(`/api/payments/${paymentId}/status`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStatus(data.status);
        setGatewayResponse(data.gateway_response || null);
        
        setOrderInfo({
          order_id: data.order_id || '',
        });
        
        if (data.amount) {
          setAmount(data.amount);
        }
        if (data.currency) {
          setCurrency(data.currency);
        }
        
        // Initialize countdown if TTL exists
        if (data.expires_at) {
          setExpiresAt(data.expires_at);
          const end = new Date(data.expires_at).getTime();
          const now = Date.now();
          const initial = Math.max(0, Math.floor((end - now) / 1000));
          setCountdown(initial);
        }
        
        if (data.gateway_response) {
          if (!data.amount && data.gateway_response.order_amount) {
            setAmount(data.gateway_response.order_amount);
          }
          if (!data.currency && data.gateway_response.currency) {
            setCurrency(data.gateway_response.currency);
          }
          setCheckoutUrl(data.gateway_response.checkout_url || '');
        }
        
        const qr = data.gateway_response?.qr_code_url || data.gateway_response?.payment_url || '';
        if (qr && !qrUrl) setQrUrl(qr);
        setLastUpdate(new Date().toLocaleTimeString());
      } catch (e) {
        setError(String(e.message || e));
      }
    }

    fetchStatus();
    timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, [paymentId, qrUrl]);

  // TTL countdown tick
  useEffect(() => {
    if (!expiresAt) return;
    if (countdown === null) return;
    if (countdown <= 0) {
      window.location.replace('/error/404');
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, countdown]);
  
  const formatAmount = (amount) => {
    if (!amount) return '0 VND';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(num);
  };
  
  const handlePaymentMethod = (method) => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else if (qrUrl) {
      alert('Vui lòng quét mã QR để thanh toán');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán đơn hàng</h1>
        </div>

        {/* {status === 'pending' && (
          <div className="text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )} */}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-semibold mb-2">Lỗi không xác định</h3>
            <p className="text-red-700 text-sm">{error}</p>
            <p className="text-red-600 text-sm mt-2">Đã có lỗi xảy ra trong quá trình thực hiện</p>
            <button
              onClick={() => window.location.href = getThankYouUrl()}
              className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
            >
              Trở về nhà bán hàng
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6 text-center">
            <h2 className="text-green-800 font-bold text-xl mb-2">Thành công</h2>
            <p className="text-green-700 mb-4">Đã thực hiện thành công</p>
            <button
              onClick={() => window.location.href = getThankYouUrl()}
              className="text-sm text-green-600 hover:text-green-800 underline"
            >
              Trở về nhà bán hàng
            </button>
          </div>
        )}

        {orderInfo && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Thông tin đơn hàng</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-600">Mã đơn hàng</dt>
                <dd className="text-sm font-semibold text-gray-900">{orderInfo.order_id || 'N/A'}</dd>
              </div>
              {expiresAt && (
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-600">Thời gian còn lại</dt>
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
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-600">Mô tả đơn hàng</dt>
                <dd className="text-sm text-gray-900">Thanh toán cho đơn hàng #{orderInfo.order_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-600">Số tiền</dt>
                <dd className="text-sm font-semibold text-gray-900">{formatAmount(amount)}</dd>
              </div>
            </dl>
            <button
              onClick={() => window.location.href = getThankYouUrl()}
              className="mt-4 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Quay lại
            </button>
          </div>
        )}

        {status === 'pending' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Phương thức thanh toán</h2>
            
            {countdown !== null && countdown <= 0 ? (
              <div className="text-center text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
                Link thanh toán đã hết hạn. Vui lòng quay lại và tạo thanh toán mới.
              </div>
            ) : (
              qrUrl && (
                <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                  <h3 className="font-semibold text-gray-900 mb-2">Quét mã QR để thanh toán</h3>
                  <div className="text-center">
                    <img 
                      src={qrUrl} 
                      alt="QR Code" 
                      className="mx-auto max-w-xs h-auto border-2 border-white rounded-lg p-2 bg-white shadow-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Quét mã QR bằng ứng dụng ngân hàng của bạn
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {status !== 'pending' && status !== 'completed' && (
          <div className="text-center text-sm text-gray-600 mb-4">
            <div><strong>Trạng thái:</strong> <span className="uppercase">{status}</span></div>
            {lastUpdate && <div><strong>Lần cập nhật:</strong> {lastUpdate}</div>}
          </div>
        )}

        {status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-red-700 mb-2">❌ Thanh toán thất bại. Vui lòng thử lại.</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Thử lại
            </button>
          </div>
        )}

      </div>
    </div>
  );
}


