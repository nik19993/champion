// Usage: node scripts/verify-curriculum-redistribution.mjs /path/to/pglite/dist/index.js
// Fully isolated synthetic PostgreSQL test. No Supabase or production requests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const before=JSON.parse(execFileSync('git',['show','324a928a64b242227e83d85ec0b6460e2c3aa4a2:supabase/seed/approved_curriculum_20261024.json'],{cwd:root,encoding:'utf8'}));
const after=JSON.parse(await readFile(path.join(root,'supabase/seed/approved_curriculum_20261024.json'),'utf8'));
const sql=await readFile(path.join(root,'release/2026-10-25/redistribute_curriculum.sql'),'utf8');
const uuid=index=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const rows=before.map((task,index)=>({...task,id:uuid(index+1),is_active:true,goalkeeper_stage:task.goalkeeper_stage||null}));
rows.push({...rows[0],id:uuid(999),is_active:false});
const columns='id,phase,level,component,title,description,age_from,age_to,sort_order,is_active,audience,goalkeeper_stage,context';
const types='id uuid,phase text,level text,component text,title text,description text,age_from smallint,age_to smallint,sort_order integer,is_active boolean,audience text,goalkeeper_stage text,context text';
const setup=async()=>{
  const db=new PGlite();
  await db.exec(`create table methodology_tasks(id uuid primary key,phase text,level text,component text,title text,description text,age_from smallint,age_to smallint,sort_order integer,is_active boolean,audience text,goalkeeper_stage text,context text,updated_at timestamptz default now());
    create table events(id uuid primary key,task_id uuid references methodology_tasks(id),notes text);
    create table methodology_materials(id uuid primary key,task_id uuid references methodology_tasks(id),notes text);
    create function touch_task() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
    create trigger touch_task before update on methodology_tasks for each row execute function touch_task();`);
  await db.query(`insert into methodology_tasks(${columns}) select ${columns} from jsonb_to_recordset($1::jsonb) as t(${types})`,[JSON.stringify(rows)]);
  await db.query('insert into events values($1,$2,$3)',[uuid(1001),uuid(131),'Historical U11 event must retain its task link.']);
  await db.query('insert into methodology_materials values($1,$2,$3)',[uuid(1002),uuid(158),'Existing task material must retain its link.']);
  return db;
};
const snapshot=async db=>(await db.query('select to_jsonb(t) as row from methodology_tasks t order by id')).rows;
const db=await setup();
try {
  await db.exec(sql);
  const actual=(await db.query(`select ${columns} from methodology_tasks order by id`)).rows;
  const expected=after.map((task,index)=>({...task,id:uuid(index+1),is_active:true,goalkeeper_stage:task.goalkeeper_stage||null}));
  expected.push(rows.at(-1));
  assert.deepEqual(actual,expected);
  assert.equal((await db.query('select task_id::text from events')).rows[0].task_id,uuid(131));
  assert.equal((await db.query('select task_id::text from methodology_materials')).rows[0].task_id,uuid(158));
  const first=await snapshot(db);
  await db.exec(sql);
  assert.deepEqual(await snapshot(db),first,'Reapplying an already applied release must make no writes.');
} finally {await db.close();}

const drift=await setup();
try {
  await drift.query("update methodology_tasks set description='A separately edited task' where id=$1",[uuid(158)]);
  const first=await snapshot(drift);
  await assert.rejects(()=>drift.exec(sql),/differs from the reviewed source/);
  await drift.exec('rollback');
  assert.deepEqual(await snapshot(drift),first,'A concurrent edit must roll back the entire redistribution.');
} finally {await drift.close();}
console.log('PASS: complete catalog equality, task identities, archived history, event/material links, idempotency, and atomic rollback on drift.');
