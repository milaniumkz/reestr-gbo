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

## Android download

Successful `Deploy` builds a release APK for the production API and publishes it at
`https://89-207-255-42.sslip.io/downloads/ersi-gbo.apk`. Its SHA256 is published at
`/downloads/ersi-gbo.apk.sha256`. The workflow also retains an `ersi-gbo-apk` artifact
for 30 days and verifies the public download against the built file.

The repository currently signs release APKs with the Android debug key. Installing
an update over an existing installation requires the same signing certificate;
a stable production signing key must be configured separately for repeatable updates.

### Inspection keyboard (20 October 2026)

Inspection text fields (screens 15–23, including quality correction of the same form) request `ru-RU` via Flutter `hintLocales` and character capitalization. A scoped formatter also uppercases typed and pasted text while preserving punctuation, Kazakh/Russian characters, cursor selection and active IME composition. Password, phone, number, date, URL and email keyboard modes are excluded. Login/password screens are outside the scope.

The operating-system keyboard owns the language selection: Android API 24+ can honor the language hint if Russian is available, but a keyboard may ignore it; browsers and iOS do not guarantee this language switch. Uppercase normalization does not depend on the selected keyboard layout. Android users need the newly built APK; the web version uses the updated client after refresh. Existing APK debug-signing limitations described above still apply.

Validation: Flutter analyze without issues; full pre-existing suite plus keyboard tests passed (16 passed, one visual golden test skipped), followed by five focused keyboard tests including numeric mode and unchanged mixed-case password. No backend schema changes.
