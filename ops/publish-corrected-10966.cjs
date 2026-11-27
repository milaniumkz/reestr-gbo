'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const root = '/opt/reestr/app/backend';
const {PrismaClient} = require(root + '/node_modules/@prisma/client');
const sharp = require(root + '/node_modules/sharp');
const {StorageService} = require(root + '/dist/src/storage/storage.service');
const {CertificatesService} = require(root + '/dist/src/certificates/certificates.service');
const {InspectionsService} = require(root + '/dist/src/inspections/inspections.service');
const db = new PrismaClient({log: []});
const id = '8b3a8d58-27e4-4eea-a803-91c5b65ea631';
const emptyId = '73cf8325-3906-47f5-8b9b-033cb4a48814';
const organizationId = '716c5c26-dfe4-4dce-b9f8-32ce3cf8d85f';
const vehicleId = '24f4a2a0-7a63-46cb-bb3a-67f4c19fb1bd';
const creatorId = '25ed348b-b2f2-4ee8-ae27-57009080581c';
const actorId = '5e0944a8-f163-48c2-a62f-efff903e420b';
const requestKey = 'owner-2026-11-27-remove-leading-dot-and-publish-10966';
const requiredTypes = ['cylinder_label','vehicle_photo','tech_passport','applicant_application',
  'gas_work_record','cylinder_work_record','gas_inspection_report','cylinder_inspection_report','certificate_document'];
const include = {photos: {orderBy: {id: 'asc'}}, certificate: true};
const storage = new StorageService({get: key => process.env[key]}, db);

function assertTarget(row) {
  assert(row);
  assert.equal(row.organizationId, organizationId);
  assert.equal(row.vehicleId, vehicleId);
  assert.equal(row.createdById, creatorId);
  assert.equal(row.certificateNumber, '.10966');
  assert(['quality_approved','approved'].includes(row.status));
  assert(row.qualityConfirmedAt && row.qualityConfirmedById && row.qualityDocumentUploadedAt);
  assert(row.address?.trim() && !/^GPS\b/i.test(row.address.trim()));
  assert(Number.isFinite(row.lat) && Number.isFinite(row.lng));
  assert.equal(row.usesTwoCylinders, false);
  assert.equal(row.photos.length, 9);
  assert.deepEqual(row.photos.map(p => p.type).sort(), [...requiredTypes].sort());
  if (row.certificate) {
    assert.equal(row.status, 'approved');
    assert.equal(row.certificate.number, '.10966');
    assert.equal(row.certificate.status, 'active');
    assert.equal(row.certificate.organizationId, organizationId);
    assert.equal(row.certificate.vehicleId, vehicleId);
    assert.equal(row.certificate.inspectionId, id);
  } else assert.equal(row.status, 'quality_approved');
}

(async () => {
  assert.equal(process.env.CONFIRM_NUMBER, '10966');
  assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
  const prior = await db.auditLog.findFirst({where: {action: 'inspection.number.corrected_and_published',
    entity: 'inspection', entityId: id, metadata: {path: ['requestKey'], equals: requestKey}}});
  if (prior) { console.log('Request already applied; no changes'); return; }
  const actor = await db.user.findUnique({where: {id: actorId}, include: {roles: true}});
  assert(actor && !actor.isBlocked && actor.roles.some(r => r.role === 'super_admin'));
  const snapshot = await db.inspection.findUnique({where: {id}, include});
  assertTarget(snapshot);
  // Read originals on the server only; never replace, recompress or export them.
  for (const photo of snapshot.photos) {
    const object = await db.storageObject.findUnique({where: {objectKey: photo.objectKey}});
    assert(object && object.sizeBytes > 0 && object.sizeBytes <= 64 * 1024 * 1024);
    const bytes = await storage.readObject(photo.objectKey);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    assert.equal(bytes.length, object.sizeBytes);
    assert.equal(checksum, object.checksum);
    assert.equal(checksum, photo.checksum);
    if (bytes.subarray(0, 5).toString() === '%PDF-') {
      assert.equal(photo.type, 'certificate_document');
      assert(bytes.subarray(-4096).includes(Buffer.from('%%EOF')));
    } else {
      const image = sharp(bytes, {limitInputPixels: 40_000_000});
      const meta = await image.metadata();
      assert(meta.width > 0 && meta.height > 0);
      await image.stats();
    }
  }
  console.log('All 9 original attachments read and verified against stored checksums');
  await db.$transaction(async tx => {
    const current = await tx.inspection.findUnique({where: {id}, include});
    assertTarget(current);
    assert.equal(current.updatedAt.toISOString(), snapshot.updatedAt.toISOString());
    assert.deepEqual(current.photos, snapshot.photos);
    assert.deepEqual(current.certificate, snapshot.certificate);
    const empty = await tx.inspection.findUnique({where: {id: emptyId}, include});
    assert(empty && empty.organizationId === organizationId && empty.vehicleId === vehicleId);
    assert.equal(empty.createdById, creatorId);
    assert.equal(empty.status, 'draft');
    assert.equal(empty.certificateNumber, '10966');
    assert.equal(empty.photos.length, 0);
    assert.equal(empty.certificate, null);
    assert.equal(empty.submittedAt, null);
    assert.equal(empty.qualityConfirmedAt, null);
    assert.equal(await tx.certificate.count({where: {organizationId, number: '10966'}}), 0);
    const certificates = new CertificatesService(tx, storage);
    const inspections = new InspectionsService(tx, storage, certificates);
    const ready = await inspections.readiness(id, {sub: actorId, phone: actor.phone, roles: ['super_admin']});
    assert(ready.ready && ready.missing.length === 0, 'Inspection is incomplete');
    const released = await tx.inspection.updateMany({
      where: {id: emptyId, organizationId, vehicleId, status: 'draft', certificateNumber: '10966', updatedAt: empty.updatedAt},
      data: {certificateNumber: null, status: 'blocked',
        notes: [empty.notes, 'Пустой дубликат сохранён: заполненная инспекция опубликована под №10966'].filter(Boolean).join('\n')},
    });
    assert.equal(released.count, 1);
    const corrected = await tx.inspection.updateMany({
      where: {id, organizationId, vehicleId, certificateNumber: '.10966', status: current.status, updatedAt: current.updatedAt},
      data: {certificateNumber: '10966', status: 'approved', autoPublishAt: null,
        ...(current.status === 'quality_approved' ? {approvedAt: new Date(), approvedById: actorId} : {})},
    });
    assert.equal(corrected.count, 1);
    let certificate;
    if (current.certificate) {
      certificate = await tx.certificate.update({where: {id: current.certificate.id}, data: {number: '10966'}});
      assert.equal(certificate.qrPayload, current.certificate.qrPayload);
    } else certificate = await certificates.issueForInspection(id);
    assert.equal(certificate.number, '10966');
    assert.equal(certificate.status, 'active');
    const after = await tx.inspection.findUnique({where: {id}, include});
    assert.deepEqual(after.photos, snapshot.photos);
    assert.equal(after.status, 'approved');
    assert.equal(after.certificate.id, certificate.id);
    await tx.auditLog.create({data: {actorId, action: 'inspection.number.corrected_and_published', entity: 'inspection', entityId: id,
      metadata: {requestKey, organizationId, previousNumber: '.10966', certificateNumber: '10966',
        previousStatus: current.status, certificateId: certificate.id, preservedFiles: 9, emptyDuplicateId: emptyId,
        reason: 'Owner requested removing leading dot, checking originals and publishing the quality-approved certificate',
        emptyDuplicatePrevious: {status: empty.status, certificateNumber: empty.certificateNumber, notes: empty.notes},
        workflowRun: process.env.GITHUB_RUN_ID}}});
    console.log('10966 published; leading dot removed; all 9 files preserved; empty duplicate archived without deletion; audited');
  }, {isolationLevel: 'Serializable', timeout: 15000});
})().catch(() => {
  console.error('Scoped 10966 correction refused; transaction makes no partial changes');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
