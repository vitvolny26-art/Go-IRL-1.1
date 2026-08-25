import { localDateKey } from "./visualDemoState";

export const normalizeActivityCreateDate = (
  date: string,
  localToday = localDateKey(),
  utcToday = new Date().toISOString().slice(0, 10),
) => date === utcToday && utcToday < localToday ? localToday : date;
