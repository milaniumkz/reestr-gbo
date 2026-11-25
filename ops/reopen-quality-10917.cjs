'use strict';
// Owner-authorized, one-time return of this exact issued inspection to quality.
const assert = require('node:assert/strict');
const {PrismaClient} = require('/opt/reestr/app/backend/node_modules/@prisma/client');
const db = new PrismaClient({log: []});
const id = '37f48c0f-e19d-4434-8435-8f0eddd4ecd6';
const organizationId = '716c5c26-dfe4-4dce-b9f8-32ce3cf8d85f';
const certificateId = '970078a7-33e2-407e-b234-54df616c73b1';
const requestKey = 'owner-request-2026-11-25-quality-scan-10917';
const reset = {
  status: 'submitted', qualityReviewerId: null, qualityReviewStartedAt: null,
  qualityDocumentUploadedAt: null, secondQualityDocumentUploadedAt: null,
  qualityConfirmedAt: null, qualityConfirmedById: null,
  approvedAt: null, approvedById: null, autoPublishAt: null,
};
(async () => {
  assert.equal(process.env.CONFIRM_NUMBER, '10917');
  assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
  await db.$transaction(async tx => {
    const prior = await tx.auditLog.findFirst({where: {
      action: 'inspection.quality.reopen', entity: 'inspection', entityId: id,
      metadata: {path: ['requestKey'], equals: requestKey},
    }});
    if (prior) { console.log('Already applied; no changes'); return; }
    const include = {certificate: true, photos: {orderBy: {id: 'asc'}}};
    const row = await tx.inspection.findUnique({where: {id}, include});
    assert(row, 'Inspection missing');
    assert.equal(row.organizationId, organizationId);
    assert.equal(row.certificateNumber, '10917');
    assert.equal(row.status, 'approved');
    assert.equal(row.approvedAt?.toISOString(), '2026-11-24T11:39:09.195Z');
    assert.equal(row.certificate?.id, certificateId);
    assert.equal(row.certificate.status, 'active');
    assert.equal(row.certificate.number, '10917');
    const before = Object.fromEntries(Object.keys(reset).map(key => [key, row[key]]));
    const changed = await tx.inspection.updateMany({
      where: {id, organizationId, certificateNumber: '10917', status: 'approved', updatedAt: row.updatedAt},
      data: reset,
    });
    assert.equal(changed.count, 1, 'Concurrent change; refusing overwrite');
    const after = await tx.inspection.findUnique({where: {id}, include});
    assert.deepEqual(after.certificate, row.certificate);
    assert.deepEqual(after.photos, row.photos);
    for (const [key, value] of Object.entries(reset)) assert.equal(after[key], value);
    await tx.auditLog.create({data: {
      action: 'inspection.quality.reopen', entity: 'inspection', entityId: id,
      metadata: {requestKey, certificateNumber: '10917', organizationId, certificateId,
        reason: 'Owner requested quality control access to replace the certificate scan',
        previous: JSON.parse(JSON.stringify(before)), nextStatus: 'submitted',
        certificateAndOriginalFilesPreserved: true, workflowRun: process.env.GITHUB_RUN_ID},
    }});
    console.log('10917 returned to quality control; certificate and all original files unchanged; audited');
  }, {isolationLevel: 'Serializable'});
})().catch(() => {
  console.error('Scoped quality return refused; no partial changes committed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
