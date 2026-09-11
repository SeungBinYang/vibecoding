/**
 * 저장 항목의 실제 저장/조회 — docs/06-data.md 「저장 항목」 표의 4개 항목(일정 · 참석 응답 ·
 * 구성원 명단 · 공유 주소)을 서버 데이터베이스(Postgres · process.env.DATABASE_URL)에 넣고 뺀다.
 * 한도 · 규칙 검사는 src/lib/storage.ts 의 validateSchedule · validateAttendance 를 그대로 쓴다.
 *
 * 서버 전용 — node-postgres(pg)를 쓰므로 "use client" 컴포넌트에서 이 파일을 import 하면 안 된다
 * (브라우저 번들이 깨진다). 화면은 src/app/api/ 의 라우트 핸들러를 fetch 로 호출해서 이 함수들을
 * 서버에서만 실행되게 한다.
 */
import { Pool } from "pg";
import {
  assertValid,
  validateAttendance,
  validateSchedule,
  type Attendance,
  type Member,
  type Schedule,
  type ShareLink,
} from "./storage.ts";

let pool: Pool | undefined;

/** 첫 호출에서만 커넥션 풀을 만든다(모듈 로드 시점이 아니라) — 그때는 DATABASE_URL 이 이미 있어야 한다 */
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS schedules (
    title TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    place TEXT NOT NULL,
    status TEXT NOT NULL,
    changed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendances (
    schedule TEXT NOT NULL,
    name TEXT NOT NULL,
    answer TEXT NOT NULL,
    answered_at TEXT NOT NULL,
    PRIMARY KEY (schedule, name)
  );
  CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share_links (
    schedule TEXT PRIMARY KEY,
    url TEXT NOT NULL
  );
`;

let ready: Promise<void> | undefined;

/** 앱 시작 · 첫 연결에서 한 번만 테이블을 만든다(있으면 그대로 둔다) */
function ensureSchema(): Promise<void> {
  if (!ready) ready = getPool().query(CREATE_TABLES_SQL).then(() => undefined);
  return ready;
}

async function query<T extends Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

/* ── 일정 ── */

export async function getSchedules(): Promise<Schedule[]> {
  return query<Schedule>(
    `SELECT title, date, time, place, status, changed, created_at AS "createdAt" FROM schedules`,
  );
}

export async function getSchedule(title: string): Promise<Schedule | undefined> {
  const rows = await query<Schedule>(
    `SELECT title, date, time, place, status, changed, created_at AS "createdAt" FROM schedules WHERE title = $1`,
    [title],
  );
  return rows[0];
}

/** 같은 제목이면 덮어쓴다(F5 수정) · 없으면 새로 넣는다(F1 등록) */
export async function saveSchedule(schedule: Schedule, now: Date = new Date()): Promise<void> {
  assertValid(validateSchedule(schedule, now));
  await query(
    `INSERT INTO schedules (title, date, time, place, status, changed, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (title) DO UPDATE SET
       date = $2, time = $3, place = $4, status = $5, changed = $6, created_at = $7`,
    [
      schedule.title,
      schedule.date,
      schedule.time,
      schedule.place,
      schedule.status,
      schedule.changed,
      schedule.createdAt,
    ],
  );
}

/* ── 참석 응답 ── */

export async function getAttendances(scheduleTitle?: string): Promise<Attendance[]> {
  if (scheduleTitle === undefined) {
    return query<Attendance>(
      `SELECT name, schedule, answer, answered_at AS "answeredAt" FROM attendances`,
    );
  }
  return query<Attendance>(
    `SELECT name, schedule, answer, answered_at AS "answeredAt" FROM attendances WHERE schedule = $1`,
    [scheduleTitle],
  );
}

/** P5 — 한 사람은 일정 하나에 답 하나만. 같은 이름으로 다시 누르면 덮어쓴다 */
export async function saveAttendance(attendance: Attendance): Promise<void> {
  assertValid(validateAttendance(attendance));
  await query(
    `INSERT INTO attendances (schedule, name, answer, answered_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (schedule, name) DO UPDATE SET answer = $3, answered_at = $4`,
    [attendance.schedule, attendance.name, attendance.answer, attendance.answeredAt],
  );
}

/* ── 구성원 명단 ── */
/* [?] 명단을 누가 · 어디서 만드나 — 06 에서 정하지 않았다. 여기서는 읽고 쓰기만 둔다 */

export async function getMembers(): Promise<Member[]> {
  return query<Member>(`SELECT name FROM members ORDER BY id`);
}

/** 명단을 통째로 바꾼다(기존 localStorage 판과 같은 동작 — 부분 수정이 아니라 전체 교체) */
export async function setMembers(members: Member[]): Promise<void> {
  for (const member of members) {
    if (!member.name.trim()) throw new Error("이름을 입력하세요");
  }
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM members");
    for (const member of members) {
      await client.query("INSERT INTO members (name) VALUES ($1)", [member.name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/* ── 공유 주소 ── */

export async function getShareLink(scheduleTitle: string): Promise<ShareLink | undefined> {
  const rows = await query<ShareLink>(
    `SELECT schedule, url FROM share_links WHERE schedule = $1`,
    [scheduleTitle],
  );
  return rows[0];
}

/** 한 일정에 주소 하나 — 새로고침 뒤에도 같아야 한다(06 근거) */
export async function saveShareLink(link: ShareLink): Promise<void> {
  if (!link.schedule.trim() || !link.url.trim()) throw new Error("어느 일정 · 주소가 비었습니다");
  await query(
    `INSERT INTO share_links (schedule, url) VALUES ($1, $2)
     ON CONFLICT (schedule) DO UPDATE SET url = $2`,
    [link.schedule, link.url],
  );
}

/** 테스트 전용 — 네 테이블을 모두 비운다. 앱 코드에서는 쓰지 않는다. */
export async function __resetAllTablesForTest(): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "DELETE FROM schedules; DELETE FROM attendances; DELETE FROM members; DELETE FROM share_links;",
  );
}

/** 테스트 전용 — 커넥션 풀을 닫는다(안 닫으면 node 프로세스가 안 끝난다). 앱 코드에서는 쓰지 않는다. */
export async function __closePoolForTest(): Promise<void> {
  await pool?.end();
  pool = undefined;
  ready = undefined;
}
