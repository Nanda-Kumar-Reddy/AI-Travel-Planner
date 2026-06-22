/**
 * Geocoding Service — resolves a destination name to lat/lng coordinates
 * using the Open-Meteo geocoding API (free, no API key required).
 *
 * API docs: https://open-meteo.com/en/docs/geocoding-api
 */

import { logger } from '../utils/logger';

interface GeocodingResult {
  lat: number;
  lng: number;
  resolvedName: string; // the canonical city name from the API
}

interface OpenMeteoGeoResponse {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    admin1?: string;
  }>;
}

/**
 * geocodeDestination — resolves a city/place name to coordinates.
 * Returns null (does NOT throw) when the place is not found —
 * the caller stores null and the trip is still created without coordinates.
 * Weather risk will degrade gracefully when coordinates are missing.
 */
export async function geocodeDestination(
  destination: string
): Promise<GeocodingResult | null> {
  try {
    const encoded = encodeURIComponent(destination.trim());
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encoded}&count=1&language=en&format=json`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5-second timeout
    });

    if (!response.ok) {
      logger.warn(`[Geocoding] API returned ${response.status} for "${destination}"`);
      return null;
    }

    const data = (await response.json()) as OpenMeteoGeoResponse;

    if (!data.results || data.results.length === 0) {
      logger.warn(`[Geocoding] No results for "${destination}"`);
      return null;
    }

    const place = data.results[0];
    return {
      lat: place.latitude,
      lng: place.longitude,
      resolvedName: `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}, ${place.country}`,
    };
  } catch (err) {
    // Network error, timeout, or JSON parse failure — degrade gracefully
    logger.warn(`[Geocoding] Failed to geocode "${destination}":`, err);
    return null;
  }
}
