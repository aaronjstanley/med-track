export function formatTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = Number(hStr);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")}${suffix}`;
}

export function timeInputValue(time: string): string {
  // Postgres time may come as HH:MM:SS
  return time.slice(0, 5);
}
