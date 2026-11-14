#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
sha=$(git rev-parse HEAD)
remote="/opt/reestr/identity-build/$sha"
ssh "$server" "mkdir -p '$remote'"
rsync -az --delete --exclude __pycache__ --exclude '*.pyc' services/identity/ "$server:$remote/"
ssh "$server" "set -euo pipefail
if ! command -v docker >/dev/null; then apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io; fi
systemctl enable --now docker
bash /opt/reestr/app/ops/backup-reestr.sh
mkdir -p /opt/reestr/storage/private/identity
chown -R reestr-backend:reestr-backend /opt/reestr/storage/private
chmod 700 /opt/reestr/storage/private /opt/reestr/storage/private/identity
docker build -t 'reestr-identity:$sha' '$remote'
if ! docker network inspect reestr-identity-private >/dev/null 2>&1; then docker network create --internal reestr-identity-private; fi
test \"\$(docker network inspect -f '{{.Internal}}' reestr-identity-private)\" = true
if docker container inspect reestr-identity >/dev/null 2>&1; then docker stop reestr-identity; docker rename reestr-identity reestr-identity-previous; fi
if ! docker run -d --name reestr-identity --restart unless-stopped --network reestr-identity-private -p 127.0.0.1:8091:8080 --memory 768m --cpus 1.5 --pids-limit 128 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=256m 'reestr-identity:$sha'; then
 docker rename reestr-identity-previous reestr-identity 2>/dev/null && docker start reestr-identity || true
 exit 1
fi
ready=false
for n in \$(seq 1 30); do
 if curl -fsS --max-time 3 http://127.0.0.1:8091/health | python3 -c 'import json,sys;v=json.load(sys.stdin);assert v[\"ready\"] and v[\"liveness\"]'; then ready=true; break; fi
 sleep 2
done
if [ \"\$ready\" != true ]; then
 docker rm -f reestr-identity
 docker rename reestr-identity-previous reestr-identity 2>/dev/null && docker start reestr-identity || true
 exit 1
fi
docker rm reestr-identity-previous 2>/dev/null || true
echo 'Private identity engine is healthy; inspector access policy remains unchanged'
"
