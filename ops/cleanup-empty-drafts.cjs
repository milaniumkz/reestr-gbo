'use strict';
const assert = require('node:assert/strict');
const {readFile,writeFile,mkdir} = require('node:fs/promises');
const {createHash} = require('node:crypto');
const {PrismaClient} = require('/opt/reestr/app/backend/node_modules/@prisma/client');
const {isEmptyPrivateDraft,isEmptyBusinessDraft} = require('./empty-draft-policy.cjs');
const db = new PrismaClient({log:[]});
const actorId = '5e0944a8-f163-48c2-a62f-efff903e420b';
const directory = '/opt/reestr/backups';
const policy = 'blank-default-only-v1';
const digest = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const include = {
  photos: {orderBy: {id: 'asc'}}, certificate: true,
  vehicle: {include: {owners: {orderBy: {id: 'asc'}}, cylinders: {orderBy: {id: 'asc'}}}},
};
const prefix = (type,row) => type === 'private' ? `inspection-drafts/${row.userId}/${row.id}/` : `inspections/${row.id}/`;
async function hasStoredFiles(client,type,row) {
  return await client.storageObject.count({where:{objectKey:{startsWith:prefix(type,row)}}}) > 0;
}
function links(rows) {
  const inspections = new Set(), vehicles = new Set();
  for (const row of rows) {
    if (typeof row.fields?.draftInspectionId === 'string') inspections.add(row.fields.draftInspectionId);
    if (typeof row.fields?.draftVehicleId === 'string') vehicles.add(row.fields.draftVehicleId);
  }
  return {inspections,vehicles};
}
async function loadPlan() {
  const run = process.env.PLAN_RUN ?? '', expected = process.env.PLAN_SHA256 ?? '';
  assert.match(run,/^\d+$/); assert.match(expected,/^[a-f0-9]{64}$/);
  const bytes = await readFile(`${directory}/empty-drafts-plan-${run}.json`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
  const plan = JSON.parse(bytes);
  assert.equal(plan.policy,policy);
  assert(Date.now()-new Date(plan.createdAt).getTime() < 6*3600000);
  assert(Date.now() >= new Date(plan.createdAt).getTime());
  assert(Array.isArray(plan.candidates));
  return plan;
}
(async () => {
  assert.match(process.env.GITHUB_RUN_ID ?? '',/^\d+$/);
  const actor = await db.user.findUnique({where:{id:actorId},include:{roles:true}});
  assert(actor && !actor.isBlocked && actor.roles.some(r=>r.role==='super_admin'));
  const mode = process.env.MODE;
  assert(['diagnose','verify','apply'].includes(mode));
  if (mode !== 'diagnose') {
    const plan = await loadPlan();
    if (mode === 'verify') { console.log(JSON.stringify({verifiedPlan:true,counts:plan.counts})); return; }
    let privateDeleted=0,businessDeleted=0,changedOrProtected=0;
    for (const entry of plan.candidates) {
      assert(['private','business'].includes(entry.type));
      try {
        const removed = await db.$transaction(async tx => {
          const model = entry.type === 'private' ? tx.inspectionDraft : tx.inspection;
          const row = await model.findUnique({where:{id:entry.id},...(entry.type==='business'?{include}:{})});
          if (!row || digest(row) !== entry.sha256 || new Date(row.updatedAt) > new Date(plan.cutoff)) return false;
          const currentLinks = links(await tx.inspectionDraft.findMany({select:{fields:true}}));
          if (!(entry.type==='private'?isEmptyPrivateDraft(row):isEmptyBusinessDraft(row,currentLinks.inspections,currentLinks.vehicles))) return false;
          if (await hasStoredFiles(tx,entry.type,row)) return false;
          if (entry.type==='business' && await tx.inspectionDeviation.count({where:{inspectionId:row.id}})) return false;
          const deleted = await model.deleteMany({where:{id:row.id,updatedAt:row.updatedAt,...(entry.type==='private'?{version:row.version}:{status:'draft'})}});
          if (deleted.count !== 1) return false;
          await tx.auditLog.create({data:{actorId,action:'inspection.empty_draft.delete',entity:entry.type==='private'?'inspection_draft':'inspection',entityId:row.id,
            metadata:{policy,planRun:process.env.PLAN_RUN,workflowRun:process.env.GITHUB_RUN_ID,
              reason:'Owner requested removing genuinely empty inactive drafts across the database',
              filesDeleted:false,deletedRecord:JSON.parse(JSON.stringify(row))}}});
          return true;
        },{isolationLevel:'Serializable',timeout:15000});
        if (removed) { if (entry.type==='private') privateDeleted++; else businessDeleted++; }
        else changedOrProtected++;
      } catch (error) {
        if (['P2034','P2025'].includes(error?.code)) changedOrProtected++;
        else throw error;
      }
    }
    console.log(JSON.stringify({privateDeleted,businessDeleted,changedOrProtected,filesDeleted:0,planRun:process.env.PLAN_RUN}));
    return;
  }
  const createdAt = new Date(), cutoff = new Date(createdAt.getTime()-3600000);
  const privateRows = await db.inspectionDraft.findMany({orderBy:{id:'asc'}});
  const businessRows = await db.inspection.findMany({where:{status:'draft'},include,orderBy:{id:'asc'}});
  const referenced = links(privateRows);
  const counts = {privateTotal:privateRows.length,businessTotal:businessRows.length,privateEligible:0,businessEligible:0,recentEmptyProtected:0,storedFilesProtected:0};
  const candidates=[];
  for (const [type,rows] of [['private',privateRows],['business',businessRows]]) for (const row of rows) {
    const empty = type==='private'?isEmptyPrivateDraft(row):isEmptyBusinessDraft(row,referenced.inspections,referenced.vehicles);
    if (!empty) continue;
    if (new Date(row.updatedAt) > cutoff) { counts.recentEmptyProtected++; continue; }
    if (await hasStoredFiles(db,type,row)) { counts.storedFilesProtected++; continue; }
    if (type==='business' && await db.inspectionDeviation.count({where:{inspectionId:row.id}})) continue;
    counts[type==='private'?'privateEligible':'businessEligible']++;
    candidates.push({type,id:row.id,sha256:digest(row)});
  }
  const plan={policy,createdAt:createdAt.toISOString(),cutoff:cutoff.toISOString(),counts,candidates};
  const bytes=Buffer.from(JSON.stringify(plan));
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(`${directory}/empty-drafts-plan-${process.env.GITHUB_RUN_ID}.json`,bytes,{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({planRun:process.env.GITHUB_RUN_ID,planSha256:createHash('sha256').update(bytes).digest('hex'),counts}));
})().catch(error => { console.error('Empty-draft operation refused; protected records and all files retained',error?.code??'');process.exitCode=1; }).finally(()=>db.$disconnect());
