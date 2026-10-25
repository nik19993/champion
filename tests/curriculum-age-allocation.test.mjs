import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { taskForGroup } from '../lib/domain/curriculum.ts';

const rows = JSON.parse(await readFile(new URL('../supabase/seed/approved_curriculum_20261024.json', import.meta.url), 'utf8'));
const group = age => ({code:`U${age}`, age, group_kind:'age'});
const tasksFor = age => rows.filter(task => taskForGroup({...task,is_active:true}, group(age)));

test('approved redistribution retains all 349 tasks with a balanced age allocation', () => {
  assert.equal(rows.length,349);
  assert.equal(rows.filter(task => task.audience === 'field').length,284);
  assert.deepEqual(Object.fromEntries(Array.from({length:11},(_,i)=>[i+6,tasksFor(i+6).length])),{6:16,7:20,8:26,9:30,10:29,11:30,12:30,13:26,14:26,15:29,16:22});
  for (const [stage,total] of [['A',19],['B',26],['C',20]]) assert.equal(rows.filter(task => task.audience === 'goalkeeper' && task.goalkeeper_stage === stage).length,total);
});

test('first-ball tasks start at U14 and complex first-contact decisions are assigned to U15', () => {
  for (let age=6;age<14;age++) assert.equal(tasksFor(age).filter(task=>task.component === 'Боротьба за перший м’яч').length,0);
  assert.deepEqual(tasksFor(14).filter(task=>task.component === 'Боротьба за перший м’яч').map(task=>task.sort_order),[104,131,132]);
  assert.deepEqual(tasksFor(15).filter(task=>task.component === 'Боротьба за перший м’яч').map(task=>task.sort_order),[160,189]);
  for (const order of [198,199,202]) assert.equal(rows.find(task=>task.sort_order===order).age_from,15);
  assert.equal(rows.find(task=>task.sort_order===158).age_from,14);
});

test('accessible U14 goals move to U13 while short corners, low crosses and no-heading layoffs remain', () => {
  for (const order of [213,214,222,236]) assert.ok(tasksFor(13).some(task=>task.sort_order===order));
  assert.ok(tasksFor(8).some(task=>task.sort_order===55 && task.title.includes('короткий розіграш')));
  assert.ok(tasksFor(11).find(task=>task.sort_order===130).description.includes('низом'));
  assert.ok(tasksFor(12).find(task=>task.sort_order===159).description.includes('без гри головою'));
  assert.equal(tasksFor(17).length,0);
});
