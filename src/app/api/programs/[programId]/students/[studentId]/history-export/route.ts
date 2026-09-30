import ExcelJS from "exceljs";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildStudentTimeline, isApplicationTimelineEvent } from "@/lib/student-timeline";

export const runtime = "nodejs";

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "student";
}

function titleSheet(sheet: ExcelJS.Worksheet, title: string, subtitle: string, headers: string[]) {
  sheet.addRow([title]);
  sheet.addRow([subtitle]);
  sheet.addRow([`Prepared ${new Date().toLocaleString("en-CA")}`]);
  sheet.addRow([]);
  sheet.addRow(headers);
  sheet.mergeCells(1, 1, 1, Math.max(1, headers.length));
  sheet.mergeCells(2, 1, 2, Math.max(1, headers.length));
  sheet.mergeCells(3, 1, 3, Math.max(1, headers.length));
  for (let row = 1; row <= 3; row += 1) {
    sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17624F" } };
    sheet.getRow(row).font = { color: { argb: "FFFFFFFF" }, bold: row < 3, size: row === 1 ? 18 : row === 2 ? 12 : 10 };
  }
  const header = sheet.getRow(5);
  header.font = { bold: true, color: { argb: "FF26323A" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F1EE" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: headers.length } };
}

function finishSheet(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 5 && rowNumber % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF9" } };
    if (rowNumber > 5) row.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  });
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => { width = Math.max(width, Math.min(42, String(cell.value ?? "").length + 2)); });
    column.width = width;
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ programId: string; studentId: string }> }) {
  try {
    const { programId, studentId } = await params;
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const db = createSupabaseServiceClient();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return Response.json({ error: "Please sign in again." }, { status: 401 });

    const [recordsAccess, applicationAccess, decisionAccess, financeAccess] = await Promise.all([
      db.rpc("can_view_program_student_records", { check_program_id: programId, check_profile_id: user.id }),
      db.rpc("can_view_program_applications", { check_program_id: programId, check_profile_id: user.id }),
      db.rpc("can_decide_program_applications", { check_program_id: programId, check_profile_id: user.id }),
      db.rpc("can_manage_program_finances", { check_program_id: programId, check_profile_id: user.id }),
    ]);
    const canViewRecords = recordsAccess.data === true;
    const canViewApplications = applicationAccess.data === true || decisionAccess.data === true;
    const canViewFinances = financeAccess.data === true;
    if (!canViewRecords && !canViewApplications && !canViewFinances) return Response.json({ error: "Student record access is required." }, { status: 403 });

    const [{ data: program }, { data: student }, { data: enrollment }, eventsResult, applicationsResult, notesResult] = await Promise.all([
      db.from("programs").select("id, title").eq("id", programId).maybeSingle(),
      db.from("profiles").select("id, full_name, email, phone_number, date_of_birth, age, gender").eq("id", studentId).maybeSingle(),
      db.from("enrollments").select("status, created_at").eq("program_id", programId).eq("student_profile_id", studentId).maybeSingle(),
      db.from("program_finance_audit_events").select("*").eq("program_id", programId).eq("student_profile_id", studentId).order("created_at", { ascending: false }).limit(250),
      db.from("enrollment_requests").select("id, program_id, student_profile_id, parent_profile_id, status, payment_type, requested_at, reviewed_at, reviewed_by, review_note").eq("program_id", programId).eq("student_profile_id", studentId).order("requested_at", { ascending: true }),
      db.from("program_student_notes").select("id, message, created_at, author_profile_id").eq("program_id", programId).eq("student_profile_id", studentId).order("created_at", { ascending: false }),
    ]);
    if (!program || !student) return Response.json({ error: "Student record was not found." }, { status: 404 });
    if (eventsResult.error || applicationsResult.error || notesResult.error) throw eventsResult.error || applicationsResult.error || notesResult.error;

    const profileIds = [...new Set([
      studentId,
      ...(eventsResult.data ?? []).map((row) => row.actor_profile_id),
      ...(applicationsResult.data ?? []).flatMap((row) => [row.parent_profile_id, row.reviewed_by]),
      ...(notesResult.data ?? []).map((row) => row.author_profile_id),
    ].filter((id): id is string => Boolean(id)))];
    const { data: people } = await db.from("profiles").select("id, full_name, email").in("id", profileIds);
    const personName = new Map((people ?? []).map((person) => [person.id, person.full_name?.trim() || person.email?.trim() || "Staff member"]));
    const allTimeline = buildStudentTimeline({
      events: eventsResult.data ?? [],
      applications: applicationsResult.data ?? [],
      people: people ?? [],
      scope: "finance",
    });
    const financePattern = /payment|subscription|billing|price|checkout|waiv|invoice/i;
    const timeline = allTimeline.filter((event) => {
      if (!canViewApplications && isApplicationTimelineEvent(event.event_type)) return false;
      if (!canViewFinances && financePattern.test(`${event.event_type} ${event.summary}`)) return false;
      return true;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tareeqah";
    workbook.created = new Date();
    const overview = workbook.addWorksheet("Student overview");
    titleSheet(overview, student.full_name || "Student history", program.title, ["Field", "Value"]);
    const overviewRows = [
      ["Student", student.full_name || "—"],
      ["Enrollment status", enrollment?.status?.replaceAll("_", " ") || "No current enrollment"],
      ["Enrolled", enrollment?.created_at ? new Date(enrollment.created_at).toLocaleDateString("en-CA") : "—"],
      ...(canViewRecords ? [["Email", student.email || "—"], ["Phone", student.phone_number || "—"], ["Gender", student.gender || "—"], ["Date of birth", student.date_of_birth || "—"]] : []),
      ["Included sections", ["Student history", canViewApplications ? "Applications" : null, canViewFinances ? "Payments" : null].filter(Boolean).join(", ")],
    ];
    overviewRows.forEach((row) => overview.addRow(row));
    finishSheet(overview);

    const history = workbook.addWorksheet("Student history");
    titleSheet(history, `${student.full_name || "Student"} — history`, program.title, ["Date", "Event", "Performed by", "Context"]);
    timeline.forEach((event) => history.addRow([new Date(event.created_at), event.summary, event.actor_name, event.context || ""]));
    (notesResult.data ?? []).forEach((note) => history.addRow([new Date(note.created_at), note.message, personName.get(note.author_profile_id) || "Staff member", "Class note"]));
    history.getColumn(1).numFmt = "mmm d, yyyy h:mm AM/PM";
    finishSheet(history);

    if (canViewApplications) {
      const applications = workbook.addWorksheet("Applications");
      titleSheet(applications, `${student.full_name || "Student"} — applications`, program.title, ["Submitted", "Status", "Payment option", "Reviewed", "Reviewed by", "Decision note"]);
      (applicationsResult.data ?? []).forEach((application) => applications.addRow([
        new Date(application.requested_at), application.status.replaceAll("_", " "), application.payment_type?.replaceAll("_", " ") || "—",
        application.reviewed_at ? new Date(application.reviewed_at) : "", application.reviewed_by ? personName.get(application.reviewed_by) || "Staff member" : "", application.review_note || "",
      ]));
      applications.getColumn(1).numFmt = "mmm d, yyyy h:mm AM/PM";
      applications.getColumn(4).numFmt = "mmm d, yyyy h:mm AM/PM";
      finishSheet(applications);
    }

    if (canViewFinances) {
      const { data: payments } = await db.from("program_payments").select("paid_at, amount_cents, currency, receipt_url, tax_receipt_status, tax_receipt_number").eq("program_id", programId).eq("student_profile_id", studentId).order("paid_at", { ascending: false });
      const paymentSheet = workbook.addWorksheet("Payments");
      titleSheet(paymentSheet, `${student.full_name || "Student"} — payments`, program.title, ["Date", "Amount", "Currency", "Receipt", "Tax receipt status", "Tax receipt number"]);
      (payments ?? []).forEach((payment) => paymentSheet.addRow([new Date(payment.paid_at), payment.amount_cents / 100, payment.currency.toUpperCase(), payment.receipt_url || "", payment.tax_receipt_status.replaceAll("_", " "), payment.tax_receipt_number || ""]));
      paymentSheet.getColumn(1).numFmt = "mmm d, yyyy";
      paymentSheet.getColumn(2).numFmt = "$#,##0.00";
      finishSheet(paymentSheet);
    }

    await db.from("program_finance_audit_events").insert({ program_id: programId, student_profile_id: studentId, actor_profile_id: user.id, event_type: "student_history_exported", summary: `${personName.get(user.id) || "Staff member"} exported ${student.full_name || "the student"}'s history.`, metadata: { includedApplications: canViewApplications, includedFinances: canViewFinances } });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${safeFilename(student.full_name || "student")}-history.xlsx"`,
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not prepare the student history report." }, { status: 500 });
  }
}
