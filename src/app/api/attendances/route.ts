import { NextResponse } from "next/server";
import { getAttendances, saveAttendance } from "@/lib/db";
import type { Attendance } from "@/lib/storage";

/** F2 · F4 — 참석 응답 목록. ?schedule=제목 으로 그 일정만 걸러 받을 수 있다 */
export async function GET(request: Request) {
  const schedule = new URL(request.url).searchParams.get("schedule") ?? undefined;
  const attendances = await getAttendances(schedule);
  return NextResponse.json(attendances);
}

/** F3 · P5 — 참석/불참 남기기. 같은 이름은 덮어쓴다 */
export async function POST(request: Request) {
  const attendance = (await request.json()) as Attendance;
  try {
    await saveAttendance(attendance);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
