import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  HttpException,
} from '@nestjs/common';
import { PaymentService } from '../payment.service';
import {
  PaymentHistoryService,
} from '../services/payment-history.service';

@Controller('api/payments/paypal')
export class PaypalController {
  private readonly logger = new Logger(PaypalController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentHistoryService: PaymentHistoryService,
  ) {}

  @Post('create-order')
  @HttpCode(HttpStatus.OK)
  async createPayPalOrder(
    @Body() body: { order_id?: string; amount?: number; currency?: string; payment_id: string },
  ): Promise<{ orderId: string }> {
    this.logger.log(`Creating PayPal order for payment_id: ${body.payment_id}`);
    let paymentRequestId: number | null = null;
    try {
      const status = await this.paymentService.getPaymentStatus(body.payment_id);
      if (body.order_id && String(body.order_id) !== String(status.order_id)) {
        throw new HttpException('order_id does not match payment', HttpStatus.BAD_REQUEST);
      }
      const paymentRequest = await this.paymentService.findByIdempotencyKey(body.payment_id);
      paymentRequestId = paymentRequest?.id || null;
      const result = await this.paymentService.createPayPalOrder(
        String(status.order_id),
        Number(status.amount || 0),
        status.currency || 'USD',
      );
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
          result,
        );
      }
      return result;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create PayPal order: ${errorMessage}`);
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_create_failed',
          {
            error: errorMessage,
            paypal_error: error.response?.data || error.paypalError || {},
          },
          error.response?.data || error.paypalError || {},
        ).catch((logError) => {
          this.logger.warn(`Failed to log PayPal create-order error: ${logError.message}`);
        });
      }
      throw error;
    }
  }

  @Post('capture-order')
  @HttpCode(HttpStatus.OK)
  async capturePayPalOrder(
    @Body() body: { orderId: string; payment_id: string },
  ): Promise<{ success: boolean; transaction_id?: string; data?: any }> {
    this.logger.log(`Capturing PayPal order: ${body.orderId} for payment_id: ${body.payment_id}`);
    let paymentRequestId: number | null = null;
    try {
      const paymentRequest = await this.paymentService.findByIdempotencyKey(body.payment_id);
      paymentRequestId = paymentRequest?.id || null;
      const captureData = await this.paymentService.capturePayPalOrder(body.orderId);
      const transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      await this.paymentService.updatePaymentStatusFromLaravel(
        body.payment_id,
        'completed',
        transactionId,
        captureData,
      );
      if (paymentRequestId) {
        await this.paymentHistoryService.logEvent(
          paymentRequestId,
          'paypal_order_captured',
          {
            paypal_order_id: body.orderId,
            transaction_id: transactionId,
            payment_id: body.payment_id,
          },
          captureData,
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
          paypalError,
        ).catch((logError) => {
          this.logger.warn(`Failed to log PayPal capture error: ${logError.message}`);
        });
      }
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


