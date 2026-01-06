export type GeocodeResult = {
  location: { lat: number; lng: number };
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
};

export type BarberPlace = {
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  place_id: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  formatted_phone_number?: string;
  website?: string;
};

type PlacesTextSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    types?: string[];
  }>;
  nextPageToken?: string;
};

type PlaceDetailsResponse = {
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

const BASE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const BASE_PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const BASE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

export class GoogleApiError extends Error {
  constructor(message: string, public status?: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_GRID_POINTS = 16;
const MAX_PAGES_PER_POINT = 3;
const MAX_TOTAL_RESULTS = 500;

const buildUrl = (base: string, params: Record<string, string | number>) => {
  const search = new URLSearchParams(params as Record<string, string>);
  return `${base}?${search.toString()}`;
};

const mapNewApiStatus = (status?: string) => {
  switch (status) {
    case "RESOURCE_EXHAUSTED":
      return "OVER_QUERY_LIMIT";
    case "PERMISSION_DENIED":
      return "REQUEST_DENIED";
    case "INVALID_ARGUMENT":
      return "INVALID_REQUEST";
    default:
      return status;
  }
};

const parseNewApiError = async (res: Response) => {
  try {
    const data = (await res.json()) as {
      error?: { status?: string; message?: string };
    };
    const mappedStatus = mapNewApiStatus(data.error?.status);
    return new GoogleApiError(
      data.error?.message || `Places request failed with ${res.status}`,
      mappedStatus
    );
  } catch {
    return new GoogleApiError(`Places request failed with ${res.status}`);
  }
};

type GridPoint = { lat: number; lng: number; radiusMeters: number };

const metersPerDegreeLat = 111_000;

const metersPerDegreeLng = (lat: number) =>
  111_000 * Math.cos((lat * Math.PI) / 180);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const buildGridPoints = (
  center: { lat: number; lng: number },
  viewport?: GeocodeResult["viewport"]
): GridPoint[] => {
  if (!viewport) {
    return [{ lat: center.lat, lng: center.lng, radiusMeters: 40000 }];
  }

  const latMin = viewport.southwest.lat;
  const latMax = viewport.northeast.lat;
  const lngMin = viewport.southwest.lng;
  const lngMax = viewport.northeast.lng;

  const latSpan = Math.abs(latMax - latMin);
  const lngSpan = Math.abs(lngMax - lngMin);

  const largeCity = latSpan > 0.35 || lngSpan > 0.35;
  const rows = largeCity ? 4 : 3;
  const cols = largeCity ? 4 : 3;

  const latStep = latSpan / rows;
  const lngStep = lngSpan / cols;

  const avgLat = (latMin + latMax) / 2;
  const latMeters = latStep * metersPerDegreeLat;
  const lngMeters = lngStep * metersPerDegreeLng(avgLat);
  const radiusMeters = clamp(
    Math.max(latMeters, lngMeters) * 0.75,
    5000,
    40000
  );

  const points: GridPoint[] = [];
  for (let row = 0; row < rows; row++) {
    const lat = latMin + latStep * (row + 0.5);
    for (let col = 0; col < cols; col++) {
      const lng = lngMin + lngStep * (col + 0.5);
      points.push({ lat, lng, radiusMeters });
    }
  }

  return points.slice(0, MAX_GRID_POINTS);
};

export async function geocodeCity(
  city: string,
  apiKey: string
): Promise<GeocodeResult> {
  const url = buildUrl(BASE_GEOCODE_URL, {
    address: city,
    key: apiKey
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new GoogleApiError(`Geocode request failed with ${res.status}`);
  }

  const data = (await res.json()) as {
    status: string;
    results: Array<{
      geometry?: { location: { lat: number; lng: number }; viewport?: GeocodeResult["viewport"] };
    }>;
    error_message?: string;
  };

  if (data.status !== "OK" || !data.results?.length) {
    throw new GoogleApiError(data.error_message || `Geocode status: ${data.status}`, data.status);
  }

  const first = data.results[0];
  if (!first.geometry?.location) {
    throw new GoogleApiError("Geocode response missing coordinates");
  }

  return {
    location: first.geometry.location,
    viewport: first.geometry.viewport
  };
}

async function fetchPlacesPage(
  query: string,
  apiKey: string,
  pageToken?: string,
  location?: { lat: number; lng: number },
  radiusMeters?: number
): Promise<PlacesTextSearchResponse> {
  const body: Record<string, unknown> = {
    textQuery: query,
    pageToken
  };

  if (location) {
    body.locationBias = {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng
        },
        radius: radiusMeters ?? 40000
      }
    };
  }

  const res = await fetch(BASE_PLACES_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.types",
        "nextPageToken"
      ].join(",")
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw await parseNewApiError(res);
  }

  return (await res.json()) as PlacesTextSearchResponse;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetailsResponse | undefined> {
  const res = await fetch(`${BASE_PLACE_DETAILS_URL}/${placeId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ["internationalPhoneNumber", "nationalPhoneNumber", "websiteUri"].join(
        ","
      )
    }
  });

  if (!res.ok) {
    throw await parseNewApiError(res);
  }

  return (await res.json()) as PlaceDetailsResponse;
}

export async function searchBarberShops(
  city: string,
  apiKey: string,
  includeDetails = false
): Promise<{
  results: BarberPlace[];
  pages: number;
  strategy: "grid";
  gridPoints: number;
  warnings: string[];
}> {
  const geo = await geocodeCity(city, apiKey);

  const query = "barber shop";
  const seen = new Map<string, BarberPlace>();
  let pages = 0;
  const warnings: string[] = [];
  const gridPoints = buildGridPoints(geo.location, geo.viewport);

  for (const point of gridPoints) {
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      if (pageToken) {
        // nextPageToken requires a short delay before use
        await sleep(2000);
      }

      const page = await fetchPlacesPage(
        query,
        apiKey,
        pageToken,
        { lat: point.lat, lng: point.lng },
        point.radiusMeters
      );

      pages += 1;
      pageCount += 1;

      const pageResults = page.places || [];
      for (const place of pageResults) {
        const placeId = place.id;
        if (!placeId || seen.has(placeId)) continue;
        const entry: BarberPlace = {
          name: place.displayName?.text || "Unknown",
          formatted_address: place.formattedAddress || "",
          lat: place.location?.latitude ?? 0,
          lng: place.location?.longitude ?? 0,
          place_id: placeId,
          rating: place.rating,
          user_ratings_total: place.userRatingCount,
          types: place.types
        };
        seen.set(placeId, entry);
        if (seen.size >= MAX_TOTAL_RESULTS) {
          warnings.push(
            `Stopped early after ${MAX_TOTAL_RESULTS} results to control API cost.`
          );
          break;
        }
      }

      if (seen.size >= MAX_TOTAL_RESULTS) {
        break;
      }

      pageToken = page.nextPageToken;
    } while (pageToken && pageCount < MAX_PAGES_PER_POINT);

    if (seen.size >= MAX_TOTAL_RESULTS) {
      break;
    }
  }

  const results = Array.from(seen.values());

  if (includeDetails && results.length) {
    const detailLimit = Math.min(results.length, 50); // avoid runaway quota use
    for (let i = 0; i < detailLimit; i++) {
      const details = await fetchPlaceDetails(results[i].place_id, apiKey);
      if (details) {
        results[i].formatted_phone_number =
          details.internationalPhoneNumber || details.nationalPhoneNumber;
        results[i].website = details.websiteUri;
      }
    }
  }

  return {
    results,
    pages,
    strategy: "grid",
    gridPoints: gridPoints.length,
    warnings
  };
}
