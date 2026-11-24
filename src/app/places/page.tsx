import { redirect } from "next/navigation";

/**
 * 지역 수첩은 데이트 지도에 합쳤다. 예전 주소(`/places?area=3&kind=stay`)로 들어오면
 * 같은 동네를 고른 데이트 지도로 보낸다. 숙소 탭이었으면 숙소 레이어만 켠다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { area, kind } = await searchParams;
  const params = new URLSearchParams();
  if (typeof area === "string" && /^\d+$/.test(area)) params.set("area", area);
  if (kind === "stay") params.set("layers", "stay");
  const query = params.toString();
  redirect(query ? `/map?${query}` : "/map");
}
