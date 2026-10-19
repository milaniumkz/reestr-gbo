-- Explicit owner request: only the owner account, authenticated by password.
-- Keep password hashes, business users and historical audit unchanged.
UPDATE "TechAccount" SET "active"=("login"='owner'), "version"="version"+1,
 "totpEncrypted"=NULL,"totpConfirmedAt"=NULL,"lastTotpStep"=-1;
UPDATE "TechSession" SET "revokedAt"=now() WHERE "revokedAt" IS NULL;
INSERT INTO "TechnicalEvent" ("id","createdAt","source","category","action","result","severity","explanation","expiresAt")
VALUES ('technical-owner-password-only-20261019',now(),'migration','security','technical.authentication.policy','success','info',
 'По явному запросу владельца включён вход только по паролю для единственной учётной записи owner; прежние технические сеансы отозваны',now()+interval '365 days')
ON CONFLICT ("id") DO NOTHING;
