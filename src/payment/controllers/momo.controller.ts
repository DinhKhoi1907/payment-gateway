import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MomoService } from '../gateways/momo/momo.service';

interface PaymentCreateBody {
  order_id: string;
  amount: number;
  currency?: string;
  customer_data?: { user_id?: string | number } | Record<string, unknown>;
  return_url?: string;
  notify_url?: string;
}

@Controller('api/payments/momo')
export class MomoController {
  constructor(private readonly momoService: MomoService) {}

  // Legacy create endpoint (kept for compatibility)
  @Post('create')
  async createMomoPayment(
    @Body() body: PaymentCreateBody,
    @Res() res: Response,
  ): Promise<any> {
    try {
      const laravelUrl = process.env.LARAVEL_URL;
      const nestjsUrl = process.env.NESTJS_URL;
      if (!laravelUrl) {
        return res.status(500).json({
          error: 'Server configuration error',
          message: 'LARAVEL_URL environment variable is not set',
        });
      }
      if (!nestjsUrl) {
        return res.status(500).json({
          error: 'Server configuration error',
          message: 'NESTJS_URL environment variable is not set',
        });
      }
      const returnUrl = body.return_url || `${laravelUrl}/thank-you?order_id=${body.order_id}`;
      const notifyUrl = body.notify_url || `${nestjsUrl}/api/payments/webhooks/momo`;
      const momoRequest = {
        order_id: body.order_id,
        amount: body.amount,
        currency: body.currency || 'VND',
        customer_data: body.customer_data,
        return_url: returnUrl,
        notify_url: notifyUrl,
      };
      const momoResponse = await this.momoService.createPayment(momoRequest);
      return res.status(200).json(momoResponse);
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to create MoMo payment',
        message: error.message,
      });
    }
  }
}


