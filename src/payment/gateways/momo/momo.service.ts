import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';

export interface MomoPaymentRequest {
  order_id: string;
  amount: number;
  currency?: string;
  customer_data?: Record<string, any>;
  return_url: string;
  notify_url?: string;
  expire_time?: number;
}

export interface MomoPaymentResponse {
  accessKey: string;
  partnerCode: string;
  requestType: string;
  notifyUrl: string;
  returnUrl: string;
  orderId: string;
  amount: string;
  orderInfo: string;
  requestId: string;
  extraData: string;
  signature: string;
  payUrl?: string;
}

@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);

  private readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly apiUrl: string;
  private readonly defaultExpireTime: number;

  constructor() {
    if (
      !process.env.MOMO_PARTNER_CODE ||
      !process.env.MOMO_ACCESS_KEY ||
      !process.env.MOMO_SECRET_KEY ||
      !process.env.MOMO_API_URL ||
      !process.env.IDEMPOTENCY_TTL_MINUTES
    ) {
      throw new Error('Variables not configured in environment variables');
    }
    this.partnerCode = process.env.MOMO_PARTNER_CODE;
    this.accessKey = process.env.MOMO_ACCESS_KEY;
    this.secretKey = process.env.MOMO_SECRET_KEY;
    this.apiUrl = process.env.MOMO_API_URL;
    this.defaultExpireTime = parseInt(process.env.IDEMPOTENCY_TTL_MINUTES, 10);

    const defaultTtlMinutes = parseInt(
      process.env.IDEMPOTENCY_TTL_MINUTES || '30',
      10,
    );
    this.defaultExpireTime = defaultTtlMinutes * 60 * 1000;

    // Validate required config
    if (!this.accessKey || !this.secretKey) {
      this.logger.warn(
        'MOMO_ACCESS_KEY and MOMO_SECRET_KEY must be configured in environment variables',
      );
    }

    this.logger.log(
      `MoMo Service initialized with partnerCode: ${this.partnerCode}`,
    );
    this.logger.log(`MoMo API URL: ${this.apiUrl}`);
    this.logger.log(`MoMo default TTL: ${defaultTtlMinutes} minutes`);
  }

  async createPayment(
    request: MomoPaymentRequest,
  ): Promise<MomoPaymentResponse> {
    this.logger.log(`Creating MoMo payment for order: ${request.order_id}`);
    this.logger.log(`Request data: ${JSON.stringify(request, null, 2)}`);

    try {
      // Tạo request ID và order ID theo format MoMo (Đảm bảo unique)
      const timestamp = Date.now();
      const requestId = `${this.partnerCode}${timestamp}`;
      // Sử dụng order_id từ Laravel nhưng thêm timestamp để đảm bảo unique
      const orderId = request.order_id
        ? `ORDER_${request.order_id}_${timestamp}`
        : requestId;

      this.logger.log(`Generated requestId: ${requestId}, orderId: ${orderId}`);

      // Tạo extraData từ customer_data
      const extraData = request.customer_data
        ? Object.entries(request.customer_data)
            .map(([key, value]) => `${key}=${value}`)
            .join('&')
        : '';

      this.logger.log(`Generated extraData: ${extraData}`);

      const requestType = 'captureWallet';
      // Ưu tiên: notify_url trong request -> MOMO_NOTIFY_URL -> NESTJS_URL/webhooks/momo
      const defaultNestWebhook =
        (process.env.NESTJS_URL
          ? `${process.env.NESTJS_URL}/api/payments/webhooks/momo`
          : '') || '';
      const ipnUrl =
        request.notify_url || process.env.MOMO_NOTIFY_URL || defaultNestWebhook;
      if (!ipnUrl) {
        this.logger.warn(
          'MoMo ipnUrl is empty. Please set MOMO_NOTIFY_URL or NESTJS_URL',
        );
      } else {
        this.logger.log(`Using MoMo ipnUrl: ${ipnUrl}`);
      }

      const params = {
        accessKey: this.accessKey,
        amount: request.amount.toString(),
        extraData: extraData,
        ipnUrl: ipnUrl,
        orderId: orderId,
        orderInfo: `pay with MoMo - ${orderId}`,
        partnerCode: this.partnerCode,
        redirectUrl: request.return_url,
        requestId: requestId,
        requestType: requestType,
      };

      this.logger.log(
        `Parameters for signature: ${JSON.stringify(params, null, 2)}`,
      );

      // Tạo signature theo format MoMo
      const signature = this.generateMoMoSignature(params);
      this.logger.log(`Generated signature: ${signature}`);

      // Gọi MoMo API thực sự
      // Đảm bảo URL đúng format: nếu apiUrl đã có /api thì chỉ thêm /create, nếu không thì thêm /api/create
      const baseUrl = this.apiUrl.endsWith('/api')
        ? this.apiUrl
        : this.apiUrl.replace('/pay', '/api');
      const momoApiUrl = `${baseUrl}/create`;

      // Tính toán expireTime nếu được cung cấp
      // Lưu ý: MoMo API hiện tại không hỗ trợ tham số expireTime trong request body,
      // nhưng có thể được cấu hình trong tài khoản MoMo Business hoặc qua API khác
      const expireTime = request.expire_time || this.defaultExpireTime;
      const expireTimeMinutes = Math.floor(expireTime / (60 * 1000));

      this.logger.log(
        `Payment expire time: ${expireTimeMinutes} minutes (${expireTime}ms)`,
      );

      const requestBody: Record<string, string> = {
        partnerCode: this.partnerCode,
        accessKey: this.accessKey,
        requestId: requestId,
        amount: request.amount.toString(),
        orderId: orderId,
        orderInfo: `pay with MoMo - ${orderId}`,
        redirectUrl: request.return_url,
        ipnUrl: ipnUrl,
        extraData: extraData,
        requestType: requestType,
        signature: signature,
        lang: 'en',
      };

      // Thêm expireTime nếu MoMo hỗ trợ trong tương lai
      // Hiện tại MoMo không hỗ trợ tham số này, nhưng giữ lại để dễ mở rộng
      // if (expireTime && expireTime > 0) {
      //   requestBody.expireTime = expireTime.toString();
      // }

      this.logger.log(`Calling MoMo API: ${momoApiUrl}`);
      this.logger.log(`Request body: ${JSON.stringify(requestBody, null, 2)}`);

      // Gọi MoMo API
      const response = await fetch(momoApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      this.logger.log(`MoMo API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`MoMo API error: ${errorText}`);
        throw new Error(`MoMo API error: ${response.status} - ${errorText}`);
      }

      const momoResponse = (await response.json()) as {
        resultCode: number;
        message?: string;
        payUrl?: string;
        deeplink?: string;
      };
      this.logger.log(
        `MoMo API response FULL: ${JSON.stringify(momoResponse, null, 2)}`,
      );

      // Kiểm tra resultCode từ MoMo API response
      if (momoResponse.resultCode !== 0) {
        this.logger.error(
          `MoMo API error: resultCode=${momoResponse.resultCode}, message=${momoResponse.message}`,
        );
        throw new Error(
          `MoMo API error: ${momoResponse.message || 'Unknown error'}`,
        );
      }

      // Lấy payUrl từ response (MoMo trả về sau khi tạo transaction thành công)
      const payUrl = momoResponse.payUrl || momoResponse.deeplink;

      if (!payUrl) {
        this.logger.error('MoMo API did not return payUrl');
        throw new Error('MoMo payment URL not available');
      }

      this.logger.log(`MoMo Pay URL from API: ${payUrl}`);

      // Trả về response với payUrl
      const result: MomoPaymentResponse = {
        accessKey: this.accessKey,
        partnerCode: this.partnerCode,
        requestType: requestType,
        notifyUrl: ipnUrl,
        returnUrl: request.return_url,
        orderId: orderId,
        amount: request.amount.toString(),
        orderInfo: `pay with MoMo - ${orderId}`,
        requestId: requestId,
        extraData: extraData,
        signature: signature,
        payUrl: payUrl, // URL để redirect
      };

      this.logger.log(`MoMo payment created successfully: ${orderId}`);
      this.logger.log(`Final Pay URL: ${payUrl}`);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating MoMo payment: ${errorMessage}`);
      if (errorStack) {
        this.logger.error(`Error stack: ${errorStack}`);
      }
      throw error;
    }
  }

  private generateMoMoSignature(params: Record<string, string>): string {
    // Format signature theo MoMo: accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
    const rawSignature = `accessKey=${params.accessKey}&amount=${params.amount}&extraData=${params.extraData}&ipnUrl=${params.ipnUrl}&orderId=${params.orderId}&orderInfo=${params.orderInfo}&partnerCode=${params.partnerCode}&redirectUrl=${params.redirectUrl}&requestId=${params.requestId}&requestType=${params.requestType}`;

    this.logger.log(`Raw signature: ${rawSignature}`);
    this.logger.log(`Secret key: ${this.secretKey}`);

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(rawSignature)
      .digest('hex');

    this.logger.log(`Generated signature: ${signature}`);
    return signature;
  }

  private generateSignature(params: Record<string, string>): string {
    // Sắp xếp các tham số theo alphabet
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    this.logger.log(`Sorted params for signature: ${sortedParams}`);
    this.logger.log(`Secret key: ${this.secretKey}`);

    // Tạo signature với secret key
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(sortedParams)
      .digest('hex');

    this.logger.log(`Generated signature: ${signature}`);
    return signature;
  }

  private buildPaymentUrl(
    params: Record<string, string>,
    signature: string,
  ): string {
    // Sắp xếp parameters theo thứ tự alphabet
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    // Encode parameters
    const encodedParams = Buffer.from(queryString).toString('base64');

    // Tạo final URL với format MoMo
    return `${this.apiUrl}?t=${encodedParams}&s=${signature}`;
  }

  verifyWebhookSignature(
    payload: Record<string, any>,
    signature: string,
  ): boolean {
    try {
      // MoMo webhook signature verification
      // MoMo gửi signature trong payload hoặc header
      const receivedSignature = (payload.signature as string) || signature;

      if (!receivedSignature) {
        this.logger.warn('No signature provided in MoMo webhook');
        return false;
      }

      // Tạo signature từ payload (loại bỏ signature field)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { signature: _ignored, ...payloadWithoutSignature } = payload;
      const sortedParams = Object.keys(payloadWithoutSignature)
        .sort()
        .map((key) => `${key}=${payloadWithoutSignature[key]}`)
        .join('&');

      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(sortedParams)
        .digest('hex');

      const signatureHex =
        typeof receivedSignature === 'string'
          ? receivedSignature
          : String(receivedSignature);

      this.logger.log(`MoMo webhook signature verification:`, {
        receivedSignature: signatureHex,
        expectedSignature,
        payloadWithoutSignature,
      });

      return crypto.timingSafeEqual(
        Buffer.from(signatureHex, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `MoMo webhook signature verification failed: ${errorMessage}`,
      );
      return false;
    }
  }
}
