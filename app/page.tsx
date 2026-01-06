'use client';

import { FormEvent, useMemo, useState } from "react";
import { placesToCsv } from "@/lib/csv";
import type { BarberPlace } from "@/lib/google";

type NormalizedPlace = BarberPlace & { google_maps_url: string };

type SearchResponse = {
  results: NormalizedPlace[];
  meta?: {
    total: number;
    pages: number;
    strategy?: string;
    gridPoints?: number;
    warnings?: string[];
  };
  error?: string;
};

export default function Home() {
  const [city, setCity] = useState("");
  const [includeDetails, setIncludeDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [results, setResults] = useState<NormalizedPlace[]>([]);
  const [meta, setMeta] = useState<{ total: number; pages: number }>({
    total: 0,
    pages: 0
  });

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) {
      setError("Please type a city name first.");
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);
    setResults([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: trimmed, includeDetails })
      });

      const data = (await res.json().catch(() => ({}))) as SearchResponse;

      if (!res.ok) {
        setError(data?.error || "Search failed. Please try again.");
        if (res.status === 429) {
          setWarning("Results may be limited due to API quota or rate limits.");
        }
        setMeta({ total: 0, pages: 0 });
        return;
      }

      setResults(data.results || []);
      setMeta(
        data.meta || {
          total: data.results?.length || 0,
          pages: 1
        }
      );
      const warningMessages: string[] = [];
      if (data.meta?.warnings?.length) {
        warningMessages.push(...data.meta.warnings);
      }
      if (includeDetails && (data.results?.length || 0) > 50) {
        warningMessages.push(
          "Place details fetched only for the first 50 places to stay within quota."
        );
      }
      setWarning(warningMessages.length ? warningMessages.join(" ") : null);
    } catch (err) {
      setError("Unexpected error. Please try again.");
      setMeta({ total: 0, pages: 0 });
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!results.length) return;
    const csv = placesToCsv(results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `barber-shops-${city || "city"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const statusText = useMemo(() => {
    if (loading) return "Searching Google Maps…";
    if (results.length) return `${results.length} barber shops found`;
    return "No results yet";
  }, [loading, results.length]);

  return (
    <main>
      <div className="card">
        <h1 className="title">City Barber Shops → CSV Export</h1>
        <p className="subtitle">
          Type a city, search Google Maps barber shops, and download everything
          to CSV.
        </p>

        <form className="form" onSubmit={handleSearch}>
          <div>
            <label htmlFor="city">City</label>
            <input
              id="city"
              type="text"
              placeholder='Ex: "Ribeirão Preto, SP"'
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="row">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={includeDetails}
                onChange={(e) => setIncludeDetails(e.target.checked)}
                disabled={loading}
              />
              Include phone/website
            </label>
          </div>

          <div className="row">
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
            <button
              className="button"
              type="button"
              onClick={downloadCsv}
              disabled={!results.length || loading}
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #10b981 100%)",
                color: "#04120d",
                boxShadow: "0 12px 30px rgba(34, 197, 94, 0.35)"
              }}
            >
              Download CSV
            </button>
            <span className="muted">{statusText}</span>
          </div>
        </form>

        {error && <div className="error">{error}</div>}
        {warning && !error && <div className="muted">{warning}</div>}

        <div className="status" style={{ marginTop: 12 }}>
          <div>
            <strong>Total:</strong> {meta.total}{" "}
            <span className="muted">(pages fetched: {meta.pages})</span>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Rating</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="muted">
                    No results yet. Search a city to begin.
                  </td>
                </tr>
              )}
              {results.map((place) => (
                <tr key={place.place_id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{place.name}</div>
                    <div className="muted">
                      {place.types?.slice(0, 3).map((type) => (
                        <span key={type} className="badge">
                          {type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{place.formatted_address}</td>
                  <td>
                    {place.rating ? (
                      <>
                        {place.rating.toFixed(1)}{" "}
                        <span className="muted">
                          ({place.user_ratings_total ?? 0})
                        </span>
                      </>
                    ) : (
                      <span className="muted">N/A</span>
                    )}
                  </td>
                  <td>{place.formatted_phone_number || <span className="muted">–</span>}</td>
                  <td>
                    {place.website ? (
                      <a href={place.website} target="_blank" rel="noreferrer">
                        Site
                      </a>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td>
                    <a
                      href={place.google_maps_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Maps
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
