import {
  Controller,
  Get,
  Res,
  Body,
  Headers,
  Req,
  Param,
  Query,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { SepayService } from './payment/gateways/sepay/sepay.service';
import { MomoService } from './payment/gateways/momo/momo.service';
import { PaymentService } from './payment/payment.service';
import { CreatePaymentDto } from './payment/dto/create-payment.dto';
import * as crypto from 'crypto';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly sepayService: SepayService,
    private readonly momoService: MomoService,
    private readonly paymentService: PaymentService,
  ) {}
  @Get()
  getHello(): string {
    return 'Payment Service API is running!';
  }

  @Get('app')
  getReactApp(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public/index.html'));
  }

  // Tạo payment Sepay theo order_id và hiển thị QR để test webhook
  @Get('payment/sepay/:orderId')
  async createSepayPaymentAndShowQr(
    @Param('orderId') orderId: string,
    @Query('amount') amount: string,
    @Res() res: Response,
  ) {
    const numericAmount = amount ? parseInt(amount, 10) : 100000;
    const dto: CreatePaymentDto = {
      order_id: orderId,
      payment_method: 'sepay',
      amount: Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : 100000,
      currency: 'VND',
      customer_data: { source: 'quick-qr' },
      description: `Thanh toan don hang ${orderId}`,
    };

    const secretKey = process.env.LARAVEL_SECRET_KEY || '';
    const signaturePayload: Record<string, unknown> = {
      order_id: dto.order_id,
      payment_method: dto.payment_method,
      amount: dto.amount,
      currency: dto.currency,
      customer_data: dto.customer_data,
      description: dto.description,
    };
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(JSON.stringify(signaturePayload))
      .digest('hex');

    try {
      const result = await this.paymentService.createPayment(dto, signature);
      const qr = (result.qr_code_url as unknown as string) || (result.payment_url as string) || '';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sepay QR - ${orderId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto;padding:24px} .box{max-width:520px;margin:auto;text-align:center} img{max-width:100%;height:auto;border:1px solid #eee;border-radius:12px;padding:12px;background:#fafafa} .meta{margin-top:12px;color:#666;font-size:14px;word-break:break-all} .btn{display:inline-block;margin-top:12px;padding:10px 14px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none}</style>
</head><body><div class="box">
<h2>Sepay QR cho đơn ${orderId}</h2>
${qr && qr.startsWith('http') ? `<img src="${qr}" alt="QR Code" />` : '<p>Không có QR. Xem liên kết bên dưới.</p>'}
<div class="meta">
<div><strong>payment_id:</strong> ${result.payment_id}</div>
<div><strong>order_id:</strong> ${orderId}</div>
<div><strong>amount:</strong> ${dto.amount} ${dto.currency}</div>
<div><strong>qr_code_url/payment_url:</strong> ${qr}</div>
</div>
<a class="btn" href="/api/payments/${result.payment_id}/qr" target="_blank">Mở trang QR (preview)</a>
</div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res
        .status(200)
        .send(html);
    } catch (e) {
      return res
        .status(500)
        .json({
          error: 'Failed to create payment',
          message: e instanceof Error ? e.message : String(e),
        });
    }
  }





  @Get('payment/momo')
  getMomoPayment(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'frontend/dist/index.html'));
  }

  @Get('payment/paypal')
  getPaypalPayment(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'frontend/dist/index.html'));
  }

  @Get('paypal')
  getPaypal(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'frontend/dist/index.html'));
  }

  // Serve static assets - MUST be before catch-all routes
  // This is a fallback in case useStaticAssets doesn't work
  @Get('assets/*')
  getAssets(@Req() req: Request, @Res() res: Response) {
    const filePath = req.url.replace('/assets/', '');
    const fullPath = join(process.cwd(), 'frontend/dist/assets', filePath);
    return res.sendFile(fullPath);
  }

  // Serve React routes for Sepay and others under root-level paths
  @Get(['sepay', 'sepay/*', 'momo', 'momo/*', 'paypal', 'paypal/*', 'error', 'error/*', '404'])
  serveFrontendCatchAll(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'frontend/dist/index.html'));
  }

  // Temporary passthrough to ensure status route is reachable even if router ordering changes
  @Get('api/payments/:paymentId/status')
  async passthroughPaymentStatus(@Param('paymentId') paymentId: string, @Res() res: Response) {
    try {
      this.logger.log(`[passthroughPaymentStatus] paymentId=${paymentId}`);
      const status = await this.paymentService.getPaymentStatus(paymentId);
      return res.status(200).json(status);
    } catch (e: any) {
      this.logger.warn(`[passthroughPaymentStatus] error=${e?.message || e}`);
      const code = e?.status || 404;
      return res.status(code).json({ message: e?.message || 'Not Found' });
    }
  }

  // Final catch-all: serve SPA for any non-API paths (so /error/600, /anything -> SPA)
  @Get('*')
  serveAnyNonApi(@Req() req: Request, @Res() res: Response) {
    // Do not intercept API calls
    if (req.path.startsWith('/api')) {
      this.logger.warn(`[UNMATCHED_API_ROUTE] method=${req.method} path=${req.path}`);
      return res.status(404).json({ message: 'Not Found' });
    }
    return res.sendFile(join(process.cwd(), 'frontend/dist/index.html'));
  }
}
