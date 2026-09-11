/**
 * 저장 항목 — docs/06-data.md 「저장 항목」 표의 4개 항목과 그 칸만 담는다.
 * 표에 없는 칸은 만들지 않는다. 한도 · 규칙(제목 30자 · 날짜는 오늘 이후 · 참석/불참 중 하나 ·
 * 같은 이름은 하나만)은 저장 전에 검사한다.
 *
 * 이 파일은 타입 · 검사 로직 · (총무 판정용) localStorage 만 담는다 — 브라우저(클라이언트 컴포넌트)에서
 * 그대로 import 해도 안전해야 하기 때문에 DB 드라이버(node-postgres)는 여기서 import 하지 않는다.
 * 실제 저장/조회(서버 데이터베이스)는 src/lib/db.ts 에 있고, src/app/api/ 의 라우트 핸들러(서버)에서만
 * 그 파일을 불러 쓴다. 화면은 fetch 로 그 라우트를 호출한다.
 */

export type ScheduleStatus = "예정" | "진행 중" | "지난 일정";
export type Answer = "참석" | "불참";

/** 일정 — 제목 · 날짜 · 시간 · 장소 · 상태값 · 변경됨 표시 · 만든 시각 */
export type Schedule = {
  /** 제목 (30자까지 · P3) */
  title: string;
  /** 날짜 (오늘 이후만 · P3) — YYYY-MM-DD */
  date: string;
  /** 시간 — HH:MM */
  time: string;
  /** 장소 */
  place: string;
  /** 상태값 (05 상태값) */
  status: ScheduleStatus;
  /** 변경됨 표시 (시작 전까지 · P4) */
  changed: boolean;
  /** 만든 시각 — ISO 문자열 */
  createdAt: string;
};

/** 참석 응답 — 이름 · 어느 일정 · 참석/불참 · 남긴 시각 */
export type Attendance = {
  /** 이름 */
  name: string;
  /** 어느 일정 — 06 의 예시 값이 제목("9월 정기 모임")이라 제목으로 가리킨다 */
  schedule: string;
  /** 참석/불참 (둘 중 하나 · P5 — 같은 이름은 하나만) */
  answer: Answer;
  /** 남긴 시각 — ISO 문자열 */
  answeredAt: string;
};

/** 구성원 명단 — 이름 · [?] 명단을 누가 · 어디서 만드나(06 에서 정하지 않았다) */
export type Member = {
  name: string;
};

/** 공유 주소 — 어느 일정 · 주소 문자열 */
export type ShareLink = {
  /** 어느 일정 — 제목 */
  schedule: string;
  /** 주소 문자열 */
  url: string;
};

/* ── 검사 ── */

/** 오늘 날짜를 YYYY-MM-DD 로 (기기의 시간대 기준) */
export function todayString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const STATUSES: ScheduleStatus[] = ["예정", "진행 중", "지난 일정"];

/** 어기면 그 이유를, 괜찮으면 null. 문구는 05 정책의 "위반 시" 칸을 따른다 */
export function validateSchedule(schedule: Schedule, now: Date = new Date()): string | null {
  const { title, date, time, place, status } = schedule;
  // P3 — 제목 · 날짜 · 시간 · 장소는 비울 수 없다
  if (!title.trim() || !date.trim() || !time.trim() || !place.trim()) {
    return "제목 · 날짜 · 시간 · 장소는 비울 수 없습니다";
  }
  // P3 — 제목은 30자까지
  if (title.length > 30) return "제목은 30자까지입니다";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "날짜 형식이 올바르지 않습니다";
  if (!/^\d{2}:\d{2}$/.test(time)) return "시간 형식이 올바르지 않습니다";
  // P3 — 날짜는 오늘 이후만 (오늘은 된다 · 위반 문구는 "지난 날짜입니다")
  if (date < todayString(now)) return "지난 날짜입니다";
  if (!STATUSES.includes(status)) return "상태값이 올바르지 않습니다";
  return null;
}

/** 어기면 그 이유를, 괜찮으면 null */
export function validateAttendance(attendance: Attendance): string | null {
  if (!attendance.name.trim()) return "이름을 입력하세요";
  if (!attendance.schedule.trim()) return "어느 일정인지 없습니다";
  // P5 — 참석/불참 둘 중 하나
  if (attendance.answer !== "참석" && attendance.answer !== "불참") {
    return "참석 · 불참 중 하나여야 합니다";
  }
  return null;
}

/** 검사에 걸리면 그 이유로 예외를 던진다 — db.ts 의 저장 함수들이 그대로 재사용한다 */
export function assertValid(reason: string | null): void {
  if (reason) throw new Error(reason);
}

/* ── 총무 판정 (P1) ── */
/* [?] 총무를 어떻게 판정할 건지 정하지 않았다(로그인 화면은 만들지 않기로 함).
   ponytail: 기기 하나 = 총무 한 명으로 가정해 기본값을 총무로 둔다 — 실제 판정 방법이 정해지면 교체.
   구성원 화면 테스트: localStorage.setItem("currentAdmin", "0") */
export function isCurrentAdmin(): boolean {
  return globalThis.localStorage?.getItem("currentAdmin") !== "0";
}

/* 일정 · 참석 응답 · 구성원 명단 · 공유 주소의 실제 저장/조회(서버 데이터베이스)는 src/lib/db.ts 에 있다. */
