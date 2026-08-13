export type ThreadAnnouncementRow<TProgram> = {
  program_id: string;
  created_at: string;
  program?: TProgram | null;
  receipt?: { read_at: string | null } | null;
};

export type ThreadNoteRow<TProgram, TStudent> = {
  program_id: string;
  student_profile_id: string;
  created_at: string;
  seen_at: string | null;
  program?: TProgram | null;
  student?: TStudent | null;
};

export function buildAnnouncementThreads<TAnnouncement extends ThreadAnnouncementRow<TProgram>, TProgram extends { id: string }>(
  announcements: TAnnouncement[],
  enrolledPrograms: TProgram[] = [],
) {
  const byProgram = new Map<string, TAnnouncement[]>();
  for (const announcement of announcements) {
    byProgram.set(announcement.program_id, [...(byProgram.get(announcement.program_id) ?? []), announcement]);
  }

  const programIds = Array.from(new Set([...enrolledPrograms.map((program) => program.id), ...Array.from(byProgram.keys())]));

  return programIds
    .map((programId) => {
      const rows = byProgram.get(programId) ?? [];
      const sorted = rows.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return {
        programId,
        program: sorted[0]?.program ?? enrolledPrograms.find((program) => program.id === programId) ?? null,
        latest: sorted[0],
        unreadCount: sorted.filter((announcement) => !announcement.receipt?.read_at).length,
      };
    })
    .sort((a, b) => Date.parse(b.latest?.created_at ?? "0") - Date.parse(a.latest?.created_at ?? "0"));
}

export function buildNoteThreads<TNote extends ThreadNoteRow<TProgram, TStudent>, TProgram, TStudent>(notes: TNote[]) {
  const byThread = new Map<string, TNote[]>();
  for (const note of notes) {
    const key = `${note.program_id}:${note.student_profile_id}`;
    byThread.set(key, [...(byThread.get(key) ?? []), note]);
  }

  const threads: Array<{ programId: string; studentId: string; program: TProgram | null; student: TStudent | null; latest: TNote; unreadCount: number }> = [];

  for (const [_key, rows] of Array.from(byThread.entries())) {
    const sorted = rows.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latest = sorted[0];
    if (!latest) {
      continue;
    }
    threads.push({
      programId: latest.program_id,
      studentId: latest.student_profile_id,
      program: latest.program ?? null,
      student: latest.student ?? null,
      latest,
      unreadCount: sorted.filter((note) => !note.seen_at).length,
    });
  }

  return threads.sort((a, b) => Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at));
}
