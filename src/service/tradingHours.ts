export function isInTradingSession(date: Date = new Date()): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const morningStart = 9 * 60 + 25;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 12 * 60 + 55;
  const afternoonEnd = 15 * 60 + 5;
  return (
    (minutes >= morningStart && minutes <= morningEnd) ||
    (minutes >= afternoonStart && minutes <= afternoonEnd)
  );
}
