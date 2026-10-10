import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRefreshedSession } from '../app/lib/session-action.ts';

test('an expired session refreshes and retries the add with the fresh token', async () => {
  const attempts=[];
  let refreshes=0;
  const result=await withRefreshedSession('expired',async()=>{refreshes++;return 'fresh';},async(token)=>{
    attempts.push(token);
    if(token==='expired')throw Object.assign(new Error('Unauthorized'),{status:401});
    return {members:8};
  });
  assert.deepEqual(attempts,['expired','fresh']);
  assert.equal(refreshes,1);
  assert.deepEqual(result,{value:{members:8},token:'fresh'});
});
test('a validation failure does not refresh or retry',async()=>{
  let attempts=0;
  await assert.rejects(withRefreshedSession('valid',async()=>{throw new Error('unexpected refresh');},async()=>{
    attempts++;
    throw Object.assign(new Error('Missing phone'),{status:400});
  }),/Missing phone/);
  assert.equal(attempts,1);
});
test('a failed refresh asks the user to sign in and does not resubmit',async()=>{
  let attempts=0;
  await assert.rejects(withRefreshedSession('expired',async()=>null,async()=>{
    attempts++;
    throw Object.assign(new Error('Unauthorized'),{status:401});
  }),/Войдите заново/);
  assert.equal(attempts,1);
});
