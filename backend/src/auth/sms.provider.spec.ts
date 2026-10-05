import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { SmsProvider } from './sms.provider';

function config(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('SmsProvider', () => {
  it('allows mock SMS outside production', async () => {
    const provider = new SmsProvider(config({ NODE_ENV: 'development' }));
    await expect(provider.sendOtp('+77001234567', '1111')).resolves.toEqual({ code: '1111' });
  });

  it('requires a real provider in production', async () => {
    const provider = new SmsProvider(config({ NODE_ENV: 'production' }));
    await expect(provider.sendOtp('+77001234567', '1234')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows explicit mock providers for staging smoke tests', async () => {
    const provider = new SmsProvider(config({
      NODE_ENV: 'production',
      ALLOW_MOCK_PROVIDERS: 'true',
    }));
    await expect(provider.sendOtp('+77001234567', '1111')).resolves.toEqual({ code: '1111' });
  });
});
