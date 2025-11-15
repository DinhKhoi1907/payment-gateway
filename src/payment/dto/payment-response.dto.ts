export class PaymentResponseDto {
  payment_id: string;
  session_id: string;
  idempotency_key: string;
  payment_url: string;
  qr_code_url?: string;
  expires_at: string;
  status: string;
}

export class PaymentStatusDto {
  payment_id: string;
  session_id?: string;
  order_id: string;
  status: string;
  amount?: number;
  currency?: string;
  transaction_id?: string;
  gateway_response?: any;
  completed_at?: string;
  expires_at?: string;
}
