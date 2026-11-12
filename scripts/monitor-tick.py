#!/usr/bin/env python3
"""매일 자동 수집 시계 — Hermes 호스트에서 no_agent 예약 작업으로 1분마다 돈다.

사이트에 "할 일 있어?"를 묻고, 서버가 알려 준 다음 확인 시각까지는 호출하지 않는다.
수집 결과와 오류는 대시보드에서만 보여 주고 알림은 보내지 않는다 — 이 스크립트는 아무것도 출력하지 않는다.
시계는 모든 사용자의 고객사·이슈를 한 번에 돌리므로, 출력이 어딘가로 배달되면 여러 사용자의
고객사 이름이 섞인다. 마지막 오류는 상태 파일(MONITOR_TICK_STATE)의 last_error에만 남긴다.

필요한 환경 변수:
  MONITOR_TICK_URL  — 예: https://example.com/api/monitor/agent/tick (필수)
  MONITOR_KEY_FILE  — 앱의 MONITOR_INGEST_KEY와 같은 값을 담은 파일 (기본 ~/.config/monitor/ingest.key)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

URL = os.environ.get("MONITOR_TICK_URL", "")
KEY_FILE = Path(
    os.environ.get("MONITOR_KEY_FILE", "~/.config/monitor/ingest.key")
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
            "User-Agent": "monitor-tick/1.0",
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
    if not URL:
        return 1
    state = load_state()
    if time.time() < state.get("next_check", 0):
        return

    result, error = call_tick()
    if result is not None:
        failed = result.get("failed") or []
        error = "; ".join(f"{f['client']}: {f['error']}" for f in failed) or None

    # 알림 없이 마지막 오류만 남긴다 (실패하면 5분 뒤 다시 시도).
    state["last_error"] = error

    if result is not None and result.get("nextCheckAt"):
        when = result["nextCheckAt"].replace("Z", "+00:00")
        state["next_check"] = datetime.fromisoformat(when).timestamp()
    else:
        state["next_check"] = time.time() + ERROR_RETRY_SEC
    save_state(state)


if __name__ == "__main__":
    sys.exit(main())
