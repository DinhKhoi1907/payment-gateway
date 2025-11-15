import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentRequest } from './entities/payment-request.entity';
import { PaymentLog } from './entities/payment-log.entity';
import { PaymentWebhook } from './entities/payment-webhook.entity';
import { PaymentCallback } from './entities/payment-callback.entity';
import { PaymentStatistics } from './entities/payment-statistics.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentGatewayModule } from './gateways/payment-gateway.module';
import { IdempotencyService } from './services/idempotency.service';
import { PaymentHistoryService } from './services/payment-history.service';
import { PaymentCleanupService } from './services/payment-cleanup.service';
import { IdempotencyGuard } from './guards/idempotency.guard';
import { PaypalController } from './controllers/paypal.controller';
import { WebhooksController } from './controllers/webhooks.controller';
import { PaymentStatusController } from './controllers/status.controller';
import { SepayController } from './controllers/sepay.controller';
import { MomoController } from './controllers/momo.controller';
import { PaymentController } from './payment.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentRequest,
      PaymentLog,
      PaymentWebhook,
      PaymentCallback,
      PaymentStatistics,
      PaymentTransaction,
    ]),
    PaymentGatewayModule,
  ],
  controllers: [
    PaymentController,
    PaypalController,
    WebhooksController,
    PaymentStatusController,
    SepayController,
    MomoController,
  ],
  providers: [
    PaymentService,
    IdempotencyService,
    PaymentHistoryService,
    PaymentCleanupService,
    IdempotencyGuard,
  ],
  exports: [PaymentService, IdempotencyService, PaymentHistoryService],
})
export class PaymentModule {}
