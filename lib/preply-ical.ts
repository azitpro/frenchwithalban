/**
 * Lecture de l'agenda iCal de Preply.
 *
 * Seules les dates et les heures sont extraites : le résumé des événements
 * (qui contient les prénoms des élèves) n'est jamais lu.
 */

/** Une plage occupée, en heures décimales locales (Europe/Paris). Ex. : 17.5 = 17 h 30. */
export type Occupation = { date: string; startHour: number; endHour: number };

type DateIcal = { y: number; mo: number; d: number; h: number; mi: number; utc: boolean };

function lireDateIcal(valeur: string): DateIcal {
  const utc = valeur.endsWith('Z');
  const propre = valeur.replace('Z', '');
  return {
    y: parseInt(propre.slice(0, 4)),
    mo: parseInt(propre.slice(4, 6)),
    d: parseInt(propre.slice(6, 8)),
    h: parseInt(propre.slice(9, 11)),
    mi: parseInt(propre.slice(11, 13)),
    utc,
  };
}

/** Passage à l'heure de Paris ; une date sans « Z » est déjà locale. */
export function versHeureParis(parsee: DateIcal): { date: string; hour: number } {
  if (!parsee.utc) {
    const mo = String(parsee.mo).padStart(2, '0');
    const d = String(parsee.d).padStart(2, '0');
    return { date: `${parsee.y}-${mo}-${d}`, hour: parsee.h + parsee.mi / 60 };
  }
  const instant = new Date(Date.UTC(parsee.y, parsee.mo - 1, parsee.d, parsee.h, parsee.mi));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour')) + parseInt(get('minute')) / 60,
  };
}

/** Plages occupées du fichier iCal ; les événements à cheval sur deux jours sont ignorés. */
export function lireIcal(texte: string): Occupation[] {
  const occupations: Occupation[] = [];
  for (const bloc of texte.split('BEGIN:VEVENT').slice(1)) {
    const debut = bloc.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/);
    const fin = bloc.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/);
    if (!debut || !fin) continue;
    const d = versHeureParis(lireDateIcal(debut[1]));
    const f = versHeureParis(lireDateIcal(fin[1]));
    if (d.date === f.date) occupations.push({ date: d.date, startHour: d.hour, endHour: f.hour });
  }
  return occupations;
}

/** Agenda Preply téléchargé, ou null si l'adresse n'est pas configurée ou le téléchargement échoue. */
export async function chargerOccupations(): Promise<Occupation[] | null> {
  const url = process.env.PREPLY_ICAL_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return lireIcal(await res.text());
  } catch {
    return null;
  }
}
