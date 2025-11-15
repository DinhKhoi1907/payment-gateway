import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentLog } from '../entities/payment-log.entity';
import { PaymentRequest } from '../entities/payment-request.entity';

export interface PaymentHistoryEntry {
  id: number;
  payment_request_id: number;
  event_type: string;
  event_data: any;
  gateway_response: any;
  created_at: Date;
  order_id?: string;
  payment_method?: string;
  amount?: number;
  status?: string;
}

export interface PaymentHistoryFilter {
  order_id?: string;
  payment_method?: string;
  status?: string;
  event_type?: string;
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class PaymentHistoryService {
  private readonly logger = new Logger(PaymentHistoryService.name);

  constructor(
    @InjectRepository(PaymentLog)
    private paymentLogRepository: Repository<PaymentLog>,
    @InjectRepository(PaymentRequest)
    private paymentRequestRepository: Repository<PaymentRequest>,
  ) {}

  /**
   * Lấy lịch sử thanh toán với filter
   */
  async getPaymentHistory(filter: PaymentHistoryFilter = {}): Promise<{
    entries: PaymentHistoryEntry[];
    total: number;
  }> {
    try {
      const query = this.paymentLogRepository
        .createQueryBuilder('log')
        .leftJoinAndSelect('log.payment_request', 'payment_request')
        .orderBy('log.created_at', 'DESC');

      // Apply filters
      if (filter.order_id) {
        query.andWhere('payment_request.order_id = :order_id', { order_id: filter.order_id });
      }

      if (filter.payment_method) {
        query.andWhere('payment_request.payment_method = :payment_method', { 
          payment_method: filter.payment_method 
        });
      }

      if (filter.status) {
        query.andWhere('payment_request.status = :status', { status: filter.status });
      }

      if (filter.event_type) {
        query.andWhere('log.event_type = :event_type', { event_type: filter.event_type });
      }

      if (filter.start_date) {
        query.andWhere('log.created_at >= :start_date', { start_date: filter.start_date });
      }

      if (filter.end_date) {
        query.andWhere('log.created_at <= :end_date', { end_date: filter.end_date });
      }

      // Get total count
      const total = await query.getCount();

      // Apply pagination
      if (filter.limit) {
        query.limit(filter.limit);
      }
      if (filter.offset) {
        query.offset(filter.offset);
      }

      const logs = await query.getMany();

      const entries: PaymentHistoryEntry[] = logs.map(log => ({
        id: log.id,
        payment_request_id: log.payment_request_id,
        event_type: log.event_type,
        event_data: log.event_data,
        gateway_response: log.gateway_response,
        created_at: log.created_at,
        order_id: log.payment_request?.order_id,
        payment_method: log.payment_request?.payment_method,
        amount: log.payment_request?.amount,
        status: log.payment_request?.status,
      }));

      return { entries, total };
    } catch (error) {
      this.logger.error(`Error getting payment history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy lịch sử thanh toán cho một order cụ thể
   */
  async getOrderPaymentHistory(orderId: string): Promise<PaymentHistoryEntry[]> {
    try {
      const result = await this.getPaymentHistory({ order_id: orderId });
      return result.entries;
    } catch (error) {
      this.logger.error(`Error getting order payment history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy lịch sử thanh toán cho một payment request cụ thể
   */
  async getPaymentRequestHistory(paymentRequestId: number): Promise<PaymentHistoryEntry[]> {
    try {
      const logs = await this.paymentLogRepository.find({
        where: { payment_request_id: paymentRequestId },
        relations: ['payment_request'],
        order: { created_at: 'ASC' },
      });

      return logs.map(log => ({
        id: log.id,
        payment_request_id: log.payment_request_id,
        event_type: log.event_type,
        event_data: log.event_data,
        gateway_response: log.gateway_response,
        created_at: log.created_at,
        order_id: log.payment_request?.order_id,
        payment_method: log.payment_request?.payment_method,
        amount: log.payment_request?.amount,
        status: log.payment_request?.status,
      }));
    } catch (error) {
      this.logger.error(`Error getting payment request history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy lịch sử thanh toán cho một payment request bằng payment ID (idempotency key)
   */
  async getPaymentRequestHistoryByPaymentId(paymentId: string): Promise<PaymentHistoryEntry[]> {
    try {
      const logs = await this.paymentLogRepository
        .createQueryBuilder('log')
        .leftJoinAndSelect('log.payment_request', 'payment_request')
        .where('payment_request.idempotency_key = :paymentId', { paymentId })
        .orderBy('log.created_at', 'ASC')
        .getMany();

      return logs.map(log => ({
        id: log.id,
        payment_request_id: log.payment_request_id,
        event_type: log.event_type,
        event_data: log.event_data,
        gateway_response: log.gateway_response,
        created_at: log.created_at,
        order_id: log.payment_request?.order_id,
        payment_method: log.payment_request?.payment_method,
        amount: log.payment_request?.amount,
        status: log.payment_request?.status,
      }));
    } catch (error) {
      this.logger.error(`Error getting payment request history by payment ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log a payment-related event (alias for createLogEntry)
   */
  async logEvent(
    paymentRequestId: number,
    eventType: string,
    eventData?: any,
    gatewayResponse?: any,
  ): Promise<PaymentLog> {
    return this.createLogEntry(paymentRequestId, eventType, eventData, gatewayResponse);
  }

  /**
   * Tạo log entry mới
   */
  async createLogEntry(
    paymentRequestId: number,
    eventType: string,
    eventData?: any,
    gatewayResponse?: any,
  ): Promise<PaymentLog> {
    try {
      const log = this.paymentLogRepository.create({
        payment_request_id: paymentRequestId,
        event_type: eventType,
        event_data: eventData,
        gateway_response: gatewayResponse,
      });

      const savedLog = await this.paymentLogRepository.save(log);
      this.logger.log(`Created log entry: ${eventType} for payment request ${paymentRequestId}`);
      
      return savedLog;
    } catch (error) {
      this.logger.error(`Error creating log entry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy thống kê thanh toán
   */
  async getPaymentStatistics(startDate?: Date, endDate?: Date): Promise<{
    total_payments: number;
    successful_payments: number;
    failed_payments: number;
    pending_payments: number;
    cancelled_payments: number;
    total_amount: number;
    successful_amount: number;
    payment_methods: { [key: string]: number };
    daily_stats: { [key: string]: { count: number; amount: number } };
  }> {
    try {
      const query = this.paymentRequestRepository.createQueryBuilder('payment');

      if (startDate) {
        query.andWhere('payment.created_at >= :start_date', { start_date: startDate });
      }
      if (endDate) {
        query.andWhere('payment.created_at <= :end_date', { end_date: endDate });
      }

      const payments = await query.getMany();

      const stats = {
        total_payments: payments.length,
        successful_payments: payments.filter(p => p.status === 'completed').length,
        failed_payments: payments.filter(p => p.status === 'failed').length,
        pending_payments: payments.filter(p => p.status === 'pending').length,
        cancelled_payments: payments.filter(p => p.status === 'cancelled').length,
        total_amount: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        successful_amount: payments
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + Number(p.amount), 0),
        payment_methods: {} as { [key: string]: number },
        daily_stats: {} as { [key: string]: { count: number; amount: number } },
      };

      // Calculate payment methods stats
      payments.forEach(payment => {
        const method = payment.payment_method;
        stats.payment_methods[method] = (stats.payment_methods[method] || 0) + 1;
      });

      // Calculate daily stats
      payments.forEach(payment => {
        const date = payment.created_at.toISOString().split('T')[0];
        if (!stats.daily_stats[date]) {
          stats.daily_stats[date] = { count: 0, amount: 0 };
        }
        stats.daily_stats[date].count++;
        stats.daily_stats[date].amount += Number(payment.amount);
      });

      return stats;
    } catch (error) {
      this.logger.error(`Error getting payment statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export payment history to CSV format
   */
  async exportPaymentHistory(filter: PaymentHistoryFilter = {}): Promise<string> {
    try {
      const result = await this.getPaymentHistory(filter);
      
      const headers = [
        'ID',
        'Order ID',
        'Payment Method',
        'Amount',
        'Status',
        'Event Type',
        'Event Data',
        'Gateway Response',
        'Created At',
      ];

      const rows = result.entries.map(entry => [
        entry.id.toString(),
        entry.order_id || '',
        entry.payment_method || '',
        entry.amount?.toString() || '',
        entry.status || '',
        entry.event_type,
        JSON.stringify(entry.event_data || {}),
        JSON.stringify(entry.gateway_response || {}),
        entry.created_at.toISOString(),
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      return csvContent;
    } catch (error) {
      this.logger.error(`Error exporting payment history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Xóa logs cũ hơn một số ngày nhất định
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.paymentLogRepository
        .createQueryBuilder()
        .delete()
        .where('created_at < :cutoff_date', { cutoff_date: cutoffDate })
        .execute();

      const deletedCount = result.affected || 0;
      this.logger.log(`Cleaned up ${deletedCount} old log entries`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error cleaning up old logs: ${error.message}`);
      throw error;
    }
  }
}
