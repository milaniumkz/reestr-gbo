import {describe,it,expect,jest,afterEach} from '@jest/globals';
import {DEVICE_MODEL,DeviceEvidence,deviceDecision,validDeviceEvidence} from './local-device-evidence';
import {LocalPhotoDeviceService} from './local-photo-device.service';
const evidence=(confidence=.92,agreement=.85,box:[number,number,number,number]=[.2,.2,.6,.6]):DeviceEvidence=>({model:DEVICE_MODEL,authenticityGuaranteed:false,pageLikeBorder:false,detections:[{kind:'phone',confidence,agreement,box}]});
afterEach(()=>jest.restoreAllMocks());
describe('local photo device decisions',()=>{
 it('requires a dominant central device corroborated in two views before refusing',()=>{
  expect(deviceDecision(evidence()).rejectReason).toContain('телефон');
  expect(deviceDecision(evidence(.84)).rejectReason).toBeUndefined();
  expect(deviceDecision(evidence(.92,.74)).rejectReason).toBeUndefined();
  expect(deviceDecision(evidence(.92,.9,[0,0,.2,.2])).rejectReason).toBeUndefined();
  expect(deviceDecision(evidence(.92,.9,[0,0,.3,.9])).rejectReason).toBeUndefined();
 });
 it('ignores page borders and books under the relaxed screen-only policy',()=>{
  const e=evidence();e.pageLikeBorder=true;e.detections=[{kind:'book',confidence:.99,agreement:.99,box:[.1,.1,.8,.8]}];
  const result=deviceDecision(e);expect(result.rejectReason).toBeUndefined();expect(result.reasons).toEqual([]);
 });
 it('no objects does not certify originality and unavailable inference requires manual review',()=>{
  expect(deviceDecision({...evidence(),detections:[]}).rejectReason).toBeUndefined();
  expect(deviceDecision(undefined).reasons.join(' ')).toContain('недоступна');
 });
 it('validates bounded detections and refuses malformed detector responses',()=>{
  expect(validDeviceEvidence(evidence())).toBe(true);
  for(const e of [{...evidence(),model:'untrusted'},{...evidence(),authenticityGuaranteed:true},{...evidence(),detections:Array(21).fill(evidence().detections[0])},evidence(NaN),evidence(1.1),evidence(.9,.9,[.9,.1,.5,.5])])expect(validDeviceEvidence(e)).toBe(false);
 });
 it('uses loopback only and degrades to explicit review when the private worker fails',async()=>{
  const fetch=jest.spyOn(global,'fetch').mockResolvedValue(new Response(JSON.stringify(evidence())));
  const service=new LocalPhotoDeviceService();expect(await service.analyze(Buffer.from('synthetic'))).toEqual(evidence());
  expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8093/analyze');
  fetch.mockResolvedValueOnce(new Response('busy',{status:503}));expect(await service.analyze(Buffer.from('synthetic'))).toBeUndefined();
  fetch.mockRejectedValueOnce(new Error('offline'));expect(await service.analyze(Buffer.from('synthetic'))).toBeUndefined();
  fetch.mockResolvedValueOnce(new Response('{}'));expect(await service.analyze(Buffer.from('synthetic'))).toBeUndefined();
 });
});
