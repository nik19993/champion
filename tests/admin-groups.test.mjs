import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_GROUP_SECTIONS, groupsForAdminSection, groupDeletionBlocker, parseGroupDeletionStatus } from '../lib/domain/admin-groups.ts';
import { deleteEmptyGroup, loadGroupDeletionStatus } from '../lib/supabase/group-deletion.ts';

const groupId='group';
const status={id:groupId,code:'Локація № 15 Junior',is_active:true,player_count:0,future_event_count:0,weekly_slot_count:0};
const timing={timeoutMs:10,verifyTimeoutMs:10};
function fixture(options={}) {
  const calls=[],signals=[];
  return {calls,signals,client:{rpc(name,args){
    calls.push({name,args});
    return {abortSignal(signal){signals.push(signal);return {then(resolve,reject){return Promise.resolve().then(()=>{
      if ((name==='delete_empty_group'&&options.writeHangs)||(name==='empty_group_deletion_status'&&options.readHangs)) return new Promise(()=>{});
      return name==='delete_empty_group'
        ? {data:{id:groupId,already_deleted:false},error:options.businessError??null}
        : {data:options.state??{...status,is_active:false},error:null};
    }).then(resolve,reject);}};}};
  }}};
}

test('main, location and goalkeeper tabs are disjoint and preserve all three keeper identities',()=>{
  const groups=[{id:'main',group_kind:'age'},{id:'location',group_kind:'location'},...['A','B','C'].map(id=>({id,group_kind:'goalkeeper'}))];
  assert.deepEqual(ADMIN_GROUP_SECTIONS.map(s=>s.label),['Основні групи','Групи локацій','Групи воротарів']);
  assert.deepEqual(groupsForAdminSection(groups,'main').map(g=>g.id),['main']);
  assert.deepEqual(groupsForAdminSection(groups,'location').map(g=>g.id),['location']);
  assert.deepEqual(groupsForAdminSection(groups,'goalkeeper').map(g=>g.id),['A','B','C']);
  assert.equal(new Set(ADMIN_GROUP_SECTIONS.flatMap(s=>groupsForAdminSection(groups,s.value)).map(g=>g.id)).size,groups.length);
});
test('deletion is blocked by members and active planning, with history alone allowed',()=>{
  assert.equal(groupDeletionBlocker(status),null);
  for(const key of ['player_count','future_event_count','weekly_slot_count']) assert.ok(groupDeletionBlocker({...status,[key]:1}));
});
test('malformed, truncated and wrong-group deletion previews fail closed',()=>{
  assert.deepEqual(parseGroupDeletionStatus(status,groupId),status);
  for(const value of [null,{}, {...status,id:'other'},{...status,player_count:-1},{...status,player_count:undefined},{...status,weekly_slot_count:'0'}]) assert.throws(()=>parseGroupDeletionStatus(value,groupId));
});
test('confirmed deletion submits exactly one checked RPC',async()=>{
  const f=fixture();await deleteEmptyGroup(f.client,groupId);
  assert.deepEqual(f.calls,[{name:'delete_empty_group',args:{p_group_id:groupId}}]);
});
test('a business rejection is preserved and does not imply deletion',async()=>{
  const error={code:'23514',message:'GROUP_HAS_PLAYERS'},f=fixture({businessError:error});
  await assert.rejects(deleteEmptyGroup(f.client,groupId),e=>e===error);
  assert.equal(f.calls.length,1);
});
test('a lost response is confirmed by reading state without repeating deletion',async()=>{
  const f=fixture({writeHangs:true});await deleteEmptyGroup(f.client,groupId,timing);
  assert.deepEqual(f.calls.map(c=>c.name),['delete_empty_group','empty_group_deletion_status']);
  assert.equal(f.signals[0].aborted,true);
});
test('active, unknown and unreadable groups are never reported as deleted',async()=>{
  for(const options of [{state:status},{readHangs:true},{state:{...status,id:'other'}}]) {
    const f=fixture({writeHangs:true,...options});
    await assert.rejects(deleteEmptyGroup(f.client,groupId,timing),/GROUP_DELETE_TIMEOUT/);
    assert.equal(f.calls.filter(c=>c.name==='delete_empty_group').length,1);
  }
});
test('a stalled preview releases the interface with a bounded error',async()=>{
  const f=fixture({readHangs:true});await assert.rejects(loadGroupDeletionStatus(f.client,groupId,10),/GROUP_DELETE_TIMEOUT/);
  assert.equal(f.signals[0].aborted,true);
});
