import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedTrainingVenue, groupsInScope, groupScopeOptions, locationAgeRange, locationGroupCode } from '../lib/domain/location-groups.ts';
import { taskForGroup } from '../lib/domain/curriculum.ts';
import { previewSeason } from '../lib/domain/seasons.ts';

const main = { id:'main',code:'U9A',age:9,group_kind:'age',location_id:null,cohort_birth_year:2018 };
const keeper = { id:'keeper',code:'Воротарі A',age:null,group_kind:'goalkeeper' };
const one = { id:'one',code:'Локація № 2 A',group_kind:'location',age:null,team_suffix:'A',location_id:'school2',location:{id:'school2',school_number:2,name:'ЗОШ № 2',venue_id:'hall2'} };
const two = { ...one,id:'two',code:'Локація № 2 B',team_suffix:'B' };
const other = { ...one,id:'other',code:'Локація № 15 C',team_suffix:'C',location_id:'school15',location:{id:'school15',school_number:15,name:'ЗОШ № 15',venue_id:'hall15'} };
const groups=[main,keeper,one,two,other];

test('reports distinguish organization membership from the physical venue',()=>{
  assert.deepEqual(groupsInScope(groups,'main').map(g=>g.id),['main','keeper']);
  assert.deepEqual(groupsInScope(groups,'locations').map(g=>g.id),['one','two','other']);
  assert.deepEqual(groupsInScope(groups,'location:school2').map(g=>g.id),['one','two']);
  assert.deepEqual(groupsInScope(groups,'group:two'),[two]);
  assert.equal(groupsInScope(groups,'all').length,5);
  assert.deepEqual(groupsInScope(groups,'location:missing'),[]);
  assert.deepEqual(groupsInScope(groups,'unexpected'),[]);
  assert.equal(groupScopeOptions(groups).filter(o=>o.value==='location:school2').length,1);
});

test('location names and age bands exclude the undecided preschool category',()=>{
  assert.equal(locationGroupCode(2,'A'),'Локація № 2 A');
  for(const number of [0,-1,2.5,10000,NaN]) assert.equal(locationGroupCode(number,'A'),null);
  assert.equal(locationGroupCode(15,'preschool'),null);
  assert.equal(locationAgeRange(main),null);
  for(const [category,min,max] of [['A',6,8],['B',9,12],['C',13,17]]) {
    const group={...one,team_suffix:category};
    assert.deepEqual([locationAgeRange(group).min,locationAgeRange(group).max],[min,max]);
    for(let age=4;age<=18;age++) {
      const task={is_active:true,audience:'field',age_from:age,age_to:age};
      assert.equal(taskForGroup(task,group),age>=min&&age<=max);
      assert.equal(taskForGroup({...task,audience:'goalkeeper'},group),false);
    }
  }
});

test('location training uses its assigned hall while games retain their venue choice',()=>{
  assert.equal(fixedTrainingVenue(one,'training'),'hall2');
  assert.equal(fixedTrainingVenue(other,'training'),'hall15');
  assert.equal(fixedTrainingVenue(one,'oblast'),null);
  assert.equal(fixedTrainingVenue(main,'training'),null);
  assert.equal(fixedTrainingVenue(undefined,'training'),null);
});

test('a season change leaves broad location categories outside cohort advancement',()=>{
  const rows=previewSeason(groups,2027);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'main');
  assert.equal(rows[0].next,'U10');
});
