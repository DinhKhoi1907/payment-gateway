import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRequest } from '../entities/payment-request.entity';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly cache = new Map<string, { value: any; storedAt: number }>();
  private readonly ttlMs: number = (Number(process.env.IDEMPOTENCY_TTL_MINUTES || '10') || 10) * 60 * 1000;

  constructor(
    @InjectRepository(PaymentRequest)
    private paymentRequestRepository: Repository<PaymentRequest>,
  ) {}

  /**
   * Lưu trữ request để kiểm tra duplicate
   */
  async storeRequest(idempotencyKey: string, requestBody: any): Promise<void> {
    this.cache.set(idempotencyKey, {
      value: {
        requestBody,
      },
      storedAt: Date.now(),
    });
  }

  /**
   * Kiểm tra duplicate request
   */
  async checkDuplicateRequest(idempotencyKey: string, requestBody: any): Promise<any | null> {
    const cached = this.cache.get(idempotencyKey);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.storedAt > this.ttlMs) {
      this.logger.log(`Idempotency request cache expired for key: ${idempotencyKey}`);
      this.cache.delete(idempotencyKey);
      return null;
    }

    // So sánh request body
    if (JSON.stringify(cached.value.requestBody) !== JSON.stringify(requestBody)) {
      return null;
    }

    // Kiểm tra trong database
    const existingPayment = await this.paymentRequestRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });

    if (existingPayment && (existingPayment.isCompleted() || existingPayment.isFailed())) {
      return this.buildResponse(existingPayment);
    }

    return null;
  }

  /**
   * Lấy cached response
   */
  async get(idempotencyKey: string): Promise<any | null> {
    const cached = this.cache.get(idempotencyKey);
    if (!cached) return null;
    if (Date.now() - cached.storedAt > this.ttlMs) {
      this.logger.log(`Idempotency response cache expired for key: ${idempotencyKey}`);
      this.cache.delete(idempotencyKey);
      return null;
    }
    return cached.value;
  }

  /**
   * Lưu cached response
   */
  async set(idempotencyKey: string, response: any): Promise<void> {
    this.cache.set(idempotencyKey, { value: response, storedAt: Date.now() });
  }

  /**
   * Xóa cache
   */
  async delete(idempotencyKey: string): Promise<void> {
    this.cache.delete(idempotencyKey);
  }

  /**
   * Build response từ payment request
   */
  private buildResponse(paymentRequest: PaymentRequest): any {
    return {
      payment_id: paymentRequest.idempotency_key,
      idempotency_key: paymentRequest.idempotency_key,
      payment_url: paymentRequest.response_data?.payment_url || '',
      expires_at: paymentRequest.expires_at?.toISOString() || '',
      status: paymentRequest.status,
    };
  }
}
