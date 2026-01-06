import type { BarberPlace } from "./google";

export const CSV_HEADERS = [
  "name",
  "formatted_address",
  "lat",
  "lng",
  "place_id",
  "rating",
  "user_ratings_total",
  "types",
  "google_maps_url",
  "formatted_phone_number",
  "website"
];

const escapeCsvValue = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const buildGoogleMapsUrl = (placeId: string) =>
  `https://www.google.com/maps/place/?q=place_id:${placeId}`;

export function placesToCsv(places: BarberPlace[]): string {
  const header = CSV_HEADERS.join(",");
  const rows = places.map((place) => {
    const values: Array<string | number | undefined> = [
      place.name,
      place.formatted_address,
      place.lat,
      place.lng,
      place.place_id,
      place.rating,
      place.user_ratings_total,
      place.types?.join(";"),
      buildGoogleMapsUrl(place.place_id),
      place.formatted_phone_number,
      place.website
    ];

    return values.map(escapeCsvValue).join(",");
  });

  return [header, ...rows].join("\n");
}
