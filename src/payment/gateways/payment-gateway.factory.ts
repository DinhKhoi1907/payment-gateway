import { Injectable, Logger } from '@nestjs/common';
import { SepayService, SepayPaymentRequest, SepayPaymentResponse } from './sepay/sepay.service';
import { MomoService, MomoPaymentRequest, MomoPaymentResponse } from './momo/momo.service';
import { PaypalService, PaypalPaymentRequest, PaypalPaymentResponse } from './paypal/paypal.service';

export type PaymentMethod = 'sepay' | 'momo' | 'paypal';

export interface PaymentGatewayRequest {
  order_id: string;
  amount: number;
  currency: string;
  customer_data: any;
  return_url: string;
  notify_url: string;
}

export interface PaymentGatewayResponse {
  payment_url: string;
  transaction_id: string;
  status: string;
  qr_code_url?: string; // QR code URL nếu có
}

@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name);

  constructor(
    private readonly sepayService: SepayService,
    private readonly momoService: MomoService,
    private readonly paypalService: PaypalService,
  ) {}

  /**
   * Tạo payment với gateway tương ứng
   */
  async createPayment(
    method: PaymentMethod,
    request: PaymentGatewayRequest,
  ): Promise<PaymentGatewayResponse> {
    this.logger.log(`=== PAYMENT GATEWAY FACTORY: CREATE PAYMENT ===`);
    this.logger.log(`Method: ${method}`);
    this.logger.log(`Request: ${JSON.stringify(request, null, 2)}`);

    try {
      let result: PaymentGatewayResponse;
      
      switch (method) {
        case 'sepay':
          this.logger.log(`Calling Sepay service...`);
          {
            const sepayResp = await this.sepayService.createPayment(
              request as SepayPaymentRequest,
            );
            // Ánh xạ về dạng chuẩn của factory
            // Sepay trả về qr_code_url, payment_url sẽ được tạo sau với format mới
            result = {
              payment_url: '', // Sẽ được tạo sau với format /sepay/confirm?paymentId=...&qr=...
              transaction_id: sepayResp.order_invoice_number,
              status: 'pending',
              qr_code_url: sepayResp.qr_code_url, // QR code URL nếu có
            };
            this.logger.log(`Sepay response: ${JSON.stringify({
              transaction_id: result.transaction_id,
              has_qr_code: !!result.qr_code_url
            }, null, 2)}`);
          }
          break;
        
        case 'momo':
          this.logger.log(`Calling MoMo service...`);
          const momoSdkResponse = await this.momoService.createPayment(request as MomoPaymentRequest);
          result = {
            payment_url: momoSdkResponse.payUrl || '', // Lấy URL thực từ MoMo API, không hardcode URL test
            transaction_id: momoSdkResponse.orderId,
            status: 'pending',
          };
          break;
        
        case 'paypal':
          this.logger.log(`Calling PayPal service...`);
          const nestjsUrl = process.env.NESTJS_URL;
          if (!nestjsUrl) {
            throw new Error('NESTJS_URL environment variable is required for PayPal payments');
          }
          const paypalPageUrl = `${nestjsUrl}/paypal?orderId=${request.order_id}&amount=${request.amount}`;
          result = {
            payment_url: paypalPageUrl,
            transaction_id: `PAYPAL_${request.order_id}_${Date.now()}`,
            status: 'pending',
          };
          this.logger.log(`PayPal payment URL: ${paypalPageUrl}`);
          break;
        
        default:
          this.logger.error(`Unsupported payment method: ${method}`);
          throw new Error(`Unsupported payment method: ${method}`);
      }
      
      this.logger.log(`Gateway response: ${JSON.stringify(result, null, 2)}`);
      this.logger.log(`=== PAYMENT GATEWAY FACTORY SUCCESS ===`);
      return result;
    } catch (error) {
      this.logger.error(`Payment gateway factory error:`, error);
      this.logger.error(`=== PAYMENT GATEWAY FACTORY FAILED ===`);
      throw error;
    }
  }

  /**
   * Verify webhook signature từ gateway
   */
  async verifyWebhookSignature(
    method: PaymentMethod,
    payload: any,
    signature: string,
  ): Promise<boolean> {
    this.logger.log(`Verifying webhook signature for ${method}`);

    switch (method) {
      case 'sepay':
        return this.sepayService.verifyWebhookSignature(payload, signature);
      
      case 'momo':
        return await this.momoService.verifyWebhookSignature(payload, signature);
      
      case 'paypal':
        return this.paypalService.verifyWebhookSignature(payload, signature);
      
      default:
        this.logger.warn(`Unsupported payment method for webhook verification: ${method}`);
        return false;
    }
  }

  /**
   * Execute PayPal payment (chỉ dành cho PayPal)
   */
  async executePaypalPayment(paymentId: string, payerId: string): Promise<any> {
    return await this.paypalService.executePayment(paymentId, payerId);
  }

  /**
   * Tạo PayPal Order (v2 Orders API - cho PayPal JS SDK)
   */
  async createPayPalOrder(
    orderId: string,
    amount: number,
    currency: string = 'USD',
  ): Promise<{ orderId: string }> {
    return await this.paypalService.createOrder(orderId, amount, currency);
  }

  /**
   * Capture PayPal Order (v2 Orders API)
   */
  async capturePayPalOrder(
    paypalOrderId: string,
  ): Promise<Record<string, unknown>> {
    return await this.paypalService.captureOrder(paypalOrderId);
  }

  /**
   * Kiểm tra gateway có hỗ trợ method không
   */
  isSupportedMethod(method: string): method is PaymentMethod {
    return ['sepay', 'momo', 'paypal'].includes(method);
  }

  /**
   * Lấy danh sách các payment methods được hỗ trợ
   */
  getSupportedMethods(): PaymentMethod[] {
    return ['sepay', 'momo', 'paypal'];
  }
}
