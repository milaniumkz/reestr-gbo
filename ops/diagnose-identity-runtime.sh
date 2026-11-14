#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
ssh "$server" 'bash -s' <<'REMOTE'
set -euo pipefail
image=$(docker image ls reestr-identity --format '{{.Repository}}:{{.Tag}}' | head -1)
test -n "$image"
docker rm -f reestr-identity-probe >/dev/null 2>&1 || true
trap 'docker rm -f reestr-identity-probe >/dev/null 2>&1 || true' EXIT
docker run -d --name reestr-identity-probe --network reestr-identity-private -p 127.0.0.1:8092:8080 --memory 768m --cpus 1.5 --pids-limit 128 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=256m "$image"
sleep 6
docker inspect reestr-identity-probe --format 'State={{json .State}} Ports={{json .NetworkSettings.Ports}}'
docker logs --tail 35 reestr-identity-probe 2>&1
printf 'INTERNAL HEALTH\n'
docker exec reestr-identity-probe python -c 'import urllib.request;print(urllib.request.urlopen("http://127.0.0.1:8080/health",timeout=3).read().decode())' || true
printf 'LOOPBACK HEALTH\n'
curl -sS --max-time 3 http://127.0.0.1:8092/health || true
printf '\nBRIDGE HEALTH\n'
ip=$(docker inspect reestr-identity-probe --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
curl -sS --max-time 3 "http://$ip:8080/health" || true
printf '\n'
REMOTE
