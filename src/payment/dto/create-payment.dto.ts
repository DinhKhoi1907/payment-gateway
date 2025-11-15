/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsObject,
  Min,
} from 'class-validator';

interface CustomerData {
  [key: string]: unknown;
}

export class CreatePaymentDto {
  @IsString()
  order_id: string;

  @IsEnum(['sepay', 'momo', 'paypal'])
  payment_method: string;

  @IsString()
  @IsOptional()
  idempotency_key?: string;

  @IsString()
  @IsOptional()
  session?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsObject()
  @IsOptional()
  customer_data?: CustomerData;

  @IsString()
  @IsOptional()
  description?: string;
}
