import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PaymentService } from '../payment.service';
import {
  PaymentHistoryService,
  type PaymentHistoryFilter,
} from '../services/payment-history.service';
import type { PaymentStatusDto } from '../dto/payment-response.dto';

@Controller('api/payments')
export class PaymentStatusController {
  private readonly logger = new Logger(PaymentStatusController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentHistoryService: PaymentHistoryService,
  ) {}

  @Get(':paymentId/status')
  async getPaymentStatus(
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentStatusDto> {
    this.logger.log(`[getPaymentStatus] paymentId=${paymentId}`);
    return await this.paymentService.getPaymentStatus(paymentId);
  }

  @Get('history')
  async getPaymentHistory(@Query() filter: PaymentHistoryFilter): Promise<any> {
    return this.paymentHistoryService.getPaymentHistory(filter);
  }

  @Get(':paymentId/history')
  async getPaymentRequestHistory(
    @Param('paymentId')
    paymentId: string,
  ): Promise<any> {
    return this.paymentHistoryService.getPaymentRequestHistoryByPaymentId(
      paymentId,
    );
  }

  @Post(':paymentId/update-status')
  @HttpCode(HttpStatus.OK)
  async updatePaymentStatus(
    @Param('paymentId') paymentId: string,
    @Body()
    body: { status: string; transaction_id?: string; gateway_response?: any },
  ): Promise<{ success: boolean }> {
    this.logger.log(`=== UPDATE PAYMENT STATUS FROM LARAVEL ===`);
    this.logger.log(`Payment ID: ${paymentId}`);
    this.logger.log(`Status: ${body.status}`);
    this.logger.log(`Transaction ID: ${body.transaction_id}`);
    await this.paymentService.updatePaymentStatusFromLaravel(
      paymentId,
      body.status,
      body.transaction_id,
      body.gateway_response,
    );
    return { success: true };
  }
}
