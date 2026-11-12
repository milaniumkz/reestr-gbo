#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
ssh "$server" 'bash -s' <<'REMOTE'
set -euo pipefail
test -f /etc/resolv.conf
test ! -L /etc/resolv.conf
# Prove replacement resolvers work before touching the host configuration.
node <<'NODE'
const {Resolver}=require('node:dns').promises;
(async()=>{
 for(const server of ['1.1.1.1','8.8.8.8']) {
  const dns=new Resolver({timeout:2000,tries:1});dns.setServers([server]);
  for(const host of ['nominatim.openstreetmap.org','photon.komoot.io']) {
   if(!(await dns.resolve4(host)).length)throw Error('No DNS answer');
  }
 }
 console.log('Both replacement DNS servers resolve both geocoders');
})().catch(()=>{console.error('Replacement DNS preflight failed; configuration unchanged');process.exitCode=1});
NODE
backup="/opt/reestr/backups/dns-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
cp -a /etc/resolv.conf "$backup/resolv.conf"
candidate=$(mktemp /etc/reestr-resolv.XXXXXX)
trap 'rm -f "$candidate"' EXIT
{
  printf '# Reestr: redundant DNS after hosting resolver timeouts\nnameserver 1.1.1.1\nnameserver 8.8.8.8\n'
  awk '!/^nameserver[[:space:]]/ && !/^# Reestr:/' "$backup/resolv.conf"
  printf 'options timeout:2 attempts:2\n'
} > "$candidate"
chmod --reference=/etc/resolv.conf "$candidate"
chown --reference=/etc/resolv.conf "$candidate"
mv "$candidate" /etc/resolv.conf
if ! timeout 10 getent ahostsv4 nominatim.openstreetmap.org >/dev/null || ! timeout 10 getent ahostsv4 photon.komoot.io >/dev/null; then
  cp -a "$backup/resolv.conf" /etc/resolv.conf
  echo 'DNS validation failed; previous configuration restored' >&2
  exit 1
fi
echo "DNS updated and verified; previous configuration saved in $backup"
REMOTE
