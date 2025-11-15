import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRequest } from './entities/payment-request.entity';
import { PaymentLog } from './entities/payment-log.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentStatusDto } from './dto/payment-response.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import {
  PaymentGatewayFactory,
  PaymentGatewayRequest,
} from './gateways/payment-gateway.factory';
import { IdempotencyService } from './services/idempotency.service';
import { PaymentHistoryService } from './services/payment-history.service';
import * as crypto from 'crypto';
import axios from 'axios';

interface OrderInfo {
  id: string;
  total_amount: number;
  currency: string;
  customer_data?: Record<string, unknown>;
  description?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentRequest)
    private paymentRequestRepository: Repository<PaymentRequest>,
    @InjectRepository(PaymentLog)
    private paymentLogRepository: Repository<PaymentLog>,
    @InjectRepository(PaymentTransaction)
    private paymentTransactionRepository: Repository<PaymentTransaction>,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly idempotencyService: IdempotencyService,
    private readonly paymentHistoryService: PaymentHistoryService,
  ) {}

  /**
   * Tạo payment request mới
   */
  async createPayment(
    dto: CreatePaymentDto,
    signature: string,
    idempotencyKey?: string,
  ): Promise<PaymentResponseDto> {
    this.logger.log(`=== CREATE PAYMENT START ===`);
    this.logger.log(`=== REQUEST DETAILS ===`);
    this.logger.log(`Order ID: ${dto.order_id}`);
    this.logger.log(`Payment Method: ${dto.payment_method}`);
    this.logger.log(`Idempotency Key: ${idempotencyKey}`);
    this.logger.log(`Signature: ${signature}`);
    this.logger.log(`Full DTO: ${JSON.stringify(dto, null, 2)}`);

    // 1. Verify signature
    this.logger.log(`Verifying signature...`);
    this.verifySignature(dto, signature);
    this.logger.log(`Signature verification passed`);

    // 2. Lấy thông tin order: Fast-path nếu có amount, ngược lại fetch từ Laravel
    let orderInfo: OrderInfo;
    // Kiểm tra amount: có thể là number hoặc string (như "100000.00")
    const amountValue =
      typeof dto.amount === 'number'
        ? dto.amount
        : dto.amount
          ? parseFloat(String(dto.amount))
          : 0;
    if (amountValue > 0) {
      this.logger.log(
        `Using FAST-PATH with amount from request. Skipping Laravel fetch.`,
      );
      this.logger.log(
        `Amount value: ${amountValue} (type: ${typeof amountValue})`,
      );
      orderInfo = {
        id: dto.order_id,
        total_amount: amountValue,
        currency: dto.currency || 'VND',
        customer_data: dto.customer_data || {},
        description: dto.description || `Thanh toan don hang ${dto.order_id}`,
      };
    } else {
      this.logger.log(
        `Fetching order info from Laravel for order_id: ${dto.order_id}`,
      );
      orderInfo = await this.fetchOrderFromLaravel(dto.order_id);
      this.logger.log(
        `Order info received: ${JSON.stringify(
          {
            order_id: orderInfo.id,
            amount: orderInfo.total_amount,
            currency: orderInfo.currency,
            customer_data: orderInfo.customer_data,
          },
          null,
          2,
        )}`,
      );
    }

    // 3. Generate idempotency key nếu không có từ guard
    const finalIdempotencyKey =
      idempotencyKey ||
      this.generateIdempotencyKey(dto.order_id, orderInfo.total_amount);
    this.logger.log(`Final idempotency key: ${finalIdempotencyKey}`);

    // 4. Generate payment session ID (Payment Transaction Session)
    // Session là identifier duy nhất cho mỗi payment transaction
    // Nếu Laravel gửi session, dùng session đó; nếu không, generate mới
    const paymentSessionId = dto.session || crypto.randomUUID();
    this.logger.log(`Payment session ID: ${paymentSessionId}`);

    // 5. Check idempotency cache trước
    this.logger.log(
      `Checking idempotency cache for key: ${finalIdempotencyKey}`,
    );
    const cachedResponse =
      await this.idempotencyService.get(finalIdempotencyKey);
    if (cachedResponse) {
      this.logger.log(
        `Idempotent request detected for key: ${finalIdempotencyKey}`,
      );
      this.logger.log(
        `Cached response: ${JSON.stringify(cachedResponse, null, 2)}`,
      );
      return cachedResponse;
    }
    this.logger.log(`No cached response found`);

    // 6. Check if payment already exists trong database
    this.logger.log(
      `Checking database for existing payment with key: ${finalIdempotencyKey}`,
    );
    const existingPayment =
      await this.findByIdempotencyKey(finalIdempotencyKey);
    if (existingPayment) {
      this.logger.log(
        `Found existing payment: ${JSON.stringify(
          {
            id: existingPayment.id,
            status: existingPayment.status,
            order_id: existingPayment.order_id,
            amount: existingPayment.amount,
            payment_method: existingPayment.payment_method,
            isCompleted: existingPayment.isCompleted(),
            isFailed: existingPayment.isFailed(),
            isPending: existingPayment.isPending(),
            isExpired: existingPayment.isExpired(),
          },
          null,
          2,
        )}`,
      );

      // Validate payload: nếu cùng key nhưng payload khác -> reject
      // Convert về cùng type để so sánh (order_id có thể là string hoặc number)
      const existingOrderId = String(existingPayment.order_id);
      const newOrderId = String(dto.order_id);
      const payloadChanged =
        existingOrderId !== newOrderId ||
        existingPayment.payment_method !== dto.payment_method;

      if (payloadChanged) {
        this.logger.error(
          `Idempotency key conflict: Same key but different payload!`,
          {
            existing: {
              order_id: existingPayment.order_id,
              payment_method: existingPayment.payment_method,
            },
            new: {
              order_id: dto.order_id,
              payment_method: dto.payment_method,
            },
          },
        );
        throw new BadRequestException(
          'Idempotency key conflict: Request payload does not match existing payment',
        );
      }

      await this.paymentHistoryService.logEvent(
        existingPayment.id,
        'idempotent_request',
        { order_id: dto.order_id },
      );

      if (existingPayment.isCompleted() || existingPayment.isFailed()) {
        this.logger.log(
          `Payment is completed or failed, returning cached response`,
        );
        const response = this.buildResponse(existingPayment);
        await this.idempotencyService.set(finalIdempotencyKey, response);
        return response;
      }

      if (existingPayment.isPending() && !existingPayment.isExpired()) {
        this.logger.log(
          `Payment is pending and not expired, returning cached response`,
        );
        const response = this.buildResponse(existingPayment);
        await this.idempotencyService.set(finalIdempotencyKey, response);
        return response;
      }
    } else {
      this.logger.log(`No existing payment found in database`);
    }

    // 7. Create new payment request với session_id
    this.logger.log(`Creating new payment request...`);
    const paymentRequest = this.paymentRequestRepository.create({
      idempotency_key: finalIdempotencyKey,
      session_id: paymentSessionId, // Payment Transaction Session ID
      order_id: dto.order_id,
      payment_method: dto.payment_method,
      amount: orderInfo.total_amount,
      currency: orderInfo.currency || 'VND',
      status: 'pending',
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    this.logger.log(
      `Payment request data: ${JSON.stringify(
        {
          idempotency_key: paymentRequest.idempotency_key,
          session_id: paymentRequest.session_id,
          order_id: paymentRequest.order_id,
          payment_method: paymentRequest.payment_method,
          amount: paymentRequest.amount,
          currency: paymentRequest.currency,
          status: paymentRequest.status,
          expires_at: paymentRequest.expires_at,
        },
        null,
        2,
      )}`,
    );

    const savedPayment =
      await this.paymentRequestRepository.save(paymentRequest);
    this.logger.log(`Payment request saved with ID: ${savedPayment.id}`);
    await this.paymentHistoryService.logEvent(savedPayment.id, 'created', {
      order_id: dto.order_id,
    });

    // 8. Call payment gateway (pass orderInfo để tránh fetch lại)
    this.logger.log(`=== CALLING PAYMENT GATEWAY ===`);
    this.logger.log(`Payment Method: ${dto.payment_method}`);
    this.logger.log(`Payment Session ID: ${savedPayment.session_id}`);
    this.logger.log(`Order Info: ${JSON.stringify(orderInfo, null, 2)}`);
    this.logger.log(`Payment ID: ${savedPayment.id}`);
    try {
      const gatewayResponse = await this.callPaymentGateway(
        savedPayment,
        dto.payment_method,
        orderInfo,
      );
      this.logger.log(`=== GATEWAY RESPONSE RECEIVED ===`);
      this.logger.log(
        `Full Response: ${JSON.stringify(gatewayResponse, null, 2)}`,
      );
      if (gatewayResponse.payment_url) {
        this.logger.log(`Payment URL: ${gatewayResponse.payment_url}`);
      }
      if (gatewayResponse.qr_code_url) {
        this.logger.log(`QR Code URL: ${gatewayResponse.qr_code_url}`);
      }

      // 7. Save gateway response
      savedPayment.response_data = gatewayResponse;
      await this.paymentRequestRepository.save(savedPayment);
      this.logger.log(`Gateway response saved to database`);

      await this.paymentHistoryService.logEvent(
        savedPayment.id,
        'initiated',
        undefined,
        gatewayResponse,
      );

      const response = this.buildResponse(savedPayment);
      this.logger.log(`Built response: ${JSON.stringify(response, null, 2)}`);
      await this.idempotencyService.set(finalIdempotencyKey, response);

      this.logger.log(`=== CREATE PAYMENT SUCCESS ===`);
      return response;
    } catch (error: unknown) {
      this.logger.error(`Gateway error for payment ${savedPayment.id}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.paymentHistoryService.logEvent(
        savedPayment.id,
        'gateway_error',
        { error: errorMessage },
      );

      savedPayment.markAsFailed(errorMessage);
      await this.paymentRequestRepository.save(savedPayment);

      this.logger.error(`=== CREATE PAYMENT FAILED ===`);
      throw new BadRequestException('Payment gateway unavailable');
    }
  }

  /**
   * Xử lý webhook từ payment gateway
   */
  async handleWebhook(
    webhookData: PaymentWebhookDto,
    gateway: string,
    signature?: string,
  ): Promise<void> {
    this.logger.log(`Received webhook from ${gateway}:`, webhookData);

    // Save raw banking transaction if payload contains banking fields (from n8n)
    try {
      const gw: any = webhookData.gateway_response || {};
      if (
        gw &&
        (gw.referenceCode || gw.id || gw.transactionDate || gw.transferAmount)
      ) {
        const isIn = String(gw.transferType || '').toLowerCase() === 'in';
        const tx = this.paymentTransactionRepository.create({
          gateway: gw.gateway || gateway || 'unknown',
          transactionDate: gw.transactionDate
            ? new Date(gw.transactionDate)
            : new Date(),
          accountNumber: gw.accountNumber || null,
          subAccount: gw.subAccount != null ? String(gw.subAccount) : null,
          amountIn: isIn ? String(Number(gw.transferAmount || 0)) : '0',
          amountOut: !isIn ? String(Number(gw.transferAmount || 0)) : '0',
          accumulated: String(Number(gw.accumulated || 0)),
          code: gw.code ?? null,
          transactionContent: gw.content || gw.description || null,
          referenceNumber: gw.referenceCode || String(gw.id || ''),
          body: gw,
        });
        await this.paymentTransactionRepository.save(tx);
        await this.paymentHistoryService.logEvent(
          (await this.findByTransactionId(webhookData.transaction_id))?.id || 0,
          'bank_tx_logged',
          { reference: tx.referenceNumber },
          gw,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to persist banking transaction: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 1. Verify webhook signature nếu có
    if (
      signature &&
      !this.paymentGatewayFactory.verifyWebhookSignature(
        gateway as any,
        webhookData,
        signature,
      )
    ) {
      this.logger.warn(`Invalid webhook signature from ${gateway}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Find payment request (by transaction_id first)
    let paymentRequest = await this.findByTransactionId(
      webhookData.transaction_id,
    );

    // Fallback 1: Tìm bằng order_id từ webhook (nếu có)
    if (!paymentRequest && webhookData.order_id) {
      this.logger.log(
        `Payment not found by transaction_id: ${webhookData.transaction_id}. Trying to find by order_id: ${webhookData.order_id}`,
      );
      paymentRequest = await this.paymentRequestRepository.findOne({
        where: { order_id: webhookData.order_id },
      });
    }

    // Fallback 2: Với Sepay chuyển khoản, bóc tách mã đơn hàng từ nội dung (des) dạng DH{orderId}
    // Fallback 3: Với MoMo, extract order_id từ orderId format ORDER_{orderId}_{timestamp}
    if (!paymentRequest) {
      this.logger.warn(
        `Payment not found by transaction_id or order_id. Trying to extract order_id from gateway response...`,
      );
      const gatewayPayload: any = webhookData.gateway_response || {};

      // MoMo: Extract từ orderId (format: ORDER_{orderId}_{timestamp})
      if (
        gatewayPayload.orderId &&
        typeof gatewayPayload.orderId === 'string'
      ) {
        const momoMatch = gatewayPayload.orderId.match(/^ORDER_(\d+)_/);
        if (momoMatch) {
          const extractedOrderId = momoMatch[1];
          this.logger.log(
            `Extracted order_id from MoMo orderId: ${extractedOrderId}`,
          );
          paymentRequest = await this.paymentRequestRepository.findOne({
            where: { order_id: extractedOrderId },
          });
        }
      }

      // Sepay: Extract từ description dạng DH{orderId}
      if (!paymentRequest) {
        const candidateTexts: string[] = [];
        // Thu thập các trường có thể chứa nội dung chuyển khoản
        for (const key of [
          'description',
          'order_description',
          'message',
          'content',
          'orderInfo',
          'note',
          'des',
        ]) {
          const v = gatewayPayload?.[key];
          if (typeof v === 'string' && v) candidateTexts.push(v);
        }
        // Nếu body có chuỗi gộp
        for (const key of Object.keys(gatewayPayload || {})) {
          const v = gatewayPayload[key];
          if (typeof v === 'string' && /DH\d+/i.test(v)) candidateTexts.push(v);
        }
        const joined = candidateTexts.join(' | ');
        const extractedOrderId = this.extractOrderIdFromText(joined);
        if (extractedOrderId) {
          this.logger.log(
            `Extracted order_id from description: ${extractedOrderId}`,
          );
          paymentRequest = await this.paymentRequestRepository.findOne({
            where: { order_id: extractedOrderId },
          });
        }
      }

      if (!paymentRequest) {
        this.logger.warn(
          `Payment request still not found after all extraction attempts. Aborting webhook.`,
        );
        this.logger.warn(
          `Webhook data: ${JSON.stringify(webhookData, null, 2)}`,
        );
        return;
      }
    }

    // 3. Check if already processed
    if (paymentRequest.isCompleted()) {
      this.logger.log(`Duplicate webhook for payment ${paymentRequest.id}`);
      await this.paymentHistoryService.logEvent(
        paymentRequest.id,
        'duplicate_webhook',
        { transaction_id: webhookData.transaction_id },
      );
      return;
    }

    // 4. Optional: validate amount khớp với đơn hàng
    if (typeof webhookData.amount === 'number' && webhookData.amount > 0) {
      if (
        Math.round(Number(paymentRequest.amount)) !==
        Math.round(Number(webhookData.amount))
      ) {
        this.logger.warn(
          `Webhook amount mismatch. expected=${paymentRequest.amount}, got=${webhookData.amount}`,
        );
      }
    }

    // 5. Update payment status
    this.logger.log(
      `Updating payment status. Current status: ${paymentRequest.status}, Webhook status: ${webhookData.status}`,
    );
    this.logger.log(
      `Payment request ID: ${paymentRequest.id}, Order ID: ${paymentRequest.order_id}`,
    );

    if (webhookData.status === 'completed') {
      this.logger.log(
        `Marking payment as completed. Transaction ID: ${webhookData.transaction_id}`,
      );
      paymentRequest.markAsCompleted(
        webhookData.transaction_id,
        webhookData.gateway_response,
      );
      this.logger.log(
        `Payment marked as completed. New status: ${paymentRequest.status}`,
      );
    } else if (webhookData.status === 'failed') {
      this.logger.log(`Marking payment as failed`);
      paymentRequest.markAsFailed(
        'Payment failed',
        webhookData.gateway_response,
      );
    }

    this.logger.log(
      `Saving payment request to database. Status: ${paymentRequest.status}`,
    );
    await this.paymentRequestRepository.save(paymentRequest);
    this.logger.log(
      `Payment request saved successfully. ID: ${paymentRequest.id}, Status: ${paymentRequest.status}`,
    );

    await this.paymentHistoryService.logEvent(
      paymentRequest.id,
      'webhook_received',
      undefined,
      webhookData,
    );
    await this.paymentHistoryService.logEvent(
      paymentRequest.id,
      webhookData.status,
      { transaction_id: webhookData.transaction_id },
    );

    // 6. Call Laravel callback
    await this.callLaravelCallback(paymentRequest);
  }

  /**
   * Bóc tách order_id từ nội dung có dạng DH{orderId}
   */
  private extractOrderIdFromText(text?: string): string | null {
    if (!text) return null;
    // Hỗ trợ DH với hậu tố alphanumeric (ví dụ: DHTEST123)
    const match = text.match(/\bDH([A-Za-z0-9_-]+)\b/i);
    return match ? match[1] : null;
  }

  /**
   * Update payment status từ Laravel (khi payment được xử lý từ return_url như MoMo)
   */
  async updatePaymentStatusFromLaravel(
    paymentId: string,
    status: string,
    transactionId?: string,
    gatewayResponse?: any,
  ): Promise<void> {
    this.logger.log(
      `Updating payment status from Laravel: ${paymentId} -> ${status}`,
    );

    const paymentRequest = await this.findByIdempotencyKey(paymentId);
    if (!paymentRequest) {
      this.logger.warn(`Payment not found: ${paymentId}`);
      throw new BadRequestException('Payment not found');
    }

    // Chỉ update nếu chưa completed
    if (paymentRequest.isCompleted()) {
      this.logger.log(`Payment already completed: ${paymentId}`);
      return;
    }

    // Update status
    if (status === 'completed') {
      this.logger.log(
        `Marking payment as completed. Transaction ID: ${transactionId}`,
      );
      paymentRequest.markAsCompleted(
        transactionId ||
          (paymentRequest.gateway_data?.transaction_id as string | undefined),
        gatewayResponse || paymentRequest.gateway_data,
      );
      this.logger.log(
        `Payment marked as completed. New status: ${paymentRequest.status}`,
      );
    } else if (status === 'failed') {
      this.logger.log(`Marking payment as failed`);
      paymentRequest.markAsFailed(
        'Payment failed',
        gatewayResponse || paymentRequest.gateway_data,
      );
    }

    this.logger.log(
      `Saving payment request to database. Status: ${paymentRequest.status}`,
    );
    await this.paymentRequestRepository.save(paymentRequest);
    this.logger.log(
      `Payment request saved successfully. ID: ${paymentRequest.id}, Status: ${paymentRequest.status}`,
    );

    await this.paymentHistoryService.logEvent(
      paymentRequest.id,
      'status_updated_from_laravel',
      { status, transaction_id: transactionId },
    );

    this.logger.log(
      `Payment status updated successfully: ${paymentId} -> ${status}`,
    );
  }

  /**
   * Huỷ payment request từ Laravel (khi user đổi phương thức hoặc payment đã hết hạn)
   */
  async cancelPayment(
    paymentId: string,
    dto: CancelPaymentDto,
    signature: string,
  ): Promise<void> {
    this.logger.log(`[cancelPayment] paymentId=${paymentId}`);

    this.verifyCancellationSignature(paymentId, dto, signature);

    const requestedMethod =
      dto.payment_method?.toLowerCase?.() || dto.payment_method;
    const cancelledBy = dto.cancelled_by || 'laravel';
    const forceCancellation = Boolean(dto.force);

    await this.paymentRequestRepository.manager.transaction(
      async (entityManager) => {
        const repo = entityManager.getRepository(PaymentRequest);
        const paymentRequest = await repo.findOne({
          where: { idempotency_key: paymentId },
        });

        if (!paymentRequest) {
          this.logger.warn(`[cancelPayment] payment not found: ${paymentId}`);
          throw new NotFoundException('Payment not found');
        }

        if (
          !this.paymentGatewayFactory.isSupportedMethod(
            paymentRequest.payment_method,
          )
        ) {
          this.logger.error(
            `[cancelPayment] Unsupported payment method: ${paymentRequest.payment_method}`,
          );
          throw new BadRequestException(
            `Unsupported payment method: ${paymentRequest.payment_method}`,
          );
        }

        if (
          requestedMethod &&
          paymentRequest.payment_method !== requestedMethod
        ) {
          this.logger.error(
            `[cancelPayment] Payment method mismatch. request=${requestedMethod} stored=${paymentRequest.payment_method}`,
          );
          throw new BadRequestException('Payment method mismatch');
        }

        if (paymentRequest.status === 'completed') {
          this.logger.warn(
            `[cancelPayment] payment already completed: ${paymentId}`,
          );
          return;
        }

        if (paymentRequest.status === 'failed') {
          this.logger.warn(
            `[cancelPayment] payment already failed: ${paymentId}`,
          );
          return;
        }

        if (paymentRequest.status === 'cancelled') {
          this.logger.log(
            `[cancelPayment] payment already cancelled: ${paymentId}`,
          );
          return;
        }

        const now = new Date();
        const isExpired = paymentRequest.isExpired();
        const reason =
          dto.reason ||
          (isExpired
            ? 'Payment expired before completion'
            : 'Cancelled from Laravel checkout flow');

        if (
          !isExpired &&
          !forceCancellation &&
          paymentRequest.status !== 'pending'
        ) {
          this.logger.warn(
            `[cancelPayment] payment not in cancellable state: ${paymentRequest.status}`,
          );
          return;
        }

        paymentRequest.markAsCancelled(reason);
        paymentRequest.gateway_data = {
          ...(paymentRequest.gateway_data || {}),
          cancellation_reason: reason,
          cancellation_source: cancelledBy,
          cancellation_timestamp: now.toISOString(),
          ...(dto.metadata ? { cancellation_metadata: dto.metadata } : {}),
        };

        if (!paymentRequest.expires_at || paymentRequest.expires_at > now) {
          paymentRequest.expires_at = now;
        }

        await repo.save(paymentRequest);
        await this.paymentHistoryService.logEvent(
          paymentRequest.id,
          'cancelled',
          {
            reason,
            cancelled_by: cancelledBy,
            expired: isExpired,
            force: forceCancellation,
          },
        );
        await this.idempotencyService.delete(paymentId);

        this.logger.log(
          `[cancelPayment] payment cancelled successfully: ${paymentId}`,
        );
      },
    );
  }

  /**
   * Tạo PayPal Order (cho PayPal JS SDK)
   */
  async createPayPalOrder(
    orderId: string,
    amount: number,
    currency: string = 'USD',
  ): Promise<{ orderId: string }> {
    let amountForPayPal = amount;
    let currencyForPayPal = (currency || 'USD').toUpperCase();

    if (currencyForPayPal === 'VND') {
      const rate = this.getPayPalExchangeRate();
      amountForPayPal = Number((amount / rate).toFixed(2));
      currencyForPayPal = 'USD';
      this.logger.log(
        `Converted amount for PayPal: ${amount} VND -> ${amountForPayPal} USD (rate: ${rate})`,
      );
    }

    if (amountForPayPal <= 0) {
      amountForPayPal = 0.01; // PayPal requires minimum amount
    }

    return await this.paymentGatewayFactory.createPayPalOrder(
      orderId,
      amountForPayPal,
      currencyForPayPal,
    );
  }

  private getPayPalExchangeRate(): number {
    const rawRate = Number(process.env.PAYPAL_VND_TO_USD_RATE || '23000');
    if (Number.isNaN(rawRate) || rawRate <= 0) {
      return 23000;
    }
    return rawRate;
  }

  /**
   * Capture PayPal Order (sau khi user approve)
   */
  async capturePayPalOrder(
    paypalOrderId: string,
  ): Promise<Record<string, unknown>> {
    return await this.paymentGatewayFactory.capturePayPalOrder(paypalOrderId);
  }

  /**
   * Tìm payment request theo idempotency key
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentRequest | null> {
    return this.paymentRequestRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });
  }

  /**
   * Tìm payment request theo order_id
   */
  async findByOrderId(orderId: string): Promise<PaymentRequest | null> {
    return this.paymentRequestRepository.findOne({
      where: { order_id: orderId },
      order: { created_at: 'DESC' }, // Lấy payment mới nhất nếu có nhiều
    });
  }

  /**
   * Tìm payment request theo transaction ID
   * Hỗ trợ tìm bằng transaction_id hoặc orderId (cho MoMo)
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<PaymentRequest | null> {
    if (!transactionId) {
      return null;
    }

    // Tìm bằng transaction_id trong gateway_data
    let paymentRequest = await this.paymentRequestRepository
      .createQueryBuilder('payment')
      .where("payment.gateway_data->>'transaction_id' = :transactionId", {
        transactionId,
      })
      .getOne();

    // Fallback: Tìm bằng orderId trong gateway_data (cho MoMo)
    // MoMo lưu orderId (ORDER_49_1234567890) trong transaction_id
    if (!paymentRequest) {
      paymentRequest = await this.paymentRequestRepository
        .createQueryBuilder('payment')
        .where("payment.gateway_data->>'transaction_id' = :transactionId", {
          transactionId,
        })
        .orWhere(
          "payment.gateway_data->'gateway_response'->>'orderId' = :transactionId",
          { transactionId },
        )
        .getOne();
    }

    return paymentRequest;
  }

  /**
   * Lấy payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatusDto> {
    const payment = await this.paymentRequestRepository.findOne({
      where: { idempotency_key: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    // If payment is pending and expired => treat as not found to avoid reuse
    if (payment.isPending() && payment.isExpired()) {
      throw new NotFoundException('Payment expired');
    }

    return {
      payment_id: payment.idempotency_key,
      session_id: payment.session_id, // Payment Transaction Session ID
      order_id: payment.order_id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      transaction_id: payment.gateway_data?.transaction_id as
        | string
        | undefined,
      gateway_response: payment.gateway_data,
      completed_at: payment.completed_at?.toISOString(),
      expires_at: payment.expires_at?.toISOString(),
    };
  }

  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(orderId: string, amount: number): string {
    const timestamp = Date.now();
    return crypto
      .createHash('sha256')
      .update(`${orderId}|${amount}|${timestamp}`)
      .digest('hex');
  }

  /**
   * Fetch order info từ Laravel API
   */
  private async fetchOrderFromLaravel(orderId: string): Promise<OrderInfo> {
    // Lấy Laravel URL - ưu tiên từ env, fallback về host.docker.internal
    let laravelUrl = process.env.LARAVEL_URL;
    if (!laravelUrl) {
      throw new BadRequestException('LARAVEL_URL is not configured');
    }

    // Nếu URL chứa 'laravel-app', thay bằng host.docker.internal hoặc 172.19.0.1
    if (laravelUrl.includes('laravel-app')) {
      laravelUrl = laravelUrl.replace('laravel-app', 'host.docker.internal');
      this.logger.log(
        `Replaced laravel-app with host.docker.internal: ${laravelUrl}`,
      );
    }

    // Đảm bảo URL có /api prefix
    if (!laravelUrl.endsWith('/api') && !laravelUrl.includes('/api/')) {
      // Nếu URL không có /api, thêm vào
      const urlParts = laravelUrl.split('/');
      if (!urlParts.some((part) => part === 'api')) {
        laravelUrl = laravelUrl.replace(/\/$/, '') + '/api';
        this.logger.log(`Added /api prefix to Laravel URL: ${laravelUrl}`);
      }
    }

    const secretKey = process.env.LARAVEL_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException('LARAVEL_SECRET_KEY is not configured');
    }

    try {
      // Tạo signature cho request
      const payload = JSON.stringify({ order_id: orderId });
      const signature = crypto
        .createHmac('sha256', secretKey)
        .update(payload)
        .digest('hex');

      // Đảm bảo URL đúng format
      const apiUrl = laravelUrl.endsWith('/api')
        ? `${laravelUrl}/payment-service/orders/${orderId}`
        : `${laravelUrl}/api/payment-service/orders/${orderId}`;

      this.logger.log(`=== FETCHING ORDER FROM LARAVEL ===`);
      this.logger.log(`Full URL: ${apiUrl}`);
      this.logger.log(`Order ID: ${orderId}`);
      this.logger.log(`Signature: ${signature}`);
      this.logger.log(`Payload: ${payload}`);
      this.logger.log(`Secret Key length: ${secretKey ? secretKey.length : 0}`);

      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        validateStatus: () => true,
        timeout: 10000, // 10 seconds timeout
      });

      this.logger.log(`=== LARAVEL API RESPONSE ===`);
      this.logger.log(`Status: ${response.status}`);
      this.logger.log(`Headers: ${JSON.stringify(response.headers, null, 2)}`);
      this.logger.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

      if (response.status !== 200 || !response.data.success) {
        this.logger.error(
          `Failed to fetch order from Laravel: ${response.status}`,
          response.data,
        );
        throw new BadRequestException(
          `Failed to fetch order: ${response.data.error || 'Unknown error'}`,
        );
      }

      this.logger.log(`=== ORDER INFO RECEIVED ===`);
      this.logger.log(`Order ID: ${response.data.order?.id}`);
      this.logger.log(`Total Amount: ${response.data.order?.total_amount}`);
      this.logger.log(`Currency: ${response.data.order?.currency}`);
      this.logger.log(`Status: ${response.data.order?.status}`);
      this.logger.log(
        `Customer: ${JSON.stringify(response.data.order?.customer_data, null, 2)}`,
      );

      return response.data.order;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching order from Laravel: ${errorMessage}`);
      throw new BadRequestException(`Failed to fetch order: ${errorMessage}`);
    }
  }

  /**
   * Verify HMAC signature
   */
  private verifySignature(dto: CreatePaymentDto, signature: string): void {
    this.logger.log(`Verifying signature...`);
    this.logger.log(
      `LARAVEL_SECRET_KEY exists: ${!!process.env.LARAVEL_SECRET_KEY}`,
    );
    this.logger.log(
      `LARAVEL_SECRET_KEY length: ${process.env.LARAVEL_SECRET_KEY?.length || 0}`,
    );

    const secretKey = process.env.LARAVEL_SECRET_KEY;
    if (!secretKey) {
      this.logger.error(`LARAVEL_SECRET_KEY is not configured`);
      throw new BadRequestException('LARAVEL_SECRET_KEY is not configured');
    }

    // Verify signature với tất cả fields trong payload (bao gồm amount, currency, customer_data, description nếu có)
    // Tạo payload giống như Laravel gửi (bao gồm tất cả fields)
    const signaturePayload: Record<string, unknown> = {
      order_id: dto.order_id,
      payment_method: dto.payment_method,
    };

    if (dto.idempotency_key) {
      signaturePayload.idempotency_key = dto.idempotency_key;
    }
    // Payment Transaction Session - identifier duy nhất cho mỗi payment transaction
    // Session bao gồm thông tin hữu ích về transaction và được lưu trong database
    if (dto.session) {
      signaturePayload.session = dto.session;
    }
    if (dto.amount !== undefined) {
      signaturePayload.amount = dto.amount;
    }
    if (dto.currency) {
      signaturePayload.currency = dto.currency;
    }
    if (dto.customer_data) {
      signaturePayload.customer_data = dto.customer_data;
    }
    if (dto.description) {
      signaturePayload.description = dto.description;
    }

    const payload = JSON.stringify(signaturePayload);
    this.logger.log(`Payload for signature: ${payload}`);

    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');

    this.logger.log(`Expected signature: ${expectedSignature}`);
    this.logger.log(`Received signature: ${signature}`);
    this.logger.log(`Signatures match: ${signature === expectedSignature}`);

    if (signature !== expectedSignature) {
      this.logger.error(`Signature verification failed`);
      throw new BadRequestException('Invalid signature');
    }

    this.logger.log(`Signature verification successful`);
  }

  private verifyCancellationSignature(
    paymentId: string,
    dto: CancelPaymentDto,
    signature: string,
  ): void {
    if (!signature) {
      throw new BadRequestException(
        'Missing signature for cancellation request',
      );
    }

    const secretKey = process.env.LARAVEL_SECRET_KEY;
    if (!secretKey) {
      this.logger.error(
        `[verifyCancellationSignature] LARAVEL_SECRET_KEY is not configured`,
      );
      throw new BadRequestException('LARAVEL_SECRET_KEY is not configured');
    }

    const signaturePayload: Record<string, unknown> = {
      payment_id: paymentId,
      payment_method: dto.payment_method,
      reason: dto.reason ?? null,
      force: Boolean(dto.force),
      cancelled_by: dto.cancelled_by ?? null,
      timestamp: dto.timestamp,
    };

    if (dto.metadata) {
      signaturePayload.metadata = dto.metadata;
    }

    const payload = JSON.stringify(signaturePayload);
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');

    if (expectedSignature !== signature) {
      this.logger.error(
        `[verifyCancellationSignature] Signature mismatch for payment=${paymentId} expected=${expectedSignature} received=${signature}`,
      );
      throw new BadRequestException('Invalid signature');
    }

    const timestamp = new Date(dto.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      throw new BadRequestException('Invalid cancellation timestamp');
    }

    const allowedDriftSeconds = Number(
      process.env.PAYMENT_CANCEL_MAX_DRIFT_SECONDS || 300,
    );
    const driftMs = Math.abs(Date.now() - timestamp.getTime());
    if (driftMs > allowedDriftSeconds * 1000) {
      this.logger.error(
        `[verifyCancellationSignature] Timestamp drift too large for payment=${paymentId} driftMs=${driftMs}`,
      );
      throw new BadRequestException(
        'Cancellation request timestamp out of allowed range',
      );
    }
  }

  /**
   * Call payment gateway
   */
  private async callPaymentGateway(
    paymentRequest: PaymentRequest,
    paymentMethod: string,
    orderInfo?: OrderInfo,
  ): Promise<any> {
    this.logger.log(`=== CALL PAYMENT GATEWAY START ===`);
    this.logger.log(`Payment method: ${paymentMethod}`);
    this.logger.log(`Payment request ID: ${paymentRequest.id}`);

    try {
      // Kiểm tra payment method có được hỗ trợ không
      this.logger.log(`Checking if payment method is supported...`);
      if (!this.paymentGatewayFactory.isSupportedMethod(paymentMethod)) {
        this.logger.error(`Unsupported payment method: ${paymentMethod}`);
        throw new Error(`Unsupported payment method: ${paymentMethod}`);
      }
      this.logger.log(`Payment method is supported`);

      // Lấy order info từ Laravel nếu chưa có
      if (!orderInfo) {
        this.logger.log(`Fetching order info from Laravel...`);
        orderInfo = await this.fetchOrderFromLaravel(paymentRequest.order_id);
      } else {
        this.logger.log(`Using order info passed from createPayment`);
      }

      // Chuẩn bị request data cho gateway
      // Đảm bảo LARAVEL_URL và NESTJS_URL được set
      const laravelUrl = process.env.LARAVEL_URL;
      const nestjsUrl = process.env.NESTJS_URL;

      if (!laravelUrl) {
        this.logger.error('LARAVEL_URL environment variable is not set');
        throw new Error('LARAVEL_URL environment variable is required');
      }

      if (!nestjsUrl) {
        this.logger.error('NESTJS_URL environment variable is not set');
        throw new Error('NESTJS_URL environment variable is required');
      }

      const gatewayRequest: PaymentGatewayRequest = {
        order_id: paymentRequest.order_id,
        amount: orderInfo.total_amount,
        currency: orderInfo.currency || 'VND',
        customer_data: orderInfo.customer_data || {},
        return_url: `${laravelUrl}/thank-you?order_id=${paymentRequest.order_id}`,
        notify_url: `${nestjsUrl}/api/payments/webhooks/${paymentRequest.payment_method}`,
      };

      this.logger.log(
        `Gateway request data: ${JSON.stringify(gatewayRequest, null, 2)}`,
      );
      this.logger.log(`Environment variables:`);
      this.logger.log(`- LARAVEL_URL: ${laravelUrl}`);
      this.logger.log(`- NESTJS_URL: ${nestjsUrl}`);

      // Gọi gateway tương ứng
      this.logger.log(`Calling payment gateway factory...`);
      const gatewayResponse = await this.paymentGatewayFactory.createPayment(
        paymentMethod as any,
        gatewayRequest,
      );

      this.logger.log(
        `Gateway response received: ${JSON.stringify(gatewayResponse, null, 2)}`,
      );
      this.logger.log(`=== CALL PAYMENT GATEWAY SUCCESS ===`);

      if (paymentMethod === 'sepay' && gatewayResponse.qr_code_url) {
        const nestjsUrl =
          process.env.NESTJS_URL || 'https://payment-gateway.dinhkhoi.io.vn';
        const qrEncoded = encodeURIComponent(gatewayResponse.qr_code_url);
        gatewayResponse.payment_url = `${nestjsUrl}/sepay/confirm?paymentId=${paymentRequest.idempotency_key}&qr=${qrEncoded}`;
      }

      // Ensure PayPal URL includes paymentId (idempotency key)
      if (paymentMethod === 'paypal') {
        const nestjsUrl = (
          process.env.NESTJS_URL || 'https://payment-gateway.dinhkhoi.io.vn'
        ).replace(/\/$/, '');
        gatewayResponse.payment_url = `${nestjsUrl}/paypal?paymentId=${paymentRequest.idempotency_key}`;
      }

      // Lưu gateway response vào payment request
      paymentRequest.gateway_data = {
        transaction_id: gatewayResponse.transaction_id,
        status: gatewayResponse.status,
        gateway_response: gatewayResponse,
      };

      return gatewayResponse;
    } catch (error) {
      this.logger.error(
        `Gateway call failed for payment ${paymentRequest.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Call Laravel API để update payment status
   */
  private async callLaravelCallback(
    paymentRequest: PaymentRequest,
  ): Promise<void> {
    const laravelUrl = process.env.LARAVEL_URL;
    if (!laravelUrl) {
      this.logger.error('LARAVEL_URL is not configured');
      return;
    }

    const secretKey = process.env.LARAVEL_SECRET_KEY;
    if (!secretKey) {
      this.logger.error('LARAVEL_SECRET_KEY is not configured');
      return;
    }

    const updateData = {
      status: paymentRequest.status,
      transaction_id: paymentRequest.gateway_data?.transaction_id,
      gateway_response: paymentRequest.gateway_data,
      completed_at: paymentRequest.completed_at?.toISOString(),
    };

    // Generate signature for update request
    const payload = JSON.stringify(updateData);
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');

    // Call Laravel API để update payment status
    try {
      const response = await axios.post(
        `${laravelUrl}/api/payment-service/orders/${paymentRequest.order_id}/payment-status`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
          },
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        this.logger.error(
          `Laravel payment status update failed: ${response.status}`,
          response.data,
        );
      } else {
        this.logger.log(
          `Payment status updated in Laravel for order ${paymentRequest.order_id}`,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Laravel payment status update error: ${errorMessage}`);
    }
  }

  /**
   * Build response DTO
   */
  private buildResponse(paymentRequest: PaymentRequest): PaymentResponseDto {
    const gatewayResponse = paymentRequest.gateway_data
      ?.gateway_response as any;

    // Lấy payment_url từ response_data hoặc gateway_data
    let paymentUrl =
      (paymentRequest.response_data?.payment_url as string) ||
      (gatewayResponse?.payment_url as string) ||
      '';

    // Nếu là Sepay và chưa có payment_url, tạo mới với format /sepay/confirm
    if (
      paymentRequest.payment_method === 'sepay' &&
      !paymentUrl &&
      gatewayResponse?.qr_code_url
    ) {
      let nestjsUrl =
        process.env.NESTJS_URL ||
        process.env.NESTJS_PUBLIC_URL ||
        'https://payment-gateway.dinhkhoi.io.vn';
      // Đảm bảo URL không có trailing slash
      try {
        const url = new URL(nestjsUrl);
        // Chỉ thêm port nếu là HTTP và chưa có port
        if (url.protocol === 'http:' && !url.port) {
          url.port = '3000';
        }
        nestjsUrl = url.toString().replace(/\/$/, ''); // Remove trailing slash
      } catch {
        // Nếu URL không hợp lệ, dùng default
        nestjsUrl = 'https://payment-gateway.dinhkhoi.io.vn';
      }
      const qrEncoded = encodeURIComponent(gatewayResponse.qr_code_url);
      paymentUrl = `${nestjsUrl}/sepay/confirm?paymentId=${paymentRequest.idempotency_key}&qr=${qrEncoded}`;
    }

    if (paymentRequest.payment_method === 'paypal' && !paymentUrl) {
      let nestjsUrl =
        process.env.NESTJS_URL ||
        process.env.NESTJS_PUBLIC_URL ||
        'https://payment-gateway.dinhkhoi.io.vn';
      try {
        const url = new URL(nestjsUrl);
        nestjsUrl = url.toString().replace(/\/$/, '');
      } catch {
        nestjsUrl = 'https://payment-gateway.dinhkhoi.io.vn';
      }
      paymentUrl = `${nestjsUrl}/paypal?paymentId=${paymentRequest.idempotency_key}`;
    }

    const qrCodeUrl =
      (paymentRequest.response_data?.qr_code_url as string) ||
      (gatewayResponse?.qr_code_url as string) ||
      '';

    this.logger.log(`Building response - Payment URL: ${paymentUrl}`);
    if (qrCodeUrl) {
      this.logger.log(`QR Code URL: ${qrCodeUrl}`);
    }

    return {
      payment_id: paymentRequest.idempotency_key,
      session_id: paymentRequest.session_id,
      idempotency_key: paymentRequest.idempotency_key,
      payment_url: paymentUrl,
      qr_code_url: qrCodeUrl as string | undefined,
      expires_at: paymentRequest.expires_at?.toISOString() || '',
      status: paymentRequest.status,
    };
  }
}
