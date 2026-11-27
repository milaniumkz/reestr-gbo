'use strict';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const blank = value => value == null || (typeof value === 'string' && value.trim() === '');
const emptyObject = value => value == null || (plain(value) && Object.keys(value).length === 0);
const textFields = new Set(('inspectionCertificateNumber ownerId ownerName ownerPhone ownerAddress vehiclePlate vehicleVin vehicleMakeModel vehicleYear vehicleColor cylinderNumber secondCylinderNumber cylinderMaker cylinderVolume cylinderProductionDate cylinderFuel reducerName controlUnitName cylinderShape draftVehicleId draftInspectionId cylinderPhotoName vehiclePhotoName techPassportPhotoName documentFileName').split(' '));
const flags = new Set(('usesTwoCylinders cylinderPhotoUploaded vehiclePhotoUploaded techPassportPhotoUploaded protectedInspectionPhotosLocked').split(' '));
const maps = new Set(('secondCylinderValues packageDocumentNames packageDocumentUploaded photoReviewNotices cylinderPhotoPosition vehiclePhotoPosition techPassportPhotoPosition packageDocumentPositions').split(' '));
function isEmptyPrivateDraft(row) {
  if (!plain(row.fields) || !plain(row.files) || Object.keys(row.files).length) return false;
  if (row.fields.screen !== 15) return false;
  const created = new Date(row.createdAt);
  if (!Number.isFinite(created.getTime())) return false;
  const days = new Set([created.toISOString().slice(0, 10), new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Almaty'}).format(created)]);
  for (const [key,value] of Object.entries(row.fields)) {
    if (key === 'screen') continue;
    if (key === 'localDraftId') { if (!blank(value) && value !== row.id) return false; continue; }
    if (key === 'organizationId') { if (value !== row.organizationId) return false; continue; }
    if (key === 'ownerKind') { if (!blank(value) && value !== 'Физическое лицо') return false; continue; }
    if (key === 'inspectionIssuedAt') { if (!blank(value) && !days.has(value)) return false; continue; }
    if (textFields.has(key)) { if (!blank(value)) return false; continue; }
    if (flags.has(key)) { if (value != null && value !== false) return false; continue; }
    if (maps.has(key)) { if (!emptyObject(value)) return false; continue; }
    return false; // An unknown field is preserved until reviewed, even if empty.
  }
  return true;
}
function isEmptyBusinessDraft(row, referencedInspectionIds = new Set(), referencedVehicleIds = new Set()) {
  if (row.status !== 'draft' || row.certificate !== null || !Array.isArray(row.photos) || row.photos.length || referencedInspectionIds.has(row.id) || referencedVehicleIds.has(row.vehicleId)) return false;
  const strings = ['certificateNumber','inspectorName','notes','address','secondCylinderSerial','secondCylinderManufacturer','secondCylinderShape'];
  const nulls = ['submittedAt','submittedById','approvedAt','approvedById','qualityConfirmedAt','qualityConfirmedById','qualityReviewerId','qualityReviewStartedAt','qualityDocumentUploadedAt','secondQualityDocumentUploadedAt','autoPublishAt','lat','lng','secondCylinderVolumeLiters','secondCylinderProducedAt','secondCylinderInspectedAt','secondCylinderValidUntil'];
  if (strings.some(key => !blank(row[key])) || nulls.some(key => row[key] != null) || row.usesTwoCylinders) return false;
  const v = row.vehicle;
  return !!v && ['vin','plateNumber','normalizedPlate','vinLast3','make','model'].every(key => blank(v[key])) &&
    v.year == null && v.owners?.length === 0 && v.cylinders?.length === 0;
}
module.exports = {isEmptyPrivateDraft,isEmptyBusinessDraft};
