import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaymentModule } from './payment/payment.module';
import { SepayService } from './payment/gateways/sepay/sepay.service';
import { MomoService } from './payment/gateways/momo/momo.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Support Vercel Postgres (POSTGRES_URL) and traditional PostgreSQL
      url: process.env.POSTGRES_URL || process.env.DATABASE_URL || undefined,
      host:
        process.env.POSTGRES_URL || process.env.DATABASE_URL
          ? undefined
          : process.env.DB_HOST || 'localhost',
      port:
        process.env.POSTGRES_URL || process.env.DATABASE_URL
          ? undefined
          : parseInt(process.env.DB_PORT || '5432'),
      username:
        process.env.POSTGRES_URL || process.env.DATABASE_URL
          ? undefined
          : process.env.DB_USERNAME || 'postgres',
      password:
        process.env.POSTGRES_URL || process.env.DATABASE_URL
          ? undefined
          : process.env.DB_PASSWORD || 'postgres123',
      database:
        process.env.POSTGRES_URL || process.env.DATABASE_URL
          ? undefined
          : process.env.DB_DATABASE || 'payment_db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      // Only enable SSL for Vercel Postgres or when explicitly requested
      // Vercel Postgres always requires SSL
      // Local PostgreSQL typically doesn't support SSL
      ssl:
        process.env.POSTGRES_URL ||
        (process.env.DATABASE_URL &&
          (process.env.DATABASE_URL.includes('vercel') ||
            process.env.DATABASE_URL.includes('sslmode=require'))) ||
        process.env.DB_USE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
    }),
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService, SepayService, MomoService],
})
export class AppModule {}
