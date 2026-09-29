import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/student-timeline.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", output)(exports);
const { buildStudentTimeline } = exports;

const programId = "program";
const studentId = "student";
const applications = [
  { id: "request-1", program_id: programId, student_profile_id: studentId, parent_profile_id: "parent", status: "rejected", payment_type: "monthly", requested_at: "2026-08-10T10:00:00Z" },
  { id: "request-2", program_id: programId, student_profile_id: studentId, parent_profile_id: "parent", status: "approved", payment_type: "annual", requested_at: "2026-08-20T10:00:00Z" },
];
const people = [
  { id: studentId, full_name: "Zach", email: "zach@example.test" },
  { id: "parent", full_name: "Anas", email: "anas@example.test" },
  { id: "director", full_name: "Director", email: "director@example.test" },
];

test("reconstructs historical application submissions and labels each decision attempt", () => {
  const events = buildStudentTimeline({
    scope: "application", applications, people,
    events: [
      { id: "reject-1", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "application_rejected", summary: "Rejected.", metadata: {}, created_at: "2026-08-11T10:00:00Z" },
      { id: "approve-2", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "application_approved", summary: "Approved.", metadata: {}, created_at: "2026-08-21T10:00:00Z" },
    ],
  });

  assert.equal(events.filter((event) => event.event_type === "application_submitted").length, 2);
  assert.match(events.find((event) => event.id === "application-submitted:request-1").summary, /Anas submitted application #1 for Zach/);
  assert.equal(events.find((event) => event.id === "reject-1").context, "Application #1 of 2");
  assert.equal(events.find((event) => event.id === "approve-2").context, "Application #2 of 2");
});

test("uses the stored request id instead of timestamp inference for new audit entries", () => {
  const events = buildStudentTimeline({
    scope: "application", applications, people,
    events: [{ id: "exact", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "application_rejected", summary: "Rejected.", metadata: { enrollmentRequestId: "request-1" }, created_at: "2026-08-22T10:00:00Z" }],
  });
  assert.equal(events.find((event) => event.id === "exact").context, "Application #1 of 2");
});

test("application viewers receive application notes but no finance-only activity", () => {
  const events = buildStudentTimeline({
    scope: "application", applications, people,
    events: [
      { id: "application-note", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "manual_note", summary: "Application note", metadata: { enrollmentRequestId: "request-2" }, created_at: "2026-08-21T11:00:00Z" },
      { id: "finance-note", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "manual_note", summary: "Finance note", metadata: {}, created_at: "2026-08-21T12:00:00Z" },
      { id: "refund", program_id: programId, student_profile_id: studentId, actor_profile_id: "director", event_type: "payment_refunded", summary: "Refunded", metadata: {}, created_at: "2026-08-21T13:00:00Z" },
    ],
  });
  assert.ok(events.some((event) => event.id === "application-note"));
  assert.ok(!events.some((event) => event.id === "finance-note"));
  assert.ok(!events.some((event) => event.id === "refund"));
});
