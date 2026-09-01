import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
  differenceInCalendarDays,
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  format,
} from "date-fns";

export const APP_TIMEZONE = process.env.TIMEZONE || "America/Sao_Paulo";

export function nowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE);
}

export function formatDateBR(
  value: Date | string | null | undefined,
  pattern = "dd/MM/yyyy",
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (!isValid(date)) return "—";
  return formatInTimeZone(date, APP_TIMEZONE, pattern, { locale: ptBR });
}

export function formatDateTimeBR(
  value: Date | string | null | undefined,
): string {
  return formatDateBR(value, "dd/MM/yyyy HH:mm");
}

export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const target = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(target)) return null;
  const today = startOfDay(nowInAppTz());
  return differenceInCalendarDays(
    startOfDay(toZonedTime(target, APP_TIMEZONE)),
    today,
  );
}

export function isExpired(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const target = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(target)) return false;
  // Compare calendar days in app timezone (validity is date-based, not hour-based)
  const todayKey = formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
  const expKey = formatInTimeZone(target, APP_TIMEZONE, "yyyy-MM-dd");
  return expKey < todayKey;
}

export function startOfDayTz(date: Date = new Date()): Date {
  return startOfDay(toZonedTime(date, APP_TIMEZONE));
}

export function endOfDayTz(date: Date = new Date()): Date {
  return endOfDay(toZonedTime(date, APP_TIMEZONE));
}

export { format };
