import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaymentAdapter {
  createInvoice(input: { amount: number; currency: string; purpose: string }): Promise<{ externalId: string; payUrl: string }>;
  handleWebhook(payload: unknown): Promise<{ externalId: string; status: string }>;
  refund(externalId: string): Promise<{ status: string }>;
  getStatus(externalId: string): Promise<string>;
}

@Injectable()
export class PaymentProvider implements PaymentAdapter {
  constructor(private readonly config: ConfigService) {}

  async createInvoice(input: { amount: number; currency: string; purpose: string }) {
    if (!this.isMockEnabled()) {
      const url = this.config.get<string>('PAYMENT_HTTP_URL');
      const token = this.config.get<string>('PAYMENT_HTTP_TOKEN');
      if (!url) throw new BadRequestException('Payment provider is not configured');
      const response = await fetch(`${url.replace(/\/$/, '')}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new BadRequestException('Payment provider rejected invoice');
      return response.json() as Promise<{ externalId: string; payUrl: string }>;
    }
    return {
      externalId: `mock_${Date.now()}`,
      payUrl: `https://payments.example.local/pay?amount=${input.amount}&currency=${input.currency}`,
    };
  }

  async handleWebhook(payload: unknown) {
    const event = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    return {
      externalId: event.externalId?.toString() ?? '',
      status: event.status?.toString() ?? 'pending',
    };
  }

  async refund(_externalId: string) {
    return { status: 'refunded' };
  }

  async getStatus(_externalId: string) {
    return 'confirmed';
  }

  isMockEnabled() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return this.config.get<string>('ALLOW_MOCK_PROVIDERS') === 'true';
    }
    return this.config.get<string>('PAYMENT_PROVIDER') !== 'http';
  }
}
