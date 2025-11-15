/**
 * Payment Error Codes và Messages thân thiện
 * Được sử dụng để map lỗi kỹ thuật thành message dễ hiểu cho user
 */
export enum PaymentErrorCode {
  // Idempotency errors
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_INVALID = 'IDEMPOTENCY_INVALID',

  // Payment gateway errors
  GATEWAY_UNAVAILABLE = 'GATEWAY_UNAVAILABLE',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  GATEWAY_INVALID_RESPONSE = 'GATEWAY_INVALID_RESPONSE',

  // Validation errors
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_ORDER = 'INVALID_ORDER',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Payment status errors
  PAYMENT_ALREADY_COMPLETED = 'PAYMENT_ALREADY_COMPLETED',
  PAYMENT_ALREADY_FAILED = 'PAYMENT_ALREADY_FAILED',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export const PaymentErrorMessages: Record<PaymentErrorCode, string> = {
  [PaymentErrorCode.IDEMPOTENCY_CONFLICT]:
    'Yêu cầu thanh toán đã được xử lý trước đó. Vui lòng kiểm tra lại trạng thái đơn hàng.',
  [PaymentErrorCode.IDEMPOTENCY_INVALID]:
    'Mã xác thực thanh toán không hợp lệ. Vui lòng thử lại.',

  [PaymentErrorCode.GATEWAY_UNAVAILABLE]:
    'Hệ thống thanh toán tạm thời không khả dụng. Vui lòng thử lại sau vài phút.',
  [PaymentErrorCode.GATEWAY_TIMEOUT]:
    'Hệ thống thanh toán đang phản hồi chậm. Vui lòng thử lại.',
  [PaymentErrorCode.GATEWAY_INVALID_RESPONSE]:
    'Hệ thống thanh toán trả về phản hồi không hợp lệ. Vui lòng thử lại.',

  [PaymentErrorCode.INVALID_SIGNATURE]:
    'Xác thực thanh toán không thành công. Vui lòng thử lại.',
  [PaymentErrorCode.INVALID_AMOUNT]:
    'Số tiền thanh toán không hợp lệ. Vui lòng kiểm tra lại.',
  [PaymentErrorCode.INVALID_ORDER]:
    'Thông tin đơn hàng không hợp lệ. Vui lòng kiểm tra lại.',
  [PaymentErrorCode.MISSING_REQUIRED_FIELD]:
    'Thiếu thông tin bắt buộc. Vui lòng kiểm tra lại.',

  [PaymentErrorCode.PAYMENT_ALREADY_COMPLETED]:
    'Giao dịch này đã được thanh toán thành công.',
  [PaymentErrorCode.PAYMENT_ALREADY_FAILED]:
    'Giao dịch này đã thất bại trước đó. Vui lòng tạo đơn hàng mới.',
  [PaymentErrorCode.PAYMENT_EXPIRED]:
    'Phiên thanh toán đã hết hạn. Vui lòng tạo đơn hàng mới.',
  [PaymentErrorCode.PAYMENT_NOT_FOUND]:
    'Không tìm thấy thông tin thanh toán. Vui lòng kiểm tra lại.',

  [PaymentErrorCode.INTERNAL_ERROR]:
    'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
  [PaymentErrorCode.NETWORK_ERROR]:
    'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
  [PaymentErrorCode.UNKNOWN_ERROR]:
    'Đã xảy ra lỗi không xác định. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
};

/**
 * Map error message/exception thành error code
 */
export function getPaymentErrorCode(error: Error | string): PaymentErrorCode {
  const errorMessage =
    typeof error === 'string' ? error : error.message || '';

  // Idempotency errors
  if (
    errorMessage.includes('Idempotency key conflict') ||
    errorMessage.includes('idempotency') ||
    errorMessage.includes('Request payload does not match')
  ) {
    return PaymentErrorCode.IDEMPOTENCY_CONFLICT;
  }

  // Gateway errors
  if (
    errorMessage.includes('gateway unavailable') ||
    errorMessage.includes('Payment gateway unavailable')
  ) {
    return PaymentErrorCode.GATEWAY_UNAVAILABLE;
  }

  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('ETIMEDOUT')
  ) {
    return PaymentErrorCode.GATEWAY_TIMEOUT;
  }

  // Signature errors
  if (
    errorMessage.includes('signature') ||
    errorMessage.includes('Signature verification')
  ) {
    return PaymentErrorCode.INVALID_SIGNATURE;
  }

  // Payment status errors
  if (errorMessage.includes('already completed')) {
    return PaymentErrorCode.PAYMENT_ALREADY_COMPLETED;
  }

  if (errorMessage.includes('already failed')) {
    return PaymentErrorCode.PAYMENT_ALREADY_FAILED;
  }

  if (errorMessage.includes('expired')) {
    return PaymentErrorCode.PAYMENT_EXPIRED;
  }

  if (errorMessage.includes('not found')) {
    return PaymentErrorCode.PAYMENT_NOT_FOUND;
  }

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND')
  ) {
    return PaymentErrorCode.NETWORK_ERROR;
  }

  // Default
  return PaymentErrorCode.UNKNOWN_ERROR;
}

