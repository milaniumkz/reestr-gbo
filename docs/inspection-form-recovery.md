# Web inspection recovery

Pending inspector forms are written to browser IndexedDB after edits (300 ms),
on backgrounding and before opening the native camera. Fields and original file
bytes are stored atomically for the authenticated user and organization. The
current step is restored after authentication and the normal identity gate. A
server draft already submitted is never reopened. Successful submission clears
local recovery. One pending form per user is retained for up to seven days;
clearing browser site data removes it. Quota/storage failures show a warning and
leave the current form open. Tokens, passwords and identity videos are excluded.

The browser can still kill a tab under resource pressure. Recovery preserves
completed local saves; web code cannot prevent OS process termination. Large
photos are checked from encoded headers without allocating a full bitmap, and
preview decoding is capped at 1800 pixels per side. Uploaded original bytes are
unchanged. Automatic frontend updates remain paused during an inspection.

Web Locks serialize refresh rotation and login writes across same-origin tabs.
Cached preferences are reloaded before refresh. A fresh access token from another
tab is reused only for the same subject, session and password version. Server
expiry, revocation, identity and role checks remain authoritative.

Validation: Flutter recovery/session/parser/preview tests, full Flutter suite,
Node startup/readiness tests and camera/PWA browser regressions. Device-specific
camera and OS process behavior still require checks on affected phones.
