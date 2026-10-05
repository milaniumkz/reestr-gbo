# Cloud development and deploy

## GitHub / Codex Cloud

1. Open the GitHub repository in Codex Cloud.
2. Use a feature branch for every change.
3. Run or wait for GitHub Actions `CI`.
4. Merge to `main` only after checks pass.
5. `Deploy` runs automatically from `main`; it can also be started manually from Actions.

Codex Cloud must use test configuration, not production secrets. For local services use `docker compose up -d postgres redis minio`.

## Required GitHub Actions secrets

- `DEPLOY_HOST`: server IP or hostname.
- `DEPLOY_USER`: SSH user, normally `root`.
- `DEPLOY_SSH_KEY`: private key with access only to this server.
- `DEPLOY_KNOWN_HOSTS`: pinned SSH host key line from `ssh-keyscan`.

Production application secrets remain on the server in `/opt/reestr/app/backend/.env`.

## Server layout

- App source/runtime: `/opt/reestr/app`.
- Releases: `/opt/reestr/releases`.
- Storage uploads: `/opt/reestr/storage`.
- Backups: `/opt/reestr/backups`.
- Backend logs: `/var/log/reestr/backend.log`, `/var/log/reestr/backend-error.log`.
- Admin logs: `/var/log/reestr/admin.log`, `/var/log/reestr/admin-error.log`.
- Services: `reestr-backend`, `reestr-admin`, `nginx`.

## Manual operations

Use GitHub Actions workflow `Deploy` with `workflow_dispatch`:

- `deploy`: deploy selected ref.
- `status`: show installed version, service status, health.
- `logs`: show short sanitized logs.
- `restart`: restart backend/admin and reload nginx.
- `rollback`: restore previous release files and restart services.

Rollback does not restore an old database over new user data.

## Local sync

```sh
git pull origin main
/Volumes/PD1000/job/flutter/bin/flutter pub get
cd backend && npm ci && cd ..
cd admin && npm ci && cd ..
```
