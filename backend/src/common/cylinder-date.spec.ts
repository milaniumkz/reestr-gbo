import { describe, expect, it } from '@jest/globals';
import { cylinderProducedAt } from './cylinder-date';

describe('Cylinder production date',()=>{
  it.each([undefined,'2024','2024-02-30','2100-01-01','1899-12-31'])('rejects missing, partial and invalid dates: %s',value=>{
    expect(()=>cylinderProducedAt(value)).toThrow();
  });
  it('preserves the exact production day rather than substituting January 1',()=>{
    expect(cylinderProducedAt('2024-07-15').toISOString()).toBe('2024-07-15T00:00:00.000Z');
  });
});
