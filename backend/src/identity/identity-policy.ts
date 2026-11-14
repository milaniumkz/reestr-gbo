export function similarity(a:number[],b:number[]) {
 if(a.length!==128||b.length!==128||!a.every(Number.isFinite)||!b.every(Number.isFinite))throw new Error('Invalid face template');
 const norms=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
 if(norms<0.01)throw new Error('Invalid face template');
 return a.reduce((s,v,i)=>s+v*b[i],0)/norms;
}
/** A single missed gesture may be tolerated only with a strong face match
 * and independently successful PAD, continuity and sharpness checks. */
export function confidentRecoveryMotion(result:any,score:number) {
 const c=result.checks;
 return result.verdict==='REVIEW'&&score>=.70&&c?.oneFace===true&&
  c.totalActions===3&&c.passedActions===2&&
  Array.isArray(c.issues)&&c.issues.length===1&&c.issues[0]==='ACTIONS'&&
  Number.isFinite(c.continuity)&&c.continuity>=.60&&c.continuity<=1&&Number.isFinite(c.sharpness)&&c.sharpness>=35&&
  Array.isArray(c.padMedian)&&c.padMedian.length===2&&c.padMedian.every((v:any)=>typeof v==='number'&&v>=.97&&v<=1)&&
  Array.isArray(c.padLower)&&c.padLower.length===2&&c.padLower.every((v:any)=>typeof v==='number'&&v>=.85&&v<=1);
}
/** Detect virtually identical temporal frames after common container re-encoding.
 * Scoped to this account; never used to search for people across accounts. */
export function repeatedVideo(a:string[],b:string[]) {
 if(a.length!==b.length||a.length<30)return false;
 let total=0,close=0;
 for(let i=0;i<a.length;i++){
  if(!/^[a-f0-9]{16}$/.test(a[i])||!/^[a-f0-9]{16}$/.test(b[i]))return false;
  let difference=BigInt('0x'+a[i])^BigInt('0x'+b[i]),bits=0;
  while(difference){difference&=difference-1n;bits++;}
  total+=bits;if(bits<=1)close++;
 }
 return total/a.length<=.5 && close>=Math.ceil(a.length*.98);
}

export const IDENTITY_SETTING = 'inspectorVideoIdentityEnabled';
export const IDENTITY_CONSENT = 'ersi-gbo-inspector-face-2026-11-v1';
export function isInspectorSubject(user:{roles?:Array<{role:string}>;memberships?:Array<{role:string}>}) {
 const roles=user.roles?.map(v=>v.role)??[];
 if(roles.some(r=>['super_admin','operator','government','nca'].includes(r)))return false;
 const members=user.memberships??[];
 return members.some(m=>['inspector','inspection_org'].includes(m.role))&&!members.some(m=>['admin','quality_control'].includes(m.role));
}

export function identityEnabledFor(value:unknown,userId:string) {
 if(value===true)return true;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const ids=(value as {pilotUserIds?:unknown}).pilotUserIds;
 return Array.isArray(ids)&&ids.includes(userId);
}
