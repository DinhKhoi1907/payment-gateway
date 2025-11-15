import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { IdempotencyService } from '../services/idempotency.service';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.headers['x-idempotency-key'] as string;

    if (!idempotencyKey) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    // Validate idempotency key format
    if (!this.isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException('Invalid idempotency key format');
    }

    // Check if this is a duplicate request
    const existingRequest = await this.idempotencyService.checkDuplicateRequest(
      idempotencyKey,
      request.body,
    );

    if (existingRequest) {
      this.logger.log(`Duplicate request detected for key: ${idempotencyKey}`);
      
      // Attach cached response to request for controller to use
      request['cachedResponse'] = existingRequest.response_data;
      request['isDuplicate'] = true;
      
      return true; // Allow request to proceed but controller will return cached response
    }

    // Store request for future duplicate detection
    await this.idempotencyService.storeRequest(idempotencyKey, request.body);
    request['isDuplicate'] = false;

    return true;
  }

  private isValidIdempotencyKey(key: string): boolean {
    // Idempotency key should be a valid SHA256 hash (64 characters)
    return /^[a-f0-9]{64}$/.test(key);
  }
}
