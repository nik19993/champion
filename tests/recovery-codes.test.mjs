import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecoveryCode } from '../lib/auth/verify-recovery-code.ts';
import { recoveryCodeError } from '../lib/auth/recovery-codes.ts';

function client({rejected=false,level='aal2',assuranceError=null}={}) {
  const calls=[];
  return {calls,auth:{mfa:{recoveryCodes:{verify:async({code})=>{calls.push(code);return {error:rejected?{code:'mfa_verification_failed'}:null};}},getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error:assuranceError})}}};
}
test('recovery needs a successful server verification and an upgraded MFA session',async()=>{
  const valid=client();
  await verifyRecoveryCode(valid,'abcd-efgh-2345-6789');
  assert.deepEqual(valid.calls,['ABCDEFGH23456789']);
  for(const settings of [{rejected:true},{level:'aal1'},{assuranceError:new Error('offline')}]) {
    await assert.rejects(verifyRecoveryCode(client(settings),'ABCDEFGH23456789'));
  }
});
test('short personal answers cannot be submitted as a recovery code',async()=>{
  const api=client();
  await assert.rejects(verifyRecoveryCode(api,'pet-name'));
  assert.deepEqual(api.calls,[]);
});
test('recovery failures show safe instructions without exposing backend secrets',()=>{
  assert.match(recoveryCodeError({status:429}),/Забагато спроб/);
  assert.match(recoveryCodeError({code:'mfa_recovery_codes_verify_not_enabled'}),/ще не ввімкнено/);
  assert.doesNotMatch(recoveryCodeError({message:'private token xyz'}),/xyz/);
});
