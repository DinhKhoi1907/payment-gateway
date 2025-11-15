import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from '../payment.service';
import { PaymentWebhookDto } from '../dto/payment-webhook.dto';

@Controller('api/payments/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post('sepay')
  @HttpCode(HttpStatus.OK)
  async handleSepayWebhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
    @Req() request?: Request,
  ): Promise<{ success: boolean }> {
    this.logger.log('=== SEPAY WEBHOOK RECEIVED (from n8n) ===');
    try { this.logger.log(`Headers: ${JSON.stringify(request?.headers || {}, null, 2)}`); } catch {}
    try { this.logger.log(`Method: ${request?.method} Path: ${request?.url}`); } catch {}
    try { this.logger.log(`Content-Type: ${(request?.headers || {})['content-type']}`); } catch {}
    try { this.logger.log(`Raw Body: ${JSON.stringify(request?.body || body || {}, null, 2)}`); } catch {}

    // Normalize payload: support raw at root or wrapped as { body: { ... } }
    let finalPayload: PaymentWebhookDto;
    const raw: any = (request?.body ?? body) as any;
    const maybeWrapped = raw && typeof raw === 'object' && raw.body && typeof raw.body === 'object';
    const p: any = maybeWrapped ? raw.body : raw;
    try { this.logger.log(`Body Wrapper Detected: ${maybeWrapped}`); } catch {}
    try { this.logger.log(`Payload (p) preview keys: ${Object.keys(p || {}).slice(0, 20).join(', ')}`); } catch {}

    const texts: string[] = [];
    if (typeof p?.content === 'string') texts.push(p.content);
    if (typeof p?.description === 'string') texts.push(p.description);
    const joined = texts.join(' | ');
    const m = joined.match(/\bDH([A-Za-z0-9_-]+)\b/i);
    const extractedOrderId = p?.order_id || (m ? m[1] : '');

    finalPayload = {
      transaction_id: String(p?.referenceCode || p?.id || ''),
      status: 'completed',
      amount: Number(p?.transferAmount || 0),
      currency: 'VND',
      order_id: extractedOrderId,
      gateway_response: p,
    } as unknown as PaymentWebhookDto;

    this.logger.log(`Normalized webhook payload: ${JSON.stringify(finalPayload, null, 2)}`);
    await this.paymentService.handleWebhook(finalPayload, 'sepay', signature);
    return { success: true };
  }

  @Post('momo')
  @HttpCode(HttpStatus.OK)
  async handleMomoWebhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
    @Req() request?: Request,
  ): Promise<{ success: boolean }> {
    this.logger.log('=== MOMO WEBHOOK RECEIVED ===');
    try { this.logger.log(`Headers: ${JSON.stringify(request?.headers || {}, null, 2)}`); } catch {}
    try { this.logger.log(`Raw Body: ${JSON.stringify(body || {}, null, 2)}`); } catch {}

    const raw: any = body || {};
    let extractedOrderId: string | null = null;
    if (raw.orderId && typeof raw.orderId === 'string') {
      const match = raw.orderId.match(/^ORDER_(\d+)_/);
      if (match) {
        extractedOrderId = match[1];
      }
    }
    const resultCode = raw.resultCode;
    const status = (resultCode === 0 || resultCode === '0') ? 'completed' : 'failed';
    const transactionId = raw.transId || raw.orderId || '';

    const normalizedWebhook: PaymentWebhookDto = {
      transaction_id: transactionId,
      status: status,
      amount: Number(raw.amount || 0),
      currency: raw.currency || 'VND',
      order_id: extractedOrderId || raw.orderId || '',
      gateway_response: raw,
      signature: raw.signature || signature,
    };

    this.logger.log(`Normalized MoMo webhook payload: ${JSON.stringify(normalizedWebhook, null, 2)}`);
    await this.paymentService.handleWebhook(normalizedWebhook, 'momo', signature);
    return { success: true };
  }

  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  async handlePayPalWebhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
  ): Promise<{ success: boolean }> {
    this.logger.log('=== PAYPAL WEBHOOK RECEIVED (from n8n) ===');
    try { this.logger.log(`Headers: ${JSON.stringify((body && body.headers) || {}, null, 2)}`); } catch {}
    try { this.logger.log(`Raw Body: ${JSON.stringify(body || {}, null, 2)}`); } catch {}

    const raw: any = body || {};
    const maybeWrapped = raw && typeof raw === 'object' && raw.body && typeof raw.body === 'object';
    const p: any = maybeWrapped ? raw.body : raw;

    const resource = p?.resource || {};
    const purchaseUnit0 = Array.isArray(resource?.purchase_units) ? resource.purchase_units[0] : undefined;
    const amountObj = purchaseUnit0?.amount || {};
    const normalized: PaymentWebhookDto = {
      transaction_id: String(resource?.id || p?.id || ''),
      status: (p?.event_type === 'CHECKOUT.ORDER.APPROVED' || resource?.status === 'APPROVED') ? 'completed' : 'failed',
      amount: Number(amountObj?.value ? Number(amountObj.value) : 0),
      currency: amountObj?.currency_code || 'USD',
      order_id: String(purchaseUnit0?.reference_id || ''),
      gateway_response: p,
      signature,
    };

    this.logger.log(`Normalized PayPal webhook payload: ${JSON.stringify(normalized, null, 2)}`);
    await this.paymentService.handleWebhook(normalized, 'paypal', signature);
    return { success: true };
  }
}
