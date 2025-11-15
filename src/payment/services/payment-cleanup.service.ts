import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PaymentRequest } from '../entities/payment-request.entity';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class PaymentCleanupService {
  private readonly logger = new Logger(PaymentCleanupService.name);
  private readonly laravelBaseUrl: string;
  private readonly laravelSecretKey: string;

  constructor(
    @InjectRepository(PaymentRequest)
    private paymentRequestRepository: Repository<PaymentRequest>,
  ) {
    this.laravelBaseUrl =
      process.env.LARAVEL_BASE_URL || 'http://localhost:8000';
    this.laravelSecretKey =
      process.env.LARAVEL_SECRET_KEY ||
      process.env.PAYMENT_SERVICE_SECRET_KEY ||
      '';

    if (!this.laravelSecretKey) {
      this.logger.warn(
        'LARAVEL_SECRET_KEY not configured. Cannot cancel orders in Laravel.',
      );
    }
  }

  /**
   * Method để check và cancel các payment đã hết hạn
   * Có thể gọi thủ công khi cần
   */
  async handleExpiredPayments() {
    this.logger.log('Starting expired payments cleanup job...');

    try {
      const now = new Date();

      // Tìm tất cả payment requests đang pending và đã hết hạn
      const expiredPayments = await this.paymentRequestRepository.find({
        where: {
          status: 'pending',
          expires_at: LessThan(now),
        },
        order: {
          created_at: 'ASC',
        },
        take: 100, // Giới hạn 100 records mỗi lần để tránh quá tải
      });

      if (expiredPayments.length === 0) {
        this.logger.log('No expired payments found');
        return;
      }

      this.logger.log(
        `Found ${expiredPayments.length} expired payments to cancel`,
      );

      let successCount = 0;
      let failCount = 0;

      for (const payment of expiredPayments) {
        try {
          // Cancel payment trong NestJS
          payment.markAsCancelled(
            'Cancelled by cron job due to expiration',
          );
          await this.paymentRequestRepository.save(payment);

          // Gọi API Laravel để cancel order tương ứng
          await this.cancelOrderInLaravel(
            payment.order_id,
            payment.id.toString(),
            'Payment expired and cancelled by cron job',
          );

          successCount++;
          this.logger.log(
            `Cancelled expired payment: payment_id=${payment.id}, order_id=${payment.order_id}`,
          );
        } catch (error) {
          failCount++;
          this.logger.error(
            `Failed to cancel expired payment: payment_id=${payment.id}, order_id=${payment.order_id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      this.logger.log(
        `Cleanup completed: ${successCount} succeeded, ${failCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        'Error in expired payments cleanup job',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Gọi API Laravel để cancel order
   */
  private async cancelOrderInLaravel(
    orderId: string,
    paymentId: string,
    reason: string,
  ): Promise<void> {
    if (!this.laravelSecretKey) {
      this.logger.warn(
        `Skipping Laravel API call for order ${orderId} - secret key not configured`,
      );
      return;
    }

    try {
      const url = `${this.laravelBaseUrl}/api/payment-service/orders/${orderId}/cancel`;
      // Tạo payload với order_id để verify signature
      // Laravel verify signature dựa trên route param orderId
      const orderIdInt = parseInt(orderId, 10);
      const payloadForSignature = JSON.stringify({ order_id: orderIdInt });
      const signature = crypto
        .createHmac('sha256', this.laravelSecretKey)
        .update(payloadForSignature)
        .digest('hex');

      const payload = {
        reason,
        payment_id: paymentId,
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        timeout: 10000, // 10 seconds timeout
      });

      if (response.data.success) {
        this.logger.log(
          `Successfully cancelled order ${orderId} in Laravel`,
        );
      } else {
        this.logger.warn(
          `Laravel returned unsuccessful response for order ${orderId}: ${JSON.stringify(response.data)}`,
        );
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to cancel order ${orderId} in Laravel: ${error.message}`,
          error.response?.data
            ? JSON.stringify(error.response.data)
            : undefined,
        );
      } else {
        this.logger.error(
          `Failed to cancel order ${orderId} in Laravel: ${String(error)}`,
        );
      }
      // Không throw error để không làm gián đoạn việc cancel các payment khác
    }
  }
}

