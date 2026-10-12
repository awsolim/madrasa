import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { cancelProgramSubscription, isActiveStripeSubscriptionStatus } from "@/lib/stripe/subscriptions";
import { escapeHtml, getTenantAppUrl, renderEmailShell, sendEmail } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { getProgramEnrollmentRecipientProfileIds } from "@/lib/push/program-recipients";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type DeleteAccountBody = {
  confirmation?: string;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as DeleteAccountBody;
    if (body.confirmation?.trim().toUpperCase() !== "DELETE") {
      return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const userId = user.id;
    const userEmail = user.email ?? null;

    // Preflight: refuse to strand a mosque or program without anyone left to run it.
    const { data: adminMemberships, error: adminMembershipsError } = await supabase
      .from("mosque_memberships")
      .select("mosque_id, mosques(name)")
      .eq("profile_id", userId)
      .eq("role", "admin")
      .eq("status", "active");
    if (adminMembershipsError) {
      return Response.json({ error: adminMembershipsError.message }, { status: 500 });
    }

    const soleAdminMosqueNames: string[] = [];
    for (const membership of adminMemberships ?? []) {
      const { count, error: countError } = await supabase
        .from("mosque_memberships")
        .select("id", { count: "exact", head: true })
        .eq("mosque_id", membership.mosque_id)
        .eq("role", "admin")
        .eq("status", "active")
        .neq("profile_id", userId);
      if (countError) {
        return Response.json({ error: countError.message }, { status: 500 });
      }
      if (!count) {
        const mosqueName = (membership as unknown as { mosques: { name: string } | null }).mosques?.name ?? "a masjid";
        soleAdminMosqueNames.push(mosqueName);
      }
    }

    if (soleAdminMosqueNames.length) {
      return Response.json(
        {
          error: `You're the only admin for ${soleAdminMosqueNames.join(", ")}. Add another admin there before deleting your account.`,
        },
        { status: 409 },
      );
    }

    const { data: directorAssignments, error: directorError } = await supabase
      .from("program_teachers")
      .select("program_id, programs(title)")
      .eq("teacher_profile_id", userId)
      .eq("role", "director");
    if (directorError) {
      return Response.json({ error: directorError.message }, { status: 500 });
    }

    if (directorAssignments?.length) {
      const programTitles = directorAssignments
        .map((row) => (row as unknown as { programs: { title: string } | null }).programs?.title ?? "a program")
        .join(", ");
      return Response.json(
        {
          error: `You're the director of ${programTitles}. Assign a new director there before deleting your account.`,
        },
        { status: 409 },
      );
    }

    // Managed children (no login of their own) with no other parent/guardian linked are removed with this account.
    const { data: childLinks, error: childLinksError } = await supabase
      .from("parent_child_links")
      .select("child_profile_id")
      .eq("parent_profile_id", userId);
    if (childLinksError) {
      return Response.json({ error: childLinksError.message }, { status: 500 });
    }

    const childIdsToDelete: string[] = [];
    for (const link of childLinks ?? []) {
      const { count, error: countError } = await supabase
        .from("parent_child_links")
        .select("id", { count: "exact", head: true })
        .eq("child_profile_id", link.child_profile_id)
        .neq("parent_profile_id", userId);
      if (countError) {
        return Response.json({ error: countError.message }, { status: 500 });
      }
      if (!count) {
        childIdsToDelete.push(link.child_profile_id);
      }
    }

    const deletedProfileIds = [userId, ...childIdsToDelete];

    // Cancel any live billing before touching auth/profile records.
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("program_subscriptions")
      .select("id, program_id, stripe_subscription_id, stripe_account_id, status, student_profile_id, parent_profile_id")
      .or(`student_profile_id.in.(${deletedProfileIds.join(",")}),parent_profile_id.eq.${userId}`);
    if (subscriptionsError) {
      return Response.json({ error: subscriptionsError.message }, { status: 500 });
    }

    const activeSubscriptions = (subscriptions ?? []).filter((row) => isActiveStripeSubscriptionStatus(row.status));
    try {
      for (const subscription of activeSubscriptions) {
        await cancelProgramSubscription(supabase, subscription);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not cancel an active subscription.";
      return Response.json({ error: `${message} Please try deleting your account again in a moment.` }, { status: 502 });
    }

    // Figure out who taught the departing student(s) so we can tell them, before the
    // enrollment rows themselves are gone. Paid status is keyed off the subscriptions
    // we just gathered above, whether or not they needed cancelling.
    const paidPairKeys = new Set(activeSubscriptions.map((row) => `${row.student_profile_id}:${row.program_id}`));

    const [{ data: departingProfiles }, { data: activeEnrollments }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", deletedProfileIds),
      supabase.from("enrollments").select("program_id, student_profile_id").in("student_profile_id", deletedProfileIds).eq("status", "active"),
    ]);

    const nameByProfileId = new Map((departingProfiles ?? []).map((row) => [row.id, row.full_name?.trim() || "A student"]));
    const programIds = Array.from(new Set((activeEnrollments ?? []).map((row) => row.program_id)));

    let teacherNotifications: Array<{
      programId: string;
      title: string;
      mosqueSlug: string;
      managerIds: string[];
      studentNames: string[];
      anyPaid: boolean;
    }> = [];

    if (programIds.length) {
      const { data: programs } = await supabase
        .from("programs")
        .select("id, title, mosque_id, director_profile_id, teacher_profile_id, mosques(slug)")
        .in("id", programIds);

      teacherNotifications = await Promise.all(
        (programs ?? []).map(async (program) => {
          const managerIds = await getProgramEnrollmentRecipientProfileIds(supabase, program);
          const enrolledIds = (activeEnrollments ?? [])
            .filter((row) => row.program_id === program.id)
            .map((row) => row.student_profile_id);
          return {
            programId: program.id,
            title: program.title,
            mosqueSlug: (program as unknown as { mosques: { slug: string } | null }).mosques?.slug ?? "",
            managerIds,
            studentNames: enrolledIds.map((id) => nameByProfileId.get(id) ?? "A student"),
            anyPaid: enrolledIds.some((id) => paidPairKeys.has(`${id}:${program.id}`)),
          };
        }),
      );
    }

    // Point of no return: remove the login itself first so a partial failure below never
    // leaves a deletable-looking account that can still sign in.
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId, false);
    if (deleteAuthError) {
      return Response.json({ error: deleteAuthError.message }, { status: 500 });
    }

    // enrollments/programs predate the migration history and may not carry an FK cascade,
    // so remove them explicitly rather than assuming the profile delete below cleans them up.
    await supabase.from("enrollments").delete().in("student_profile_id", deletedProfileIds);

    for (const childId of childIdsToDelete) {
      await supabase.from("profiles").delete().eq("id", childId);
    }
    await supabase.from("profiles").delete().eq("id", userId);

    if (userEmail) {
      try {
        await sendEmail({
          to: userEmail,
          subject: "Your Madrasa account has been deleted",
          html: renderEmailShell({
            eyebrow: "Madrasa",
            title: "Your account has been deleted",
            body: `<p style="margin:0;">${escapeHtml(
              "This confirms your Madrasa account and its data have been permanently deleted. If this wasn't you, please contact the masjid you were registered with right away.",
            )}</p>`,
          }),
          text: "This confirms your Madrasa account and its data have been permanently deleted. If this wasn't you, please contact the masjid you were registered with right away.",
          idempotencyKey: `account-deleted:${userId}`,
        });
      } catch {
        // Best-effort notification; the account is already gone regardless.
      }
    }

    for (const notification of teacherNotifications) {
      if (!notification.managerIds.length || !notification.studentNames.length) {
        continue;
      }
      const plural = notification.studentNames.length > 1;
      const names = notification.studentNames.join(", ");
      const message = notification.anyPaid
        ? `${names} ${plural ? "have" : "has"} left ${notification.title} because their account${plural ? "s were" : " was"} deleted. Any related subscription has been cancelled.`
        : `${names} ${plural ? "have" : "has"} left ${notification.title} because their account${plural ? "s were" : " was"} deleted.`;
      try {
        await sendProfileNotificationEmails(supabase, notification.managerIds, {
          includeAdmins: true,
          eventKey: `account-deleted:${userId}:${notification.programId}`,
          subject: `${names} ${plural ? "have" : "has"} left ${notification.title}`,
          title: "A student's enrollment has ended",
          message,
          action: notification.mosqueSlug
            ? { label: "Open Teacher Inbox", href: getTenantAppUrl(notification.mosqueSlug, "/teacher/inbox") }
            : undefined,
        });
      } catch {
        // Best-effort notification; the account is already gone regardless.
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account could not be deleted.";
    await logServerError(createSupabaseServiceClient(), {
      source: "account.delete",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
