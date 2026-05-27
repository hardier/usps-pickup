export function getNextPickupDate(): Date {
  const now = new Date();
  // Start from tomorrow (local date arithmetic)
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const holidays = new Set([
    ...uspsHolidays(date.getFullYear()),
    ...uspsHolidays(date.getFullYear() + 1),
  ]);

  while (true) {
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(toIso(date))) {
      return date;
    }
    date.setDate(date.getDate() + 1);
  }
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// nth occurrence of weekday (0=Sun…6=Sat) in a given month (0-indexed)
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday && ++count === n) return toIso(d);
    d.setDate(d.getDate() + 1);
  }
}

// last Monday of a month (0-indexed)
function lastMonday(year: number, month: number): string {
  const d = new Date(year, month + 1, 0); // last day of month
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return toIso(d);
}

// observed federal holiday (Sat→Fri, Sun→Mon)
function observed(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  else if (dow === 6) d.setDate(d.getDate() - 1);
  return toIso(d);
}

function uspsHolidays(year: number): string[] {
  return [
    observed(year, 0, 1),        // New Year's Day
    nthWeekday(year, 0, 1, 3),   // MLK Day (3rd Mon Jan)
    nthWeekday(year, 1, 1, 3),   // Presidents Day (3rd Mon Feb)
    lastMonday(year, 4),          // Memorial Day (last Mon May)
    observed(year, 5, 19),       // Juneteenth
    observed(year, 6, 4),        // Independence Day
    nthWeekday(year, 8, 1, 1),   // Labor Day (1st Mon Sep)
    nthWeekday(year, 9, 1, 2),   // Columbus Day (2nd Mon Oct)
    observed(year, 10, 11),      // Veterans Day
    nthWeekday(year, 10, 4, 4),  // Thanksgiving (4th Thu Nov)
    observed(year, 11, 25),      // Christmas
  ];
}
