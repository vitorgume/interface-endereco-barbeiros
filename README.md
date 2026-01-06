# City Barber Shops → CSV Export

One-page Next.js app to search **barber shops** in any city via Google Maps Places API and download the results as CSV. The Google API key is kept server-side only.

## Quick start

```bash
npm install
cp .env.example .env   # add your Google API key
npm run dev
```

Then open `http://localhost:3000`.

## Environment

```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

### How to get a key

1. Go to Google Cloud Console → APIs & Services.
2. Create a project (or pick an existing one).
3. Enable billing.
4. Enable these APIs:
   - Geocoding API
   - Places API (includes Text Search & Place Details)
5. Create a new API key (Credentials → Create credentials → API key).
6. Restrict the key to the above APIs and your desired referrers/IPs.
7. Paste the key into `.env`.

## What the app does

- Input a city, e.g. `"Ribeirão Preto, SP"`.
- Backend `POST /api/search`:
  - Geocodes the city.
  - Runs Places **Text Search** for `"barber shop in <city>"`.
  - Follows `next_page_token` (with ~2s waits) to fetch as many pages as Google returns.
  - De-duplicates by `place_id`.
  - Optionally fetches phone/website via Place Details (capped to 60 places to avoid quota spikes).
- Frontend shows the results count and pages fetched and lets you download the CSV.

### CSV columns

`name, formatted_address, lat, lng, place_id, rating, user_ratings_total, types, google_maps_url, formatted_phone_number, website`

## Project structure

- `app/page.tsx` — UI for search, results, CSV download.
- `app/api/search/route.ts` — server endpoint calling Google APIs.
- `lib/google.ts` — geocode + places search + pagination + optional details.
- `lib/csv.ts` — CSV serializer and Maps URL helper.
- `.env.example` — environment template.

## Notes & limits

- The API key is read only on the server; the client never sees it.
- If Google returns `OVER_QUERY_LIMIT`, the UI will surface a warning and results may be partial.
- Place Details calls are intentionally capped to reduce quota usage.
- CSV uses standard escaping so it opens cleanly in Excel/Sheets.

## Running lint/build

```bash
npm run lint
npm run build
```
