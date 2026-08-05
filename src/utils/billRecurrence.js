// Helpers puros para cálculo de datas de recorrência mensal de contas (visão "DDA")
// due_date é sempre tratado como string "YYYY-MM-DD" (DATEONLY), nunca como Date,
// para evitar bugs de fuso horário.

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

export function parseDateOnly(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatDateOnly(year, month, day) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function monthKeyFromParts(year, month) {
  return `${pad(year, 4)}-${pad(month)}`;
}

export function monthKeyFromDate(dateStr) {
  const { year, month } = parseDateOnly(dateStr);
  return monthKeyFromParts(year, month);
}

export function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return { year, month };
}

export function isValidMonthKey(monthKey) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey));
}

export function addMonths(year, month, delta) {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (((total % 12) + 12) % 12) + 1;
  return { year: newYear, month: newMonth };
}

// Projeta o "dia" de um due_date de referência para outro mês, ajustando
// para o último dia do mês quando necessário (ex: dia 31 em fevereiro -> 28/29).
export function projectDueDate(day, year, month) {
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return formatDateOnly(year, month, clampedDay);
}

// Garante due_date como string pura "YYYY-MM-DD", sem componente de hora,
// para que todos os endpoints (bills, alerts, etc.) retornem o mesmo formato
// e o frontend possa comparar datas sem risco de divergência por fuso horário.
export function normalizeDateOnly(value) {
  if (!value) return value;
  if (value instanceof Date) {
    return formatDateOnly(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }
  return String(value).slice(0, 10);
}

// Gera uma janela de `count` meses consecutivos a partir de `startDate`.
export function buildMonthWindow(startDate, count) {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1;
  const months = [];
  for (let i = 0; i < count; i++) {
    const { year: y, month: m } = addMonths(year, month, i);
    months.push({ year: y, month: m, key: monthKeyFromParts(y, m) });
  }
  return months;
}

function monthIndex(year, month) {
  return year * 12 + (month - 1);
}

// Lista todos os meses entre [start, end], inclusive, em ordem cronológica.
// Usado para "catch-up" de contas recorrentes atrasadas há vários meses:
// cada mês nesse intervalo que ainda não foi pago vira um aviso próprio.
export function monthRangeInclusive(startYear, startMonth, endYear, endMonth) {
  const startIdx = monthIndex(startYear, startMonth);
  const endIdx = monthIndex(endYear, endMonth);
  if (startIdx > endIdx) return [];
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const year = Math.floor(idx / 12);
    const month = (((idx % 12) + 12) % 12) + 1;
    months.push({ year, month, key: monthKeyFromParts(year, month) });
  }
  return months;
}
