const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
export const API_BASE_URL = API_URL;

export type ListResponse<T> = {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
};

export type ListMeta = {
  total: number;
  page: number;
  limit: number;
};

export type DashboardPages = Partial<Record<
  'organizations' | 'inspections' | 'certificates' | 'importJobs' | 'users' | 'audit' | 'registry' | 'publicChecks' | 'notifications',
  number
>>;

export type DashboardOptions = {
  includeManagement?: boolean;
};

function asItems<T>(value: T[] | ListResponse<T>): T[] {
  return Array.isArray(value) ? value : value.items;
}

function asList<T>(value: T[] | ListResponse<T>, page = 1, limit = 50): ListResponse<T> & ListMeta {
  if (Array.isArray(value)) {
    return { items: value, total: value.length, page, limit };
  }
  return {
    items: value.items,
    total: value.total ?? value.items.length,
    page: value.page ?? page,
    limit: value.limit ?? limit,
  };
}

async function apiError(response: Response, path: string) {
  const fallback = `API ${response.status}: ${path}`;
  const contentType = response.headers.get('content-type') ?? '';
  const withStatus = (error: Error) => Object.assign(error, { status: response.status });
  try {
    if (contentType.includes('application/json')) {
      const body = await response.json() as { message?: string | string[]; error?: string };
      const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      return withStatus(new Error(message || body.error || fallback));
    }
    const text = await response.text();
    return withStatus(new Error(text.trim() || fallback));
  } catch {
    return withStatus(new Error(fallback));
  }
}

async function api<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (!response.ok) {
    throw await apiError(response, path);
  }
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await apiError(response, path);
  }
  return response.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await apiError(response, path);
  }
  return response.json() as Promise<T>;
}

async function del<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await apiError(response, path);
  }
  return response.json() as Promise<T>;
}

async function upload<T>(path: string, form: FormData, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw await apiError(response, path);
  }
  return response.json() as Promise<T>;
}

export type AdminUser = {
  sub: string;
  phone: string;
  roles: string[];
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
};

export type Organization = {
  id: string;
  name: string;
  bin: string;
  type: string;
  status: string;
  address?: string;
  region?: string;
  contactPhone?: string;
  contactEmail?: string;
  lat?: number;
  lng?: number;
  balances?: Array<{ amount: number; currency: string }>;
  members?: Array<{ id: string; role: string; user?: { id: string; fullName: string; phone: string; lastLoginAt?: string } }>;
};

export type BannerRow = {
  id: string;
  title: string;
  linkUrl?: string;
  objectKey: string;
  imageUrl: string;
  durationSeconds: number;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  createdAt: string;
};

export type EquipmentItem = {
  id: string;
  type: 'reducer' | 'control_unit' | 'cylinder_manufacturer';
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type LegalDocumentRow = {
  id: string;
  title: string;
  excerpt?: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Inspection = {
  id: string;
  status: string;
  createdAt: string;
  lat?: number;
  lng?: number;
  address?: string;
  autoPublishAt?: string;
  certificateNumber?: string;
  organization?: { name: string };
  vehicle?: {
    vin: string;
    plateNumber: string;
    make?: string;
    model?: string;
    year?: number;
    owners?: Array<{ fullName?: string; iin?: string; address?: string }>;
    cylinders?: Array<{
      serialNumber?: string;
      manufacturer?: string;
      volumeLiters?: number;
      reducerName?: string;
      controlUnitName?: string;
      validUntil?: string;
    }>;
  };
  photos?: Array<{ id: string; type: string; objectKey: string; viewUrl?: string }>;
  certificate?: { number: string; status: string; validUntil: string };
  createdBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
  submittedBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
  approvedBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
  submittedAt?: string;
  approvedAt?: string;
};

export type CertificateRow = {
  id: string;
  number: string;
  status: string;
  validUntil: string;
  issuedAt: string;
  vehicle?: {
    vin: string;
    plateNumber: string;
    make: string;
    model: string;
    year?: number;
    owners?: Array<{ fullName?: string; iin?: string; address?: string; user?: { phone?: string } }>;
    cylinders?: Array<{
      serialNumber: string;
      manufacturer?: string;
      volumeLiters?: number;
      reducerName?: string;
      controlUnitName?: string;
      validUntil?: string;
    }>;
  };
  inspection?: {
    id?: string;
    status?: string;
    address?: string;
    lat?: number;
    lng?: number;
    organization?: Organization;
    photos?: Array<{ id: string; type: string; objectKey: string; viewUrl?: string }>;
    createdBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
    submittedBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
    approvedBy?: { id: string; phone: string; fullName: string; lastLoginAt?: string };
    submittedAt?: string;
    approvedAt?: string;
  };
  _count?: { views: number };
};

export type UserRow = {
  id: string;
  phone: string;
  fullName: string;
  iin?: string;
  isBlocked: boolean;
  lastLoginAt?: string;
  roles: Array<{ role: string }>;
  memberships?: Array<{ role: string; organization?: Organization }>;
  sessions?: Array<{
    id: string;
    deviceName?: string;
    ipAddress?: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
  }>;
};

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  createdAt: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  actor?: { phone: string; fullName: string; roles?: Array<{ role: string }> };
};

export type RegistryVehicle = {
  id: string;
  vin: string;
  plateNumber: string;
  make: string;
  model: string;
  certificates?: Array<{
    number: string;
    status: string;
    validUntil: string;
    inspection?: { organization?: Organization };
  }>;
  cylinders?: Array<{ serialNumber: string; validUntil: string }>;
  owners?: Array<{ fullName: string; iin?: string }>;
};

export type NotificationRow = {
  id: string;
  userId?: string;
  title: string;
  body: string;
  role?: string;
  readAt?: string;
  createdAt: string;
};

export type CertificateImportJob = {
  id: string;
  status: string;
  filename: string;
  objectKey: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
  finishedAt?: string;
  organizationId?: string;
  organization?: Organization;
  summary?: Record<string, unknown>;
  certificate?: CertificateRow;
  errors?: Array<{ id: string; field?: string; message: string; rawValue?: string }>;
};

export type PublicCertificateCheckRow = {
  id: string;
  plateNumber: string;
  normalizedPlate: string;
  vinLast3: string;
  found: boolean;
  vehicleId?: string;
  certificateId?: string;
  certificateNumber?: string;
  lat?: number;
  lng?: number;
  address?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
};

export type OrganizationActivity = {
  members: NonNullable<Organization['members']>;
  inspections: Inspection[];
  audit: AuditRow[];
  stats?: {
    createdCount: number;
    submittedCount: number;
    publishedCount: number;
  };
};

export type UserActivity = {
  audit: AuditRow[];
  created: Inspection[];
  submitted: Inspection[];
  approved: Inspection[];
};

export async function sendOtp(phone: string) {
  return post<{ ok: boolean; ttlSeconds: number }>('/auth/otp/send', { phone });
}

export async function verifyOtp(phone: string, code: string) {
  return post<AuthResponse>('/auth/otp/verify', {
    phone,
    code,
    deviceName: 'ЕРСИ ГБО Admin Web',
  });
}

export async function refreshAuth(refreshToken: string) {
  return post<AuthResponse>('/auth/refresh', { refreshToken });
}

export async function logoutAuth(token: string) {
  return post<{ ok: boolean }>('/auth/logout', {}, token);
}

export async function importCertificateXlsx(token: string, file: File, organizationBin?: string) {
  const form = new FormData();
  form.append('file', file);
  if (organizationBin) form.append('organizationBin', organizationBin);
  return upload<{ ok: boolean; job: CertificateImportJob; certificate?: CertificateRow }>('/certificates/import-xlsx', form, token);
}

export function getCertificateImportJobs(token: string) {
  return api<CertificateImportJob[] | ListResponse<CertificateImportJob>>('/certificates/import-jobs?limit=50', token)
    .then(asItems);
}

export async function getDashboardData(
  token: string,
  query = '',
  pages: DashboardPages = {},
  options: DashboardOptions = {},
) {
  const q = encodeURIComponent(query.trim());
  const querySuffix = q ? `&q=${q}` : '';
  const registryQuery = q ? q : '';
  const includeManagement = options.includeManagement ?? true;
  const pageQuery = (key: keyof DashboardPages, limit = 50) => `page=${pages[key] ?? 1}&limit=${limit}`;
  const [organizations, inspections, certificates, importJobs, users, audit, registry, publicChecks, notifications] = await Promise.all([
    api<Organization[] | ListResponse<Organization>>(`/organizations?${pageQuery('organizations')}${querySuffix}`, token),
    includeManagement
      ? api<Inspection[] | ListResponse<Inspection>>(`/inspections?${pageQuery('inspections')}${querySuffix}`, token)
      : Promise.resolve([] as Inspection[]),
    api<CertificateRow[] | ListResponse<CertificateRow>>(`/certificates?${pageQuery('certificates')}${querySuffix}`, token),
    includeManagement
      ? api<CertificateImportJob[] | ListResponse<CertificateImportJob>>(`/certificates/import-jobs?${pageQuery('importJobs')}${querySuffix}`, token)
      : Promise.resolve([] as CertificateImportJob[]),
    includeManagement
      ? api<UserRow[] | ListResponse<UserRow>>(`/users?${pageQuery('users')}${querySuffix}`, token)
      : Promise.resolve([] as UserRow[]),
    api<AuditRow[] | ListResponse<AuditRow>>(`/audit?${pageQuery('audit')}`, token),
    api<RegistryVehicle[] | ListResponse<RegistryVehicle>>(`/registry/search?${pageQuery('registry')}&q=${registryQuery}`, token),
    api<PublicCertificateCheckRow[] | ListResponse<PublicCertificateCheckRow>>(`/registry/public-checks?${pageQuery('publicChecks')}&q=${registryQuery}`, token),
    includeManagement
      ? api<NotificationRow[] | ListResponse<NotificationRow>>(`/notifications?${pageQuery('notifications')}${querySuffix}`, token)
      : Promise.resolve([] as NotificationRow[]),
  ]);
  const orgList = asList(organizations, pages.organizations ?? 1);
  const inspectionList = asList(inspections, pages.inspections ?? 1);
  const certificateList = asList(certificates, pages.certificates ?? 1);
  const importJobList = asList(importJobs, pages.importJobs ?? 1);
  const userList = asList(users, pages.users ?? 1);
  const auditList = asList(audit, pages.audit ?? 1);
  const registryList = asList(registry, pages.registry ?? 1);
  const publicCheckList = asList(publicChecks, pages.publicChecks ?? 1);
  const notificationList = asList(notifications, pages.notifications ?? 1);

  return {
    organizations: orgList.items,
    inspections: inspectionList.items,
    certificates: certificateList.items,
    importJobs: importJobList.items,
    users: userList.items,
    audit: auditList.items,
    registry: registryList.items,
    publicChecks: publicCheckList.items,
    notifications: notificationList.items,
    meta: {
      organizations: { total: orgList.total, page: orgList.page, limit: orgList.limit },
      inspections: { total: inspectionList.total, page: inspectionList.page, limit: inspectionList.limit },
      certificates: { total: certificateList.total, page: certificateList.page, limit: certificateList.limit },
      importJobs: { total: importJobList.total, page: importJobList.page, limit: importJobList.limit },
      users: { total: userList.total, page: userList.page, limit: userList.limit },
      audit: { total: auditList.total, page: auditList.page, limit: auditList.limit },
      registry: { total: registryList.total, page: registryList.page, limit: registryList.limit },
      publicChecks: { total: publicCheckList.total, page: publicCheckList.page, limit: publicCheckList.limit },
      notifications: { total: notificationList.total, page: notificationList.page, limit: notificationList.limit },
    },
  };
}

export function getOrganizationDetail(token: string, id: string) {
  return api<Organization & { inspections?: Inspection[] }>(`/organizations/${id}`, token);
}

export function getOrganizationActivity(token: string, id: string) {
  return api<OrganizationActivity>(`/organizations/${id}/activity`, token);
}

export function getOrganizationsPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<Organization[] | ListResponse<Organization>>(`/organizations?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getUserDetail(token: string, id: string) {
  return api<UserRow & { memberships?: Array<{ role: string; organization?: Organization }>; createdInspections?: Inspection[] }>(`/users/${id}`, token);
}

export function getUserActivity(token: string, id: string) {
  return api<UserActivity>(`/users/${id}/activity`, token);
}

export function getUsersPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<UserRow[] | ListResponse<UserRow>>(`/users?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getCertificateImportJob(token: string, id: string) {
  return api<CertificateImportJob>(`/certificates/import-jobs/${id}`, token);
}

export function getCertificateImportJobsPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<CertificateImportJob[] | ListResponse<CertificateImportJob>>(`/certificates/import-jobs?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getCertificateDetail(token: string, number: string) {
  return api<CertificateRow>(`/certificates/${encodeURIComponent(number)}`, token);
}

export function getCertificatesPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<CertificateRow[] | ListResponse<CertificateRow>>(`/certificates?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getInspectionsPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<Inspection[] | ListResponse<Inspection>>(`/inspections?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getInspectionDetail(token: string, id: string) {
  return api<Inspection>(`/inspections/${id}`, token);
}

export function trackView(token: string, entity: 'certificate' | 'organization', entityId: string, title?: string) {
  return post<AuditRow>('/audit/view', { entity, entityId, title }, token);
}

export function getAuditRows(token: string, params: Record<string, string>) {
  const query = new URLSearchParams({ limit: '200', ...cleanParams(params) });
  return api<AuditRow[] | ListResponse<AuditRow>>(`/audit?${query.toString()}`, token).then(asItems);
}

export function getAuditRowsPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<AuditRow[] | ListResponse<AuditRow>>(`/audit?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getPublicCertificateChecks(token: string, params: Record<string, string>) {
  const query = new URLSearchParams({ limit: '200', ...cleanParams(params) });
  return api<PublicCertificateCheckRow[] | ListResponse<PublicCertificateCheckRow>>(`/registry/public-checks?${query.toString()}`, token).then(asItems);
}

export function getPublicCertificateChecksPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const cleaned = cleanParams(params);
  if (cleaned.found === 'found') cleaned.found = 'true';
  if (cleaned.found === 'not_found') cleaned.found = 'false';
  if (cleaned.found === 'all') delete cleaned.found;
  const query = new URLSearchParams({ limit: String(limit), ...cleaned });
  return api<PublicCertificateCheckRow[] | ListResponse<PublicCertificateCheckRow>>(`/registry/public-checks?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

export function getRegistryPage(token: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 50);
  const query = new URLSearchParams({ limit: String(limit), ...cleanParams(params) });
  return api<RegistryVehicle[] | ListResponse<RegistryVehicle>>(`/registry/search?${query.toString()}`, token)
    .then((value) => asList(value, page, limit));
}

function cleanParams(params: Record<string, string>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value.trim().length > 0));
}

export function setOrganizationStatus(token: string, id: string, status: string, reason?: string) {
  return patch<Organization>(`/organizations/${id}/status`, { status, reason }, token);
}

export function createOrganization(token: string, input: {
  type: string;
  name: string;
  bin: string;
  address?: string;
  region?: string;
  contactPhone?: string;
  contactEmail?: string;
  lat?: number;
  lng?: number;
}) {
  return post<Organization>('/organizations', input, token);
}

export function updateOrganization(token: string, id: string, input: {
  name?: string;
  bin?: string;
  address?: string | null;
  region?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}) {
  return patch<Organization>(`/organizations/${id}`, input, token);
}

export function deleteOrganization(token: string, id: string) {
  return del<{ ok: boolean }>(`/organizations/${id}`, token);
}

export function addOrganizationMember(token: string, organizationId: string, input: {
  userId?: string;
  role: string;
  fullName?: string;
  phone?: string;
  iin?: string;
}) {
  return post<Organization>(`/organizations/${organizationId}/members`, input, token);
}

export function removeOrganizationMember(token: string, organizationId: string, memberId: string) {
  return del<Organization>(`/organizations/${organizationId}/members/${memberId}`, token);
}

export function setUserBlocked(token: string, id: string, isBlocked: boolean, reason?: string) {
  return patch<UserRow>(`/users/${id}/block`, { isBlocked, reason }, token);
}

export function createUser(token: string, input: { phone: string; fullName: string; iin?: string; role?: string }) {
  return post<UserRow>('/users', input, token);
}

export function addUserRole(token: string, id: string, role: string) {
  return post<{ role: string }>(`/users/${id}/roles`, { role }, token);
}

export function removeUserRole(token: string, id: string, role: string) {
  return del<{ role: string }>(`/users/${id}/roles/${role}`, token);
}

export function setInspectionStatus(token: string, id: string, status: string) {
  return patch<Inspection>(`/inspections/${id}/status`, { status }, token);
}

export function setCertificateStatus(token: string, number: string, status: string, reason?: string) {
  return patch<CertificateRow>(`/certificates/${number}/status`, { status, reason }, token);
}

export function createInspection(token: string, input: { organizationId: string; vehicleId: string }) {
  return post<Inspection>('/inspections', input, token);
}

export function getBanners(token: string) {
  return api<BannerRow[] | ListResponse<BannerRow>>('/banners', token).then(asItems);
}

export function createBanner(token: string, input: {
  file: File;
  title: string;
  linkUrl: string;
  durationSeconds: string;
  startsAt: string;
  endsAt: string;
}) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('title', input.title);
  form.append('linkUrl', input.linkUrl);
  form.append('durationSeconds', input.durationSeconds);
  form.append('startsAt', input.startsAt);
  form.append('endsAt', input.endsAt);
  return upload<BannerRow>('/banners', form, token);
}

export function setBannerActive(token: string, id: string, isActive: boolean) {
  return patch<BannerRow>(`/banners/${id}/active`, { isActive }, token);
}

export function deleteBanner(token: string, id: string) {
  return del<{ ok: boolean }>(`/banners/${id}`, token);
}

export function getEquipment(token: string) {
  return api<EquipmentItem[] | ListResponse<EquipmentItem>>('/equipment', token).then(asItems);
}

export function createEquipment(token: string, input: { type: EquipmentItem['type']; name: string }) {
  return post<EquipmentItem>('/equipment', input, token);
}

export function updateEquipment(token: string, id: string, input: { type: EquipmentItem['type']; name: string }) {
  return patch<EquipmentItem>(`/equipment/${id}`, input, token);
}

export function setEquipmentActive(token: string, id: string, isActive: boolean) {
  return patch<EquipmentItem>(`/equipment/${id}/active`, { isActive }, token);
}

export function deleteEquipment(token: string, id: string) {
  return del<{ ok: boolean }>(`/equipment/${id}`, token);
}

export function getLegalDocuments(token: string) {
  return api<LegalDocumentRow[] | ListResponse<LegalDocumentRow>>('/legal', token).then(asItems);
}

export function createLegalDocument(token: string, input: { title: string; excerpt: string; body: string }) {
  return post<LegalDocumentRow>('/legal', input, token);
}

export function updateLegalDocument(
  token: string,
  id: string,
  input: Partial<Pick<LegalDocumentRow, 'title' | 'excerpt' | 'body' | 'isActive'>>,
) {
  return patch<LegalDocumentRow>(`/legal/${id}`, input, token);
}

export function deleteLegalDocument(token: string, id: string) {
  return del<{ ok: boolean }>(`/legal/${id}`, token);
}

export function getInspectionReadiness(token: string, id: string) {
  return api<{ ready: boolean; missing: string[]; photoTypes: string[] }>(`/inspections/${id}/readiness`, token);
}

export async function uploadInspectionPhoto(token: string, id: string, type: string, file: File) {
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  const response = await fetch(`${API_URL}/inspections/${id}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw await apiError(response, `/inspections/${id}/photos`);
  }
  return response.json() as Promise<{ id: string; type: string; objectKey: string }>;
}

export function createVehicle(token: string, input: {
  vin: string;
  plateNumber: string;
  make: string;
  model: string;
  owner: { phone: string; fullName: string; iin?: string };
  cylinder: { serialNumber: string; manufacturer: string; volumeLiters: number; validUntil: string };
}) {
  return post<RegistryVehicle>('/vehicles', input, token);
}

export function createNotification(token: string, input: { title: string; body: string; role?: string }) {
  return post<NotificationRow>('/notifications', input, token);
}

export function markNotificationRead(token: string, id: string) {
  return patch<NotificationRow>(`/notifications/${id}/read`, {}, token);
}

export function deleteNotification(token: string, id: string) {
  return del<NotificationRow>(`/notifications/${id}`, token);
}
