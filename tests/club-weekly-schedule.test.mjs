import assert from "node:assert/strict";
import test from "node:test";
import {
  groupScheduleByDay, groupScheduleByVenue, sameScheduleSlot, scheduleCoachLabel, scheduleConflicts,
  scheduleVenuePartLabel, slotVenueLabel,
} from "../lib/domain/club-weekly-schedule.ts";

const booked = {
  id: "monday-session", weekday: 1, start_time: "17:00:00", end_time: "18:00:00",
  group_id: "u13a", group_code: "U13A", coach_id: "coach-1", coach_name: "Тренер 1",
  venue_id: "legacy-left-half", venue_name: "Поле №2 — ліва половина",
  booking_venue_id: "field-2", booking_venue_name: "Поле №2", venue_part: "left",
};
const candidate = {
  weekday: 1, start_time: "17:30", end_time: "18:30", group_id: "u10a", coach_id: "coach-2",
  venue_id: "field-2", booking_venue_id: "field-2", venue_part: "right",
};

test("distinct halves can coexist and an entire field overlaps a legacy linked half", () => {
  assert.deepEqual(scheduleConflicts(candidate, [booked]), []);
  assert.deepEqual(scheduleConflicts({ ...candidate, venue_part: "whole" }, [booked]), [
    { slot: booked, reasons: ["майданчик"] },
  ]);
  assert.equal(slotVenueLabel(booked), "Поле №2 · ліва половина");
});

test("group and coach overlaps are reported across different venues", () => {
  const proposal = { ...candidate, group_id: booked.group_id, coach_id: booked.coach_id, booking_venue_id: "field-1" };
  assert.deepEqual(scheduleConflicts(proposal, [booked]), [{ slot: booked, reasons: ["група", "тренер"] }]);
});

test("adjacent times, other weekdays and the record being edited do not conflict", () => {
  const proposal = { ...candidate, venue_part: "whole" };
  assert.deepEqual(scheduleConflicts({ ...proposal, start_time: "18:00" }, [booked]), []);
  assert.deepEqual(scheduleConflicts({ ...proposal, weekday: 2 }, [booked]), []);
  assert.deepEqual(scheduleConflicts(proposal, [booked], booked.id), []);
});

test("timestamps from the database and form match to the minute when retrying", () => {
  assert.equal(sameScheduleSlot(booked, { ...booked, start_time: "17:00", end_time: "18:00" }), true);
  assert.equal(sameScheduleSlot(booked, { ...booked, start_time: "17:30" }), false);
});

test("venue groups contain only scheduled venues and sort by venue, day and start time", () => {
  const linkedHalf = { ...booked, booking_venue_name: "Майданчик 2" };
  const otherHalf = {
    ...linkedHalf, id: "right", start_time: "16:30:00", venue_id: "field-2",
    venue_name: "Майданчик 2", venue_part: "right",
  };
  const laterDay = { ...otherHalf, id: "tuesday", weekday: 2, start_time: "15:00:00" };
  const fieldOne = { ...booked, id: "field-one", booking_venue_id: "field-1", booking_venue_name: "Майданчик 1", venue_part: "whole" };
  const schoolHall = { ...booked, id: "school", booking_venue_id: "school", booking_venue_name: "Зал ЗОШ 26", venue_part: "whole" };
  const unassigned = { ...booked, id: "unassigned", venue_id: null, venue_name: null, booking_venue_id: null, booking_venue_name: null };
  const input = [unassigned, schoolHall, laterDay, linkedHalf, fieldOne, otherHalf];
  const groups = groupScheduleByVenue(input);

  assert.deepEqual(groups.map(({ name, slots }) => [name, slots.map(({ id }) => id)]), [
    ["Майданчик 1", ["field-one"]],
    ["Майданчик 2", ["right", "monday-session", "tuesday"]],
    ["Спортивний зал ЗОШ №26", ["school"]],
    ["Майданчик не вказано", ["unassigned"]],
  ]);
  assert.deepEqual(groupScheduleByVenue([]), []);
  assert.equal(scheduleVenuePartLabel(fieldOne), "Усе поле");
  assert.equal(scheduleVenuePartLabel(schoolHall), "Увесь зал");
  assert.equal(scheduleVenuePartLabel(linkedHalf), "Ліва половина");
  assert.equal(scheduleVenuePartLabel(otherHalf), "Права половина");
  assert.equal(scheduleVenuePartLabel(unassigned), "—");
  assert.deepEqual(input.map(({ id }) => id), ["unassigned", "school", "tuesday", "monday-session", "field-one", "right"]);
});

test("coach labels keep the initials that distinguish the two Andriieshyn coaches", () => {
  assert.equal(scheduleCoachLabel(" Андрієшин  Роман Михайлович "), "Андрієшин Р.");
  assert.equal(scheduleCoachLabel("Андрієшин Дмитро Михайлович"), "Андрієшин Д.");
  assert.equal(scheduleCoachLabel("Кондзьолка Андрій"), "Кондзьолка");
  assert.equal(scheduleCoachLabel(null), "Тренера не вказано");
});

test("the weekly view completes each day before listing venues on the next day", () => {
  const mondayFieldTwo = { ...booked, booking_venue_name: "Майданчик 2" };
  const mondayFieldOne = { ...booked, id: "monday-field-one", booking_venue_id: "field-1", booking_venue_name: "Майданчик 1" };
  const tuesdayFieldOne = { ...mondayFieldOne, id: "tuesday-field-one", weekday: 2, start_time: "16:00:00" };
  const slots = [tuesdayFieldOne, mondayFieldTwo, mondayFieldOne];
  const days = groupScheduleByDay(slots);

  assert.deepEqual(days.slice(0, 2).map(({ label }) => label), ["Понеділок", "Вівторок"]);
  assert.deepEqual(days[0].venues.map(({ name }) => name), ["Майданчик 1", "Майданчик 2"]);
  assert.deepEqual(days[0].venues.flatMap(({ slots }) => slots.map(({ id }) => id)), ["monday-field-one", "monday-session"]);
  assert.deepEqual(days[1].venues.flatMap(({ slots }) => slots.map(({ id }) => id)), ["tuesday-field-one"]);
  assert.deepEqual(days.at(-1)?.venues, []);
  assert.deepEqual(groupScheduleByDay(slots, 2), [days[1]]);
});
