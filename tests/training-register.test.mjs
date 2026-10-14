import test from "node:test";
import assert from "node:assert/strict";
import { completionResult, trainingRegisterLabel, trainingRegisterState } from "../lib/domain/training-register.ts";

const session = { id: "session", completed_at: "2026-10-14T09:00:00Z", server_version: 2 };
const completion = { completed_at: "2026-10-14T10:00:00Z", attendance_version: 2, present_count: 18, player_count: 20, card_count: 2 };

test("opening attendance is never confused with confirming the whole training register", () => {
  assert.equal(trainingRegisterState({ attendance_sessions: null }).completed, false);
  assert.equal(trainingRegisterState({ attendance_sessions: session }).attendanceSaved, true);
  assert.equal(trainingRegisterState({ attendance_sessions: session }).completed, false);
  assert.match(trainingRegisterLabel({ attendance_sessions: session }), /облік не завершено/);
});
test("saved completion supports one-to-one object, array, null and empty relations", () => {
  for (const shape of [completion, [completion]]) {
    for (const attendance of [session, [session]]) {
      const event = { attendance_sessions: attendance, training_register_completions: shape };
      assert.equal(trainingRegisterState(event).completed, true);
      assert.match(trainingRegisterLabel(event), /18 із 20 · жовтих карток 2/);
    }
  }
  for (const missing of [null, [], undefined]) assert.equal(trainingRegisterState({ attendance_sessions: session, training_register_completions: missing }).completed, false);
});
test("new attendance versions, invalidated cards and pending offline edits cannot show completed", () => {
  const event = { attendance_sessions: session, training_register_completions: completion };
  assert.equal(trainingRegisterState({ ...event, attendance_sessions: { ...session, server_version: 3 } }).completed, false);
  assert.equal(trainingRegisterState({ ...event, training_register_completions: { ...completion, completed_at: null } }).completed, false);
  for (const attendance_sync of ["pending", "unknown"]) assert.equal(trainingRegisterState({ ...event, attendance_sync }).completed, false);
  assert.match(trainingRegisterLabel({ ...event, attendance_sync: "pending" }), /Очікує синхронізації/);
});
test("only a valid server confirmation can be reported as successful", () => {
  assert.deepEqual(completionResult(completion), completion);
  for (const invalid of [null, [], {}, "success", { ...completion, completed_at: null }, { ...completion, player_count: 1 }, { ...completion, card_count: -1 }, { ...completion, attendance_version: "2" }]) assert.equal(completionResult(invalid), null);
});
