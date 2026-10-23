"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminEventModal } from "@/components/admin/admin-plan";
import { EmptyState, LoadingState, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { combineKyivDateTime, EVENT_LABELS, formatTime, kyivDateKey } from "@/lib/domain/format";
import { firstRelation } from "@/lib/domain/operational-report";
import { groupCode } from "@/lib/domain/seasons";
import { VENUE_PART_LABELS, VENUE_SELECT, venueSupportsHalves, type VenuePart } from "@/lib/domain/venue-booking";
import { venueFreeIntervals, venueOccupiedIntervals, type OccupancyEvent } from "@/lib/domain/venue-occupancy";
import type { EventType, Venue } from "@/lib/domain/types";

interface Booking extends OccupancyEvent {
  event_type: EventType; title: string | null;
  groups: { code:string; display_code?:string|null } | null;
  coach: { full_name:string } | null; substitute: { full_name:string } | null;
}
const EVENT_SELECT="id,venue_id,booking_venue_id,venue_part,start_at,ends_at,status,event_type,title,groups(code,display_code),coach:profiles!events_coach_id_fkey(full_name),substitute:profiles!events_substitute_coach_id_fkey(full_name)";

export function VenueOccupancy({client}:{client:SupabaseClient}) {
  const [date,setDate]=useState(()=>kyivDateKey(new Date()));
  const [minimum,setMinimum]=useState("60");
  const [data,setData]=useState<{venues:Venue[];bookings:Booking[]}|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const [opened,setOpened]=useState<string|null>(null);
  const request=useRef(0);
  const start=date?new Date(combineKyivDateTime(date,"09:00")).getTime():NaN;
  const end=date?new Date(combineKyivDateTime(date,"21:00")).getTime():NaN;
  const minutes=Number(minimum),validDuration=/^\d+$/.test(minimum)&&minutes>=15&&minutes<=360;
  const load=useCallback(async()=>{
    const ticket=++request.current;
    if(!Number.isFinite(start)||!Number.isFinite(end)){setLoading(false);setError("Оберіть дату.");return;}
    setLoading(true);setError(null);
    try {
      const venues=await client.from("venues").select(VENUE_SELECT).order("name");
      if(venues.error||!Array.isArray(venues.data))throw Error();
      const bookings:Booking[]=[];let expected:number|undefined;
      for(;;){
        const result=await client.from("events").select(EVENT_SELECT,{count:"exact"}).eq("status","scheduled").lt("start_at",new Date(end).toISOString()).gt("ends_at",new Date(start).toISOString()).order("id").range(bookings.length,bookings.length+499);
        if(result.error||!Array.isArray(result.data)||result.count==null)throw Error();
        expected??=result.count;
        if(expected!==result.count||(!result.data.length&&bookings.length<expected))throw Error();
        bookings.push(...result.data as unknown as Booking[]);
        if(bookings.length===expected)break;
        if(bookings.length>expected)throw Error();
      }
      if(new Set(bookings.map(row=>row.id)).size!==bookings.length)throw Error();
      for(const row of bookings)if(!Number.isFinite(Date.parse(row.start_at))||!Number.isFinite(Date.parse(row.ends_at))||Date.parse(row.ends_at)<=Date.parse(row.start_at))throw Error();
      if(ticket===request.current)setData({venues:venues.data as Venue[],bookings});
    } catch {if(ticket===request.current)setError("Не вдалося повністю перевірити завантаженість. Оновіть дані перед пошуком вільного часу.");}
    finally {if(ticket===request.current)setLoading(false);}
  },[client,end,start]);
  const invalidateRequests=useCallback(()=>{request.current++;},[]);
  useEffect(()=>{void load();return invalidateRequests;},[invalidateRequests,load]);
  useEffect(()=>{const refresh=()=>void load();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[load]);
  const visible=(data?.venues??[]).filter(venue=>!venue.parent_venue_id&&(venue.is_active||data?.bookings.some(row=>(row.booking_venue_id??row.venue_id)===venue.id)));
  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Завантаженість і вільний час" title="Майданчики" description="Усі поля та зали · 09:00–21:00 за київським часом" />
    <section className="filter-bar"><label><span>Дата</span><input type="date" value={date} onChange={event=>setDate(event.target.value)} /></label><label><span>Потрібна тривалість, хв</span><input type="text" inputMode="numeric" value={minimum} onChange={event=>{if(/^\d*$/.test(event.target.value))setMinimum(event.target.value);}} /></label><button type="button" className="secondary-action" disabled={loading} onClick={()=>void load()}>Оновити завантаженість</button></section>
    {!validDuration&&<StatusMessage kind="warning">Для пошуку вільного часу вкажіть від 15 до 360 хвилин.</StatusMessage>}
    {loading?<LoadingState />:error?<StatusMessage kind="error">{error}</StatusMessage>:!visible.length?<EmptyState title="Майданчиків ще немає" />:<div className="occupancy-venues">{visible.map(venue=>{
      const bookings=data!.bookings.filter(row=>(row.booking_venue_id??row.venue_id)===venue.id).sort((a,b)=>a.start_at.localeCompare(b.start_at));
      const parts:VenuePart[]=venueSupportsHalves(venue)?["whole","left","right"]:["whole"];
      return <section className="panel-section occupancy-venue" key={venue.id}>
        <h2>{venue.name}{!venue.is_active&&<small> · неактивний</small>}</h2>
        <div className="occupancy-hours" aria-hidden="true"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span></div>
        {parts.map(part=>{
          const occupied=venueOccupiedIntervals(bookings,venue.id,part,start,end);
          const free=validDuration?venueFreeIntervals(occupied,start,end,minutes):[];
          return <div className="occupancy-row" key={part}>
            <b>{part==="whole"&&venueSupportsHalves(venue)?"Усе поле / майданчик":VENUE_PART_LABELS[part]}</b>
            <div className="occupancy-track" aria-hidden="true">{occupied.map((slot,i)=><span className="occupancy-block" key={i} style={{left:`${(slot.start-start)/(end-start)*100}%`,width:`${(slot.end-slot.start)/(end-start)*100}%`}} />)}</div>
            <p className="occupancy-free"><strong>Вільно{validDuration?` від ${minutes} хв`:""}: </strong>{!validDuration?"Вкажіть тривалість":free.length?free.map(slot=>`${formatTime(new Date(slot.start))}–${formatTime(new Date(slot.end))} (${Math.round((slot.end-slot.start)/60000)} хв)`).join(" · "):"Відповідних проміжків немає"}</p>
          </div>;
        })}
        {bookings.length?<ul className="occupancy-bookings">{bookings.map(row=><li key={row.id}><div><strong>{formatTime(row.start_at)}–{formatTime(row.ends_at)} · {VENUE_PART_LABELS[row.venue_part]}</strong><span>{groupCode(firstRelation(row.groups))} · {firstRelation(row.substitute)?.full_name??firstRelation(row.coach)?.full_name??"Тренера не вказано"}</span><small>{EVENT_LABELS[row.event_type]}{row.title?` · ${row.title}`:""}</small></div><button type="button" className="secondary-action small" onClick={()=>setOpened(row.id)}>Відкрити подію</button></li>)}</ul>:<p>На цей день бронювань немає.</p>}
      </section>;
    })}</div>}
    <p className="muted">Зайнята половина робить усе поле недоступним на цей час. Скасовані та завершені події не блокують бронювання. Під час збереження сервер повторно перевіряє перетини.</p>
    {opened&&<AdminEventModal client={client} eventId={opened} onClose={()=>setOpened(null)} onSaved={()=>{setOpened(null);void load();}} />}
  </div>;
}
