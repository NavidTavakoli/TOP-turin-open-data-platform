// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../../_utils";

// Haversine formula to compute distance in km between two lat/lon coordinates
const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Handle CORS OPTIONS preflight
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon");
    
    // Parse limit (default 12, max 30)
    let limit = 12;
    const limitParam = searchParams.get("limit");
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 30);
      }
    }

    // Parse radius_m (default 800, max 3000)
    let radiusM = 800;
    const radiusParam = searchParams.get("radius_m");
    if (radiusParam) {
      const parsedRadius = parseFloat(radiusParam);
      if (!isNaN(parsedRadius) && parsedRadius > 0) {
        radiusM = Math.min(parsedRadius, 3000);
      }
    }

    // 1. Input Validation
    if (!latStr || !lonStr) {
      return errJSON(400, "Missing required query parameters: 'lat' and 'lon'.");
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return errJSON(400, "Invalid 'lat' parameter: must be a number between -90 and 90.");
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      return errJSON(400, "Invalid 'lon' parameter: must be a number between -180 and 180.");
    }

    // 2. Compute bounding box in degrees to filter in database
    // 1 degree latitude = 111,000 meters
    const deltaLat = radiusM / 111000;
    // 1 degree longitude = 111,000 * cos(lat) meters
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const deltaLon = radiusM / (111000 * cosLat);

    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    // 3. Fetch from Supabase via PostgREST using bounding box filters
    const queryPath = `gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon` +
      `&stop_lat=gte.${minLat}&stop_lat=lte.${maxLat}` +
      `&stop_lon=gte.${minLon}&stop_lon=lte.${maxLon}`;

    const stops = await sbFetch(ctx.env, queryPath);
    const results = Array.isArray(stops) ? stops : [];

    // 4. Calculate exact distance in meters and sort/filter
    const nearbyStops = results
      .map((stop: any) => {
        const stopLat = Number(stop.stop_lat);
        const stopLon = Number(stop.stop_lon);
        const distKm = getHaversineDistance(lat, lon, stopLat, stopLon);
        const distanceM = Math.round(distKm * 1000);
        return {
          stop_id: stop.stop_id,
          stop_code: stop.stop_code,
          stop_name: stop.stop_name,
          stop_lat: stopLat,
          stop_lon: stopLon,
          distance_m: distanceM
        };
      })
      .filter((stop: any) => stop.distance_m <= radiusM) // filter strictly inside sphere radius
      .sort((a: any, b: any) => a.distance_m - b.distance_m) // sort nearest first
      .slice(0, limit); // limit count

    // 5. Return JSON response with 10 minutes cache headers
    return okJSON(nearbyStops, {
      "Cache-Control": "public, max-age=600, s-maxage=600"
    });

  } catch (error: any) {
    return errJSON(500, "Failed to query nearby stops database.");
  }
};
