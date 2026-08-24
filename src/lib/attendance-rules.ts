export type AttendanceMeeting = {
  date: string;
  id: string;
};

export type AttendanceLink = {
  brokerId: string;
  endDate: string | null;
  startDate: string;
  teamId: string;
};

export type ExplicitAttendance = {
  attended: boolean;
  brokerId: string;
  meetingId: string;
  teamId: string | null;
};

export type ExpectedAttendance = {
  attended: boolean;
  brokerId: string;
  explicit: boolean;
  meetingDate: string;
  meetingId: string;
  teamId: string;
};

export type AttendanceSummary = {
  absent: number;
  percentage: number | null;
  present: number;
  total: number;
};

function attendanceKey(meetingId: string, brokerId: string) {
  return `${meetingId}\u0000${brokerId}`;
}

export function deriveExpectedAttendance(
  meetings: AttendanceMeeting[],
  links: AttendanceLink[],
  presences: ExplicitAttendance[],
) {
  const presenceByKey = new Map(
    presences.map((presence) => [
      attendanceKey(presence.meetingId, presence.brokerId),
      presence,
    ]),
  );
  const expectedByKey = new Map<
    string,
    { link: AttendanceLink; meeting: AttendanceMeeting }
  >();

  for (const link of links) {
    for (const meeting of meetings) {
      const isValidOnMeetingDate =
        link.startDate <= meeting.date &&
        (!link.endDate || link.endDate >= meeting.date);

      if (!isValidOnMeetingDate) {
        continue;
      }

      const key = attendanceKey(meeting.id, link.brokerId);
      const current = expectedByKey.get(key);

      if (!current || link.startDate > current.link.startDate) {
        expectedByKey.set(key, { link, meeting });
      }
    }
  }

  return [...expectedByKey.entries()]
    .map(([key, expected]): ExpectedAttendance => {
      const presence = presenceByKey.get(key);

      return {
        attended: presence?.attended === true,
        brokerId: expected.link.brokerId,
        explicit: Boolean(presence),
        meetingDate: expected.meeting.date,
        meetingId: expected.meeting.id,
        teamId: presence?.teamId ?? expected.link.teamId,
      };
    })
    .sort(
      (left, right) =>
        left.meetingDate.localeCompare(right.meetingDate) ||
        left.brokerId.localeCompare(right.brokerId),
    );
}

export function summarizeAttendance(
  facts: Array<Pick<ExpectedAttendance, "attended">>,
): AttendanceSummary {
  const present = facts.filter((fact) => fact.attended).length;
  const total = facts.length;

  return {
    absent: total - present,
    percentage: total > 0 ? Math.round((present / total) * 100) : null,
    present,
    total,
  };
}

export function summarizeGlobalBrokerAttendance(
  brokerIds: string[],
  meetings: AttendanceMeeting[],
  presences: ExplicitAttendance[],
) {
  const meetingDateById = new Map(
    meetings.map((meeting) => [meeting.id, meeting.date] as const),
  );
  const total = new Set(meetings.map((meeting) => meeting.date)).size;
  const knownBrokerIds = new Set(brokerIds);
  const presentDatesByBroker = new Map<string, Set<string>>();

  for (const presence of presences) {
    if (!presence.attended || !knownBrokerIds.has(presence.brokerId)) {
      continue;
    }

    const meetingDate = meetingDateById.get(presence.meetingId);

    if (!meetingDate) {
      continue;
    }

    const presentDates =
      presentDatesByBroker.get(presence.brokerId) ?? new Set<string>();
    presentDates.add(meetingDate);
    presentDatesByBroker.set(presence.brokerId, presentDates);
  }

  return new Map(
    brokerIds.map((brokerId) => {
      const present = presentDatesByBroker.get(brokerId)?.size ?? 0;

      return [
        brokerId,
        {
          absent: total - present,
          percentage: total > 0 ? Math.round((present / total) * 100) : null,
          present,
          total,
        } satisfies AttendanceSummary,
      ] as const;
    }),
  );
}
