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
  location?: { lat: number; lng: number }
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
        radius: 40000
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
): Promise<{ results: BarberPlace[]; pages: number }> {
  const geo = await geocodeCity(city, apiKey);

  const query = `barber shop in ${city}`;
  const seen = new Map<string, BarberPlace>();
  let pageToken: string | undefined;
  let pages = 0;
  let invalidPageAttempts = 0;

  do {
    if (pageToken) {
      // next_page_token requires a short delay before use
      await sleep(2000);
    }

    const page = await fetchPlacesPage(query, apiKey, pageToken, geo.location);

    if (!page.places?.length && pageToken) {
      invalidPageAttempts += 1;
      if (invalidPageAttempts >= 3) {
        break;
      }
      await sleep(1500);
      continue;
    }

    invalidPageAttempts = 0;
    pages += 1;

    const pageResults = page.places || [];

    if (!pageResults.length && !page.nextPageToken) {
      break;
    }

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
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

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

  return { results, pages };
}
