import { createRoot } from "react-dom/client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { TrainingRegisterModal } from "../components/coach/training-register";
import { PlayerAchievementBehavior } from "../components/star/monthly-star";
import { EnhancedProgramManagement } from "../components/admin/program-management";
import { TerminologyManagement } from "../components/admin/admin-management-methodology";
import { EnhancedImportManagement } from "../components/admin/import-management";
import { createReviewTransport } from "./adapter.mjs";
// Internal HTTP QA lacks the secure-context convenience method. Uses the same
// cryptographic source; hosted HTTPS provides crypto.randomUUID natively.
if (!crypto.randomUUID) crypto.randomUUID = () => {
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const coach={id:"00000000-0000-4000-8000-000000000011",full_name:"Тестовий тренер",role:"coach",status:"active"};
const admin={id:"00000000-0000-4000-8000-000000000012",full_name:"Тестовий адміністратор",role:"admin",status:"active"};
const eventId="00000000-0000-4000-8000-000000000501";
const routes=[{id:"training",title:"Облік тренування",role:"coach"},{id:"player",title:"Профіль гравця",role:"coach"},{id:"tasks",title:"Завдання",role:"admin"},{id:"terms",title:"Словник",role:"admin"},{id:"import",title:"Імпорт",role:"admin"}];
function App(){
 const [ready,setReady]=useState(null),[error,setError]=useState(""),[route,setRoute]=useState("training"),[open,setOpen]=useState(false),[revision,setRevision]=useState(0),[playerId,setPlayerId]=useState("00000000-0000-4000-8000-000000000201");
 useEffect(()=>{let active=true;void(async()=>{
   const db=new PGlite("idb://champion-club-cards-review-v1",{extensions:{btree_gist}});await db.waitReady;
   const exists=(await db.query("select to_regclass('public.player_club_cards') as table_name")).rows[0].table_name;
   if(!exists){const sql=await fetch("/review-schema.sql").then(response=>{if(!response.ok)throw Error("Не завантажено тестові дані");return response.text();});await db.exec(sql);}
   await db.exec("reset role");const groups=(await db.query("select * from groups where id in('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102') order by code")).rows;
   const players=(await db.query("select * from players where group_id='00000000-0000-4000-8000-000000000101' order by full_name")).rows;
   const event=(await db.query("select * from events where id=$1",[eventId])).rows[0];
   const transport=createReviewTransport(db),client=transport(coach),adminClient=transport(admin);
   if(active)setReady({db,groups,players,event:{...JSON.parse(JSON.stringify(event)),groups:groups[0]},client,adminClient});
 })().catch(failure=>{if(active)setError(failure.message);});return()=>{active=false;};},[]);
 const selected=routes.find(item=>item.id===route);
 const player=ready?.players.find(item=>item.id===playerId);
 return <main className="review-shell">
  <header className="review-header"><Image src="/champion-club-emblem.jpg" width={56} height={64} alt="Чемпіон" /><div><p className="eyebrow">КЛУБ ЧЕМПІОН</p><h1>Перевірка погоджених змін</h1></div><span className="review-badge">Приватний тест</span></header>
  <div className="review-notice"><b>Вигадані гравці та дані</b><span>Можна змінювати, видаляти й завантажувати записи. Вони зберігаються у цьому браузері. Робочий застосунок не підключений.</span></div>
  <nav className="review-nav" aria-label="Тестові розділи">{routes.map(item=><button key={item.id} type="button" className={route===item.id?"selected":""} onClick={()=>{setRoute(item.id);setOpen(false);setRevision(value=>value+1);}}>{item.title}</button>)}</nav>
  {error?<div className="review-notice error" role="alert">{error}. Спробуйте перезавантажити сторінку; браузер має дозволяти локальне зберігання даних.</div>:!ready?<section className="review-loading"><span className="loading-star">★</span><h2>Готуємо контрольну версію…</h2><p>Перший запуск завантажує тестове середовище. Наступні відкриття будуть швидшими.</p></section>:<section className="review-workspace"><div className="review-section-title"><h2>{selected.title}</h2><span>{selected.role==="admin"?"Тестовий адміністратор":"Тестовий тренер"}</span></div>
   {route==="training"&&<><p>Відкрийте тренування, збережіть присутність, відзначте гравця карткою клубу й завершіть облік. Після цього перевірте лічильник у профілі.</p><button className="primary-action" onClick={()=>setOpen(true)}>Відкрити облік тренування</button>{open&&<TrainingRegisterModal client={ready.client} profile={coach} event={ready.event} onClose={()=>setOpen(false)} onChanged={()=>setRevision(value=>value+1)} onCompleted={()=>setRevision(value=>value+1)} />}</>}
   {route==="player"&&<><label className="review-player-select"><span>Гравець</span><select value={playerId} onChange={event=>setPlayerId(event.target.value)}>{ready.players.map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><PlayerAchievementBehavior key={`${playerId}:${revision}`} client={ready.client} profile={coach} player={player} /></>}
   {route==="tasks"&&<><p>Перевірте вибір кількох завдань, видалення вибраних або всього переліку. Наявне тестове тренування зберігає своє попереднє завдання.</p><EnhancedProgramManagement client={ready.adminClient} profile={admin} /></>}
   {route==="terms"&&<TerminologyManagement client={ready.adminClient} profile={admin} />}
   {route==="import"&&<><div className="review-samples"><b>Файли для спроби</b><a href="/sample-tasks.csv" download>Нові завдання U6–U17 · CSV</a><a href="/sample-terms.csv" download>Новий словник · CSV</a></div><p>Оберіть «Навчальні завдання» або «Термінологія». Для повної заміни позначте відповідний пункт, перевірте файл і підтвердьте заміну. У цьому тестовому режимі використовуйте CSV.</p><EnhancedImportManagement client={ready.adminClient} profile={admin} groups={ready.groups} /></>}
  </section>}
 </main>;
}
createRoot(document.getElementById("root")).render(<App />);
