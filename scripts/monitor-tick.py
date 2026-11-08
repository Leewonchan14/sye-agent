#!/usr/bin/env python3
"""매일 자동 수집 시계 — Oracle에서 Hermes no_agent 예약 작업으로 1분마다 돈다.

사이트에 "할 일 있어?"를 묻고, 서버가 알려 준 다음 확인 시각까지는 호출하지 않는다.
stdout은 그대로 Discord로 가므로 완료·실패 알림, 시작 실패와 복구만 출력한다.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

URL = os.environ.get(
    "MONITOR_TICK_URL", "https://www.xn--oj4bo2g00a.shop/api/monitor/agent/tick"
)
KEY_FILE = Path(
    os.environ.get("MONITOR_KEY_FILE", "~/.config/sye-monitor/ingest.key")
).expanduser()
STATE_FILE = Path(
    os.environ.get("MONITOR_TICK_STATE", "~/.hermes/state/monitor_tick.json")
).expanduser()
ERROR_RETRY_SEC = 300


def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state))


def call_tick():
    req = urllib.request.Request(
        URL,
        method="POST",
        headers={
            "x-monitor-key": KEY_FILE.read_text().strip(),
            "User-Agent": "sye-monitor-tick/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=150) as res:
            return json.load(res), None
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")[:300]
        return None, f"HTTP {error.code} {body}"
    except Exception as error:  # 네트워크·응답 형식 오류 모두 다음 주기에 다시 시도한다.
        return None, f"{type(error).__name__}: {error}"


def main():
    state = load_state()
    if time.time() < state.get("next_check", 0):
        return

    result, error = call_tick()
    if result is not None:
        for message in result.get("notifications") or []:
            print(message)
        failed = result.get("failed") or []
        error = "; ".join(f"{f['client']}: {f['error']}" for f in failed) or None

    if error:
        if not state.get("failing"):
            print(f"⚠️ 모니터링 자동 수집을 시작하지 못했어요. 5분마다 다시 시도할게요.\n{error}")
        state["failing"] = True
    elif state.get("failing"):
        print("✅ 모니터링 자동 수집이 다시 정상으로 돌아왔어요.")
        state["failing"] = False

    if result is not None and result.get("nextCheckAt"):
        when = result["nextCheckAt"].replace("Z", "+00:00")
        state["next_check"] = datetime.fromisoformat(when).timestamp()
    else:
        state["next_check"] = time.time() + ERROR_RETRY_SEC
    save_state(state)


if __name__ == "__main__":
    sys.exit(main())
