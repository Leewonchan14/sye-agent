import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { getRunForReport, markRunMailed } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { isMailReady, sendReportMail } from "@/lib/monitor/mail";
import { shareReportPath, siteOrigin } from "@/lib/monitor/origin";
import { buildMonitorReport, reportLeads, reportSubject } from "@/lib/monitor/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** 공유 링크가 켜져 있으면 메일 끝에 "웹에서 보기" 링크를 붙인다. */
  includeLink: z.boolean().default(true),
});

/**
 * 리포트를 고객사 메일 주소로 보내고 보고 완료로 표시한다.
 * 본문은 화면의 "메일 본문" 형식과 같다.
 */
export const POST = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const runId = parseId((await ctx.params).runId);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });
  if (!isMailReady()) {
    return Response.json(
      { error: "서버에 메일 발송 설정(MONITOR_SMTP_URL, MONITOR_MAIL_FROM)이 없어요." },
      { status: 503 }
    );
  }

  try {
    const body = bodySchema.parse((await readJson(req)) ?? {});
    const { client, run, items } = await getRunForReport(runId);
    if (!client.reportEmails.length) {
      return Response.json(
        { error: "받는 사람 메일 주소를 먼저 넣어 주세요." },
        { status: 400 }
      );
    }
    if (!reportLeads(items).length) {
      return Response.json({ error: "리포트에 넣은 기사가 없어요." }, { status: 400 });
    }

    const report = buildMonitorReport({ client, run, items, format: "email" });
    const text =
      body.includeLink && run.shareToken
        ? `${report}\n\n웹에서 보기: ${siteOrigin(req)}${shareReportPath(run.shareToken)}`
        : report;

    await sendReportMail({
      to: client.reportEmails,
      subject: reportSubject(client, run),
      text,
    });
    await markRunMailed(runId, client.reportEmails, report);
    return Response.json({ ok: true, to: client.reportEmails });
  } catch (error) {
    return monitorErrorResponse(error, "메일을 보내지 못했어요.");
  }
};
