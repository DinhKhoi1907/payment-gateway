/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

interface GatewayResponse {
  [key: string]: unknown;
}

export class PaymentWebhookDto {
  @IsString()
  transaction_id: string;

  @IsString()
  status: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  order_id?: string;

  @IsObject()
  @IsOptional()
  gateway_response?: GatewayResponse;

  @IsString()
  @IsOptional()
  signature?: string;
}
