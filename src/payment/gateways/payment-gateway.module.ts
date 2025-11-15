import { Module } from '@nestjs/common';
import { SepayService } from './sepay/sepay.service';
import { MomoService } from './momo/momo.service';
import { PaypalService } from './paypal/paypal.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';

@Module({
  providers: [
    SepayService,
    MomoService,
    PaypalService,
    PaymentGatewayFactory,
  ],
  exports: [
    PaymentGatewayFactory,
    SepayService,
    MomoService,
    PaypalService,
  ],
})
export class PaymentGatewayModule {}
