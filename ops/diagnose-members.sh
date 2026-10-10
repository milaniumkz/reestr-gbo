#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}" 'bash -se' <<'REMOTE'
set -a
source /opt/reestr/app/backend/.env
set +a
psql "${DATABASE_URL%%\?*}" -X -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT json_build_object('orgId',o.id,'name',o.name,'members',(SELECT count(*) FROM "OrganizationMember" m WHERE m."organizationId"=o.id),'additions',count(a.id),'distinctAdditions',count(DISTINCT (a.metadata->>'userId',a.metadata->>'role')) FILTER (WHERE a.id IS NOT NULL),'lastAddition',max(a."createdAt")) FROM "Organization" o LEFT JOIN "AuditLog" a ON a."entityId"=o.id AND a.action='organization.member.add' AND a."createdAt">now()-interval '1 day' WHERE o.type='inspection_org' GROUP BY o.id,o.name;
SELECT json_build_object('orgId','login-summary','name','Login membership','members',count(*),'additions',count(*) FILTER (WHERE u.phone ~ '^\+7[0-9]{10}$'),'distinctAdditions',count(*) FILTER (WHERE o.status='active' AND NOT u."isBlocked" AND m.role IN ('inspection_org','inspector','admin','quality_control')),'lastAddition',NULL) FROM "OrganizationMember" m JOIN "User" u ON u.id=m."userId" JOIN "Organization" o ON o.id=m."organizationId" WHERE o.type='inspection_org';
SELECT json_build_object('orgId','login-role-'||m.role,'name','role='||m.role||'; org='||o.status,'members',count(*),'additions',count(*) FILTER (WHERE u.phone ~ '^\+7[0-9]{10}$'),'distinctAdditions',count(*) FILTER (WHERE NOT u."isBlocked"),'lastAddition',NULL) FROM "OrganizationMember" m JOIN "User" u ON u.id=m."userId" JOIN "Organization" o ON o.id=m."organizationId" WHERE o.type='inspection_org' GROUP BY m.role,o.status;
SELECT json_build_object('orgId','login-denials','name','Recent login denials','members',count(*),'additions',count(*) FILTER (WHERE a."actorId" IS NOT NULL),'distinctAdditions',count(DISTINCT a."entityId"),'lastAddition',max(a."createdAt")) FROM "AuditLog" a WHERE a.action='auth.inspection_otp_denied' AND a."createdAt">now()-interval '2 hours';

SQL
python3 - <<'PYCODE'
import collections, json, re
counts=collections.Counter()
last=None
with open('/var/log/nginx/access.log') as log:
    for line in log:
        match=re.search(r'\[([^]]+)\] "POST /api/v1/organizations/[^ /]+/members(?:\?[^ ]*)? HTTP/[^" ]+" (\d{3})',line)
        if match:
            counts[match.group(2)]+=1
            last=match.group(1)
print(json.dumps({'kind':'http','orgId':'http','codes':dict(counts),'last':last}))
PYCODE
REMOTE
