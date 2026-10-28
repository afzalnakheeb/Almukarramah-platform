// Delivery quotes from our own zone table. When the OTO account is open, otoRates() can be added here
// (Claude Code can write it from OTO's API documentation) and merged with these quotes.
import type { Db } from './util.ts';

export type ShipTo = { country: string; city: string; kind: string };
export type Quote = { zoneId: string; carrier: string; service: string; amountSar: number; daysMin: number; daysMax: number };

type Zone = {
  id: string; countries: string[]; cities: string[] | null; carrier: string; service: string;
  first_kg_sar: number; extra_kg_sar: number; days_min: number; days_max: number;
};

export async function quotes(db: Db, shipTo: ShipTo, weightG: number): Promise<Quote[]> {
  const { data, error } = await db.from('shipping_zones').select('*').eq('active', true);
  if (error) throw error;
  const zones = data as Zone[];
  const country = shipTo.country.toUpperCase();
  const city = shipTo.city.trim().toLowerCase();

  const matchCity = zones.filter((z) => z.countries.includes(country) && z.cities?.some((c) => c.toLowerCase() === city));
  const matchCountry = zones.filter((z) => z.countries.includes(country) && !z.cities);
  const world = zones.filter((z) => z.countries.includes('*'));
  const chosen = matchCity.length || matchCountry.length ? [...matchCity, ...matchCountry] : world;

  const kg = Math.max(1, Math.ceil(weightG / 1000));
  return chosen.map((z) => ({
    zoneId: z.id,
    carrier: z.carrier,
    service: z.service,
    amountSar: z.first_kg_sar + (kg - 1) * z.extra_kg_sar,
    daysMin: z.days_min,
    daysMax: z.days_max,
  }));
}
