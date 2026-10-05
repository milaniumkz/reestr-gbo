import { describe, expect, it } from '@jest/globals';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns a basic health payload', () => {
    const service = new HealthService({} as never, {} as never);
    expect(service.basic()).toMatchObject({
      ok: true,
      service: 'ersi-gbo-backend',
    });
  });
});
