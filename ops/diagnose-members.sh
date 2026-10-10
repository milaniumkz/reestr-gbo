#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}" 'bash -se' <<'REMOTE'
set -a
source /opt/reestr/app/backend/.env
set +a
psql "${DATABASE_URL%%\?*}" -X -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT json_build_object('orgId',o.id,'name',o.name,'members',(SELECT count(*) FROM "OrganizationMember" m WHERE m."organizationId"=o.id),'additions',count(a.id),'distinctAdditions',count(DISTINCT (a.metadata->>'userId',a.metadata->>'role')) FILTER (WHERE a.id IS NOT NULL),'lastAddition',max(a."createdAt")) FROM "Organization" o LEFT JOIN "AuditLog" a ON a."entityId"=o.id AND a.action='organization.member.add' AND a."createdAt">now()-interval '1 day' WHERE o.type='inspection_org' GROUP BY o.id,o.name;
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
