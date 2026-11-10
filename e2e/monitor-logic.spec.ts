import { expect, test } from "@playwright/test";

import { monitorClientPresets } from "../src/lib/monitor/presets";
import { reportClosing, reportGreeting } from "../src/lib/monitor/sender";

/** 보고서 보내는 사람은 코드에 실명을 두지 않고 환경 변수로 받는다. */

const withSender = (
  company: string | undefined,
  name: string | undefined,
  run: () => void
) => {
  const before = {
    company: process.env.MONITOR_REPORT_COMPANY,
    name: process.env.MONITOR_REPORT_SENDER,
  };
  const set = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  set("MONITOR_REPORT_COMPANY", company);
  set("MONITOR_REPORT_SENDER", name);
  try {
    run();
  } finally {
    set("MONITOR_REPORT_COMPANY", before.company);
    set("MONITOR_REPORT_SENDER", before.name);
  }
};

test("보내는 사람이 없으면 이름 없이 인사한다", () => {
  withSender(undefined, undefined, () => {
    expect(reportGreeting("담당 매니저님")).toBe("담당 매니저님, 안녕하세요.");
    expect(reportClosing()).toBe("감사합니다.");
  });
});

test("환경 변수의 소속과 이름으로 인사·맺음말을 쓴다", () => {
  withSender("샘플컴퍼니", "김샘플", () => {
    expect(reportGreeting("홍길동 매니저님")).toBe(
      "홍길동 매니저님, 안녕하세요. 샘플컴퍼니 김샘플입니다."
    );
    expect(reportClosing()).toBe("감사합니다.\n김샘플 드림");
    const [first] = monitorClientPresets();
    expect(
      first.greeting.startsWith("담당 매니저님, 안녕하세요. 샘플컴퍼니 김샘플입니다.\n")
    ).toBe(true);
    expect(first.closing).toBe("감사합니다.\n김샘플 드림");
  });
  withSender(undefined, "김샘플", () => {
    expect(reportGreeting("담당 매니저님")).toBe(
      "담당 매니저님, 안녕하세요. 김샘플입니다."
    );
  });
});
