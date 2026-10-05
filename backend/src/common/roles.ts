export const roles = [
  'vehicle_owner',
  'inspection_org',
  'operator',
  'nca',
  'government',
  'super_admin',
] as const;

export type Role = (typeof roles)[number];
