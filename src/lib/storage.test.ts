/**
 * storage.ts(검사) · db.ts(서버 데이터베이스 저장/조회)의 한도 · 규칙 검사. 프레임워크 없음.
 *   실행: node src/lib/storage.test.ts   (Node 22.18+ · 24 — .ts 를 그대로 읽는다)
 *   .env.local 의 DATABASE_URL 로 실제 서버 데이터베이스에 접속해서 검사한다(연결이 안 되면 실패한다).
 */
process.loadEnvFile(".env.local");

import assert from "node:assert/strict";
import {
  isCurrentAdmin,
  todayString,
  validateSchedule,
  type Attendance,
  type Schedule,
} from "./storage.ts";
import {
  __closePoolForTest,
  __resetAllTablesForTest,
  getAttendances,
  getMembers,
  getSchedule,
  getSchedules,
  getShareLink,
  saveAttendance,
  saveSchedule,
  saveShareLink,
  setMembers,
} from "./db.ts";

/* 브라우저 localStorage 흉내 — isCurrentAdmin 만 쓴다(그대로 localStorage 기반) */
const store = new Map<string, string>();
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
const global = globalThis as unknown as { localStorage?: typeof fake };
global.localStorage = fake;

const 오늘 = todayString();
const 어제 = todayString(new Date(Date.now() - 24 * 60 * 60 * 1000));
const 내일 = todayString(new Date(Date.now() + 24 * 60 * 60 * 1000));

const 일정: Schedule = {
  title: "9월 정기 모임",
  date: 내일,
  time: "19:00",
  place: "스터디룸 B",
  status: "예정",
  changed: false,
  createdAt: new Date().toISOString(),
};

async function throwsAsync(fn: () => Promise<unknown>, message: string) {
  await assert.rejects(fn, (e: Error) => e.message === message, `"${message}" 로 막혀야 한다`);
}

async function main() {
  // 실제 서버 데이터베이스를 검사 전에 비운다(로컬 Map 을 매번 새로 만드는 것과 같은 효과)
  await __resetAllTablesForTest();

  // 빈 저장소
  assert.deepEqual(await getSchedules(), [], "빈 저장소는 빈 배열");
  assert.deepEqual(await getAttendances(), []);
  assert.equal(await getShareLink("없는 일정"), undefined);

  // 일정 — 저장하고 다시 읽기
  await saveSchedule(일정);
  assert.deepEqual(await getSchedule("9월 정기 모임"), 일정);

  // 일정 — 같은 제목은 덮어쓴다(F5 수정 · P4 변경됨)
  await saveSchedule({ ...일정, place: "동아리방", changed: true });
  assert.equal((await getSchedules()).length, 1, "같은 제목이면 하나");
  assert.equal((await getSchedule("9월 정기 모임"))?.place, "동아리방");
  assert.equal((await getSchedule("9월 정기 모임"))?.changed, true);

  // P3 — 제목 30자까지
  await throwsAsync(() => saveSchedule({ ...일정, title: "가".repeat(31) }), "제목은 30자까지입니다");
  await saveSchedule({ ...일정, title: "가".repeat(30) }); // 30자는 된다
  assert.equal((await getSchedules()).length, 2);

  // P3 — 네 칸은 비울 수 없다
  for (const 빈칸 of [{ title: "" }, { date: "" }, { time: "" }, { place: " " }]) {
    await throwsAsync(
      () => saveSchedule({ ...일정, ...빈칸 }),
      "제목 · 날짜 · 시간 · 장소는 비울 수 없습니다",
    );
  }

  // P3 — 날짜는 오늘 이후만 ("지난 날짜입니다")
  await throwsAsync(() => saveSchedule({ ...일정, date: 어제 }), "지난 날짜입니다");
  assert.equal(validateSchedule({ ...일정, date: 오늘 }), null, "오늘은 된다");
  assert.equal(validateSchedule({ ...일정, date: 내일 }), null);

  // 상태값은 셋 중 하나
  await throwsAsync(
    () => saveSchedule({ ...일정, status: "취소됨" as never }),
    "상태값이 올바르지 않습니다",
  );

  // P5 — 한 사람은 일정 하나에 답 하나만, 다시 누르면 덮어쓴다
  const 응답: Attendance = {
    name: "민수",
    schedule: "9월 정기 모임",
    answer: "참석",
    answeredAt: new Date().toISOString(),
  };
  await saveAttendance(응답);
  await saveAttendance({ ...응답, answer: "불참" });
  assert.equal((await getAttendances("9월 정기 모임")).length, 1, "같은 이름은 하나");
  assert.equal((await getAttendances("9월 정기 모임"))[0].answer, "불참", "칸만 옮겨 간다");

  // 다른 사람 · 다른 일정은 따로 쌓인다
  await saveAttendance({ ...응답, name: "서연" });
  await saveAttendance({ ...응답, schedule: "10월 정기 모임" });
  assert.equal((await getAttendances("9월 정기 모임")).length, 2);
  assert.equal((await getAttendances()).length, 3);

  // 참석/불참 둘 중 하나 · 이름은 비울 수 없다
  await throwsAsync(
    () => saveAttendance({ ...응답, answer: "미정" as never }),
    "참석 · 불참 중 하나여야 합니다",
  );
  await throwsAsync(() => saveAttendance({ ...응답, name: "  " }), "이름을 입력하세요");

  // 구성원 명단 — 이름 칸만
  await setMembers([{ name: "지우" }, { name: "민수" }, { name: "서연" }]);
  assert.deepEqual((await getMembers()).map((m) => m.name), ["지우", "민수", "서연"]);
  await throwsAsync(() => setMembers([{ name: "" }]), "이름을 입력하세요");

  // 공유 주소 — 한 일정에 하나, 새로고침 뒤에도 같다
  await saveShareLink({ schedule: "9월 정기 모임", url: "/s/abc" });
  await saveShareLink({ schedule: "9월 정기 모임", url: "/s/xyz" });
  assert.equal((await getShareLink("9월 정기 모임"))?.url, "/s/xyz");
  assert.equal(await getShareLink("10월 정기 모임"), undefined);

  // 총무 판정 — 아무것도 설정 안 하면(새 브라우저) 기본값은 총무 · "0"이면 구성원
  // (isCurrentAdmin 은 이번 작업 범위 밖 — 지금처럼 localStorage 기반 그대로)
  assert.equal(isCurrentAdmin(), true, "새 브라우저는 기본값이 총무");
  fake.setItem("currentAdmin", "0");
  assert.equal(isCurrentAdmin(), false, "currentAdmin=0 이면 구성원");
  fake.removeItem("currentAdmin");

  // 서버 렌더 — localStorage 가 없어도 터지지 않는다(isCurrentAdmin 만 localStorage 를 쓴다)
  delete global.localStorage;
  assert.equal(isCurrentAdmin(), true, "서버 렌더도 기본값은 총무 — 터지지 않는다");
  global.localStorage = fake;

  console.log("모든 검사 통과");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(__closePoolForTest);
