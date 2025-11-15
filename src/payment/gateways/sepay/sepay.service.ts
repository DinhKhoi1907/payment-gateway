import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { SePayPgClient } from 'sepay-pg-node';

export interface SepayPaymentRequest {
  order_id: string;
  amount: number;
  currency: string;
  customer_data: any;
  return_url: string;
  notify_url: string;
}

export interface SepayPaymentResponse {
  merchant: string;
  operation: string;
  payment_method: string;
  order_invoice_number: string;
  order_amount: string;
  currency: string;
  order_description: string;
  customer_id: string;
  success_url: string;
  error_url: string;
  cancel_url: string;
  custom_data: string;
  signature: string;
  checkout_url?: string; // URL để redirect tới Sepay checkout page (có QR code)
  qr_code_url?: string; // URL của QR code image (nếu Sepay cung cấp)
  form_fields?: any; // Form fields để submit (fallback)
}

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private readonly apiUrl =
    process.env.SEPAY_API_URL || 'https://api.sepay.com';
  private readonly merchantId = process.env.SEPAY_MERCHANT_ID;
  private readonly secretKey = process.env.SEPAY_SECRET_KEY;
  private readonly sepayAccount = process.env.SEPAY_ACCOUNT || '0356936816'; // Số tài khoản Sepay
  private readonly sepayBank = process.env.SEPAY_BANK || 'MBBank'; // Ngân hàng (MBBank, Vietcombank, etc.)
  private readonly sepayClient: SePayPgClient;

  constructor() {
    if (!this.merchantId || !this.secretKey) {
      throw new Error(
        'SEPAY_MERCHANT_ID and SEPAY_SECRET_KEY must be configured',
      );
    }

    this.sepayClient = new SePayPgClient({
      env: (process.env.SEPAY_ENV as 'sandbox' | 'production') || 'production',
      merchant_id: this.merchantId,
      secret_key: this.secretKey,
    });
  }

  /**
   * Simple helper for demo page: build checkout URL and form fields using SDK
   */
  public createSimpleCheckout(params: {
    orderId: string;
    amount: number;
    description: string;
    successUrl: string;
    errorUrl: string;
    cancelUrl: string;
  }): { checkout_url: string; form_fields: Record<string, string>; order_invoice_number: string; qr_code_url: string } {
    const checkoutUrl = this.sepayClient.checkout.initCheckoutUrl();
    const rawFormFields = this.sepayClient.checkout.initOneTimePaymentFields({
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: params.orderId,
      order_amount: params.amount,
      currency: 'VND',
      order_description: params.description,
      success_url: params.successUrl,
      error_url: params.errorUrl,
      cancel_url: params.cancelUrl,
    });

    // Coerce all values to string to satisfy Record<string, string>
    const formFields: Record<string, string> = Object.fromEntries(
      Object.entries(rawFormFields).map(([k, v]) => [k, String(v)])
    );

    // Theo tài liệu: des phải chứa mã đơn hàng dạng DH{order_id}
    const qrDescription = encodeURIComponent(`DH${params.orderId}`);
    const qrUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(this.sepayAccount)}&bank=${encodeURIComponent(this.sepayBank)}&amount=${encodeURIComponent(String(params.amount))}&des=${qrDescription}&template=compact`;

    return {
      checkout_url: checkoutUrl,
      form_fields: formFields,
      order_invoice_number: params.orderId,
      qr_code_url: qrUrl,
    };
  }

  /**
   * Tạo payment request với Sepay SDK
   */
  async createPayment(
    request: SepayPaymentRequest,
  ): Promise<SepayPaymentResponse> {
    this.logger.log(`Creating Sepay payment for order ${request.order_id}, amount: ${request.amount}`);

    try {
      // Tạo checkout URL với merchant ID và các parameters giống Sepay sandbox
      const checkoutBaseUrl = this.apiUrl.includes('sandbox') 
        ? 'https://pay-sandbox.sepay.vn/v1/checkout'
        : 'https://pay.sepay.vn/v1/checkout';
      
      // Tạo signature cho checkout URL
      const checkoutParams = {
        order_amount: request.amount,
        merchant: this.merchantId,
        currency: request.currency || 'VND',
        operation: 'PURCHASE',
        order_description: encodeURIComponent(`Thanh toán đơn hàng #${request.order_id}`),
        order_invoice_number: request.order_id,
        success_url: encodeURIComponent(request.return_url),
        error_url: encodeURIComponent(request.return_url.replace('thank-you', 'error')),
        cancel_url: encodeURIComponent(request.return_url.replace('thank-you', 'cancel')),
      };
      
      // Tạo signature string theo format Sepay
      const signatureString = `order_amount=${checkoutParams.order_amount}&merchant=${checkoutParams.merchant}&currency=${checkoutParams.currency}&operation=${checkoutParams.operation}&order_description=${decodeURIComponent(checkoutParams.order_description)}&order_invoice_number=${checkoutParams.order_invoice_number}&success_url=${decodeURIComponent(checkoutParams.success_url)}&error_url=${decodeURIComponent(checkoutParams.error_url)}&cancel_url=${decodeURIComponent(checkoutParams.cancel_url)}`;
      
      const checkoutSignature = crypto
        .createHmac('sha256', this.secretKey as unknown as crypto.BinaryLike)
        .update(signatureString)
        .digest('base64');
      
      // Build checkout URL
      const checkoutUrl = `${checkoutBaseUrl}?order_amount=${checkoutParams.order_amount}&merchant=${checkoutParams.merchant}&currency=${checkoutParams.currency}&operation=${checkoutParams.operation}&order_description=${checkoutParams.order_description}&order_invoice_number=${checkoutParams.order_invoice_number}&success_url=${checkoutParams.success_url}&error_url=${checkoutParams.error_url}&cancel_url=${checkoutParams.cancel_url}&signature=${encodeURIComponent(checkoutSignature)}`;

      // Tạo form fields theo đúng format của SDK
      const checkoutFormFields =
        this.sepayClient.checkout.initOneTimePaymentFields({
          operation: 'PURCHASE',
          payment_method: 'BANK_TRANSFER',
          order_invoice_number: request.order_id,
          order_amount: request.amount,
          currency: request.currency || 'VND',
          order_description: `Thanh toan don hang ${request.order_id}`,
          customer_id: String(
            (request.customer_data as { user_id?: string | number })?.user_id ||
              '1',
          ),
          success_url: request.return_url,
          error_url: request.return_url.replace('thank-you', 'error'),
          cancel_url: request.return_url.replace('thank-you', 'cancel'),
          custom_data: JSON.stringify(request.customer_data || {}),
        });

      // Tạo QR code URL theo format Sepay
      const qrDescription = encodeURIComponent(`DH${request.order_id}`);
      const qrCodeUrl = `https://qr.sepay.vn/img?acc=${this.sepayAccount}&bank=${this.sepayBank}&amount=${request.amount}&des=${qrDescription}&template=compact`;

      const result: SepayPaymentResponse = {
        merchant: checkoutFormFields.merchant || '',
        operation: checkoutFormFields.operation || '',
        payment_method: checkoutFormFields.payment_method || '',
        order_invoice_number: checkoutFormFields.order_invoice_number || '',
        order_amount: checkoutFormFields.order_amount?.toString() || '',
        currency: checkoutFormFields.currency || '',
        order_description: checkoutFormFields.order_description || '',
        customer_id: checkoutFormFields.customer_id || '',
        success_url: checkoutFormFields.success_url || '',
        error_url: checkoutFormFields.error_url || '',
        cancel_url: checkoutFormFields.cancel_url || '',
        custom_data: checkoutFormFields.custom_data || '',
        signature: checkoutFormFields.signature || '',
        checkout_url: checkoutUrl,
        qr_code_url: qrCodeUrl,
        form_fields: checkoutFormFields,
      };

      this.logger.log(`Sepay payment created successfully. Order: ${result.order_invoice_number}, QR: ${result.qr_code_url}`);
      return result;
    } catch (error) {
      this.logger.error(`Sepay payment creation failed:`, error);
      throw error;
    }
  }

  /**
   * Verify webhook signature từ Sepay
   */
  verifyWebhookSignature(
    payload: Record<string, any>,
    signature: string,
  ): boolean {
    try {
      const expectedSignature = this.generateWebhookSignature(payload);
      return signature === expectedSignature;
    } catch (error) {
      this.logger.error('Sepay webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Generate signature cho payment request
   */
  private generateSignature(
    requestId: string,
    amount: number,
    orderId: string,
  ): string {
    if (!this.secretKey) {
      throw new Error('SEPAY_SECRET_KEY is not configured');
    }
    const rawSignature = `merchantId=${this.merchantId}&amount=${amount}&extraData=&orderId=${orderId}&orderInfo=Thanh toan don hang ${orderId}&requestId=${requestId}&requestType=payWithATM`;
    return crypto
      .createHmac('sha256', this.secretKey as unknown as crypto.BinaryLike)
      .update(rawSignature)
      .digest('hex');
  }

  /**
   * Generate signature cho webhook verification
   */
  private generateWebhookSignature(payload: Record<string, any>): string {
    if (!this.secretKey) {
      throw new Error('SEPAY_SECRET_KEY is not configured');
    }
    const rawSignature = `merchantId=${payload.merchantId || ''}&amount=${payload.amount || ''}&extraData=${payload.extraData || ''}&message=${payload.message || ''}&orderId=${payload.orderId || ''}&orderInfo=${payload.orderInfo || ''}&orderType=${payload.orderType || ''}&payType=${payload.payType || ''}&requestId=${payload.requestId || ''}&responseTime=${payload.responseTime || ''}&resultCode=${payload.resultCode || ''}&transId=${payload.transId || ''}`;
    return crypto
      .createHmac('sha256', this.secretKey as unknown as crypto.BinaryLike)
      .update(rawSignature)
      .digest('hex');
  }
}
