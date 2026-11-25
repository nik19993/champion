import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCoachUsers, saveCoachAssignment } from '../lib/supabase/admin-coach-assignment.ts';

const timing={timeoutMs:15,verifyTimeoutMs:15};
const hang=()=>new Promise(()=>{});
function fixture(options={}) {
  const calls=[],signals=[];
  class Read {
    constructor(table){this.table=table;}
    select(){return this;} eq(){return this;} neq(){return this;} order(){return this;}
    abortSignal(signal){this.signal=signal;signals.push(signal);return this;}
    single(){this.one=true;return this;} maybeSingle(){this.one=true;return this;}
    then(resolve,reject){return Promise.resolve().then(()=>{
      calls.push(`read:${this.table}`);
      if(options.readHangs)return hang();
      const actor={id:'administrator',role:options.actorRole??'admin',status:'active'};
      return {data:this.table==='profiles'?(this.one?actor:[actor]):options.absent?null:{is_active:options.saved??true},error:null};
    }).then(resolve,reject);}
  }
  const client={
    from:table=>new Read(table),
    rpc:(name,args)=>({abortSignal(signal){signals.push(signal);return {then(resolve,reject){return Promise.resolve().then(()=>{
      calls.push({name,args});
      if(options.rpcHangs)return hang();
      if(options.networkError)throw new Error('connection interrupted');
      return {error:options.rpcError??null};
    }).then(resolve,reject);}};}}),
    auth:{
      getSession:options.getSession??(async()=>({data:{session:options.noSession?null:{user:{id:'administrator'}}},error:null})),
      refreshSession:()=>{throw new Error('A fresh token must not be forcibly refreshed');},
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:options.level??'aal2'},error:null})},
    },
  };
  return {client,calls,signals};
}
test('a fresh administrator session saves exactly the requested goal without forcing a token refresh',async()=>{
  for(const assigned of [true,false]) {
    const f=fixture();
    assert.deepEqual(await saveCoachAssignment(f.client,'coach','group',assigned),{confirmedAfterRetry:false});
    assert.deepEqual(f.calls,[{name:'admin_set_coach_group',args:{p_coach_id:'coach',p_group_id:'group',p_assigned:assigned}}]);
  }
});
test('signed-out and AAL1 sessions never submit an assignment',async()=>{
  for(const [settings,code] of [[{noSession:true},'UNAUTHORIZED'],[{level:'aal1'},'MFA_REQUIRED']]) {
    const f=fixture(settings);
    await assert.rejects(saveCoachAssignment(f.client,'coach','group',true),error=>error.code===code);
    assert.deepEqual(f.calls,[]);
  }
});
test('a stalled session check times out and never writes later when the old promise resolves',async()=>{
  let release;
  const f=fixture({getSession:()=>new Promise(resolve=>{release=resolve;})});
  await assert.rejects(saveCoachAssignment(f.client,'coach','group',true,timing),error=>error.code==='ASSIGNMENT_TIMEOUT');
  release({data:{session:{user:{id:'administrator'}}},error:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.calls,[]);
});
test('a lost RPC response is reconciled by reading state without repeating the write',async()=>{
  const f=fixture({rpcHangs:true,saved:true});
  assert.deepEqual(await saveCoachAssignment(f.client,'coach','group',true,timing),{confirmedAfterRetry:true});
  assert.equal(f.calls.filter(call=>typeof call==='object').length,1);
  assert.deepEqual(f.calls.filter(call=>typeof call==='string'),['read:profiles','read:coach_group_assignments']);
  assert.equal(f.signals[0].aborted,true);
});
test('unconfirmed and unreadable saves return an explicit uncertainty instead of false success',async()=>{
  for(const settings of [{saved:false},{readHangs:true},{actorRole:'coach'}]) {
    const f=fixture({rpcHangs:true,...settings});
    await assert.rejects(saveCoachAssignment(f.client,'coach','group',true,timing),error=>error.code==='ASSIGNMENT_STATUS_UNKNOWN');
    assert.equal(f.calls.filter(call=>typeof call==='object').length,1);
  }
});
test('a network error after a committed removal confirms the absent assignment',async()=>{
  const f=fixture({networkError:true,absent:true});
  assert.deepEqual(await saveCoachAssignment(f.client,'coach','group',false,timing),{confirmedAfterRetry:true});
});
test('a business-rule rejection remains a business error and does not claim a network timeout',async()=>{
  const rpcError={code:'23514',message:'COACH_GROUP_LIMIT_REACHED'};
  const f=fixture({rpcError});
  await assert.rejects(saveCoachAssignment(f.client,'coach','group',true),error=>error===rpcError);
  assert.equal(f.calls.filter(call=>typeof call==='string').length,0);
});
test('a hung user-list request also releases the UI through a bounded error',async()=>{
  const f=fixture({readHangs:true});
  await assert.rejects(loadCoachUsers(f.client,15),error=>error.code==='ASSIGNMENT_TIMEOUT');
  assert.equal(f.signals[0].aborted,true);
});
