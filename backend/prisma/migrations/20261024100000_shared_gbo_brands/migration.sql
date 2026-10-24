-- Shared brands for both reducers and electronic control units.
-- Preserve existing IDs, names and inspection references.
WITH brands(name) AS (VALUES
  ('AGIS'),
  ('AEB'),
  ('ALPHA'),
  ('OSKAR-N'),
  ('LANDI RENZO'),
  ('POLETRON'),
  ('HANA ENGINEERING'),
  ('ZENIT'),
  ('ATIKER'),
  ('DIGITRONIC'),
  ('OMVL'),
  ('LOVATO'),
  ('TOMASETTO'),
  ('STAG'),
  ('BRC'),
  ('EMER PALLADIO'),
  ('TECH 204'),
  ('ALASKA'),
  ('DESTRO'),
  ('EUROPE GAS'),
  ('ITALGAS'),
  ('SIGMA RED'),
  ('SAVER'),
  ('KME'),
  ('TAMONA'),
  ('OPTIMA'),
  ('OSCAR')
), types(type) AS (VALUES ('reducer'), ('control_unit'))
UPDATE "GboEquipmentItem" AS item
SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP
FROM brands, types
WHERE item."type" = types.type
  AND upper(btrim(item."name")) = brands.name
  AND item."isActive" = false;

WITH brands(name) AS (VALUES
  ('AGIS'),
  ('AEB'),
  ('ALPHA'),
  ('OSKAR-N'),
  ('LANDI RENZO'),
  ('POLETRON'),
  ('HANA ENGINEERING'),
  ('ZENIT'),
  ('ATIKER'),
  ('DIGITRONIC'),
  ('OMVL'),
  ('LOVATO'),
  ('TOMASETTO'),
  ('STAG'),
  ('BRC'),
  ('EMER PALLADIO'),
  ('TECH 204'),
  ('ALASKA'),
  ('DESTRO'),
  ('EUROPE GAS'),
  ('ITALGAS'),
  ('SIGMA RED'),
  ('SAVER'),
  ('KME'),
  ('TAMONA'),
  ('OPTIMA'),
  ('OSCAR')
), types(type) AS (VALUES ('reducer'), ('control_unit'))
INSERT INTO "GboEquipmentItem" ("id", "type", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, types.type, brands.name, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM brands CROSS JOIN types
WHERE NOT EXISTS (
  SELECT 1 FROM "GboEquipmentItem" AS item
  WHERE item."type" = types.type AND upper(btrim(item."name")) = brands.name
)
ON CONFLICT ("type", "name") DO UPDATE
SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
