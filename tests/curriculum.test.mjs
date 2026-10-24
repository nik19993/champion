import test from 'node:test';
import assert from 'node:assert/strict';
import {taskForGroup,taskLabel} from '../lib/domain/curriculum.ts';
const task={id:'t',is_active:true,audience:'field',age_from:11,age_to:11,title:'Навчити відкриватися.',component:'Відкривання',description:'(Партнер бачить рух.)'};
test('a task is one continuous label including its element and parenthetical guidance',()=>{
 assert.equal(taskLabel(task),'Відкривання. Навчити відкриватися. (Партнер бачить рух.)');
 assert.equal(taskLabel({...task,description:null}),'Відкривання. Навчити відкриватися.');
});
test('age tasks never transfer to another season category or U17',()=>{
 const group={code:'U11A',age:11,group_kind:'age'};
 assert.equal(taskForGroup(task,group),true);
 assert.equal(taskForGroup(task,{...group,display_age:12}),false);
 assert.equal(taskForGroup({...task,age_to:16},group),false);
 assert.equal(taskForGroup({...task,age_from:17,age_to:17},{...group,age:17}),false);
 assert.equal(taskForGroup({...task,is_active:false},group),false);
});
test('GK A/B/C only receive their own program, never field tasks',()=>{
 for(const stage of ['A','B','C']){
  const group={code:'Воротарі '+stage,age:null,team_suffix:stage,group_kind:'goalkeeper'};
  assert.equal(taskForGroup(task,group),false);
  for(const target of ['A','B','C'])assert.equal(taskForGroup({...task,audience:'goalkeeper',goalkeeper_stage:target},group),target===stage);
 }
 assert.equal(taskForGroup({...task,audience:'goalkeeper',goalkeeper_stage:'A'},{code:'U11',age:11,group_kind:'age'}),false);
});

test('the approved catalog includes attack and defence standard situations for field and goalkeeper programs', async(t)=>{
 const {readFile}=await import('node:fs/promises');
 try { await readFile(new URL('../supabase/seed/approved_curriculum_20261024.json',import.meta.url)); } catch(error) { if(error.code==='ENOENT'){t.skip('Full curriculum is kept in the private release package.');return;} throw error; }
 const rows=JSON.parse(await readFile(new URL('../supabase/seed/approved_curriculum_20261024.json',import.meta.url),'utf8'));
 const expected={field:{attack:26,defence:25},goalkeeper:{attack:6,defence:7}};
 for(const audience of ['field','goalkeeper'])for(const phase of ['attack','defence']){
  assert.equal(rows.filter(t=>t.audience===audience&&t.phase===phase&&t.context==='standard').length,expected[audience][phase]);
 }
 const u11={code:'U11A',age:11,group_kind:'age'};
 assert.equal(rows.filter(t=>taskForGroup({...t,is_active:true},u11)&&t.context==='standard').length,3);
});
