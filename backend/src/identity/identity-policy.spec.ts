import {describe,it,expect} from '@jest/globals';
import {isInspectorSubject,repeatedVideo,similarity} from './identity-policy';
describe('Inspector video identity scope',()=>{
 it.each(['inspector','inspection_org'])('requires %s members',role=>expect(isInspectorSubject({memberships:[{role}]})).toBe(true));
 it.each(['admin','quality_control'])('exempts %s, including mixed accounts',role=>expect(isInspectorSubject({memberships:[{role:'inspector'},{role}]})).toBe(false));
 it.each(['super_admin','operator','government','nca'])('exempts %s',role=>expect(isInspectorSubject({roles:[{role}],memberships:[{role:'inspector'}]})).toBe(false));
 it('does not affect unrelated customers',()=>expect(isInspectorSubject({roles:[{role:'vehicle_owner'}]})).toBe(false));
 it('compares valid vectors and rejects invalid templates',()=>{const a=[1,...Array(127).fill(0)];expect(similarity(a,a)).toBe(1);expect(similarity(a,[0,1,...Array(126).fill(0)])).toBe(0);expect(()=>similarity([],a)).toThrow();});
 it('detects replay signatures',()=>{const a=Array(40).fill('0123456789abcdef');expect(repeatedVideo(a,[...a])).toBe(true);expect(repeatedVideo(a,Array(40).fill('fedcba9876543210'))).toBe(false);});
});
