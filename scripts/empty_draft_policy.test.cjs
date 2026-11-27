const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isEmptyPrivateDraft,isEmptyBusinessDraft}=require('../ops/empty-draft-policy.cjs');
const empty=()=>({id:'draft',organizationId:'org',createdAt:'2026-11-26T21:30:00Z',files:{},fields:{screen:15,localDraftId:'draft',organizationId:'org',ownerKind:'Физическое лицо',inspectionIssuedAt:'2026-11-27',ownerName:'',vehicleVin:'',cylinderPhotoUploaded:false,packageDocumentNames:{}}});
test('only an untouched first-step form with automatic defaults is empty',()=>{
 assert(isEmptyPrivateDraft(empty()));
 for(const change of [{ownerName:'partial'},{inspectionCertificateNumber:'10966'},{vehicleVin:'VIN'},{ownerAddress:'address'},{ownerPhone:'+7'},{cylinderShape:'Цилиндрический'},{inspectionIssuedAt:'2026-11-20'},{ownerKind:'Юридическое лицо'},{screen:16},{draftInspectionId:'linked'},{cylinderPhotoUploaded:true},{packageDocumentNames:{document:'photo.jpg'}},{photoReviewNotices:{photo:'review'}},{newFutureField:''}]){
  const row=empty();Object.assign(row.fields,change);assert.equal(isEmptyPrivateDraft(row),false,JSON.stringify(change));
 }
});
test('any staged file, even incomplete metadata, protects a draft',()=>{
 for(const files of [{primary_tech:{}},{unknown:null},[],null]){const row=empty();row.files=files;assert.equal(isEmptyPrivateDraft(row),false);}
});
test('a no-photo business draft with real vehicle or owner data is not empty',()=>{
 const row={id:'inspection',vehicleId:'vehicle',status:'draft',photos:[],certificate:null,vehicle:{vin:'',plateNumber:'',make:'',model:'',owners:[],cylinders:[]}};
 assert(isEmptyBusinessDraft(row));
 for(const key of ['vin','plateNumber','make','model'])assert.equal(isEmptyBusinessDraft({...row,vehicle:{...row.vehicle,[key]:'entered'}}),false);
 for(const change of [{certificateNumber:'10966'},{address:'GPS'},{lat:0},{qualityConfirmedAt:new Date()},{status:'rejected'},{notes:'imported'},{certificate:{id:'issued'}},{photos:[{}]}])assert.equal(isEmptyBusinessDraft({...row,...change}),false);
 assert.equal(isEmptyBusinessDraft({...row,vehicle:{...row.vehicle,owners:[{}]}}),false);
 assert.equal(isEmptyBusinessDraft({...row,vehicle:{...row.vehicle,cylinders:[{}]}}),false);
 assert.equal(isEmptyBusinessDraft(row,new Set(['inspection'])),false);
 assert.equal(isEmptyBusinessDraft(row,new Set(),new Set(['vehicle'])),false);
});
