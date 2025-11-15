import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Query,
  Logger,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';

import { PaymentService } from './payment.service';
import {
  getPaymentErrorCode,
  PaymentErrorCode,
  PaymentErrorMessages,
} from './errors/payment-error-codes';
import {
  PaymentHistoryService,
  type PaymentHistoryFilter,
} from './services/payment-history.service';
// import { IdempotencyGuard } from './guards/idempotency.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentStatusDto } from './dto/payment-response.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';

@Controller('api/payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentHistoryService: PaymentHistoryService,
  ) {}

  /**
   * Tạo payment request
   */
  @Post('create')
  // @UseGuards(IdempotencyGuard)
  @HttpCode(HttpStatus.OK)
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Headers('x-signature') signature: string,
    @Req() request: Request,
  ): Promise<PaymentResponseDto> {
    this.logger.log(`Request body: ${JSON.stringify(createPaymentDto, null, 2)}`);
    
    // Try to get signature from different places: body, headers (lower/upper), then decorator
    const sigFromHeader = request.headers['x-signature'] || request.headers['X-Signature'];
    const signatureFromHeader = (signature || (Array.isArray(sigFromHeader) ? sigFromHeader[0] : sigFromHeader)) as string;
    const signatureFromBody = (createPaymentDto as any)?.signature as string | undefined;
    this.logger.log(`Signature from @Headers: ${signature}`);
    this.logger.log(`Signature from request.headers['x-signature']: ${request.headers['x-signature']}`);
    this.logger.log(`Signature from request.headers['X-Signature']: ${request.headers['X-Signature']}`);
    this.logger.log(`Signature from body: ${signatureFromBody}`);
    const finalSignature = signatureFromBody || signatureFromHeader;
    this.logger.log(`Final signature (used): ${finalSignature}`);
    
    // Ưu tiên lấy idempotency_key từ body (Laravel gửi), sau đó từ header
    const idempotencyKey = createPaymentDto.idempotency_key || request.headers['x-idempotency-key'] as string;
    this.logger.log(`Idempotency key from body: ${createPaymentDto.idempotency_key}`);
    this.logger.log(`Idempotency key from header: ${request.headers['x-idempotency-key']}`);
    this.logger.log(`Final idempotency key: ${idempotencyKey}`);
    
    try {
      const result = await this.paymentService.createPayment(createPaymentDto, finalSignature as string, idempotencyKey);
      this.logger.log(`Payment creation successful: ${JSON.stringify(result, null, 2)}`);
      return result;
    } catch (error) {
      this.logger.error(`Payment creation failed:`, error);
      
      // Map error thành error code và message thân thiện
      const errorCode = getPaymentErrorCode(
        error instanceof Error ? error : String(error),
      );
      const userMessage = PaymentErrorMessages[errorCode];
      
      // Giữ nguyên status code từ error nếu có
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : error instanceof BadRequestException
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR;

      // Throw error với format chuẩn
      throw new HttpException(
        {
          error: errorCode,
          message: userMessage,
          // Giữ nguyên error gốc trong development
          ...(process.env.NODE_ENV === 'development' && {
            debug: {
              original_message:
                error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          }),
        },
        statusCode,
      );
    }
  }

  /**
   * Lấy payment status
   */
  @Get(':paymentId/status')
  async getPaymentStatus(
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentStatusDto> {
    this.logger.log(`[getPaymentStatus] paymentId=${paymentId}`);
    try {
      const status = await this.paymentService.getPaymentStatus(paymentId);
      this.logger.log(`[getPaymentStatus] OK paymentId=${paymentId} status=${status.status} expires_at=${(status as any).expires_at || 'null'}`);
      return status;
    } catch (err: any) {
      this.logger.warn(`[getPaymentStatus] FAIL paymentId=${paymentId} error=${err?.message || String(err)}`);
      throw err;
    }
  }

  /**
   * Lấy lịch sử thanh toán
   */
  @Get('history')
  async getPaymentHistory(
    @Query() filter: PaymentHistoryFilter,
  ): Promise<any> {
    return this.paymentHistoryService.getPaymentHistory(filter);
  }

  /**
   * Lấy chi tiết lịch sử của một payment request
   */
  @Get(':paymentId/history')
  async getPaymentRequestHistory(
    @Param('paymentId') paymentId: string,
  ): Promise<any> {
    return this.paymentHistoryService.getPaymentRequestHistoryByPaymentId(paymentId);
  }

  /**
   * Trang xem nhanh QR code (debug)
   */
  @Get(':paymentId/qr')
  async previewQr(
    @Param('paymentId') paymentId: string,
  ): Promise<string> {
    const status = await this.paymentService.getPaymentStatus(paymentId);
    const qr = (status.gateway_response as any)?.qr_code_url
      || (status.gateway_response as any)?.payment_url
      || '';
    const fallbackText = qr ? '' : '<p>QR Code URL not available.</p>';
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>QR Preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto;padding:24px} .box{max-width:460px;margin:auto;text-align:center} img{max-width:100%;height:auto;border:1px solid #eee;border-radius:12px;padding:12px;background:#fafafa} .meta{margin-top:12px;color:#666;font-size:14px;word-break:break-all}</style>
</head><body><div class="box">
<h2>Payment QR Preview</h2>
${qr && qr.startsWith('http') ? `<img src="${qr}" alt="QR Code" />` : fallbackText}
<div class="meta">
<div><strong>payment_id:</strong> ${status.payment_id}</div>
<div><strong>order_id:</strong> ${status.order_id}</div>
<div><strong>status:</strong> ${status.status}</div>
<div><strong>qr_code_url:</strong> ${qr}</div>
</div>
</div></body></html>`;
  }

  /**
   * Webhook cho Sepay
   */
  @Post('webhooks/sepay')
  @HttpCode(HttpStatus.OK)
  async handleSepayWebhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
    @Req() request?: Request,
  ): Promise<{ success: boolean }> {
    // Log raw webhook for debugging in container logs
    this.logger.log('=== SEPAY WEBHOOK RECEIVED (from n8n) ===');
    try { this.logger.log(`Headers: ${JSON.stringify(request?.headers || {}, null, 2)}`); } catch {}
    try { this.logger.log(`Method: ${request?.method} Path: ${request?.url}`); } catch {}
    try { this.logger.log(`Content-Type: ${(request?.headers || {})['content-type']}`); } catch {}
    try { this.logger.log(`Raw Body: ${JSON.stringify(request?.body || body || {}, null, 2)}`); } catch {}

    // Normalize payload: support raw at root or wrapped as { body: { ... } }
    let finalPayload: PaymentWebhookDto;
    const raw: any = (request?.body ?? body) as any;
    const maybeWrapped = raw && typeof raw === 'object' && raw.body && typeof raw.body === 'object';
    const p: any = maybeWrapped ? raw.body : raw;
    try { this.logger.log(`Body Wrapper Detected: ${maybeWrapped}`); } catch {}
    try { this.logger.log(`Payload (p) preview keys: ${Object.keys(p || {}).slice(0, 20).join(', ')}`); } catch {}

    // Build dto from SePay banking payload
    const texts: string[] = [];
    if (typeof p?.content === 'string') texts.push(p.content);
    if (typeof p?.description === 'string') texts.push(p.description);
    const joined = texts.join(' | ');
    const m = joined.match(/\bDH([A-Za-z0-9_-]+)\b/i);
    const extractedOrderId = p?.order_id || (m ? m[1] : '');

    finalPayload = {
      transaction_id: String(p?.referenceCode || p?.id || ''),
      status: 'completed',
      amount: Number(p?.transferAmount || 0),
      currency: 'VND',
      order_id: extractedOrderId,
      gateway_response: p,
    } as unknown as PaymentWebhookDto;

    this.logger.log(`Normalized webhook payload: ${JSON.stringify(finalPayload, null, 2)}`);

    await this.paymentService.handleWebhook(finalPayload, 'sepay', signature);
    return { success: true };
  }

  /**
   * Webhook cho Momo
   */
  @Post('webhooks/momo')
  @HttpCode(HttpStatus.OK)
  async handleMomoWebhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
    @Req() request?: Request,
  ): Promise<{ success: boolean }> {
    // Log raw webhook for debugging
    this.logger.log('=== MOMO WEBHOOK RECEIVED ===');
    try { this.logger.log(`Headers: ${JSON.stringify(request?.headers || {}, null, 2)}`); } catch {}
    try { this.logger.log(`Raw Body: ${JSON.stringify(body || {}, null, 2)}`); } catch {}

    // Normalize MoMo webhook payload
    // MoMo gửi: { orderId, transId, resultCode, amount, message, ... }
    const raw: any = body || {};
    
    // Extract order_id từ orderId (format: ORDER_{orderId}_{timestamp})
    let extractedOrderId: string | null = null;
    if (raw.orderId && typeof raw.orderId === 'string') {
      const match = raw.orderId.match(/^ORDER_(\d+)_/);
      if (match) {
        extractedOrderId = match[1];
      }
    }

    // Determine status từ resultCode (0 = success)
    const resultCode = raw.resultCode;
    const status = (resultCode === 0 || resultCode === '0') ? 'completed' : 'failed';
    
    // Use transId as transaction_id, fallback to orderId
    const transactionId = raw.transId || raw.orderId || '';

    // Build normalized webhook payload
    const normalizedWebhook: PaymentWebhookDto = {
      transaction_id: transactionId,
      status: status,
      amount: Number(raw.amount || 0),
      currency: raw.currency || 'VND',
      order_id: extractedOrderId || raw.orderId || '',
      gateway_response: raw,
      signature: raw.signature || signature,
    };

    this.logger.log(`Normalized MoMo webhook payload: ${JSON.stringify(normalizedWebhook, null, 2)}`);

    await this.paymentService.handleWebhook(normalizedWebhook, 'momo', signature);
    return { success: true };
  }

  /**
   * Webhook cho PayPal
   */
  @Post('webhooks/paypal')
  @HttpCode(HttpStatus.OK)
  async handlePayPalWebhook(
    @Body() webhookData: PaymentWebhookDto,
    @Headers('x-signature') signature?: string,
  ): Promise<{ success: boolean }> {
    await this.paymentService.handleWebhook(webhookData, 'paypal', signature);
    return { success: true };
  }

  /**
   * Endpoint để Laravel cập nhật payment status
   * Sử dụng khi payment được xử lý từ return_url (như MoMo - không gửi webhook tự động)
   */
  @Post(':paymentId/update-status')
  @HttpCode(HttpStatus.OK)
  async updatePaymentStatus(
    @Param('paymentId') paymentId: string,
    @Body() body: { status: string; transaction_id?: string; gateway_response?: any },
  ): Promise<{ success: boolean }> {
    this.logger.log(`=== UPDATE PAYMENT STATUS FROM LARAVEL ===`);
    this.logger.log(`Payment ID: ${paymentId}`);
    this.logger.log(`Status: ${body.status}`);
    this.logger.log(`Transaction ID: ${body.transaction_id}`);

    try {
      await this.paymentService.updatePaymentStatusFromLaravel(
        paymentId,
        body.status,
        body.transaction_id,
        body.gateway_response,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update payment status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Đồng bộ huỷ payment từ Laravel (ví dụ khi user đổi phương thức thanh toán)
   */
  @Post(':paymentId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: CancelPaymentDto,
    @Headers('x-signature') signature: string,
    @Req() request: Request,
  ): Promise<{ success: boolean }> {
    this.logger.log(`=== CANCEL PAYMENT REQUEST ===`);
    this.logger.log(`Payment ID: ${paymentId}`);
    this.logger.log(`Body: ${JSON.stringify(body, null, 2)}`);

    const sigFromHeader = request.headers['x-signature'] || request.headers['X-Signature'];
    const signatureFromHeader = (Array.isArray(sigFromHeader) ? sigFromHeader[0] : sigFromHeader) as string | undefined;
    const signatureFromBody = (body as any)?.signature as string | undefined;
    const finalSignature = signatureFromBody || signature || signatureFromHeader;

    if (!finalSignature) {
      throw new BadRequestException('Missing signature for cancellation request');
    }

    body.payment_id = body.payment_id || paymentId;

    await this.paymentService.cancelPayment(paymentId, body, finalSignature);
    return { success: true };
  }

  /**
   * Tạo PayPal Order (cho PayPal JS SDK)
   */
  @Post('paypal/create-order')
  @HttpCode(HttpStatus.OK)
  async createPayPalOrder(
    @Body() body: { order_id?: string; amount?: number; currency?: string; payment_id: string },
  ): Promise<{ orderId: string }> {
    this.logger.log(`Creating PayPal order for payment_id: ${body.payment_id}`);
    let paymentRequestId: number | null = null;
    try {
      // Always load payment by payment_id (idempotency key) to prevent tampering
      const status = await this.paymentService.getPaymentStatus(body.payment_id);
      // Optional: if client sent order_id, verify it matches
      if (body.order_id && String(body.order_id) !== String(status.order_id)) {
        throw new BadRequestException('order_id does not match payment');
      }

      // Get payment request ID for logging
      const paymentRequest = await this.paymentService.findByIdempotencyKey(body.payment_id);
      paymentRequestId = paymentRequest?.id || null;

      const result = await this.paymentService.createPayPalOrder(
        String(status.order_id),
        Number(status.amount || 0),
        status.currency || 'USD',
      );
      
      // Log successful PayPal order creation
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_created',
          {
            paypal_order_id: result.orderId,
            order_id: status.order_id,
            amount: status.amount,
            currency: status.currency,
          },
          result, // Full PayPal API response
        );
      }
      
      return result;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create PayPal order: ${errorMessage}`);
      
      // Log PayPal API error
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_create_failed',
          {
            error: errorMessage,
            paypal_error: error.response?.data || error.paypalError || {},
          },
          error.response?.data || error.paypalError || {}, // Full PayPal error response
        ).catch((logError) => {
          this.logger.warn(`Failed to log PayPal create-order error: ${logError.message}`);
        });
      }
      
      throw error;
    }
  }

  /**
   * Capture PayPal Order (sau khi user approve)
   */
  @Post('paypal/capture-order')
  @HttpCode(HttpStatus.OK)
  async capturePayPalOrder(
    @Body() body: { orderId: string; payment_id: string },
  ): Promise<{ success: boolean; transaction_id?: string; data?: any }> {
    this.logger.log(`Capturing PayPal order: ${body.orderId} for payment_id: ${body.payment_id}`);
    let paymentRequestId: number | null = null;
    try {
      // Get payment request ID for logging
      const paymentRequest = await this.paymentService.findByIdempotencyKey(body.payment_id);
      paymentRequestId = paymentRequest?.id || null;
      
      const captureData = await this.paymentService.capturePayPalOrder(body.orderId);
      
      const transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;

      // Always require payment_id; update status securely
      await this.paymentService.updatePaymentStatusFromLaravel(
        body.payment_id,
        'completed',
        transactionId,
        captureData,
      );

      // Log successful PayPal capture
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_captured',
          {
            paypal_order_id: body.orderId,
            transaction_id: transactionId,
            payment_id: body.payment_id,
          },
          captureData, // Full PayPal capture response
        );
      }

      return {
        success: true,
        transaction_id: transactionId,
        data: captureData,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to capture PayPal order';
      const statusCode = error.statusCode || 500;
      const paypalError = error.paypalError || {};
      
      this.logger.error(`Failed to capture PayPal order:`, {
        orderId: body.orderId,
        payment_id: body.payment_id,
        error: errorMessage,
        statusCode,
        paypalError,
        debugId: error.debugId,
      });

      // Log PayPal capture error
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_capture_failed',
          {
            paypal_order_id: body.orderId,
            error: errorMessage,
            status_code: statusCode,
            debug_id: error.debugId,
          },
          paypalError, // Full PayPal error response
        ).catch((logError) => {
          this.logger.warn(`Failed to log PayPal capture error: ${logError.message}`);
        });
      }

      // Trả về error response với thông tin chi tiết
      throw new HttpException(
        {
          error: 'PayPal capture failed',
          message: errorMessage,
          paypal_error: paypalError,
          debug_id: error.debugId,
        },
        statusCode,
      );
    }
  }
}
