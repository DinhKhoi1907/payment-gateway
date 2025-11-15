import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Controller('api/payments/sepay')
export class SepayController {
  @Get('redirect')
  redirectSepay(@Req() req: Request, @Res() res: Response) {
    const orderId = String(req.query.order_id || '');
    const amount = String(req.query.amount || '');
    const target = `/payment/sepay/${encodeURIComponent(orderId)}${amount ? `?amount=${encodeURIComponent(amount)}` : ''}`;
    return res.redirect(target);
  }

  @Post('redirect')
  jsonRedirectSepay(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const orderId = String(body?.order_id || body?.orderId || '');
    const amount = body?.amount ? String(body.amount) : '';
    const base = process.env.NESTJS_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUrl = `${base}/payment/sepay/${encodeURIComponent(orderId)}${amount ? `?amount=${encodeURIComponent(amount)}` : ''}`;
    return res.status(200).json({ redirect_url: redirectUrl });
  }
}


