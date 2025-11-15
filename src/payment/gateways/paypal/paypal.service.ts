import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface PaypalPaymentRequest {
  order_id: string;
  amount: number;
  currency: string;
  customer_data: any;
  return_url: string;
  notify_url: string;
}

export interface PaypalPaymentResponse {
  payment_url: string;
  transaction_id: string;
  status: string;
}

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  private readonly apiUrl = process.env.PAYPAL_API_URL || 'https://api.sandbox.paypal.com';
  private readonly clientId = process.env.PAYPAL_CLIENT_ID;
  private readonly clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Tạo payment request với PayPal
   */
  async createPayment(request: PaypalPaymentRequest): Promise<PaypalPaymentResponse> {
    try {
      // Lấy access token
      await this.ensureAccessToken();

      const paymentData = {
        intent: 'sale',
        payer: {
          payment_method: 'paypal',
        },
        transactions: [
          {
            amount: {
              total: request.amount.toString(),
              currency: request.currency,
            },
            description: `Payment for order ${request.order_id}`,
            custom: request.order_id,
            invoice_number: request.order_id,
          },
        ],
        redirect_urls: {
          return_url: request.return_url,
          cancel_url: `${request.return_url}?cancelled=true`,
        },
        application_context: {
          brand_name: 'Simple Shop',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
        },
      };

      this.logger.log(`Creating PayPal payment for order ${request.order_id}`);
      
      const response = await axios.post(`${this.apiUrl}/v1/payments/payment`, paymentData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        timeout: 30000,
      });

      if (response.data.state === 'created') {
        const approvalUrl = response.data.links.find((link: any) => link.rel === 'approval_url');
        
        return {
          payment_url: approvalUrl.href,
          transaction_id: response.data.id,
          status: 'success',
        };
      } else {
        throw new Error(`PayPal API error: ${response.data.state}`);
      }
    } catch (error) {
      this.logger.error(`PayPal payment creation failed:`, error);
      throw error;
    }
  }

  /**
   * Execute PayPal payment sau khi user approve (Legacy v1 API)
   */
  async executePayment(paymentId: string, payerId: string): Promise<any> {
    try {
      await this.ensureAccessToken();

      const executeData = {
        payer_id: payerId,
      };

      const response = await axios.post(
        `${this.apiUrl}/v1/payments/payment/${paymentId}/execute`,
        executeData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
          },
          timeout: 30000,
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`PayPal payment execution failed:`, error);
      throw error;
    }
  }

  /**
   * Tạo PayPal Order (v2 Orders API - cho PayPal JS SDK)
   */
  async createOrder(orderId: string, amount: number, currency: string = 'USD'): Promise<{ orderId: string }> {
    try {
      await this.ensureAccessToken();

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId,
            description: `Payment for order ${orderId}`,
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'Simple Shop',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${process.env.LARAVEL_URL || 'http://localhost:8000'}/thank-you?order_id=${orderId}`,
          cancel_url: `${process.env.LARAVEL_URL || 'http://localhost:8000'}/thank-you?order_id=${orderId}&cancelled=true`,
        },
      };

      this.logger.log(`Creating PayPal order for order ${orderId}`);
      
      const response = await axios.post(
        `${this.apiUrl}/v2/checkout/orders`,
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
            'PayPal-Request-Id': orderId,
          },
          timeout: 30000,
        }
      );

      if (response.data.status === 'CREATED' || response.data.id) {
        this.logger.log(`PayPal order created: ${response.data.id}`);
        return { orderId: response.data.id };
      } else {
        throw new Error(`PayPal API error: ${response.data.status || 'Unknown error'}`);
      }
    } catch (error: any) {
      this.logger.error(`PayPal order creation failed:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get PayPal Order details (v2 Orders API)
   */
  async getOrderDetails(paypalOrderId: string): Promise<any> {
    try {
      await this.ensureAccessToken();

      this.logger.log(`Getting PayPal order details: ${paypalOrderId}`);
      
      const response = await axios.get(
        `${this.apiUrl}/v2/checkout/orders/${paypalOrderId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
          },
          timeout: 30000,
        }
      );

      this.logger.log(`PayPal order details retrieved: ${response.data.id}, status: ${response.data.status}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get PayPal order details:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Capture PayPal Order (v2 Orders API)
   * Checks order status first to avoid duplicate captures
   */
  async captureOrder(paypalOrderId: string): Promise<any> {
    try {
      await this.ensureAccessToken();

      this.logger.log(`Capturing PayPal order: ${paypalOrderId}`);
      
      // Check order status first
      try {
        const orderDetails = await this.getOrderDetails(paypalOrderId);
        const orderStatus = orderDetails.status;
        
        this.logger.log(`PayPal order status before capture: ${orderStatus}`);
        
        // If order is already COMPLETED, return existing data
        if (orderStatus === 'COMPLETED') {
          this.logger.log(`PayPal order already completed, returning existing data`);
          return orderDetails;
        }
        
        // If order is not APPROVED, log warning
        if (orderStatus !== 'APPROVED') {
          this.logger.warn(`PayPal order is not in APPROVED status. Current status: ${orderStatus}`);
        }
      } catch (getOrderError: any) {
        // If we can't get order details, continue with capture attempt
        this.logger.warn(`Could not get order details before capture, proceeding anyway:`, getOrderError.message);
      }
      
      const response = await axios.post(
        `${this.apiUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
          },
          timeout: 30000,
        }
      );

      this.logger.log(`PayPal order captured: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const errorMessage = errorData.message || error.message || 'PayPal capture failed';
      const errorDetails = errorData.details || [];
      const errorIssue = errorDetails[0]?.issue || '';
      
      // Handle specific error cases
      if (errorIssue === 'TRANSACTION_REFUSED' || errorIssue === 'ORDER_ALREADY_CAPTURED') {
        // Try to get order details to return existing capture data
        try {
          this.logger.log(`Order may already be captured, attempting to get order details...`);
          const orderDetails = await this.getOrderDetails(paypalOrderId);
          
          if (orderDetails.status === 'COMPLETED') {
            this.logger.log(`Order already completed, returning existing capture data`);
            return orderDetails;
          }
        } catch (getOrderError: any) {
          this.logger.warn(`Could not retrieve order details after capture error:`, getOrderError.message);
        }
      }
      
      this.logger.error(`PayPal order capture failed:`, {
        orderId: paypalOrderId,
        status: error.response?.status,
        error: errorData,
        message: errorMessage,
        issue: errorIssue,
      });

      // Tạo error message chi tiết hơn
      let detailedMessage = errorMessage;
      if (errorIssue) {
        detailedMessage = `${errorMessage} (${errorIssue})`;
      }
      if (errorDetails[0]?.description) {
        detailedMessage += `: ${errorDetails[0].description}`;
      }

      // Tạo custom error với thông tin chi tiết
      const customError: any = new Error(detailedMessage);
      customError.statusCode = error.response?.status || 500;
      customError.paypalError = errorData;
      customError.debugId = errorData.debug_id;
      throw customError;
    }
  }

  /**
   * Verify webhook signature từ PayPal
   */
  verifyWebhookSignature(payload: any, signature: string): boolean {
    try {
      // PayPal webhook verification logic
      // Trong thực tế cần implement theo PayPal webhook verification spec
      return true; // Placeholder
    } catch (error) {
      this.logger.error('PayPal webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Đảm bảo có access token hợp lệ
   */
  private async ensureAccessToken(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
      await this.getAccessToken();
    }
  }

  /**
   * Lấy access token từ PayPal
   */
  private async getAccessToken(): Promise<void> {
    try {
      if (!this.clientId || !this.clientSecret) {
        const errorMsg = 'PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.';
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.apiUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      
      this.logger.log('PayPal access token refreshed');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error_description || error.message || 'Failed to get PayPal access token';
      this.logger.error(`Failed to get PayPal access token: ${errorMsg}`);
      this.logger.error(`PayPal API URL: ${this.apiUrl}`);
      this.logger.error(`Client ID configured: ${!!this.clientId}`);
      this.logger.error(`Client Secret configured: ${!!this.clientSecret}`);
      this.logger.error(`Error response: ${JSON.stringify(error.response?.data || {}, null, 2)}`);
      
      // Kiểm tra nếu API URL sai
      if (this.apiUrl && !this.apiUrl.includes('api.')) {
        this.logger.error(`WARNING: PayPal API URL seems incorrect. Should be 'https://api.sandbox.paypal.com' or 'https://api.paypal.com'`);
      }
      
      throw new Error(`PayPal authentication failed: ${errorMsg}`);
    }
  }
}
