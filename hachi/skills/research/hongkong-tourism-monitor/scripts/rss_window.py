#!/usr/bin/env python3
"""창(window) 필터가 붙은 RSS 수집기 — HKTB 모니터링 보조.

두 가지 모드:
  --gnews "홍콩" --hours 1d     Google News RSS 검색 (pubDate는 GMT → KST 자동 변환)
  --feed URL                    임의 RSS (예: 홍콩수요저널 https://hksooyo.com/bbs/rss.php?bo_table=news)

사용 예:
  python3 rss_window.py --gnews "홍콩관광청" --hours 2d --since "2026-10-21 09:00"
  python3 rss_window.py --feed "https://hksooyo.com/bbs/rss.php?bo_table=news" \
      --since "2026-10-21 09:00" --until "2026-10-22 08:57"

출력: "MM-DD HH:MM | 제목 | 링크" (최신순). 창 밖 건수는 마지막 줄에 요약.
주의: Google News의 <link>는 news.google.com 리다이렉트다 — 원문 URL이 필요하면
      언론사 자체 RSS를 쓰거나 제목으로 재검색한다.
"""

import argparse
import email.utils
import html
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")


def parse_dt(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return email.utils.parsedate_to_datetime(raw).astimezone(KST)
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.replace(tzinfo=KST) if dt.tzinfo is None else dt.astimezone(KST)
        except ValueError:
            continue
    return None


def clean(txt):
    txt = re.sub(r"^<!\[CDATA\[(.*?)\]\]>$", r"\1", (txt or "").strip(), flags=re.S)
    txt = re.sub(r"<[^>]+>", "", txt)
    return html.unescape(txt).strip()


def rss_url(args):
    if args.feed:
        return args.feed
    q = urllib.parse.quote(args.gnews)
    return (
        f"https://news.google.com/rss/search?q={q}+when:{args.hours}"
        f"&hl={args.hl}&gl={args.gl}&ceid={args.ceid}"
    )


def main():
    ap = argparse.ArgumentParser(description="RSS items filtered to a KST window")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--gnews", help="Google News RSS 검색어")
    src.add_argument("--feed", help="RSS/Atom URL")
    ap.add_argument("--hours", default="2d", help="Google News when: 값 (기본 2d)")
    ap.add_argument("--hl", default="ko")
    ap.add_argument("--gl", default="KR")
    ap.add_argument("--ceid", default="KR:ko")
    ap.add_argument("--since", help='창 시작 "YYYY-MM-DD HH:MM" (KST)')
    ap.add_argument("--until", help='창 끝 "YYYY-MM-DD HH:MM" (KST, 기본=지금)')
    ap.add_argument("--all", action="store_true", help="창 필터 없이 전부 출력")
    args = ap.parse_args()

    fmt = "%Y-%m-%d %H:%M"
    since = datetime.strptime(args.since, fmt).replace(tzinfo=KST) if args.since else None
    until = datetime.strptime(args.until, fmt).replace(tzinfo=KST) if args.until else datetime.now(KST)

    raw = fetch(rss_url(args))
    items = re.findall(r"<item>(.*?)</item>", raw, re.S)
    rows = []
    for it in items:
        t = re.search(r"<title>(.*?)</title>", it, re.S)
        l = re.search(r"<link>(.*?)</link>", it, re.S)
        d = re.search(r"<pubDate>(.*?)</pubDate>", it, re.S) or re.search(r"<dc:date>(.*?)</dc:date>", it, re.S)
        rows.append((parse_dt(d.group(1)) if d else None, clean(t.group(1)) if t else "", (l.group(1).strip() if l else "")))
    rows = [r for r in rows if r[0]]
    rows.sort(key=lambda r: r[0], reverse=True)

    inside = [r for r in rows if args.all or ((since is None or r[0] >= since) and r[0] <= until)]
    for dt, title, link in inside:
        print(f"{dt.strftime('%m-%d %H:%M')} | {title} | {link}")
    print(f"\n# in-window {len(inside)} / fetched {len(rows)}", file=sys.stderr)
    print(f"# window {since.strftime(fmt) if since else '-'} ~ {until.strftime(fmt)} KST", file=sys.stderr)


if __name__ == "__main__":
    main()
