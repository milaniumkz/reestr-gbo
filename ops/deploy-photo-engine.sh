#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
sha=$(git rev-parse HEAD)
# The public weights are fetched only during the build, never from the worker.
python3 services/photo/download_model.py
remote="/opt/reestr/photo-build/$sha"
ssh "$server" "mkdir -p '$remote'"
rsync -az --exclude __pycache__ --exclude '*.pyc' services/photo/ "$server:$remote/"
scp ops/configure-photo-proxy.py "$server:$remote/configure-proxy.py"
ssh "$server" "bash -s -- '$remote' '$sha'" <<'REMOTE'
set -euo pipefail
remote="$1"; sha="$2"
command -v docker >/dev/null
systemctl is-active --quiet reestr-backend
bash /opt/reestr/app/ops/backup-reestr.sh
sha256sum /opt/reestr/app/build/web/release.json > "$remote/web-preserved.sha256"
docker build -t "reestr-photo:$sha" "$remote"
if ! docker network inspect reestr-photo-private >/dev/null 2>&1; then docker network create --internal reestr-photo-private; fi
test "$(docker network inspect -f '{{.Internal}}' reestr-photo-private)" = true
docker rm reestr-photo-previous 2>/dev/null || true
if docker container inspect reestr-photo >/dev/null 2>&1; then docker stop reestr-photo; docker rename reestr-photo reestr-photo-previous; fi
rollback() {
 status=$?
 if [[ "$status" != 0 ]]; then
  docker rm -f reestr-photo 2>/dev/null || true
  if docker container inspect reestr-photo-previous >/dev/null 2>&1; then
   docker rename reestr-photo-previous reestr-photo
   docker start reestr-photo
   old_ip=$(docker inspect reestr-photo --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
   python3 "$remote/configure-proxy.py" "$old_ip" || true
  fi
  echo 'Photo worker publication failed; previous worker restored when present' >&2
 fi
 exit "$status"
}
trap rollback EXIT
docker run -d --name reestr-photo --restart unless-stopped --network reestr-photo-private --memory 512m --memory-swap 512m --cpus .75 --pids-limit 64 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=32m --log-opt max-size=10m --log-opt max-file=2 "reestr-photo:$sha"
worker_ip=$(docker inspect reestr-photo --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
ready=false
for attempt in {1..30}; do
 if curl -fsS --max-time 3 "http://$worker_ip:8080/health" 2>/dev/null | python3 -c 'import json,sys;h=json.load(sys.stdin);assert h["ready"] and h["model"]=="local-yolox-s-coco-v1" and h["externalServices"] is False'; then ready=true; break; fi
 sleep 2
done
[[ "$ready" == true ]]
python3 "$remote/configure-proxy.py" "$worker_ip"
sha256sum -c "$remote/web-preserved.sha256"
systemctl is-active --quiet reestr-backend
docker inspect -f '{{json .HostConfig.PortBindings}}' reestr-photo | python3 -c 'import json,sys;assert not json.load(sys.stdin)'
trap - EXIT
echo 'Photo worker ready: 512 MiB limit, 0.75 CPU, no published ports, internal-only network. Backend activation is separate.'
REMOTE
