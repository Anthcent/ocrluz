/**
 * School branding for the files the server exports. The web app keeps the same texts (plus the crest
 * images) in apps/web/src/lib/branding.ts; change both together.
 */

export const SCHOOL_NAME = 'Liceo José Antonio Abreu';
export const EXPORT_FOOTER_TEXT = `Documento exportado por el sistema del ${SCHOOL_NAME}`;

/** The school's time zone, so the export date matches the local calendar. */
const SCHOOL_TIME_ZONE = 'America/Caracas';

/** Footer printed on every exported page, with the export date (dd/mm/aaaa). */
export function exportFooter(date = new Date()) {
  const day = date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: SCHOOL_TIME_ZONE });
  return `${EXPORT_FOOTER_TEXT} · ${day}`;
}
