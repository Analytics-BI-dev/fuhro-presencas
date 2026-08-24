import assert from "node:assert/strict";

import {
  deriveExpectedAttendance,
  summarizeGlobalBrokerAttendance,
  summarizeAttendance,
} from "../src/lib/attendance-rules.ts";

const meetings = [
  { date: "2026-01-01", id: "m1" },
  { date: "2026-01-08", id: "m2" },
  { date: "2026-01-15", id: "m3" },
  { date: "2026-01-22", id: "m4" },
  { date: "2026-01-29", id: "m5" },
];
const links = [
  {
    brokerId: "sempre-presente",
    endDate: null,
    startDate: "2026-01-01",
    teamId: "equipe-a",
  },
  {
    brokerId: "ausencia-explicita",
    endDate: null,
    startDate: "2026-01-01",
    teamId: "equipe-a",
  },
  {
    brokerId: "ausencia-implicita",
    endDate: null,
    startDate: "2026-01-01",
    teamId: "equipe-a",
  },
  {
    brokerId: "entrou-depois",
    endDate: null,
    startDate: "2026-01-15",
    teamId: "equipe-b",
  },
  {
    brokerId: "historico-encerrado",
    endDate: "2026-01-15",
    startDate: "2026-01-01",
    teamId: "equipe-b",
  },
];
const presences = [
  ...meetings.map((meeting) => ({
    attended: true,
    brokerId: "sempre-presente",
    meetingId: meeting.id,
    teamId: "equipe-a",
  })),
  ...meetings.slice(1).map((meeting) => ({
    attended: true,
    brokerId: "ausencia-explicita",
    meetingId: meeting.id,
    teamId: "equipe-a",
  })),
  {
    attended: false,
    brokerId: "ausencia-explicita",
    meetingId: "m1",
    teamId: "equipe-a",
  },
  ...meetings.slice(0, 4).map((meeting) => ({
    attended: true,
    brokerId: "ausencia-implicita",
    meetingId: meeting.id,
    teamId: "equipe-a",
  })),
  {
    attended: true,
    brokerId: "entrou-depois",
    meetingId: "m3",
    teamId: "equipe-b",
  },
  {
    attended: true,
    brokerId: "historico-encerrado",
    meetingId: "m1",
    teamId: "equipe-b",
  },
];
const facts = deriveExpectedAttendance(meetings, links, presences);

function summaryFor(brokerId) {
  return summarizeAttendance(facts.filter((fact) => fact.brokerId === brokerId));
}

assert.deepEqual(summaryFor("sempre-presente"), {
  absent: 0,
  percentage: 100,
  present: 5,
  total: 5,
});
assert.deepEqual(summaryFor("ausencia-explicita"), {
  absent: 1,
  percentage: 80,
  present: 4,
  total: 5,
});
assert.deepEqual(summaryFor("ausencia-implicita"), {
  absent: 1,
  percentage: 80,
  present: 4,
  total: 5,
});
assert.deepEqual(summaryFor("entrou-depois"), {
  absent: 2,
  percentage: 33,
  present: 1,
  total: 3,
});
assert.deepEqual(summaryFor("historico-encerrado"), {
  absent: 2,
  percentage: 33,
  present: 1,
  total: 3,
});
assert.equal(
  facts.some(
    (fact) =>
      fact.brokerId === "ausencia-implicita" &&
      fact.meetingId === "m5" &&
      fact.attended === false &&
      fact.explicit === false,
  ),
  true,
);
assert.equal(
  facts.some(
    (fact) => fact.brokerId === "entrou-depois" && fact.meetingId === "m1",
  ),
  false,
);
assert.equal(
  facts.some(
    (fact) =>
      fact.brokerId === "historico-encerrado" && fact.meetingId === "m4",
  ),
  false,
);

const globalMeetings = [
  ...Array.from({ length: 19 }, (_, index) => ({
    date: `2026-02-${String(index + 1).padStart(2, "0")}`,
    id: `global-${index + 1}`,
  })),
  { date: "2026-02-01", id: "global-data-duplicada" },
];
const globalExamples = new Map([
  ["presente-14", 14],
  ["presente-5", 5],
  ["presente-2", 2],
  ["presente-19", 19],
  ["presente-0", 0],
]);
const globalPresences = [...globalExamples].flatMap(
  ([brokerId, presentCount]) =>
    globalMeetings.slice(0, presentCount).map((meeting) => ({
      attended: true,
      brokerId,
      meetingId: meeting.id,
      teamId: null,
    })),
);
const globalSummaries = summarizeGlobalBrokerAttendance(
  [...globalExamples.keys()],
  globalMeetings,
  globalPresences,
);

assert.deepEqual(globalSummaries.get("presente-14"), {
  absent: 5,
  percentage: 74,
  present: 14,
  total: 19,
});
assert.deepEqual(globalSummaries.get("presente-5"), {
  absent: 14,
  percentage: 26,
  present: 5,
  total: 19,
});
assert.deepEqual(globalSummaries.get("presente-2"), {
  absent: 17,
  percentage: 11,
  present: 2,
  total: 19,
});
assert.deepEqual(globalSummaries.get("presente-19"), {
  absent: 0,
  percentage: 100,
  present: 19,
  total: 19,
});
assert.deepEqual(globalSummaries.get("presente-0"), {
  absent: 19,
  percentage: 0,
  present: 0,
  total: 19,
});

console.log(
  "Regras históricas e cálculo global validados, incluindo os 5 cenários com 19 reuniões.",
);
