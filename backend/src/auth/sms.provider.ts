import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsAdapter {
  sendOtp(phone: string, code?: string): Promise<{ code?: string }>;
  verifyDelivery(messageId: string): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

@Injectable()
export class SmsProvider implements SmsAdapter {
  private readonly devCode = '1111';

  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, requestedCode?: string) {
    const code = requestedCode ?? this.config.get<string>('SMS_MOCK_CODE') ?? this.devCode;
    if (this.isMockEnabled()) {
      console.log(`[sms] OTP ${code} -> ${phone}`);
      return { code };
    }

    const url = this.config.get<string>('SMS_HTTP_URL');
    const token = this.config.get<string>('SMS_HTTP_TOKEN');
    if (!url) {
      throw new BadRequestException('SMS provider is not configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        phone,
        message: `Код ЕРСИ ГБО: ${code}`,
      }),
    });
    if (!response.ok) {
      throw new BadRequestException('SMS provider rejected request');
    }
    return {};
  }

  async verifyOtp(_phone: string, code: string) {
    return code === (this.config.get<string>('SMS_MOCK_CODE') ?? this.devCode);
  }

  async verifyDelivery(_messageId: string) {
    return true;
  }

  async healthCheck() {
    if (this.isMockEnabled()) return true;
    return Boolean(this.config.get<string>('SMS_HTTP_URL'));
  }

  isMockEnabled() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return this.config.get<string>('ALLOW_MOCK_PROVIDERS') === 'true';
    }
    return this.config.get<string>('SMS_PROVIDER') !== 'http';
  }
}
