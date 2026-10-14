/**
 * Enregistrement des demandes de réservation dans Redis : une clé par demande
 * (effacée au bout de 12 mois), indexée par date dans un ensemble trié, comme les
 * signalements et les tests de placement.
 *
 * Lecture et suppression : uniquement via /api/admin/reservations.
 */
import { randomBytes } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import type { Reservation } from './reservations';

export const INDEX_KEY = 'reservations';
export const cleReservation = (id: string) => `reservation:${id}`;
export const CONSERVATION_S = 365 * 24 * 3600;
export const MAX_RESERVATIONS = 500;
export const ID_VALIDE = /^[0-9a-f]{16}$/;

export type StoreClient = Pick<Redis, 'get' | 'set' | 'del' | 'mget' | 'zadd' | 'zrange' | 'zrem' | 'zremrangebyscore'>;

export async function enregistrerReservation(
  redis: StoreClient,
  valeur: Omit<Reservation, 'id' | 'envoyeLe'>,
  maintenant = new Date(),
): Promise<Reservation> {
  // identifiant et horodatage posés en dernier : ce qui arrive du visiteur ne peut pas les écraser
  const reservation: Reservation = { ...valeur, id: randomBytes(8).toString('hex'), envoyeLe: maintenant.toISOString() };
  await redis.set(cleReservation(reservation.id), reservation, { ex: CONSERVATION_S });
  await redis.zadd(INDEX_KEY, { score: maintenant.getTime(), member: reservation.id });

  // ménage : plus de 12 mois, puis au-delà des MAX_RESERVATIONS plus récentes
  await redis.zremrangebyscore(INDEX_KEY, 0, maintenant.getTime() - CONSERVATION_S * 1000);
  const surplus = await redis.zrange<string[]>(INDEX_KEY, 0, -(MAX_RESERVATIONS + 1));
  if (surplus.length) {
    await redis.del(...surplus.map(cleReservation));
    await redis.zrem(INDEX_KEY, ...surplus);
  }
  return reservation;
}

/** De la plus récente à la plus ancienne. */
export async function listerReservations(redis: StoreClient): Promise<Reservation[]> {
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids.length) return [];
  const liste = await redis.mget<(Reservation | null)[]>(...ids.map(cleReservation));
  return liste.filter((r): r is Reservation => r !== null);
}

export async function supprimerReservation(redis: StoreClient, id: string): Promise<void> {
  await redis.del(cleReservation(id));
  await redis.zrem(INDEX_KEY, id);
}
