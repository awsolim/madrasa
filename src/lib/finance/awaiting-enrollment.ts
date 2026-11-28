type Request = { id: string; student_profile_id: string; status: string; admission_completed_at: string | null };

/** Approval needs follow-up until enrollment completes; it is not a debt. */
export function awaitingEnrollmentRequests<T extends Request>(requests: T[], enrollments: { student_profile_id: string; status: string }[]) {
  const activeStudents = new Set(enrollments.filter(row => row.status === "active").map(row => row.student_profile_id));
  return requests.filter(request => request.status === "approved" && !request.admission_completed_at && !activeStudents.has(request.student_profile_id));
}
