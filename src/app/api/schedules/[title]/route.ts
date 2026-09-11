import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/db";

/** F4 · F5 — 일정 하나(제목으로 찾기) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ title: string }> },
) {
  const { title } = await params;
  const schedule = await getSchedule(decodeURIComponent(title));
  if (!schedule) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(schedule);
}
