import { expect, test } from "@playwright/test";

import { newUserClient } from "./helpers";

/** 고객사·런·기사·이슈는 만든 사용자만 보고 고칠 수 있다. */

const ingestKey = process.env.MONITOR_INGEST_KEY ?? "";

test("다른 사용자의 모니터링 데이터는 보이지도 바뀌지도 않는다", async ({
  playwright,
  request,
}) => {
  const a = await newUserClient(playwright, "owner");
  const b = await newUserClient(playwright, "other");

  const created = await a.request.post("/api/monitor/clients", {
    data: {
      name: "예시 브랜드",
      categories: [{ key: "own", name: "자사 뉴스", goal: null }],
    },
  });
  expect(created.status()).toBe(201);
  const client = (await created.json()).client as { id: number; slug: string };

  const run = await request.post("/api/monitor/agent/runs", {
    headers: { "x-monitor-key": ingestKey },
    data: {
      client: client.slug,
      since: "2026-11-07T09:00:00+09:00",
      until: "2026-11-08T09:00:00+09:00",
      items: [
        {
          url: "https://example.com/ownership/1",
          media: "테스트신문",
          title: "소유자 확인 기사",
          category: "own",
          score: 80,
          reason: "테스트",
        },
      ],
    },
  });
  expect(run.status()).toBe(201);
  const { runId } = (await run.json()) as { runId: number };

  const payload = await (await a.request.get(`/api/monitor/clients/${client.id}`)).json();
  const itemId = payload.items[0].id as number;

  const issue = await a.request.post("/api/monitor/issues", {
    data: { title: "예시 이슈", clientId: client.id },
  });
  expect(issue.status()).toBe(201);
  const issueId = (await issue.json()).issue.id as number;

  // B의 목록에는 A의 것이 없다.
  const overview = await (await b.request.get("/api/monitor")).json();
  expect(overview.clients).toHaveLength(0);
  expect(overview.issues).toHaveLength(0);

  // id를 알아도 404
  const denied = [
    await b.request.get(`/api/monitor/clients/${client.id}`),
    await b.request.patch(`/api/monitor/clients/${client.id}`, {
      data: { name: "가로채기" },
    }),
    await b.request.get(`/api/monitor/clients/${client.id}/stats`),
    await b.request.post(`/api/monitor/clients/${client.id}/collect`),
    await b.request.patch(`/api/monitor/items/${itemId}`, { data: { included: false } }),
    await b.request.post(`/api/monitor/runs/${runId}/ban`, {
      data: { media: "테스트신문" },
    }),
    await b.request.post(`/api/monitor/runs/${runId}/report`, {
      data: { reportText: "가로채기" },
    }),
    await b.request.delete(`/api/monitor/runs/${runId}/report`),
    await b.request.post(`/api/monitor/runs/${runId}/more`, { data: { request: "더" } }),
    await b.request.get(`/api/monitor/progress?kind=run&id=${runId}`),
    await b.request.get(`/api/monitor/issues/${issueId}`),
    await b.request.patch(`/api/monitor/issues/${issueId}`, {
      data: { title: "가로채기" },
    }),
    await b.request.post(`/api/monitor/issues/${issueId}/recount`, { data: {} }),
    await b.request.get(`/api/monitor/progress?kind=issue&id=${issueId}`),
  ];
  for (const res of denied) expect(res.status()).toBe(404);

  // 남의 고객사에 이슈를 걸 수 없다.
  const foreignIssue = await b.request.post("/api/monitor/issues", {
    data: { title: "남의 고객사 이슈", clientId: client.id },
  });
  expect(foreignIssue.status()).toBe(404);

  // A의 데이터는 그대로다.
  const after = await (await a.request.get(`/api/monitor/clients/${client.id}`)).json();
  expect(after.client.name).toBe("예시 브랜드");
  expect(after.items[0].included).toBe(true);
  expect(after.run.reportedAt).toBeNull();

  await a.request.dispose();
  await b.request.dispose();
});
