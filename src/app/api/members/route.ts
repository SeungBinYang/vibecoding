import { NextResponse } from "next/server";
import { getMembers } from "@/lib/db";

/** F4 — 미응답 명단을 세려면 구성원 전체 명단이 필요하다.
 * 명단을 만드는 화면은 없다(06-data.md 열린 질문 — 아직 정하지 않음), 읽기만 제공한다. */
export async function GET() {
  const members = await getMembers();
  return NextResponse.json(members);
}
