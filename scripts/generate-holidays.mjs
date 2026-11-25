import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getHolidays } from "korean-holidays";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** korean-holidays에 없는 선거일. 수동으로 추가한다. */
const MANUAL = {
  "2024-04-10": "국회의원 선거",
  "2025-06-03": "대통령 선거",
  "2026-06-03": "지방선거",
};

const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

const toDateString = (date) => formatter.format(date);

const mergeName = (current, name) => {
  if (!current) return name;
  const names = current.split(", ");
  if (!names.includes(name)) names.push(name);
  return names.join(", ");
};

const result = {};

for (let year = 2024; year <= 2030; year += 1) {
  for (const holiday of getHolidays(year)) {
    const key = toDateString(holiday.date);
    result[key] = mergeName(result[key], holiday.nameKo);
  }
}

for (const [key, name] of Object.entries(MANUAL)) {
  result[key] = mergeName(result[key], name);
}

const sorted = {};
for (const key of Object.keys(result).sort()) {
  sorted[key] = result[key];
}

const target = join(__dirname, "../src/lib/calendar/holidays.json");
writeFileSync(target, `${JSON.stringify(sorted, null, 2)}\n`);

const counts = {};
for (const key of Object.keys(sorted)) {
  const year = key.slice(0, 4);
  counts[year] = (counts[year] ?? 0) + 1;
}

console.log(`wrote ${target} (${Object.keys(sorted).length} holidays)`);
for (const year of Object.keys(counts).sort()) {
  console.log(`  ${year}: ${counts[year]}`);
}
console.log(`  2026-02-17: ${sorted["2026-02-17"] ?? "(없음)"}`);
console.log(`  2026-09-25: ${sorted["2026-09-25"] ?? "(없음)"}`);
