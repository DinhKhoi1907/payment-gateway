import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CancelPaymentDto {
  @IsString()
  @IsOptional()
  payment_id?: string;

  @IsEnum(['sepay', 'momo', 'paypal'])
  payment_method: string;

  @IsString()
  @IsOptional()
  reason?: string | null;

  @IsBoolean()
  @IsOptional()
  force?: boolean;

  @IsString()
  @IsOptional()
  cancelled_by?: string;

  @IsISO8601()
  timestamp: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

