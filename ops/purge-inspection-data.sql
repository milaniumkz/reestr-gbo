\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "Organization", "Inspection", "Certificate", "CertificateImportJob", "Payment", "ApiToken", "PublicCertificateCheck" IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE purge_orgs ON COMMIT DROP AS SELECT id FROM "Organization" WHERE type = 'inspection_org';
CREATE TEMP TABLE purge_inspections ON COMMIT DROP AS SELECT id FROM "Inspection" WHERE "organizationId" IN (SELECT id FROM purge_orgs);
CREATE TEMP TABLE purge_summary ON COMMIT DROP AS SELECT jsonb_build_object(
 'organizations', (SELECT count(*) FROM purge_orgs),
 'inspections', (SELECT count(*) FROM purge_inspections),
 'certificates', (SELECT count(*) FROM "Certificate"),
 'memberships', (SELECT count(*) FROM "OrganizationMember" WHERE "organizationId" IN (SELECT id FROM purge_orgs)),
 'balanceAmount', (SELECT coalesce(sum(amount),0) FROM "Balance" WHERE "organizationId" IN (SELECT id FROM purge_orgs)),
 'usersPreserved', (SELECT count(*) FROM "User"),
 'vehiclesPreserved', (SELECT count(*) FROM "Vehicle"),
 'otherOrganizationsPreserved', (SELECT count(*) FROM "Organization" WHERE type <> 'inspection_org')
) AS counts;
SELECT counts AS before FROM purge_summary;
DELETE FROM "PublicCertificateCheck" WHERE "certificateId" IN (SELECT id FROM "Certificate") OR "certificateNumber" IN (SELECT number FROM "Certificate");
DELETE FROM "CertificateImportJob" WHERE "organizationId" IN (SELECT id FROM purge_orgs) OR "certificateId" IN (SELECT id FROM "Certificate");
DELETE FROM "Certificate";
DELETE FROM "Inspection" WHERE id IN (SELECT id FROM purge_inspections);
DELETE FROM "Payment" WHERE "organizationId" IN (SELECT id FROM purge_orgs);
DELETE FROM "ApiToken" WHERE "organizationId" IN (SELECT id FROM purge_orgs);
DELETE FROM "Organization" WHERE id IN (SELECT id FROM purge_orgs);
INSERT INTO "AuditLog" (id,action,entity,metadata,"createdAt") SELECT gen_random_uuid()::text,'production.purge_inspection_orgs_and_all_certificates','Organization',counts,now() FROM purge_summary;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Organization" WHERE type='inspection_org') OR EXISTS (SELECT 1 FROM "Certificate") THEN
  RAISE EXCEPTION 'Purge postcondition failed';
 END IF;
END $$;
SELECT jsonb_build_object('inspectionOrganizations', (SELECT count(*) FROM "Organization" WHERE type='inspection_org'), 'certificates', (SELECT count(*) FROM "Certificate"), 'users', (SELECT count(*) FROM "User"), 'vehicles', (SELECT count(*) FROM "Vehicle"), 'otherOrganizations', (SELECT count(*) FROM "Organization" WHERE type<>'inspection_org')) AS after;
COMMIT;
