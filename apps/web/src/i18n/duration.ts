import type { TFunction } from 'i18next';

/**
 * A study time a person would say out loud.
 *
 * "725 min" is a number a spreadsheet produces. Past an hour the learner wants
 * hours, and the minutes after the hour are still worth keeping — "12 h" alone
 * loses the part that makes yesterday's session feel counted.
 *
 * Shared rather than duplicated, because Home and Activity now both show study
 * time and two roundings of the same figure on two screens is exactly the kind
 * of disagreement a learner notices and cannot explain.
 */
export function formatDuration(
  minutes: number,
  t: TFunction<['activity', ...string[]]> | ((key: string, options?: object) => string),
): string {
  const translate = t as (key: string, options?: object) => string;
  if (minutes < 60) return translate('activity:units.minute', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = translate('activity:units.hour', { count: hours });
  return rest === 0
    ? hourPart
    : `${hourPart} ${translate('activity:units.minute', { count: rest })}`;
}
