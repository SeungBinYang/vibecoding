import { NextResponse } from "next/server";
import { getSchedules, saveSchedule } from "@/lib/db";
import type { Schedule } from "@/lib/storage";

/** F2 · F4 — 일정 전체 목록 */
export async function GET() {
  const schedules = await getSchedules();
  return NextResponse.json(schedules);
}

/** F1 등록 · F5 수정 — 같은 제목이면 덮어쓴다 */
export async function POST(request: Request) {
  const schedule = (await request.json()) as Schedule;
  try {
    await saveSchedule(schedule);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
