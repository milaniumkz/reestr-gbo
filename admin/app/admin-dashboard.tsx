'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AdminUser,
  AuditRow,
  BannerRow,
  CertificateRow,
  CertificateImportJob,
  DashboardPages,
  EquipmentItem,
  Inspection,
  LegalDocumentRow,
  ListMeta,
  NotificationRow,
  Organization,
  OrganizationActivity,
  PublicCertificateCheckRow,
  RegistryVehicle,
  UserRow,
  addUserRole,
  addOrganizationMember,
  createBanner,
  createEquipment,
  createLegalDocument,
  createNotification,
  createOrganization,
  createUser,
  deleteBanner,
  deleteEquipment,
  deleteLegalDocument,
  deleteOrganization,
  deleteNotification,
  getInspectionReadiness,
  getDashboardData,
  getAuditRowsPage,
  getBanners,
  getEquipment,
  getLegalDocuments,
  getInspectionDetail,
  getInspectionsPage,
  getCertificateDetail,
  getCertificatesPage,
  importCertificateXlsx,
  getCertificateImportJob,
  getCertificateImportJobsPage,
  getOrganizationActivity,
  getOrganizationDetail,
  getOrganizationsPage,
  getPublicCertificateChecksPage,
  getRegistryPage,
  getUserActivity,
  getUserDetail,
  getUsersPage,
  logoutAuth,
  markNotificationRead,
  refreshAuth,
  removeUserRole,
  removeOrganizationMember,
  sendOtp,
  setBannerActive,
  setEquipmentActive,
  updateEquipment,
  updateLegalDocument,
  setCertificateStatus,
  setInspectionStatus,
  setOrganizationStatus,
  setUserBlocked,
  trackView,
  updateOrganization,
  verifyOtp,
} from '@/lib/api';
import { AdminShell } from './components/admin-shell';
import { BlocksSection } from './components/blocks-section';
import { AuditLogTable } from './components/audit-log-table';
import { BannersSection } from './components/banners-section';
import { CertificateDetailPanel } from './components/certificate-detail-panel';
import { CertificatesTable } from './components/certificates-table';
import { ControlOrgsSection } from './components/control-orgs-section';
import { DashboardSection } from './components/dashboard-section';
import { EquipmentSection } from './components/equipment-section';
import { InspectionDetailPanel } from './components/inspection-detail-panel';
import { InstallersSection } from './components/installers-section';
import { InspectionsTable } from './components/inspections-table';
import { LegalSection } from './components/legal-section';
import { NotificationsTable } from './components/notifications-table';
import { OrganizationDetailPanel } from './components/organization-detail-panel';
import { OrganizationsTable } from './components/organizations-table';
import { PublicChecksTable } from './components/public-checks-table';
import { RegistryTable } from './components/registry-table';
import { PaginationBar } from './components/ui-primitives';
import { UserDetailPanel } from './components/user-detail-panel';
import { UsersTable } from './components/users-table';
import { XlsxImportsTable } from './components/xlsx-imports-table';
import { roleLabel, statusLabel } from './lib/labels';

const adminRoles = ['operator', 'nca', 'government', 'super_admin'];
const allSystemRoles = ['vehicle_owner', 'inspection_org', 'operator', 'nca', 'government', 'super_admin'];
const limitedSystemRoles = ['vehicle_owner'];
const adminSessionKeys = {
  token: 'ersi_admin_token',
  refreshToken: 'ersi_admin_refresh_token',
  user: 'ersi_admin_user',
};
const nav = [
  'Dashboard',
  'Инспекционные органы',
  'Пользователи и роли',
  'Контрольный орган',
  'Установщики',
  'Баннеры',
  'Оборудование ГБО',
  'Законы',
  'Реестр ТС/ГБО',
  'Проверки свидетельств',
  'Инспекции',
  'Свидетельства',
  'XLSX импорт',
  'Уведомления',
  'Audit log',
  'Блокировки',
];
const governmentNav = [
  'Реестр ТС/ГБО',
  'Проверки свидетельств',
  'Свидетельства',
  'Контрольный орган',
  'Audit log',
];
const pageByNav: Partial<Record<string, keyof DashboardPages>> = {
  'Инспекционные органы': 'organizations',
  'Пользователи и роли': 'users',
  'Реестр ТС/ГБО': 'registry',
  'Проверки свидетельств': 'publicChecks',
  'Инспекции': 'inspections',
  'Свидетельства': 'certificates',
  'XLSX импорт': 'importJobs',
  'Уведомления': 'notifications',
  'Audit log': 'audit',
};
const defaultListMeta: ListMeta = { total: 0, page: 1, limit: 50 };

function normalizeKzPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '+7';
  if (digits.startsWith('7')) return `+${digits}`;
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+7${digits}`;
}

function isSystemNotification(row: NotificationRow) {
  return row.id.includes(':');
}

function isUnauthorizedError(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}

function hasAdminAccess(user: AdminUser) {
  return user.roles.some((role) => adminRoles.includes(role));
}

function readAdminSession() {
  const savedToken = sessionStorage.getItem(adminSessionKeys.token);
  const savedRefresh = sessionStorage.getItem(adminSessionKeys.refreshToken);
  const savedUser = sessionStorage.getItem(adminSessionKeys.user);
  if (!savedToken || !savedUser) return null;
  try {
    const parsedUser = JSON.parse(savedUser) as AdminUser;
    if (!hasAdminAccess(parsedUser)) return null;
    return { token: savedToken, refreshToken: savedRefresh, user: parsedUser };
  } catch {
    return null;
  }
}

function storeAdminSession(accessToken: string, nextRefreshToken: string | null, nextUser: AdminUser) {
  sessionStorage.setItem(adminSessionKeys.token, accessToken);
  if (nextRefreshToken) {
    sessionStorage.setItem(adminSessionKeys.refreshToken, nextRefreshToken);
  } else {
    sessionStorage.removeItem(adminSessionKeys.refreshToken);
  }
  sessionStorage.setItem(adminSessionKeys.user, JSON.stringify(nextUser));
}

function clearAdminSession() {
  for (const key of Object.values(adminSessionKeys)) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}

function clearLegacyAdminSession() {
  for (const key of Object.values(adminSessionKeys)) {
    localStorage.removeItem(key);
  }
}

function uniqueAuditRows(rows: AuditRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function AdminDashboard() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgAccreditationValidFrom, setOrgAccreditationValidFrom] = useState('');
  const [orgAccreditationValidUntil, setOrgAccreditationValidUntil] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgBin, setOrgBin] = useState('');
  const [orgRegion, setOrgRegion] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [orgContactPhone, setOrgContactPhone] = useState('');
  const [orgContactEmail, setOrgContactEmail] = useState('');
  const [orgLat, setOrgLat] = useState('');
  const [orgLng, setOrgLng] = useState('');
  const [orgStatusFilter, setOrgStatusFilter] = useState('all');
  const [orgRegionFilter, setOrgRegionFilter] = useState('');
  const [memberOrgId, setMemberOrgId] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('inspector');
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberIin, setMemberIin] = useState('');
  const [controlOrgName, setControlOrgName] = useState('');
  const [controlOrgBin, setControlOrgBin] = useState('');
  const [controlOrgId, setControlOrgId] = useState('');
  const [controlUserName, setControlUserName] = useState('');
  const [controlUserPhone, setControlUserPhone] = useState('');
  const [controlUserRole, setControlUserRole] = useState('government');
  const [installerName, setInstallerName] = useState('');
  const [installerPhone, setInstallerPhone] = useState('');
  const [installerCity, setInstallerCity] = useState('');
  const [installerAddress, setInstallerAddress] = useState('');
  const [installerLat, setInstallerLat] = useState('');
  const [installerLng, setInstallerLng] = useState('');
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [equipmentType, setEquipmentType] = useState<EquipmentItem['type']>('reducer');
  const [equipmentName, setEquipmentName] = useState('');
  const [legalDocuments, setLegalDocuments] = useState<LegalDocumentRow[]>([]);
  const [legalTitle, setLegalTitle] = useState('');
  const [legalExcerpt, setLegalExcerpt] = useState('');
  const [legalBody, setLegalBody] = useState('');
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerDurationSeconds, setBannerDurationSeconds] = useState('5');
  const [bannerStartsAt, setBannerStartsAt] = useState('');
  const [bannerEndsAt, setBannerEndsAt] = useState('');
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState('all');
  const [inspectionOrganizationFilter, setInspectionOrganizationFilter] = useState('');
  const [inspectionDateFrom, setInspectionDateFrom] = useState('');
  const [inspectionDateTo, setInspectionDateTo] = useState('');
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [importJobs, setImportJobs] = useState<CertificateImportJob[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userIin, setUserIin] = useState('');
  const [userRole, setUserRole] = useState('vehicle_owner');
  const [userPhoneFilter, setUserPhoneFilter] = useState('');
  const [userFullNameFilter, setUserFullNameFilter] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userOrganizationFilter, setUserOrganizationFilter] = useState('');
  const [userLastLoginFrom, setUserLastLoginFrom] = useState('');
  const [userLastLoginTo, setUserLastLoginTo] = useState('');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [registry, setRegistry] = useState<RegistryVehicle[]>([]);
  const [publicChecks, setPublicChecks] = useState<PublicCertificateCheckRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [notificationRole, setNotificationRole] = useState('vehicle_owner');
  const [registryStatusFilter, setRegistryStatusFilter] = useState('all');
  const [registryOrganizationFilter, setRegistryOrganizationFilter] = useState('');
  const [registryDateFrom, setRegistryDateFrom] = useState('');
  const [registryDateTo, setRegistryDateTo] = useState('');
  const [active, setActive] = useState('Dashboard');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<DashboardPages>({});
  const [listMeta, setListMeta] = useState<Record<string, ListMeta>>({});
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedOrganizationActivity, setSelectedOrganizationActivity] = useState<OrganizationActivity | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedUserActivity, setSelectedUserActivity] = useState<{
    audit?: AuditRow[];
    created?: Inspection[];
    submitted?: Inspection[];
    approved?: Inspection[];
  } | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [selectedInspectionAudit, setSelectedInspectionAudit] = useState<AuditRow[]>([]);
  const [selectedImportJob, setSelectedImportJob] = useState<CertificateImportJob | null>(null);
  const [importStatusFilter, setImportStatusFilter] = useState('all');
  const [importOrganizationFilter, setImportOrganizationFilter] = useState('');
  const [importDateFrom, setImportDateFrom] = useState('');
  const [importDateTo, setImportDateTo] = useState('');
  const [selectedCertificate, setSelectedCertificate] = useState<CertificateRow | null>(null);
  const [selectedCertificateAudit, setSelectedCertificateAudit] = useState<AuditRow[]>([]);
  const [selectedCertificateChecks, setSelectedCertificateChecks] = useState<PublicCertificateCheckRow[]>([]);
  const [certificatePlateFilter, setCertificatePlateFilter] = useState('');
  const [certificateVinLast3Filter, setCertificateVinLast3Filter] = useState('');
  const [certificateStatusFilter, setCertificateStatusFilter] = useState('all');
  const [certificateOrganizationFilter, setCertificateOrganizationFilter] = useState('');
  const [certificateDateFrom, setCertificateDateFrom] = useState('');
  const [certificateDateTo, setCertificateDateTo] = useState('');
  const [publicFoundFilter, setPublicFoundFilter] = useState('all');
  const [publicPlateFilter, setPublicPlateFilter] = useState('');
  const [publicCertificateFilter, setPublicCertificateFilter] = useState('');
  const [publicDateFrom, setPublicDateFrom] = useState('');
  const [publicDateTo, setPublicDateTo] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditOrganizationFilter, setAuditOrganizationFilter] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const isAdmin = useMemo(
    () => Boolean(user && hasAdminAccess(user)),
    [user],
  );
  const canManage = useMemo(
    () => Boolean(user?.roles.some((role) => ['operator', 'nca', 'super_admin'].includes(role))),
    [user],
  );
  const canGrantSystemRoles = Boolean(user?.roles.includes('super_admin'));
  const roleOptions = canGrantSystemRoles ? allSystemRoles : limitedSystemRoles;
  const isReadOnly = !canManage;
  const availableNav = useMemo(() => {
    if (!user?.roles.includes('government') || canManage) return nav;
    return governmentNav;
  }, [canManage, user]);
  const dashboardOptions = useMemo(
    () => ({ includeManagement: canManage || !user?.roles.includes('government') }),
    [canManage, user],
  );
  const currentActive = availableNav.includes(active) ? active : availableNav[0];

  function closeDetails() {
    setSelectedOrganization(null);
    setSelectedOrganizationActivity(null);
    setSelectedUser(null);
    setSelectedUserActivity(null);
    setSelectedInspection(null);
    setSelectedInspectionAudit([]);
    setSelectedImportJob(null);
    setSelectedCertificate(null);
    setSelectedCertificateAudit([]);
    setSelectedCertificateChecks([]);
  }

  function changeActive(value: string) {
    closeDetails();
    setActive(value);
  }

  useEffect(() => {
    clearLegacyAdminSession();
    const saved = readAdminSession();
    if (saved) {
      setToken(saved.token);
      setRefreshToken(saved.refreshToken);
      setUser(saved.user);
    }
  }, []);

  useEffect(() => {
    if (!token || !isAdmin) return;
    const timeout = window.setTimeout(() => {
      getDashboardData(token, query, pages, dashboardOptions)
        .then((data) => {
          applyDashboardData(data);
        })
        .catch(async (err) => {
          if (isUnauthorizedError(err)) {
            await refreshSession();
            return;
          }
          setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [token, isAdmin, query, pages, dashboardOptions]);

  useEffect(() => {
    setPages({});
  }, [query]);

  useEffect(() => {
    if (!availableNav.includes(active)) {
      setActive(availableNav[0]);
    }
  }, [active, availableNav]);

  async function handleSendOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await sendOtp(normalizeKzPhone(phone));
      setOtpSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка отправки SMS';
      if (message.includes('OTP resend cooldown')) {
        setOtpSent(true);
        setStatus('SMS-код уже отправлен. Введите полученный код.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await verifyOtp(normalizeKzPhone(phone), code);
      if (!hasAdminAccess(response.user)) {
        await logoutAuth(response.accessToken).catch(() => undefined);
        clearAdminSession();
        setToken(null);
        setRefreshToken(null);
        setUser(null);
        setError('Нет доступа: нужна роль оператора, НЦА, контрольного органа или суперадминистратора.');
        return;
      }
      storeAdminSession(response.accessToken, response.refreshToken, response.user);
      setToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      setUser(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (token) await logoutAuth(token).catch(() => undefined);
    clearAdminSession();
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrganizations([]);
    setInspections([]);
    setCertificates([]);
    setImportJobs([]);
    setUsers([]);
    setAudit([]);
    setRegistry([]);
    setPublicChecks([]);
    setNotifications([]);
    setBanners([]);
    setEquipment([]);
    setLegalDocuments([]);
  }

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDashboardData(token, query, pages, dashboardOptions).catch(async (err) => {
        if (!isUnauthorizedError(err)) throw err;
        const nextToken = await refreshSession();
        if (!nextToken) throw new Error('Session expired');
        return getDashboardData(nextToken, query, pages, dashboardOptions);
      });
      applyDashboardData(data);
      const [nextBanners, nextEquipment, nextLegalDocuments] = await Promise.all([
        getBanners(token),
        getEquipment(token),
        getLegalDocuments(token),
      ]);
      setBanners(nextBanners);
      setEquipment(nextEquipment);
      setLegalDocuments(nextLegalDocuments);
      setStatus('Данные обновлены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }

  function applyDashboardData(data: Awaited<ReturnType<typeof getDashboardData>>) {
    setOrganizations(data.organizations);
    setInspections(data.inspections);
    setCertificates(data.certificates);
    setImportJobs(data.importJobs);
    setUsers(data.users);
    setAudit(data.audit);
    setRegistry(data.registry);
    setPublicChecks(data.publicChecks);
    setNotifications(data.notifications);
    setListMeta(data.meta);
    if (token) getBanners(token).then(setBanners).catch(() => undefined);
    if (token) getEquipment(token).then(setEquipment).catch(() => undefined);
    if (token) getLegalDocuments(token).then(setLegalDocuments).catch(() => undefined);
  }

  async function loadPage(key: keyof DashboardPages, page: number) {
    if (!token || page < 1) return;
    await runAction('Страница загружена', async () => {
      if (key === 'publicChecks') {
        const result = await getPublicCertificateChecksPage(token, {
          q: query,
          found: publicFoundFilter === 'all' ? '' : publicFoundFilter === 'found' ? 'true' : 'false',
          plate: publicPlateFilter,
          certificateNumber: publicCertificateFilter,
          dateFrom: publicDateFrom,
          dateTo: publicDateTo,
          page: String(page),
          limit: '50',
        });
        setPublicChecks(result.items);
        setPages((current) => ({ ...current, publicChecks: result.page }));
        setListMeta((current) => ({ ...current, publicChecks: result }));
        return;
      }
      if (key === 'audit') {
        const actorSearch = users.length ? '' : auditActorFilter.trim();
        const auditQuery = [query.trim(), actorSearch].filter(Boolean).join(' ');
        const result = await getAuditRowsPage(token, {
          q: auditQuery,
          entity: auditEntityFilter,
          action: auditActionFilter,
          actorId: users.length ? auditActorFilter : '',
          organizationId: auditOrganizationFilter,
          dateFrom: auditDateFrom,
          dateTo: auditDateTo,
          page: String(page),
          limit: '50',
        });
        setAudit(result.items);
        setPages((current) => ({ ...current, audit: result.page }));
        setListMeta((current) => ({ ...current, audit: result }));
        return;
      }
      if (key === 'certificates') {
        const result = await getCertificatesPage(token, {
          q: query,
          plateNumber: certificatePlateFilter,
          vinLast3: certificateVinLast3Filter,
          status: certificateStatusFilter,
          organizationId: certificateOrganizationFilter,
          dateFrom: certificateDateFrom,
          dateTo: certificateDateTo,
          page: String(page),
          limit: '50',
        });
        setCertificates(result.items);
        setPages((current) => ({ ...current, certificates: result.page }));
        setListMeta((current) => ({ ...current, certificates: result }));
        return;
      }
      if (key === 'users') {
        const result = await getUsersPage(token, {
          q: query,
          phone: userPhoneFilter,
          fullName: userFullNameFilter,
          role: userRoleFilter,
          status: userStatusFilter,
          organizationId: userOrganizationFilter,
          lastLoginFrom: userLastLoginFrom,
          lastLoginTo: userLastLoginTo,
          page: String(page),
          limit: '50',
        });
        setUsers(result.items);
        setPages((current) => ({ ...current, users: result.page }));
        setListMeta((current) => ({ ...current, users: result }));
        return;
      }
      if (key === 'organizations') {
        const result = await getOrganizationsPage(token, {
          q: query,
          status: orgStatusFilter,
          region: orgRegionFilter,
          page: String(page),
          limit: '50',
        });
        setOrganizations(result.items);
        setPages((current) => ({ ...current, organizations: result.page }));
        setListMeta((current) => ({ ...current, organizations: result }));
        return;
      }
      if (key === 'inspections') {
        const result = await getInspectionsPage(token, {
          q: query,
          status: inspectionStatusFilter,
          organizationId: inspectionOrganizationFilter,
          dateFrom: inspectionDateFrom,
          dateTo: inspectionDateTo,
          page: String(page),
          limit: '50',
        });
        setInspections(result.items);
        setPages((current) => ({ ...current, inspections: result.page }));
        setListMeta((current) => ({ ...current, inspections: result }));
        return;
      }
      if (key === 'importJobs') {
        const result = await getCertificateImportJobsPage(token, {
          q: query,
          status: importStatusFilter,
          organizationId: importOrganizationFilter,
          dateFrom: importDateFrom,
          dateTo: importDateTo,
          page: String(page),
          limit: '50',
        });
        setImportJobs(result.items);
        setPages((current) => ({ ...current, importJobs: result.page }));
        setListMeta((current) => ({ ...current, importJobs: result }));
        return;
      }
      if (key === 'registry') {
        const result = await getRegistryPage(token, {
          q: query,
          status: registryStatusFilter,
          organizationId: registryOrganizationFilter,
          dateFrom: registryDateFrom,
          dateTo: registryDateTo,
          page: String(page),
          limit: '50',
        });
        setRegistry(result.items);
        setPages((current) => ({ ...current, registry: result.page }));
        setListMeta((current) => ({ ...current, registry: result }));
        return;
      }
      const nextPages = { ...pages, [key]: page };
      const data = await getDashboardData(token, query, nextPages, dashboardOptions);
      setPages(nextPages);
      applyDashboardData(data);
    });
  }

  async function refreshSession() {
    if (!refreshToken) {
      logout();
      return null;
    }
    try {
      const response = await refreshAuth(refreshToken);
      if (!hasAdminAccess(response.user)) {
        await logoutAuth(response.accessToken).catch(() => undefined);
        await logout();
        return null;
      }
      storeAdminSession(response.accessToken, response.refreshToken, response.user);
      setToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      setUser(response.user);
      setError('');
      return response.accessToken;
    } catch {
      await logout();
      return null;
    }
  }

  async function runAction(successMessage: string, action: () => Promise<void>) {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка операции');
    } finally {
      setLoading(false);
    }
  }

  async function openOrganization(row: Organization) {
    if (!token) return;
    await runAction('Карточка ИО открыта', async () => {
      const [detail, activity] = await Promise.all([
        getOrganizationDetail(token, row.id),
        getOrganizationActivity(token, row.id),
      ]);
      closeDetails();
      setSelectedOrganization(detail);
      setSelectedOrganizationActivity(activity);
      await trackView(token, 'organization', detail.id, detail.name).catch(() => undefined);
    });
  }

  async function reloadSelectedOrganization(organizationId: string) {
    if (!token) return;
    const [detail, activity] = await Promise.all([
      getOrganizationDetail(token, organizationId),
      getOrganizationActivity(token, organizationId),
    ]);
    setSelectedOrganization(detail);
    setSelectedOrganizationActivity(activity);
  }

  async function openUser(row: UserRow) {
    if (!token) return;
    await runAction('Карточка пользователя открыта', async () => {
      const [detail, activity] = await Promise.all([
        getUserDetail(token, row.id),
        getUserActivity(token, row.id),
      ]);
      closeDetails();
      setSelectedUser(detail);
      setSelectedUserActivity(activity);
    });
  }

  async function openImportJob(row: CertificateImportJob) {
    if (!token) return;
    await runAction('Результат импорта открыт', async () => {
      const detail = await getCertificateImportJob(token, row.id);
      closeDetails();
      setSelectedImportJob(detail);
    });
  }

  async function openCertificate(row: CertificateRow) {
    if (!token) return;
    await openCertificateNumber(row.number);
  }

  async function openCertificateNumber(number: string) {
    if (!token) return;
    await runAction('Карточка свидетельства открыта', async () => {
      const detail = await getCertificateDetail(token, number);
      const [auditByNumber, auditById, checks] = await Promise.all([
        getAuditRowsPage(token, { entity: 'certificate', entityId: detail.number, page: '1', limit: '50' }),
        getAuditRowsPage(token, { entity: 'certificate', entityId: detail.id, page: '1', limit: '50' }),
        getPublicCertificateChecksPage(token, { certificateNumber: detail.number, page: '1', limit: '20' }),
      ]);
      closeDetails();
      setSelectedCertificate(detail);
      setSelectedCertificateAudit(uniqueAuditRows([...auditByNumber.items, ...auditById.items]));
      setSelectedCertificateChecks(checks.items);
      await trackView(token, 'certificate', detail.id, detail.number).catch(() => undefined);
    });
  }

  async function applyCertificateFilters() {
    if (!token) return;
    await runAction('Свидетельства отфильтрованы', async () => {
      const result = await getCertificatesPage(token, {
        q: query,
        plateNumber: certificatePlateFilter,
        vinLast3: certificateVinLast3Filter,
        status: certificateStatusFilter,
        organizationId: certificateOrganizationFilter,
        dateFrom: certificateDateFrom,
        dateTo: certificateDateTo,
        page: '1',
        limit: '50',
      });
      setCertificates(result.items);
      setPages((current) => ({ ...current, certificates: 1 }));
      setListMeta((current) => ({ ...current, certificates: result }));
    });
  }

  async function resetCertificateFilters() {
    setCertificatePlateFilter('');
    setCertificateVinLast3Filter('');
    setCertificateStatusFilter('all');
    setCertificateOrganizationFilter('');
    setCertificateDateFrom('');
    setCertificateDateTo('');
    if (!token) return;
    await runAction('Фильтры свидетельств сброшены', async () => {
      const result = await getCertificatesPage(token, { q: query, page: '1', limit: '50' });
      setCertificates(result.items);
      setPages((current) => ({ ...current, certificates: 1 }));
      setListMeta((current) => ({ ...current, certificates: result }));
    });
  }

  async function applyImportFilters() {
    if (!token) return;
    await runAction('XLSX импорты отфильтрованы', async () => {
      const result = await getCertificateImportJobsPage(token, {
        q: query,
        status: importStatusFilter,
        organizationId: importOrganizationFilter,
        dateFrom: importDateFrom,
        dateTo: importDateTo,
        page: '1',
        limit: '50',
      });
      setImportJobs(result.items);
      setPages((current) => ({ ...current, importJobs: 1 }));
      setListMeta((current) => ({ ...current, importJobs: result }));
    });
  }

  async function resetImportFilters() {
    setImportStatusFilter('all');
    setImportOrganizationFilter('');
    setImportDateFrom('');
    setImportDateTo('');
    if (!token) return;
    await runAction('Фильтры XLSX сброшены', async () => {
      const result = await getCertificateImportJobsPage(token, { q: query, page: '1', limit: '50' });
      setImportJobs(result.items);
      setPages((current) => ({ ...current, importJobs: 1 }));
      setListMeta((current) => ({ ...current, importJobs: result }));
    });
  }

  async function applyRegistryFilters() {
    if (!token) return;
    await runAction('Реестр отфильтрован', async () => {
      const result = await getRegistryPage(token, {
        q: query,
        status: registryStatusFilter,
        organizationId: registryOrganizationFilter,
        dateFrom: registryDateFrom,
        dateTo: registryDateTo,
        page: '1',
        limit: '50',
      });
      setRegistry(result.items);
      setPages((current) => ({ ...current, registry: 1 }));
      setListMeta((current) => ({ ...current, registry: result }));
    });
  }

  async function resetRegistryFilters() {
    setRegistryStatusFilter('all');
    setRegistryOrganizationFilter('');
    setRegistryDateFrom('');
    setRegistryDateTo('');
    if (!token) return;
    await runAction('Фильтры реестра сброшены', async () => {
      const result = await getRegistryPage(token, { q: query, page: '1', limit: '50' });
      setRegistry(result.items);
      setPages((current) => ({ ...current, registry: 1 }));
      setListMeta((current) => ({ ...current, registry: result }));
    });
  }

  async function applyUserFilters() {
    if (!token) return;
    await runAction('Пользователи отфильтрованы', async () => {
      const result = await getUsersPage(token, {
        q: query,
        phone: userPhoneFilter,
        fullName: userFullNameFilter,
        role: userRoleFilter,
        status: userStatusFilter,
        organizationId: userOrganizationFilter,
        lastLoginFrom: userLastLoginFrom,
        lastLoginTo: userLastLoginTo,
        page: '1',
        limit: '50',
      });
      setUsers(result.items);
      setPages((current) => ({ ...current, users: 1 }));
      setListMeta((current) => ({ ...current, users: result }));
    });
  }

  async function resetUserFilters() {
    setUserRoleFilter('');
    setUserPhoneFilter('');
    setUserFullNameFilter('');
    setUserStatusFilter('all');
    setUserOrganizationFilter('');
    setUserLastLoginFrom('');
    setUserLastLoginTo('');
    if (!token) return;
    await runAction('Фильтры пользователей сброшены', async () => {
      const result = await getUsersPage(token, { q: query, page: '1', limit: '50' });
      setUsers(result.items);
      setPages((current) => ({ ...current, users: 1 }));
      setListMeta((current) => ({ ...current, users: result }));
    });
  }

  async function applyOrganizationFilters() {
    if (!token) return;
    await runAction('Организации отфильтрованы', async () => {
      const result = await getOrganizationsPage(token, {
        q: query,
        status: orgStatusFilter,
        region: orgRegionFilter,
        page: '1',
        limit: '50',
      });
      setOrganizations(result.items);
      setPages((current) => ({ ...current, organizations: 1 }));
      setListMeta((current) => ({ ...current, organizations: result }));
    });
  }

  async function resetOrganizationFilters() {
    setOrgStatusFilter('all');
    setOrgRegionFilter('');
    if (!token) return;
    await runAction('Фильтры организаций сброшены', async () => {
      const result = await getOrganizationsPage(token, { q: query, page: '1', limit: '50' });
      setOrganizations(result.items);
      setPages((current) => ({ ...current, organizations: 1 }));
      setListMeta((current) => ({ ...current, organizations: result }));
    });
  }

  async function applyInspectionFilters() {
    if (!token) return;
    await runAction('Инспекции отфильтрованы', async () => {
      const result = await getInspectionsPage(token, {
        q: query,
        status: inspectionStatusFilter,
        organizationId: inspectionOrganizationFilter,
        dateFrom: inspectionDateFrom,
        dateTo: inspectionDateTo,
        page: '1',
        limit: '50',
      });
      setInspections(result.items);
      setPages((current) => ({ ...current, inspections: 1 }));
      setListMeta((current) => ({ ...current, inspections: result }));
    });
  }

  async function resetInspectionFilters() {
    setInspectionStatusFilter('all');
    setInspectionOrganizationFilter('');
    setInspectionDateFrom('');
    setInspectionDateTo('');
    if (!token) return;
    await runAction('Фильтры инспекций сброшены', async () => {
      const result = await getInspectionsPage(token, { q: query, page: '1', limit: '50' });
      setInspections(result.items);
      setPages((current) => ({ ...current, inspections: 1 }));
      setListMeta((current) => ({ ...current, inspections: result }));
    });
  }

  async function openInspection(row: Inspection) {
    if (!token) return;
    await runAction('Карточка инспекции открыта', async () => {
      const [detail, auditRows] = await Promise.all([
        getInspectionDetail(token, row.id),
        getAuditRowsPage(token, { entity: 'inspection', entityId: row.id, page: '1', limit: '50' }),
      ]);
      closeDetails();
      setSelectedInspection(detail);
      setSelectedInspectionAudit(auditRows.items);
    });
  }

  async function applyPublicCheckFilters() {
    if (!token) return;
    await runAction('Проверки отфильтрованы', async () => {
      const result = await getPublicCertificateChecksPage(token, {
        q: query,
        found: publicFoundFilter === 'all' ? '' : publicFoundFilter === 'found' ? 'true' : 'false',
        plate: publicPlateFilter,
        certificateNumber: publicCertificateFilter,
        dateFrom: publicDateFrom,
        dateTo: publicDateTo,
        page: '1',
        limit: '50',
      });
      setPublicChecks(result.items);
      setPages((current) => ({ ...current, publicChecks: 1 }));
      setListMeta((current) => ({ ...current, publicChecks: result }));
    });
  }

  async function resetPublicCheckFilters() {
    setPublicFoundFilter('all');
    setPublicPlateFilter('');
    setPublicCertificateFilter('');
    setPublicDateFrom('');
    setPublicDateTo('');
    if (!token) return;
    await runAction('Фильтры проверок сброшены', async () => {
      const result = await getPublicCertificateChecksPage(token, { q: query, page: '1', limit: '50' });
      setPublicChecks(result.items);
      setPages((current) => ({ ...current, publicChecks: 1 }));
      setListMeta((current) => ({ ...current, publicChecks: result }));
    });
  }

  async function applyAuditFilters() {
    if (!token) return;
    await runAction('Audit отфильтрован', async () => {
      const actorSearch = users.length ? '' : auditActorFilter.trim();
      const auditQuery = [query.trim(), actorSearch].filter(Boolean).join(' ');
      const result = await getAuditRowsPage(token, {
        q: auditQuery,
        entity: auditEntityFilter,
        action: auditActionFilter,
        actorId: users.length ? auditActorFilter : '',
        organizationId: auditOrganizationFilter,
        dateFrom: auditDateFrom,
        dateTo: auditDateTo,
        page: '1',
        limit: '50',
      });
      setAudit(result.items);
      setPages((current) => ({ ...current, audit: 1 }));
      setListMeta((current) => ({ ...current, audit: result }));
    });
  }

  async function resetAuditFilters() {
    setAuditEntityFilter('');
    setAuditActionFilter('');
    setAuditActorFilter('');
    setAuditOrganizationFilter('');
    setAuditDateFrom('');
    setAuditDateTo('');
    if (!token) return;
    await runAction('Фильтры audit сброшены', async () => {
      const result = await getAuditRowsPage(token, { q: query, page: '1', limit: '50' });
      setAudit(result.items);
      setPages((current) => ({ ...current, audit: 1 }));
      setListMeta((current) => ({ ...current, audit: result }));
    });
  }

  async function submitOrganization(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!orgName.trim() || !orgBin.trim()) {
      setStatus('');
      setError('Укажите название и БИН инспекционного органа.');
      return;
    }
    const latValue = orgLat.trim();
    const lngValue = orgLng.trim();
    if ((latValue && !Number.isFinite(Number(latValue))) || (lngValue && !Number.isFinite(Number(lngValue)))) {
      setStatus('');
      setError('Координаты ИО должны быть числами.');
      return;
    }
    await runAction('Инспекционный орган создан', async () => {
      await createOrganization(token, {
        type: 'inspection_org',
        name: orgName,
        bin: orgBin,
        region: orgRegion,
        address: orgAddress,
        contactPhone: orgContactPhone,
        contactEmail: orgContactEmail,
        accreditationValidFrom: orgAccreditationValidFrom,
        accreditationValidUntil: orgAccreditationValidUntil,
        lat: latValue ? Number(latValue) : undefined,
        lng: lngValue ? Number(lngValue) : undefined,
      });
      setOrgName('');
      setOrgBin('');
      setOrgRegion('');
      setOrgAddress('');
      setOrgContactPhone('');
      setOrgContactEmail('');
      setOrgAccreditationValidFrom('');
      setOrgAccreditationValidUntil('');
      setOrgLat('');
      setOrgLng('');
      await refresh();
    });
  }

  async function submitOrganizationMember(event: FormEvent) {
    event.preventDefault();
    const organizationId = memberOrgId;
    if (!token) return;
    if (!organizationId) {
      setStatus('');
      setError('Выберите инспекционный орган для участника.');
      return;
    }
    if (!memberRole) {
      setStatus('');
      setError('Выберите роль участника ИО.');
      return;
    }
    if (!memberUserId && (!memberName.trim() || !memberPhone.trim())) {
      setStatus('');
      setError('Для нового участника укажите ФИО и телефон.');
      return;
    }
    await runAction('Участник добавлен', async () => {
      await addOrganizationMember(token, organizationId, memberUserId
        ? { userId: memberUserId, role: memberRole }
        : {
            role: memberRole,
            fullName: memberName,
            phone: memberPhone,
            iin: memberIin,
          });
      setMemberOrgId('');
      setMemberUserId('');
      setMemberRole('inspector');
      setMemberName('');
      setMemberPhone('');
      setMemberIin('');
      await refresh();
    });
  }

  async function submitControlOrganization(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!controlOrgName.trim() || !controlOrgBin.trim()) {
      setStatus('');
      setError('Укажите название и БИН контрольного органа.');
      return;
    }
    await runAction('Контрольный орган создан', async () => {
      await createOrganization(token, {
        type: 'government',
        name: controlOrgName,
        bin: controlOrgBin,
      });
      setControlOrgName('');
      setControlOrgBin('');
      await refresh();
    });
  }

  async function submitControlPhone(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!controlOrgId) {
      setStatus('');
      setError('Выберите контрольный орган.');
      return;
    }
    if (!controlUserName.trim() || !controlUserPhone.trim()) {
      setStatus('');
      setError('Укажите ФИО и телефон контрольного органа.');
      return;
    }
    await runAction('Номер контрольного органа добавлен', async () => {
      await addOrganizationMember(token, controlOrgId, {
        role: controlUserRole,
        fullName: controlUserName,
        phone: controlUserPhone,
      });
      setControlOrgId('');
      setControlUserName('');
      setControlUserPhone('');
      setControlUserRole('government');
      await refresh();
    });
  }

  async function submitInstaller(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!installerName.trim() || !installerPhone.trim() || !installerCity.trim() || !installerAddress.trim()) {
      setStatus('');
      setError('Укажите наименование, телефон, город и адрес установщика.');
      return;
    }
    if (!Number.isFinite(Number(installerLat)) || !Number.isFinite(Number(installerLng))) {
      setStatus('');
      setError('Укажите точку установщика на карте.');
      return;
    }
    await runAction('Установщик добавлен', async () => {
      await createOrganization(token, {
        type: 'installer',
        name: installerName,
        bin: `INSTALLER-${Date.now()}`,
        region: installerCity,
        address: installerAddress,
        contactPhone: installerPhone,
        lat: Number(installerLat),
        lng: Number(installerLng),
      });
      setInstallerName('');
      setInstallerPhone('');
      setInstallerCity('');
      setInstallerAddress('');
      setInstallerLat('');
      setInstallerLng('');
      await refresh();
    });
  }

  async function submitBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      setStatus('');
      setError('Загрузите фотографию баннера.');
      return;
    }
    await runAction('Баннер загружен', async () => {
      await createBanner(token, {
        file,
        title: bannerTitle,
        linkUrl: bannerLinkUrl,
        durationSeconds: bannerDurationSeconds,
        startsAt: bannerStartsAt,
        endsAt: bannerEndsAt,
      });
      setBannerTitle('');
      setBannerLinkUrl('');
      setBannerDurationSeconds('5');
      setBannerStartsAt('');
      setBannerEndsAt('');
      setBanners(await getBanners(token));
      formEl.reset();
    });
  }

  async function toggleBanner(row: BannerRow) {
    if (!token) return;
    await runAction(row.isActive ? 'Баннер скрыт' : 'Баннер активирован', async () => {
      await setBannerActive(token, row.id, !row.isActive);
      setBanners(await getBanners(token));
    });
  }

  async function removeBanner(row: BannerRow) {
    if (!token) return;
    if (!window.confirm(`Удалить баннер "${row.title}"?`)) return;
    await runAction('Баннер удален', async () => {
      await deleteBanner(token, row.id);
      setBanners(await getBanners(token));
    });
  }

  async function submitEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    await runAction('Оборудование добавлено', async () => {
      await createEquipment(token, {
        type: equipmentType,
        name: equipmentName,
      });
      setEquipmentName('');
      setEquipment(await getEquipment(token));
    });
  }

  async function toggleEquipment(row: EquipmentItem) {
    if (!token) return;
    await runAction(row.isActive ? 'Оборудование скрыто' : 'Оборудование активно', async () => {
      await setEquipmentActive(token, row.id, !row.isActive);
      setEquipment(await getEquipment(token));
    });
  }

  async function editEquipment(row: EquipmentItem) {
    if (!token) return;
    const nextName = window.prompt('Новое название', row.name)?.trim();
    if (!nextName || nextName === row.name) return;
    await runAction('Оборудование обновлено', async () => {
      await updateEquipment(token, row.id, { type: row.type, name: nextName });
      setEquipment(await getEquipment(token));
    });
  }

  async function removeEquipment(row: EquipmentItem) {
    if (!token) return;
    if (!window.confirm(`Удалить "${row.name}"?`)) return;
    await runAction('Оборудование удалено', async () => {
      await deleteEquipment(token, row.id);
      setEquipment(await getEquipment(token));
    });
  }

  async function submitLegalDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    await runAction('Закон добавлен', async () => {
      await createLegalDocument(token, {
        title: legalTitle,
        excerpt: legalExcerpt,
        body: legalBody,
      });
      setLegalTitle('');
      setLegalExcerpt('');
      setLegalBody('');
      setLegalDocuments(await getLegalDocuments(token));
    });
  }

  async function toggleLegalDocument(row: LegalDocumentRow) {
    if (!token) return;
    await runAction(row.isActive ? 'Закон скрыт' : 'Закон активирован', async () => {
      await updateLegalDocument(token, row.id, { isActive: !row.isActive });
      setLegalDocuments(await getLegalDocuments(token));
    });
  }

  async function removeLegalDocument(row: LegalDocumentRow) {
    if (!token) return;
    if (!window.confirm(`Удалить "${row.title}"?`)) return;
    await runAction('Закон удален', async () => {
      await deleteLegalDocument(token, row.id);
      setLegalDocuments(await getLegalDocuments(token));
    });
  }

  async function removeOrganization(row: Organization) {
    if (!token) return;
    if (!window.confirm(`Удалить "${row.name}"?`)) return;
    await runAction('Организация удалена', async () => {
      await deleteOrganization(token, row.id);
      if (selectedOrganization?.id === row.id) closeDetails();
      await refresh();
    });
  }

  async function addSelectedOrganizationMember(input: {
    userId?: string;
    role: string;
    fullName?: string;
    phone?: string;
    iin?: string;
  }) {
    if (!token || !selectedOrganization) return;
    if (!input.userId && (!input.fullName?.trim() || !input.phone?.trim())) {
      setStatus('');
      setError('Для нового участника укажите ФИО и телефон.');
      return;
    }
    await runAction('Участник добавлен', async () => {
      await addOrganizationMember(token, selectedOrganization.id, input);
      await Promise.all([refresh(), reloadSelectedOrganization(selectedOrganization.id)]);
    });
  }

  async function deleteOrganizationMember(org: Organization, memberId: string) {
    if (!token) return;
    if (!window.confirm('Удалить участника/номер доступа?')) return;
    await runAction('Участник удален', async () => {
      await removeOrganizationMember(token, org.id, memberId);
      await refresh();
      if (selectedOrganization?.id === org.id) {
        await reloadSelectedOrganization(org.id);
      }
    });
  }

  function requireBlockReason(isBlocking: boolean) {
    if (!isBlocking) return true;
    if (blockReason.trim()) return true;
    setStatus('');
    setError('Укажите причину блокировки.');
    return false;
  }

  async function toggleOrg(org: Organization) {
    if (!token) return;
    const nextStatus = org.status === 'blocked' ? 'active' : 'blocked';
    if (!requireBlockReason(nextStatus === 'blocked')) return;
    await runAction('Статус ИО обновлен', async () => {
      await setOrganizationStatus(token, org.id, nextStatus, blockReason);
      setBlockReason('');
      await refresh();
    });
  }

  async function saveOrganization(org: Organization, input: {
    name: string;
    bin: string;
    region: string;
    address: string;
    contactPhone: string;
    contactEmail: string;
    accreditationValidFrom: string;
    accreditationValidUntil: string;
    lat: string;
    lng: string;
  }) {
    if (!token) return;
    await runAction('Инспекционный орган обновлен', async () => {
      const updated = await updateOrganization(token, org.id, {
        name: input.name,
        bin: input.bin,
        region: input.region || null,
        address: input.address || null,
        contactPhone: input.contactPhone || null,
        contactEmail: input.contactEmail || null,
        ...(org.type === "inspection_org" ? {
          accreditationValidFrom: input.accreditationValidFrom,
          accreditationValidUntil: input.accreditationValidUntil,
        } : {}),
        lat: input.lat || null,
        lng: input.lng || null,
      });
      setSelectedOrganization({ ...org, ...updated });
      await refresh();
    });
  }

  async function toggleUser(row: UserRow) {
    if (!token) return;
    const nextBlocked = !row.isBlocked;
    if (!requireBlockReason(nextBlocked)) return;
    await runAction('Статус пользователя обновлен', async () => {
      await setUserBlocked(token, row.id, nextBlocked, blockReason);
      setBlockReason('');
      await refresh();
    });
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault();
    if (!token || !userName || !userPhone) return;
    await runAction('Пользователь сохранен', async () => {
      await createUser(token, {
        fullName: userName,
        phone: userPhone,
        iin: userIin,
        role: userRole,
      });
      setUserName('');
      setUserPhone('');
      setUserIin('');
      setUserRole('vehicle_owner');
      await refresh();
    });
  }

  async function grantUserRole(row: UserRow, role: string) {
    if (!token) return;
    await runAction(`Роль ${role} выдана`, async () => {
      await addUserRole(token, row.id, role);
      await refresh();
    });
  }

  async function revokeUserRole(row: UserRow, role: string) {
    if (!token) return;
    await runAction(`Роль ${role} снята`, async () => {
      await removeUserRole(token, row.id, role);
      await refresh();
    });
  }

  async function changeInspectionStatus(row: Inspection, status: string) {
    if (!token) return;
    await runAction('Статус инспекции обновлен', async () => {
      await setInspectionStatus(token, row.id, status);
      await refresh();
    });
  }

  async function changeCertificateStatus(row: CertificateRow, status: string) {
    if (!token) return;
    if (!requireBlockReason(status !== 'active')) return;
    await runAction('Статус свидетельства обновлен', async () => {
      await setCertificateStatus(token, row.number, status, blockReason);
      setBlockReason('');
      await refresh();
    });
  }

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const organizationBin = String(form.get('organizationBin') ?? '').trim();
    if (!(file instanceof File) || !file.name) return;
    await runAction('XLSX импортирован', async () => {
      const result = await importCertificateXlsx(token, file, organizationBin);
      if (result.job?.status === 'failed') {
        throw new Error(result.job.errors?.map((item) => item.message).join(', ') || 'Ошибка импорта XLSX');
      }
      event.currentTarget.reset();
      await refresh();
      if (result.job) setSelectedImportJob(result.job);
    });
  }

  async function checkInspection(row: Inspection) {
    if (!token) return;
    await runAction('Готовность проверена', async () => {
      const result = await getInspectionReadiness(token, row.id);
      setStatus(result.ready ? 'Инспекция готова' : `Не хватает: ${result.missing.join(', ')}`);
    });
  }

  async function submitNotification(event: FormEvent) {
    event.preventDefault();
    if (!token || !notificationTitle || !notificationBody) return;
    await runAction('Уведомление создано', async () => {
      await createNotification(token, {
        title: notificationTitle,
        body: notificationBody,
        role: notificationRole,
      });
      setNotificationTitle('');
      setNotificationBody('');
      await refresh();
    });
  }

  async function readNotification(row: NotificationRow) {
    if (!token || isSystemNotification(row)) return;
    await runAction('Уведомление отмечено прочитанным', async () => {
      await markNotificationRead(token, row.id);
      await refresh();
    });
  }

  async function removeNotification(row: NotificationRow) {
    if (!token || isSystemNotification(row)) return;
    await runAction('Уведомление удалено', async () => {
      await deleteNotification(token, row.id);
      await refresh();
    });
  }

  function currentExportRows() {
    const filtered = filterState(query, {
      organizations,
      inspections,
      certificates,
      importJobs,
      users,
      audit,
      registry,
      publicChecks,
      notifications,
    });
    return exportRows(currentActive, {
      organizations: filtered.organizations,
      inspections: filtered.inspections,
      certificates: filtered.certificates,
      importJobs: filtered.importJobs,
      users: filtered.users,
      audit: filtered.audit,
      registry: filtered.registry,
      publicChecks: filtered.publicChecks,
      notifications: filtered.notifications,
    });
  }

  function exportCsv() {
    const rows = currentExportRows();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ersi-${exportFileSlug(currentActive)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    const rows = currentExportRows();
    if (!rows.length) return;
    const xlsx = makeXlsx(rows, currentActive);
    const url = URL.createObjectURL(xlsx);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ersi-${exportFileSlug(currentActive)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!token || !user) {
    return (
      <main className="loginPage">
        <form className="loginCard" onSubmit={otpSent ? handleVerify : handleSendOtp}>
          <div className="brand dark">ЕРСИ ГБО</div>
          <h1>Вход в админку</h1>
          <label>
            Телефон
            <input value={phone} onChange={(event) => setPhone(normalizeKzPhone(event.target.value))} />
          </label>
          {otpSent && (
            <label>
              SMS-код
              <input value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Подождите...' : otpSent ? 'Войти' : 'Получить SMS'}</button>
        </form>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="loginPage">
        <section className="loginCard">
          <div className="brand dark">ЕРСИ ГБО</div>
          <h1>Нет доступа</h1>
          <p>У пользователя нет роли оператора, НЦА, контрольного органа или суперадминистратора.</p>
          <button type="button" onClick={logout}>Выйти</button>
        </section>
      </main>
    );
  }

  const filtered = filterState(query, {
    organizations,
    inspections,
    certificates,
    importJobs,
    users,
    audit,
    registry,
    publicChecks,
    notifications,
  });
  const controlOrganizations = filtered.organizations.filter((org) =>
    ['government', 'nca'].includes(org.type),
  );
  const installerOrganizations = filtered.organizations.filter((org) =>
    org.type === 'installer',
  );
  const detailOpen = Boolean(
    selectedOrganization ||
    selectedUser ||
    selectedInspection ||
    selectedImportJob ||
    selectedCertificate,
  );
  const activePageKey = pageByNav[currentActive];
  const activeMeta = activePageKey ? (listMeta[activePageKey] ?? defaultListMeta) : null;

  return (
    <AdminShell
      navItems={availableNav}
      active={currentActive}
      userPhone={user.phone}
      userRoles={user.roles}
      query={query}
      loading={loading}
      onActive={changeActive}
      onQuery={setQuery}
      onExportCsv={exportCsv}
      onExportXlsx={exportXlsx}
      onRefresh={refresh}
      onLogout={logout}
    >

        {error && <div className="error wide">{error}</div>}
        {status && !error && <div className="success wide">{status}</div>}
        {activePageKey && activeMeta && (
          <PaginationBar
            meta={activeMeta}
            onPrev={() => loadPage(activePageKey, activeMeta.page - 1)}
            onNext={() => loadPage(activePageKey, activeMeta.page + 1)}
          />
        )}

        {selectedOrganization && (
          <OrganizationDetailPanel
            organization={selectedOrganization}
            activity={selectedOrganizationActivity}
            users={users}
            canManage={canManage}
            onSave={saveOrganization}
            onAddMember={addSelectedOrganizationMember}
            onRemoveMember={deleteOrganizationMember}
            onClose={closeDetails}
          />
        )}
        {selectedUser && (
          <UserDetailPanel
            user={selectedUser}
            activity={selectedUserActivity}
            onClose={closeDetails}
          />
        )}
        {selectedCertificate && (
          <CertificateDetailPanel
            certificate={selectedCertificate}
            audit={selectedCertificateAudit}
            checks={selectedCertificateChecks}
            onClose={closeDetails}
          />
        )}
        {selectedInspection && (
          <InspectionDetailPanel
            inspection={selectedInspection}
            audit={selectedInspectionAudit}
            onClose={closeDetails}
          />
        )}
        {selectedImportJob && (
          <XlsxImportsTable
            importJobs={importJobs}
            organizations={organizations}
            canManage={canManage}
            selected={selectedImportJob}
            statusFilter={importStatusFilter}
            organizationFilter={importOrganizationFilter}
            dateFrom={importDateFrom}
            dateTo={importDateTo}
            onStatusFilter={setImportStatusFilter}
            onOrganizationFilter={setImportOrganizationFilter}
            onDateFrom={setImportDateFrom}
            onDateTo={setImportDateTo}
            onApplyFilters={applyImportFilters}
            onResetFilters={resetImportFilters}
            onUpload={uploadCertificate}
            onOpen={openImportJob}
            onOpenCertificate={openCertificate}
            onClose={closeDetails}
          />
        )}

        {!detailOpen && currentActive === 'Dashboard' && (
          <DashboardSection
            organizations={filtered.organizations}
            inspectionsCount={inspections.length}
            importJobsCount={importJobs.length}
            registryCount={registry.length}
            listMeta={listMeta}
            canManage={canManage}
            onToggleOrganization={toggleOrg}
          />
        )}
        {!detailOpen && currentActive === 'Инспекционные органы' && (
          <OrganizationsTable
            organizations={filtered.organizations}
            users={users}
            canManage={canManage}
            name={orgName}
            bin={orgBin}
            region={orgRegion}
            address={orgAddress}
            contactPhone={orgContactPhone}
            contactEmail={orgContactEmail}
            accreditationValidFrom={orgAccreditationValidFrom}
            accreditationValidUntil={orgAccreditationValidUntil}
            onAccreditationValidFrom={setOrgAccreditationValidFrom}
            onAccreditationValidUntil={setOrgAccreditationValidUntil}
            lat={orgLat}
            lng={orgLng}
            memberOrgId={memberOrgId}
            memberUserId={memberUserId}
            memberRole={memberRole}
            memberName={memberName}
            memberPhone={memberPhone}
            memberIin={memberIin}
            statusFilter={orgStatusFilter}
            regionFilter={orgRegionFilter}
            onName={setOrgName}
            onBin={setOrgBin}
            onRegion={setOrgRegion}
            onAddress={setOrgAddress}
            onContactPhone={setOrgContactPhone}
            onContactEmail={setOrgContactEmail}
            onLat={setOrgLat}
            onLng={setOrgLng}
            onMemberOrgId={setMemberOrgId}
            onMemberUserId={setMemberUserId}
            onMemberRole={setMemberRole}
            onMemberName={setMemberName}
            onMemberPhone={setMemberPhone}
            onMemberIin={setMemberIin}
            onStatusFilter={setOrgStatusFilter}
            onRegionFilter={setOrgRegionFilter}
            onApplyFilters={applyOrganizationFilters}
            onResetFilters={resetOrganizationFilters}
            onSubmit={submitOrganization}
            onRemoveMember={deleteOrganizationMember}
            onToggle={toggleOrg}
            onOpen={openOrganization}
          />
        )}
        {!detailOpen && currentActive === 'Контрольный орган' && (
          <ControlOrgsSection
            organizations={controlOrganizations}
            name={controlOrgName}
            bin={controlOrgBin}
            phone={controlUserPhone}
            fullName={controlUserName}
            role={controlUserRole}
            organizationId={controlOrgId}
            onName={setControlOrgName}
            onBin={setControlOrgBin}
            onPhone={setControlUserPhone}
            onFullName={setControlUserName}
            onRole={setControlUserRole}
            onOrganizationId={setControlOrgId}
            onCreate={submitControlOrganization}
            onAddPhone={submitControlPhone}
            onOpen={openOrganization}
            onDelete={removeOrganization}
            onRemoveMember={deleteOrganizationMember}
          />
        )}
        {!detailOpen && currentActive === 'Установщики' && (
          <InstallersSection
            installers={installerOrganizations}
            name={installerName}
            phone={installerPhone}
            city={installerCity}
            address={installerAddress}
            lat={installerLat}
            lng={installerLng}
            onName={setInstallerName}
            onPhone={setInstallerPhone}
            onCity={setInstallerCity}
            onAddress={setInstallerAddress}
            onLat={setInstallerLat}
            onLng={setInstallerLng}
            onSubmit={submitInstaller}
            onOpen={openOrganization}
            onDelete={removeOrganization}
          />
        )}
        {!detailOpen && currentActive === 'Баннеры' && (
          <BannersSection
            banners={banners}
            title={bannerTitle}
            linkUrl={bannerLinkUrl}
            durationSeconds={bannerDurationSeconds}
            startsAt={bannerStartsAt}
            endsAt={bannerEndsAt}
            onTitle={setBannerTitle}
            onLinkUrl={setBannerLinkUrl}
            onDurationSeconds={setBannerDurationSeconds}
            onStartsAt={setBannerStartsAt}
            onEndsAt={setBannerEndsAt}
            onSubmit={submitBanner}
            onToggle={toggleBanner}
            onDelete={removeBanner}
          />
        )}
        {!detailOpen && currentActive === 'Оборудование ГБО' && (
          <EquipmentSection
            items={equipment}
            type={equipmentType}
            name={equipmentName}
            onType={setEquipmentType}
            onName={setEquipmentName}
            onSubmit={submitEquipment}
            onEdit={editEquipment}
            onToggle={toggleEquipment}
            onDelete={removeEquipment}
          />
        )}
        {!detailOpen && currentActive === 'Законы' && (
          <LegalSection
            items={legalDocuments}
            title={legalTitle}
            excerpt={legalExcerpt}
            body={legalBody}
            onTitle={setLegalTitle}
            onExcerpt={setLegalExcerpt}
            onBody={setLegalBody}
            onSubmit={submitLegalDocument}
            onToggle={toggleLegalDocument}
            onDelete={removeLegalDocument}
          />
        )}
        {!detailOpen && currentActive === 'Пользователи и роли' && (
          <UsersTable
            users={filtered.users}
            organizations={organizations}
            canManage={canManage}
            name={userName}
            phone={userPhone}
            iin={userIin}
            role={userRole}
            phoneFilter={userPhoneFilter}
            fullNameFilter={userFullNameFilter}
            roleFilter={userRoleFilter}
            statusFilter={userStatusFilter}
            organizationFilter={userOrganizationFilter}
            lastLoginFrom={userLastLoginFrom}
            lastLoginTo={userLastLoginTo}
            filterRoleOptions={allSystemRoles}
            roleOptions={roleOptions}
            canGrantSystemRoles={canGrantSystemRoles}
            onName={setUserName}
            onPhone={setUserPhone}
            onIin={setUserIin}
            onRole={setUserRole}
            onPhoneFilter={setUserPhoneFilter}
            onFullNameFilter={setUserFullNameFilter}
            onRoleFilter={setUserRoleFilter}
            onStatusFilter={setUserStatusFilter}
            onOrganizationFilter={setUserOrganizationFilter}
            onLastLoginFrom={setUserLastLoginFrom}
            onLastLoginTo={setUserLastLoginTo}
            onApplyFilters={applyUserFilters}
            onResetFilters={resetUserFilters}
            onSubmit={submitUser}
            onToggle={toggleUser}
            onGrantRole={grantUserRole}
            onRevokeRole={revokeUserRole}
            onOpen={openUser}
          />
        )}
        {!detailOpen && currentActive === 'Реестр ТС/ГБО' && (
          <RegistryTable
            rows={filtered.registry}
            organizations={organizations}
            statusFilter={registryStatusFilter}
            organizationFilter={registryOrganizationFilter}
            dateFrom={registryDateFrom}
            dateTo={registryDateTo}
            onStatusFilter={setRegistryStatusFilter}
            onOrganizationFilter={setRegistryOrganizationFilter}
            onDateFrom={setRegistryDateFrom}
            onDateTo={setRegistryDateTo}
            onApplyFilters={applyRegistryFilters}
            onResetFilters={resetRegistryFilters}
            onOpenCertificate={openCertificateNumber}
          />
        )}
        {!detailOpen && currentActive === 'Проверки свидетельств' && (
          <PublicChecksTable
            rows={filtered.publicChecks}
            found={publicFoundFilter}
            onFound={setPublicFoundFilter}
            plate={publicPlateFilter}
            certificateNumber={publicCertificateFilter}
            dateFrom={publicDateFrom}
            dateTo={publicDateTo}
            onPlate={setPublicPlateFilter}
            onCertificateNumber={setPublicCertificateFilter}
            onDateFrom={setPublicDateFrom}
            onDateTo={setPublicDateTo}
            onApply={applyPublicCheckFilters}
            onReset={resetPublicCheckFilters}
            onOpenCertificate={openCertificateNumber}
          />
        )}
        {!detailOpen && currentActive === 'Инспекции' && (
          <InspectionsTable
            inspections={filtered.inspections}
            organizations={organizations}
            canManage={canManage}
            statusFilter={inspectionStatusFilter}
            organizationFilter={inspectionOrganizationFilter}
            dateFrom={inspectionDateFrom}
            dateTo={inspectionDateTo}
            onStatusFilter={setInspectionStatusFilter}
            onOrganizationFilter={setInspectionOrganizationFilter}
            onDateFrom={setInspectionDateFrom}
            onDateTo={setInspectionDateTo}
            onApplyFilters={applyInspectionFilters}
            onResetFilters={resetInspectionFilters}
            onStatusChange={changeInspectionStatus}
            onCheck={checkInspection}
            onOpen={openInspection}
            onOpenCertificate={openCertificateNumber}
          />
        )}
        {!detailOpen && currentActive === 'Свидетельства' && (
          <CertificatesTable
            rows={filtered.certificates}
            organizations={organizations}
            canManage={canManage}
            plate={certificatePlateFilter}
            vinLast3={certificateVinLast3Filter}
            status={certificateStatusFilter}
            organizationId={certificateOrganizationFilter}
            dateFrom={certificateDateFrom}
            dateTo={certificateDateTo}
            onPlate={setCertificatePlateFilter}
            onVinLast3={setCertificateVinLast3Filter}
            onStatus={setCertificateStatusFilter}
            onOrganizationId={setCertificateOrganizationFilter}
            onDateFrom={setCertificateDateFrom}
            onDateTo={setCertificateDateTo}
            onApplyFilters={applyCertificateFilters}
            onResetFilters={resetCertificateFilters}
            onStatusChange={changeCertificateStatus}
            onOpen={openCertificate}
          />
        )}
        {!detailOpen && currentActive === 'XLSX импорт' && (
          <XlsxImportsTable
            importJobs={importJobs}
            organizations={organizations}
            canManage={canManage}
            selected={selectedImportJob}
            statusFilter={importStatusFilter}
            organizationFilter={importOrganizationFilter}
            dateFrom={importDateFrom}
            dateTo={importDateTo}
            onStatusFilter={setImportStatusFilter}
            onOrganizationFilter={setImportOrganizationFilter}
            onDateFrom={setImportDateFrom}
            onDateTo={setImportDateTo}
            onApplyFilters={applyImportFilters}
            onResetFilters={resetImportFilters}
            onUpload={uploadCertificate}
            onOpen={openImportJob}
            onOpenCertificate={openCertificate}
            onClose={closeDetails}
          />
        )}
        {!detailOpen && currentActive === 'Уведомления' && (
          <NotificationsTable
            rows={filtered.notifications}
            canManage={canManage}
            title={notificationTitle}
            body={notificationBody}
            role={notificationRole}
            onTitle={setNotificationTitle}
            onBody={setNotificationBody}
            onRole={setNotificationRole}
            onSubmit={submitNotification}
            onRead={readNotification}
            onDelete={removeNotification}
          />
        )}
        {!detailOpen && currentActive === 'Audit log' && (
          <AuditLogTable
            rows={filtered.audit}
            entity={auditEntityFilter}
            action={auditActionFilter}
            actorId={auditActorFilter}
            organizationId={auditOrganizationFilter}
            dateFrom={auditDateFrom}
            dateTo={auditDateTo}
            users={users}
            organizations={organizations}
            onEntity={setAuditEntityFilter}
            onAction={setAuditActionFilter}
            onActorId={setAuditActorFilter}
            onOrganizationId={setAuditOrganizationFilter}
            onDateFrom={setAuditDateFrom}
            onDateTo={setAuditDateTo}
            onApply={applyAuditFilters}
            onReset={resetAuditFilters}
          />
        )}
        {!detailOpen && currentActive === 'Блокировки' && (
          <BlocksSection
            organizations={filtered.organizations}
            users={filtered.users}
            certificates={filtered.certificates}
            audit={audit}
            canManage={canManage}
            reason={blockReason}
            onReason={setBlockReason}
            onToggleOrganization={toggleOrg}
            onToggleUser={toggleUser}
            onToggleCertificate={(certificate) => changeCertificateStatus(certificate, certificate.status === 'active' ? 'suspended' : 'active')}
            onOpenOrganization={openOrganization}
            onOpenUser={openUser}
            onOpenCertificate={openCertificate}
          />
        )}
    </AdminShell>
  );
}

type ExportState = {
  organizations: Organization[];
  inspections: Inspection[];
  certificates: CertificateRow[];
  importJobs: CertificateImportJob[];
  users: UserRow[];
  audit: AuditRow[];
  registry: RegistryVehicle[];
  publicChecks: PublicCertificateCheckRow[];
  notifications: NotificationRow[];
};

function filterState(query: string, data: ExportState): ExportState {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return data;
  const includes = (...values: Array<unknown>) =>
    values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
  return {
    organizations: data.organizations.filter((row) =>
      includes(
        row.name,
        row.bin,
        row.region,
        row.status,
        row.members?.map((member) => `${member.user?.fullName} ${member.user?.phone} ${member.role}`).join(' '),
      ),
    ),
    inspections: data.inspections.filter((row) =>
      includes(row.status, row.vehicle?.vin, row.organization?.name, row.certificate?.number),
    ),
    certificates: data.certificates.filter((row) =>
      includes(
        row.number,
        row.status,
        row.vehicle?.vin,
        row.vehicle?.plateNumber,
        row.inspection?.organization?.name,
      ),
    ),
    importJobs: data.importJobs.filter((row) =>
      includes(row.filename, row.objectKey, row.status, row.certificate?.number, row.summary ? JSON.stringify(row.summary) : ''),
    ),
    users: data.users.filter((row) =>
      includes(
        row.fullName,
        row.phone,
        row.iin,
        row.roles.map((item) => item.role).join(' '),
        row.memberships?.map((item) => `${item.organization?.name} ${item.organization?.bin} ${item.role}`).join(' '),
      ),
    ),
    audit: data.audit.filter((row) =>
      includes(row.action, row.entity, row.entityId, row.actor?.phone, row.actor?.fullName),
    ),
    registry: data.registry.filter((row) =>
      includes(
        row.vin,
        row.plateNumber,
        row.make,
        row.model,
        row.owners?.[0]?.fullName,
        row.certificates?.[0]?.number,
        row.cylinders?.[0]?.serialNumber,
      ),
    ),
    publicChecks: data.publicChecks.filter((row) =>
      includes(
        row.plateNumber,
        row.normalizedPlate,
        row.vinLast3,
        row.certificateNumber,
        row.address,
        row.ipAddress,
        row.userAgent,
        row.found ? 'найдено found success' : 'не найдено not found failed',
      ),
    ),
    notifications: data.notifications.filter((row) =>
      includes(row.title, row.body, row.role, row.readAt ? 'read' : 'new'),
    ),
  };
}

function exportRows(active: string, data: ExportState): Array<Record<string, string | number>> {
  if (active === 'Инспекционные органы' || active === 'Dashboard') {
    return data.organizations.map((row) => ({
      name: row.name,
      bin: row.bin,
      region: row.region ?? '',
      address: row.address ?? '',
      contactPhone: row.contactPhone ?? '',
      contactEmail: row.contactEmail ?? '',
      accreditationValidFrom: row.accreditationValidFrom?.slice(0, 10) ?? '',
      accreditationValidUntil: row.accreditationValidUntil?.slice(0, 10) ?? '',
      lat: row.lat ?? '',
      lng: row.lng ?? '',
      status: statusLabel(row.status),
      members: row.members?.length ?? 0,
    }));
  }
  if (active === 'Пользователи и роли') {
    return data.users.map((row) => ({
      fullName: row.fullName,
      phone: row.phone,
      iin: row.iin ?? '',
      roles: row.roles.map((item) => roleLabel(item.role)).join('; '),
      organizations: row.memberships?.map((item) => `${item.organization?.name ?? ''} ${roleLabel(item.role)}`.trim()).filter(Boolean).join('; ') ?? '',
      lastLoginAt: row.lastLoginAt ?? '',
      status: statusLabel(row.isBlocked ? 'blocked' : 'active'),
    }));
  }
  if (active === 'Реестр ТС/ГБО') {
    return data.registry.map((row) => ({
      vin: row.vin,
      plateNumber: row.plateNumber,
      vehicle: `${row.make} ${row.model}`,
      owner: row.owners?.[0]?.fullName ?? '',
      ownerIin: row.owners?.[0]?.iin ?? '',
      certificate: row.certificates?.[0]?.number ?? '',
      certificateStatus: statusLabel(row.certificates?.[0]?.status),
      certificateValidUntil: row.certificates?.[0]?.validUntil ?? '',
      organization: row.certificates?.[0]?.inspection?.organization?.name ?? '',
      cylinder: row.cylinders?.[0]?.serialNumber ?? '',
      cylinderValidUntil: row.cylinders?.[0]?.validUntil ?? '',
    }));
  }
  if (active === 'Проверки свидетельств') {
    return data.publicChecks.map((row) => ({
      createdAt: row.createdAt,
      plateNumber: row.plateNumber,
      normalizedPlate: row.normalizedPlate,
      vinLast3: row.vinLast3,
      result: row.found ? 'найдено' : 'не найдено',
      certificateNumber: row.certificateNumber ?? '',
      certificateId: row.certificateId ?? '',
      vehicleId: row.vehicleId ?? '',
      lat: row.lat ?? '',
      lng: row.lng ?? '',
      address: row.address ?? '',
      ipAddress: row.ipAddress ?? '',
      userAgent: row.userAgent ?? '',
    }));
  }
  if (active === 'Инспекции') {
    return data.inspections.map((row) => ({
      vin: row.vehicle?.vin ?? '',
      plateNumber: row.vehicle?.plateNumber ?? '',
      owner: row.vehicle?.owners?.[0]?.fullName ?? '',
      organization: row.organization?.name ?? '',
      createdBy: row.createdBy ? `${row.createdBy.fullName} ${row.createdBy.phone}`.trim() : '',
      submittedBy: row.submittedBy ? `${row.submittedBy.fullName} ${row.submittedBy.phone}`.trim() : '',
      approvedBy: row.approvedBy ? `${row.approvedBy.fullName} ${row.approvedBy.phone}`.trim() : '',
      status: statusLabel(row.status),
      files: row.photos?.length ?? 0,
      ownerAddress: row.vehicle?.owners?.[0]?.address ?? '',
      inspectionAddress: row.address ?? '',
      inspectionLat: row.lat ?? '',
      inspectionLng: row.lng ?? '',
      autoPublishAt: row.autoPublishAt ?? '',
      certificate: row.certificate?.number ?? row.certificateNumber ?? '',
      createdAt: row.createdAt,
      submittedAt: row.submittedAt ?? '',
      approvedAt: row.approvedAt ?? '',
    }));
  }
  if (active === 'Свидетельства') {
    return data.certificates.map((row) => ({
      number: row.number,
      status: statusLabel(row.status),
      vin: row.vehicle?.vin ?? '',
      plateNumber: row.vehicle?.plateNumber ?? '',
      vehicle: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : '',
      owner: row.vehicle?.owners?.[0]?.fullName ?? '',
      ownerIin: row.vehicle?.owners?.[0]?.iin ?? '',
      organization: row.inspection?.organization?.name ?? '',
      organizationBin: row.inspection?.organization?.bin ?? '',
      issuedAt: row.issuedAt,
      validUntil: row.validUntil,
      views: row._count?.views ?? 0,
    }));
  }
  if (active === 'XLSX импорт') {
    return data.importJobs.map((row) => ({
      filename: row.filename,
      objectKey: row.objectKey,
      status: statusLabel(row.status),
      organization: row.organization?.name ?? row.organizationId ?? '',
      certificate: row.certificate?.number ?? '',
      created: row.createdCount,
      updated: row.updatedCount,
      skipped: row.skippedCount,
      errors: row.errorCount,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt ?? '',
      summary: row.summary ? JSON.stringify(row.summary) : '',
      errorDetails: row.errors?.map((item) => [item.field, item.message, item.rawValue].filter(Boolean).join(': ')).join('; ') ?? '',
    }));
  }
  if (active === 'Уведомления') {
    return data.notifications.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      role: roleLabel(row.role),
      userId: row.userId ?? '',
      status: statusLabel(row.readAt ? 'read' : 'new'),
      readAt: row.readAt ?? '',
      createdAt: row.createdAt,
    }));
  }
  if (active === 'Audit log') {
    return data.audit.map((row) => ({
      createdAt: row.createdAt,
      actor: row.actor ? `${row.actor.fullName} ${row.actor.phone}`.trim() : '',
      roles: row.actor?.roles?.map((item) => roleLabel(item.role)).join('; ') ?? '',
      action: row.action,
      entity: row.entity,
      entityId: row.entityId ?? '',
      ipAddress: row.ipAddress ?? '',
      metadata: row.metadata ? JSON.stringify(row.metadata) : '',
    }));
  }
  if (active === 'Блокировки') {
    return [
      ...data.organizations.filter((item) => item.status === 'blocked').map((row) => {
        const info = exportBlockAudit(data.audit, 'organization', row.id);
        return {
          type: 'organization',
          name: row.name,
          id: row.id,
          status: statusLabel(row.status),
          reason: info.reason,
          blockedBy: info.actor,
          blockedAt: info.createdAt,
        };
      }),
      ...data.users.filter((item) => item.isBlocked).map((row) => {
        const info = exportBlockAudit(data.audit, 'user', row.id);
        return {
          type: 'user',
          name: row.fullName,
          id: row.id,
          status: statusLabel('blocked'),
          reason: info.reason,
          blockedBy: info.actor,
          blockedAt: info.createdAt,
        };
      }),
      ...data.certificates.filter((item) => item.status !== 'active').map((row) => {
        const info = exportCertificateRestrictionAudit(data.audit, row);
        return {
          type: 'certificate',
          name: row.number,
          id: row.id,
          status: statusLabel(row.status),
          reason: info.reason,
          blockedBy: info.actor,
          blockedAt: info.createdAt,
        };
      }),
    ];
  }
  return [];
}

function exportBlockAudit(audit: AuditRow[], entity: string, entityId: string) {
  const row = latestExportAudit(audit, (item) =>
    item.entity === entity && item.entityId === entityId && item.action.endsWith('.block')
  );
  return exportAuditInfo(row);
}

function exportCertificateRestrictionAudit(audit: AuditRow[], certificate: CertificateRow) {
  const row = latestExportAudit(audit, (item) =>
    item.entity === 'certificate' &&
    (item.entityId === certificate.number || item.entityId === certificate.id) &&
    item.action === 'certificate.status.update'
  );
  return exportAuditInfo(row);
}

function latestExportAudit(audit: AuditRow[], predicate: (item: AuditRow) => boolean) {
  return audit
    .filter(predicate)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function exportAuditInfo(row?: AuditRow) {
  const reason = row?.metadata?.reason;
  return {
    reason: typeof reason === 'string' ? reason : '',
    actor: row?.actor ? `${row.actor.fullName} ${row.actor.phone}`.trim() : '',
    createdAt: row?.createdAt ?? '',
  };
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportFileSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^0-9a-zа-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'export';
}

function makeXlsx(rows: Array<Record<string, string | number>>, sheetName: string) {
  const headers = Object.keys(rows[0]);
  const sheetRows = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    sheetRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${
      row.map((value, colIndex) => {
        const cellRef = `${excelColumn(colIndex + 1)}${rowIndex + 1}`;
        if (typeof value === 'number' && Number.isFinite(value)) {
          return `<c r="${cellRef}"><v>${value}</v></c>`;
        }
        return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
      }).join('')
    }</row>`).join('')
  }</sheetData></worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName.slice(0, 31) || 'Export')}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return new Blob([zipFiles({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/workbook.xml': workbookXml,
    'xl/worksheets/sheet1.xml': sheetXml,
  })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function excelColumn(index: number) {
  let result = '';
  while (index > 0) {
    index -= 1;
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26);
  }
  return result;
}

function xmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function zipFiles(files: Record<string, string>) {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => ({
    name,
    nameBytes: encoder.encode(name),
    data: encoder.encode(content),
  }));
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const crc = crc32(entry.data);
    const local = zipHeader(0x04034b50, entry.nameBytes, entry.data.length, crc, offset);
    chunks.push(local, entry.data);
    central.push(zipHeader(0x02014b50, entry.nameBytes, entry.data.length, crc, offset));
    offset += local.length + entry.data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return new Blob([...chunks, ...central, end].map(blobPart));
}

function blobPart(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function zipHeader(signature: number, nameBytes: Uint8Array, size: number, crc: number, offset: number) {
  const isCentral = signature === 0x02014b50;
  const header = new Uint8Array((isCentral ? 46 : 30) + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, signature, true);
  if (isCentral) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, offset, true);
    header.set(nameBytes, 46);
  } else {
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
  }
  return header;
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function coords(lat?: number, lng?: number) {
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '-';
}
