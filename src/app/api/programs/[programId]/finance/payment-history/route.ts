import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type PaymentHistoryRequestBody = {
  studentProfileId?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as PaymentHistoryRequestBody;
    if (!body.studentProfileId) {
      return Response.json({ error: "Missing student." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const access = await requireProgramFinanceAccess(supabase, programId, user.id);
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("program_payments")
      .select("id, amount_cents, currency, paid_at, receipt_url")
      .eq("program_id", programId)
      .eq("student_profile_id", body.studentProfileId)
      .order("paid_at", { ascending: false })
      .limit(50);

    if (paymentsError) throw paymentsError;

    return Response.json({
      charges: (payments ?? []).map((payment) => ({
        id: payment.id,
        amountCents: payment.amount_cents,
        currency: payment.currency,
        createdAt: payment.paid_at,
        receiptUrl: payment.receipt_url,
        taxReceiptStatus: "not_applicable",
        taxReceiptEligibleAmountCents: null,
        taxReceiptNumber: null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load payment history.";
    await logServerError(createSupabaseServiceClient(), {
      source: "programs.finance.payment-history",
      message,
      context: { ...(await params) },
    });
    return Response.json({ error: "Payment history could not be loaded. Please try again." }, { status: 500 });
  }
}
