import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  searchBarberShops,
  BarberPlace
} from "@/lib/google";
import { buildGoogleMapsUrl } from "@/lib/csv";

export const dynamic = "force-dynamic";

type RequestBody = {
  city?: string;
  includeDetails?: boolean;
};

const normalizePlace = (place: BarberPlace) => ({
  ...place,
  google_maps_url: buildGoogleMapsUrl(place.place_id)
});

const statusFromGoogle = (status?: string) => {
  switch (status) {
    case "OVER_QUERY_LIMIT":
      return 429;
    case "REQUEST_DENIED":
      return 403;
    case "INVALID_REQUEST":
      return 400;
    default:
      return 500;
  }
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY" },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const city = body.city?.trim();
  const includeDetails = Boolean(body.includeDetails);

  if (!city) {
    return NextResponse.json({ error: "City is required" }, { status: 400 });
  }

  try {
    const { results, pages, strategy, gridPoints, warnings } =
      await searchBarberShops(city, apiKey, includeDetails);

    return NextResponse.json({
      results: results.map(normalizePlace),
      meta: {
        total: results.length,
        pages,
        strategy,
        gridPoints,
        warnings
      }
    });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      const code = statusFromGoogle(err.status);
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: code }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
