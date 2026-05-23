// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../../_utils";

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function timeToSeconds(t: string): number {
  const parts = t.split(":");
  const h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  const s = parseInt(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

function secondsToTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Stop = {
  stop_id: string;
  stop_code?: string | null;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  distance_m: number;
};

type ScheduleEntry = [string, number | string, string, string, string, string];

type ScheduleStopEntry = {
  tripId: string;
  stopSeq: number;
  time: string;
  timeSec: number;
  line: string;
  headsign: string;
  serviceId: string;
  stop: Stop;
};

// ---------------------------------------------------------------------------
// Transit mode classification
// ---------------------------------------------------------------------------

/** Normalize a raw line name for comparison.
 * Examples: "42", "42 ", "42 /", "Line 42" -> "42".
 * Keep meaningful suffixes such as "68+".
 */
function normalizeLineName(line: string): string {
  return String(line || "")
    .replace(/^\s*line\s+/i, "")
    .replace(/\s*\/\s*$/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Turin metro lines */
const METRO_LINES = new Set(["M1", "M1S"]);

/** Turin tram lines (based on GTT GTFS data) */
const TRAM_LINES = new Set(["3", "4", "9", "10", "13", "15", "16"]);

type TransitMode = "metro" | "tram" | "bus";

function getTransitMode(rawLine: string): TransitMode {
  const norm = normalizeLineName(rawLine).toUpperCase();
  // Check metro first (exact match on normalized)
  if (METRO_LINES.has(norm)) return "metro";
  // Tram: match if the normalized name (stripped of spaces/slashes) is in the tram set
  const normOriginal = normalizeLineName(rawLine);
  if (TRAM_LINES.has(normOriginal)) return "tram";
  return "bus";
}

function chainHasMode(lineChain: string[], mode: TransitMode): boolean {
  return lineChain.some(l => getTransitMode(l) === mode);
}

function stopHasLine(linesByStop: Map<string, Set<string>>, stopId: string, wantedLine: string): boolean {
  const wanted = normalizeLineName(wantedLine);
  return [...(linesByStop.get(stopId) || [])].some(line => normalizeLineName(line) === wanted);
}

function stopHasMode(linesByStop: Map<string, Set<string>>, stopId: string, mode: TransitMode): boolean {
  return [...(linesByStop.get(stopId) || [])].some(line => getTransitMode(line) === mode);
}

function uniqStopsById(stops: Stop[], limit: number): Stop[] {
  const seen = new Set<string>();
  const out: Stop[] = [];
  for (const stop of stops) {
    if (!stop?.stop_id || seen.has(stop.stop_id)) continue;
    seen.add(stop.stop_id);
    out.push(stop);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stop helpers
// ---------------------------------------------------------------------------
async function getNearbyStops(env: Env, lat: number, lon: number, radiusM: number, limit: number): Promise<Stop[]> {
  const deltaLat = radiusM / 111000;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const deltaLon = radiusM / (111000 * cosLat);

  const queryPath =
    `gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon` +
    `&stop_lat=gte.${lat - deltaLat}&stop_lat=lte.${lat + deltaLat}` +
    `&stop_lon=gte.${lon - deltaLon}&stop_lon=lte.${lon + deltaLon}`;

  const stops = await sbFetch(env, queryPath);
  const results = Array.isArray(stops) ? stops : [];

  return results
    .map((stop: any) => {
      const stopLat = Number(stop.stop_lat);
      const stopLon = Number(stop.stop_lon);
      const distKm = getHaversineDistance(lat, lon, stopLat, stopLon);
      return {
        stop_id: String(stop.stop_id),
        stop_code: stop.stop_code,
        stop_name: stop.stop_name,
        stop_lat: stopLat,
        stop_lon: stopLon,
        distance_m: Math.round(distKm * 1000)
      };
    })
    .filter((stop: Stop) => Number.isFinite(stop.stop_lat) && Number.isFinite(stop.stop_lon) && stop.distance_m <= radiusM)
    .sort((a: Stop, b: Stop) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

function uniqStops(stops: Stop[], limit: number): Stop[] {
  const seen = new Set<string>();
  const out: Stop[] = [];
  for (const stop of stops) {
    if (!stop?.stop_id || seen.has(stop.stop_id)) continue;
    seen.add(stop.stop_id);
    out.push(stop);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schedule normalization
// ---------------------------------------------------------------------------
function normalizeSchedule(entry: ScheduleEntry, stop: Stop): ScheduleStopEntry | null {
  const [tripId, stopSeq, arrivalTime, line, headsign, serviceId] = entry;
  if (!tripId || !arrivalTime || !serviceId) return null;
  return {
    tripId: String(tripId),
    stopSeq: Number(stopSeq),
    time: String(arrivalTime),
    timeSec: timeToSeconds(String(arrivalTime)),
    line: String(line || "?"),
    headsign: String(headsign || ""),
    serviceId: String(serviceId),
    stop
  };
}

function isUpcoming(sec: number, nowSecs: number, windowSecs: number) {
  // Handle GTFS times > 86400 (next-day services like 25:04 = 90240)
  const diff = sec - nowSecs;
  if (diff >= -300 && diff <= windowSecs) return true;
  // Also check with +86400 offset (for times stored as next-day normal times)
  const diffWrapped = (sec + 86400) - nowSecs;
  if (diffWrapped >= -300 && diffWrapped <= windowSecs) return true;
  return false;
}

function isInWindow(sec: number, nowSecs: number, minOffset: number, maxOffset: number) {
  const diff = sec - nowSecs;
  if (diff >= minOffset && diff <= maxOffset) return true;
  const diffWrapped = (sec + 86400) - nowSecs;
  if (diffWrapped >= minOffset && diffWrapped <= maxOffset) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Route scoring — mode-aware
// ---------------------------------------------------------------------------
function scoreRoute(cand: any, nowSecs: number): number {
  const depSec = timeToSeconds(cand.departure_time);
  // minutes until departure (handle wrap-around midnight)
  const minsUntilDep = ((depSec - nowSecs + 86400) % 86400) / 60;

  let score = cand.total_duration_min * 2;

  // Walking penalty
  const totalWalkM = (cand.walk_to_stop_m || 0) + (cand.walk_from_stop_m || 0);
  if (totalWalkM > 700) score += Math.floor((totalWalkM - 700) / 100) * 3;
  if (totalWalkM > 1200) score += 15;

  // Transfer penalty / direct bonus
  if (cand.route_type === "direct") {
    score -= 5; // bonus for direct
  } else {
    score += 8; // one-transfer penalty
    const waitMin = cand.transfer_wait_min || 0;
    if (waitMin > 20) score += (waitMin - 20) * 2;
  }

  // Late departure penalty (waiting > 40 min for a bus is annoying)
  if (minsUntilDep > 40) score += Math.floor((minsUntilDep - 40) / 5) * 2;

  // ---- Mode bonuses ----
  // Metro/subway routes get a strong bonus so they appear in results
  // even if they require a slightly longer walk
  const chain: string[] = cand.line_chain || [];
  if (chainHasMode(chain, "metro")) {
    score -= 18;
  } else if (chainHasMode(chain, "tram")) {
    score -= 6;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Candidate builders
// ---------------------------------------------------------------------------
function makeDirectCandidate(
  origin: ScheduleStopEntry,
  dest: ScheduleStopEntry,
  walkToStopM: number,
  walkFromStopM: number,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
) {
  const transitDuration = Math.round((dest.timeSec - origin.timeSec) / 60);
  if (transitDuration <= 0) return null;

  const walkToDuration = Math.round(walkToStopM / 80);
  const walkFromDuration = Math.round(walkFromStopM / 80);
  const totalDuration = walkToDuration + transitDuration + walkFromDuration;
  if (totalDuration <= 0) return null;

  const depSec = (origin.timeSec - walkToDuration * 60 + 86400 * 2) % 86400;
  const arrSec = (dest.timeSec + walkFromDuration * 60 + 86400 * 2) % 86400;

  const legs = [
    {
      type: "walk",
      from: { label: "Start", lat: fromLat, lon: fromLon },
      to: {
        stop_id: origin.stop.stop_id,
        stop_name: origin.stop.stop_name,
        stop_code: origin.stop.stop_code || null,
        lat: origin.stop.stop_lat,
        lon: origin.stop.stop_lon
      },
      distance_m: walkToStopM,
      duration_min: walkToDuration
    },
    {
      type: "transit",
      line: origin.line,
      headsign: origin.headsign,
      from_stop: {
        stop_id: origin.stop.stop_id,
        stop_name: origin.stop.stop_name,
        stop_code: origin.stop.stop_code || null,
        stop_lat: origin.stop.stop_lat,
        stop_lon: origin.stop.stop_lon
      },
      to_stop: {
        stop_id: dest.stop.stop_id,
        stop_name: dest.stop.stop_name,
        stop_code: dest.stop.stop_code || null,
        stop_lat: dest.stop.stop_lat,
        stop_lon: dest.stop.stop_lon
      },
      departure_time: origin.time,
      arrival_time: dest.time,
      duration_min: transitDuration,
      _trip_id: origin.tripId,
      _from_seq: origin.stopSeq,
      _to_seq: dest.stopSeq
    },
    {
      type: "walk",
      from: {
        stop_id: dest.stop.stop_id,
        stop_name: dest.stop.stop_name,
        stop_code: dest.stop.stop_code || null,
        lat: dest.stop.stop_lat,
        lon: dest.stop.stop_lon
      },
      to: { label: "Destination", lat: toLat, lon: toLon },
      distance_m: walkFromStopM,
      duration_min: walkFromDuration
    }
  ];

  return {
    route_type: "direct",
    total_duration_min: totalDuration,
    departure_time: secondsToTime(depSec),
    arrival_time: secondsToTime(arrSec),
    walk_to_stop_m: walkToStopM,
    walk_from_stop_m: walkFromStopM,
    line_chain: [origin.line],
    line_chain_label: `Line ${origin.line}`,
    legs
  };
}

function makeTransferCandidate(
  origin: ScheduleStopEntry,
  transferArr: ScheduleStopEntry,
  transferDep: ScheduleStopEntry,
  dest: ScheduleStopEntry,
  walkToStopM: number,
  walkFromStopM: number,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  /** extra walking distance between transfer stops (0 when same stop) */
  transferWalkM: number = 0
) {
  // --- FIX 1: Reject same-line transfers (e.g. 42 → 42) ---
  const normOriginLine = normalizeLineName(origin.line);
  const normTransferLine = normalizeLineName(transferDep.line);
  if (normOriginLine === normTransferLine) return null;

  const transit1Duration = Math.round((transferArr.timeSec - origin.timeSec) / 60);
  const transferWalkDuration = transferWalkM > 0 ? Math.round(transferWalkM / 70) : 0; // slightly slower for walking transfers
  const rawGapMin = Math.round((transferDep.timeSec - transferArr.timeSec) / 60);
  const waitMin = rawGapMin - transferWalkDuration;
  const transit2Duration = Math.round((dest.timeSec - transferDep.timeSec) / 60);

  if (transit1Duration <= 0 || transit2Duration <= 0 || waitMin < 2 || waitMin > 45) return null;

  const walkToDuration = Math.round(walkToStopM / 80);
  const walkFromDuration = Math.round(walkFromStopM / 80);
  const totalDuration = walkToDuration + transit1Duration + transferWalkDuration + waitMin + transit2Duration + walkFromDuration;
  if (totalDuration <= 0) return null;

  const depSec = (origin.timeSec - walkToDuration * 60 + 86400 * 2) % 86400;
  const arrSec = (dest.timeSec + walkFromDuration * 60 + 86400 * 2) % 86400;

  const transferDetails = transferWalkM > 0
    ? `Walk ${transferWalkM}m, then board Line ${transferDep.line}`
    : `Transfer from Line ${origin.line} to Line ${transferDep.line}`;

  const legs = [
    {
      type: "walk",
      from: { label: "Start", lat: fromLat, lon: fromLon },
      to: {
        stop_id: origin.stop.stop_id,
        stop_name: origin.stop.stop_name,
        stop_code: origin.stop.stop_code || null,
        lat: origin.stop.stop_lat,
        lon: origin.stop.stop_lon
      },
      distance_m: walkToStopM,
      duration_min: walkToDuration
    },
    {
      type: "transit",
      line: origin.line,
      headsign: origin.headsign,
      from_stop: {
        stop_id: origin.stop.stop_id,
        stop_name: origin.stop.stop_name,
        stop_code: origin.stop.stop_code || null,
        stop_lat: origin.stop.stop_lat,
        stop_lon: origin.stop.stop_lon
      },
      to_stop: {
        stop_id: transferArr.stop.stop_id,
        stop_name: transferArr.stop.stop_name,
        stop_code: transferArr.stop.stop_code || null,
        stop_lat: transferArr.stop.stop_lat,
        stop_lon: transferArr.stop.stop_lon
      },
      departure_time: origin.time,
      arrival_time: transferArr.time,
      duration_min: transit1Duration,
      _trip_id: origin.tripId,
      _from_seq: origin.stopSeq,
      _to_seq: transferArr.stopSeq
    },
    {
      type: "transfer",
      stop: {
        stop_id: transferArr.stop.stop_id,
        stop_name: transferArr.stop.stop_name,
        stop_code: transferArr.stop.stop_code || null,
        stop_lat: transferArr.stop.stop_lat,
        stop_lon: transferArr.stop.stop_lon
      },
      duration_min: waitMin + transferWalkDuration,
      details: transferDetails,
      ...(transferWalkM > 0 ? { transfer_walk_m: transferWalkM } : {})
    },
    {
      type: "transit",
      line: transferDep.line,
      headsign: transferDep.headsign,
      from_stop: {
        stop_id: transferDep.stop.stop_id,
        stop_name: transferDep.stop.stop_name,
        stop_code: transferDep.stop.stop_code || null,
        stop_lat: transferDep.stop.stop_lat,
        stop_lon: transferDep.stop.stop_lon
      },
      to_stop: {
        stop_id: dest.stop.stop_id,
        stop_name: dest.stop.stop_name,
        stop_code: dest.stop.stop_code || null,
        stop_lat: dest.stop.stop_lat,
        stop_lon: dest.stop.stop_lon
      },
      departure_time: transferDep.time,
      arrival_time: dest.time,
      duration_min: transit2Duration,
      _trip_id: transferDep.tripId,
      _from_seq: transferDep.stopSeq,
      _to_seq: dest.stopSeq
    },
    {
      type: "walk",
      from: {
        stop_id: dest.stop.stop_id,
        stop_name: dest.stop.stop_name,
        stop_code: dest.stop.stop_code || null,
        lat: dest.stop.stop_lat,
        lon: dest.stop.stop_lon
      },
      to: { label: "Destination", lat: toLat, lon: toLon },
      distance_m: walkFromStopM,
      duration_min: walkFromDuration
    }
  ];

  return {
    route_type: "one_transfer",
    total_duration_min: totalDuration,
    departure_time: secondsToTime(depSec),
    arrival_time: secondsToTime(arrSec),
    walk_to_stop_m: walkToStopM,
    walk_from_stop_m: walkFromStopM,
    transfer_wait_min: waitMin,
    line_chain: [origin.line, transferDep.line],
    line_chain_label: `${origin.line} → ${transferDep.line}`,
    legs
  };
}

// ---------------------------------------------------------------------------
// Multi-level deduplication
// ---------------------------------------------------------------------------
function normalizeChainLabel(label: string): string {
  return label.split(" → ").map(normalizeLineName).join(" → ");
}

function deduplicateCandidates(candidates: any[]): any[] {
  // Level A: exact transit leg key (line+from_stop+to_stop+departure_time per leg)
  const seenExact = new Set<string>();
  const afterExact: any[] = [];
  for (const cand of candidates) {
    try {
      const key = (cand.legs || [])
        .filter((l: any) => l.type === "transit")
        .map((l: any) => `${l.line}_${l.from_stop?.stop_id}_${l.to_stop?.stop_id}_${l.departure_time}`)
        .join("=>");
      if (!seenExact.has(key)) {
        seenExact.add(key);
        afterExact.push({ ...cand, _exactKey: key });
      }
    } catch {
      // skip malformed
    }
  }

  // Level B: line-chain + first transit boarding time bucket (10-min).
  const chainBucketMap = new Map<string, any>();
  for (const cand of afterExact) {
    try {
      const firstTransit = (cand.legs || []).find((l: any) => l.type === "transit");
      const boardingTime = firstTransit?.departure_time ?? cand.departure_time;
      const boardingSec = timeToSeconds(boardingTime);
      const depBucket = Math.floor(boardingSec / 600); // 10-min buckets
      const bucketKey = `${normalizeChainLabel(cand.line_chain_label)}|${depBucket}`;

      const existing = chainBucketMap.get(bucketKey);
      if (!existing || cand._score < existing._score) {
        chainBucketMap.set(bucketKey, cand);
      }
    } catch {
      // skip malformed
    }
  }

  return [...chainBucketMap.values()];
}

// ---------------------------------------------------------------------------
// Diversity selection — improved
// ---------------------------------------------------------------------------
function isSameLineTransferCandidate(cand: any): boolean {
  const chain = Array.isArray(cand?.line_chain) ? cand.line_chain.map(normalizeLineName) : [];
  if (chain.length >= 2 && chain[0] === chain[1]) return true;
  const transitLegs = Array.isArray(cand?.legs) ? cand.legs.filter((l: any) => l.type === "transit") : [];
  for (let i = 1; i < transitLegs.length; i++) {
    if (normalizeLineName(transitLegs[i - 1]?.line) === normalizeLineName(transitLegs[i]?.line)) return true;
  }
  return false;
}

function getTransitLegsFromCandidate(cand: any): any[] {
  return Array.isArray(cand?.legs) ? cand.legs.filter((leg: any) => leg.type === "transit") : [];
}

function getTransferWalkMeters(cand: any): number {
  if (!Array.isArray(cand?.legs)) return 0;
  return cand.legs.reduce((sum: number, leg: any) => {
    if (leg?.type !== "transfer") return sum;
    return sum + Number(leg.transfer_walk_m || leg.walk_m || 0);
  }, 0);
}

/**
 * Reject technically-valid transfer candidates that are bad UX:
 * - A first/second transit leg is only 1–2 minutes.
 * - A tiny first leg is followed by a meaningful wait.
 * - The transfer requires a long walk and wait.
 *
 * This removes routes like 18 → 66 where line 18 is used for only 1 minute
 * before a long transfer walk/wait, while keeping useful metro transfers such
 * as M1S → 66 where the walk is short and the overall route is competitive.
 */
function isLowValueTransferRoute(cand: any): boolean {
  if (cand?.route_type !== "one_transfer") return false;

  const transitLegs = getTransitLegsFromCandidate(cand);
  if (transitLegs.length !== 2) return false;

  const firstRideMin = Number(transitLegs[0]?.duration_min ?? 999);
  const secondRideMin = Number(transitLegs[1]?.duration_min ?? 999);
  const transferWaitMin = Number(cand.transfer_wait_min || 0);
  const transferWalkM = getTransferWalkMeters(cand);

  // A 1–2 minute transit leg is almost always worse than just walking/using the second line.
  if (firstRideMin <= 2) return true;
  if (secondRideMin <= 2) return true;

  // A 3-minute hop is only acceptable when the transfer walk is short.
  if (firstRideMin <= 3 && transferWalkM >= 250) return true;
  if (secondRideMin <= 3 && transferWalkM >= 250) return true;

  // Avoid "walk a lot, then wait" transfers.
  if (transferWalkM >= 350 && transferWaitMin >= 6) return true;

  return false;
}

function getBestDirectDurationByLine(candidates: any[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const cand of candidates) {
    if (cand?.route_type !== "direct") continue;
    const chain = Array.isArray(cand?.line_chain) ? cand.line_chain.map(normalizeLineName) : [];
    if (chain.length !== 1) continue;
    const line = chain[0];
    const duration = Number(cand.total_duration_min);
    if (!Number.isFinite(duration)) continue;
    const current = best.get(line);
    if (current === undefined || duration < current) best.set(line, duration);
  }
  return best;
}

/**
 * If both lines in a two-leg transfer are already available as direct options,
 * the transfer should only survive if it is clearly faster than the best direct.
 * This removes redundant 17 → 66 / 66 → 17 style results.
 */
function isRedundantTransferAgainstDirect(cand: any, bestDirectByLine: Map<string, number>): boolean {
  if (cand?.route_type !== "one_transfer") return false;

  const chain = Array.isArray(cand?.line_chain) ? cand.line_chain.map(normalizeLineName) : [];
  if (chain.length !== 2) return false;

  const transitLegs = getTransitLegsFromCandidate(cand);
  if (transitLegs.length !== 2) return false;

  const firstLine = chain[0];
  const secondLine = chain[1];
  const firstMode = getTransitMode(firstLine);
  const hasMetro = chainHasMode(chain, "metro");

  const firstDirect = bestDirectByLine.get(firstLine);
  const secondDirect = bestDirectByLine.get(secondLine);
  const transferDuration = Number(cand.total_duration_min);
  const firstRideMin = Number(transitLegs[0]?.duration_min ?? 999);
  const secondRideMin = Number(transitLegs[1]?.duration_min ?? 999);
  const transferWaitMin = Number(cand.transfer_wait_min || 0);
  const transferWalkM = getTransferWalkMeters(cand);

  if (!Number.isFinite(transferDuration)) return false;

  // Tiny non-metro feeder into a line that already has a direct option is usually clutter.
  // Example: 18 → 17, where 18 is used for 3 minutes, then the user waits 17 minutes
  // before boarding the same useful direct line 17. Keep metro feeders because M1/M1S
  // is often a legitimate Google-like option.
  if (secondDirect !== undefined && firstMode !== "metro" && firstRideMin <= 4 && transferWaitMin >= 8) {
    return true;
  }

  // Tiny non-metro feeder with meaningful transfer walking is also poor UX.
  if (secondDirect !== undefined && firstMode !== "metro" && firstRideMin <= 4 && transferWalkM >= 120) {
    return true;
  }

  // If the second leg is basically a one-stop hop into a direct line, hide it.
  if (firstDirect !== undefined && secondRideMin <= 3 && transferWaitMin >= 8) {
    return true;
  }

  // When the second line is available direct, avoid non-metro transfer chains that are
  // noticeably slower than that direct option. This removes 66 → 17 / 18 → 17 style
  // results while preserving useful metro alternatives.
  if (!hasMetro && secondDirect !== undefined && transferDuration >= secondDirect + 8) {
    return true;
  }

  // If both lines are direct options, the transfer is redundant unless it is clearly faster
  // than the best direct alternative.
  if (firstDirect !== undefined && secondDirect !== undefined) {
    const bestDirect = Math.min(firstDirect, secondDirect);
    return transferDuration >= bestDirect - 8;
  }

  return false;
}

function lineChainKey(cand: any): string {
  if (Array.isArray(cand?.line_chain) && cand.line_chain.length > 0) {
    return cand.line_chain.map(normalizeLineName).join(" → ");
  }
  return normalizeChainLabel(cand?.line_chain_label || "");
}

function selectDiverseRoutes(candidates: any[], finalLimit: number): any[] {
  const bestDirectByLine = getBestDirectDurationByLine(candidates);

  // Final safety:
  // - never select same-line transfers such as 42 → 42
  // - remove low-value "tiny first hop + long transfer" candidates
  // - remove redundant transfers when both lines are already good direct options
  const safe = candidates.filter(cand =>
    !isSameLineTransferCandidate(cand) &&
    !isLowValueTransferRoute(cand) &&
    !isRedundantTransferAgainstDirect(cand, bestDirectByLine)
  );

  // Sort by score ascending (lower = better).
  const sorted = [...safe].sort((a, b) => a._score - b._score);

  const chainCount = new Map<string, number>();
  const selected: any[] = [];

  // Pass 1: one best result per unique normalized chain.
  for (const cand of sorted) {
    if (selected.length >= finalLimit) break;
    const chain = lineChainKey(cand);
    if (!chainCount.has(chain)) {
      chainCount.set(chain, 1);
      selected.push(cand);
    }
  }

  // Pass 2: allow at most a second entry per chain if departure differs enough.
  if (selected.length < finalLimit) {
    for (const cand of sorted) {
      if (selected.length >= finalLimit) break;
      if (selected.includes(cand)) continue;
      const chain = lineChainKey(cand);
      const count = chainCount.get(chain) || 0;
      if (count >= 2) continue;

      const candDepSec = timeToSeconds(cand.departure_time);
      const tooClose = selected.some(s => {
        if (lineChainKey(s) !== chain) return false;
        const diff = Math.abs(timeToSeconds(s.departure_time) - candDepSec);
        return diff < 25 * 60;
      });
      if (tooClose) continue;

      chainCount.set(chain, count + 1);
      selected.push(cand);
    }
  }

  // Pass 3: fill remaining slots without exceeding 2 per chain.
  if (selected.length < finalLimit) {
    for (const cand of sorted) {
      if (selected.length >= finalLimit) break;
      if (selected.includes(cand)) continue;
      const chain = lineChainKey(cand);
      const count = chainCount.get(chain) || 0;
      if (count >= 2) continue;
      chainCount.set(chain, count + 1);
      selected.push(cand);
    }
  }

  return selected.sort((a, b) => a._score - b._score);
}
// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const fromLatStr = searchParams.get("from_lat");
    const fromLonStr = searchParams.get("from_lon");
    const toLatStr = searchParams.get("to_lat");
    const toLonStr = searchParams.get("to_lon");
    const debugMode = searchParams.get("debug") === "1" && ctx.env.ALLOW_ROUTE_DEBUG === "true";
    const simulateTime = debugMode ? searchParams.get("simulate_time") : null; // format: "HH:MM" e.g. "08:30"

    // --- FIX 4: Wider radius capped at 2000m (was 1500m) ---
    let radiusM = 800;
    const radiusParam = searchParams.get("radius_m");
    if (radiusParam) {
      const parsedRadius = parseFloat(radiusParam);
      if (!isNaN(parsedRadius) && parsedRadius > 0) radiusM = Math.min(parsedRadius, 2000);
    }

    let finalLimit = 5;
    const limitParam = searchParams.get("limit");
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) finalLimit = Math.min(parsedLimit, 10);
    }

    if (!fromLatStr || !fromLonStr || !toLatStr || !toLonStr) {
      return errJSON(400, "Missing required query parameters: 'from_lat', 'from_lon', 'to_lat', and 'to_lon'.");
    }

    const fromLat = parseFloat(fromLatStr);
    const fromLon = parseFloat(fromLonStr);
    const toLat = parseFloat(toLatStr);
    const toLon = parseFloat(toLonStr);

    if (isNaN(fromLat) || fromLat < -90 || fromLat > 90 || isNaN(fromLon) || fromLon < -180 || fromLon > 180) {
      return errJSON(400, "Invalid coordinates for 'from'.");
    }
    if (isNaN(toLat) || toLat < -90 || toLat > 90 || isNaN(toLon) || toLon < -180 || toLon > 180) {
      return errJSON(400, "Invalid coordinates for 'to'.");
    }

    // --- FIX 4: Use max(radiusM, 2000) for stop discovery so metro stations
    //            within 2km are always considered; increase limit to 40 ---
    const stopSearchRadius = Math.max(radiusM, 2000);
    const originStops = await getNearbyStops(ctx.env, fromLat, fromLon, stopSearchRadius, 40);
    const destinationStops = await getNearbyStops(ctx.env, toLat, toLon, stopSearchRadius, 40);

    if (originStops.length === 0 || destinationStops.length === 0) {
      if (debugMode) return okJSON({ routes: [], debug: { originStopsCount: originStops.length, destinationStopsCount: destinationStops.length } });
      return okJSON([]);
    }

    // Determine service day in Europe/Rome timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, weekday: "long"
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === "year")?.value || "";
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    const dow = parts.find(p => p.type === "weekday")?.value || "";

    // Support simulate_time=HH:MM for testing
    let hourStr: string;
    let minStr: string;
    let secStr: string;
    if (simulateTime && /^\d{1,2}:\d{2}$/.test(simulateTime)) {
      const [sh, sm] = simulateTime.split(":");
      hourStr = sh.padStart(2, "0");
      minStr = sm.padStart(2, "0");
      secStr = "00";
    } else {
      hourStr = parts.find(p => p.type === "hour")?.value || "00";
      minStr = parts.find(p => p.type === "minute")?.value || "00";
      secStr = parts.find(p => p.type === "second")?.value || "00";
    }

    const h = parseInt(hourStr);
    const y = parseInt(year);
    const mo = parseInt(month);
    const d = parseInt(day);
    let todayVal = "";
    let dowVal = "";
    let timeStr = "";

    if (h < 4) {
      const tempDate = new Date(y, mo - 1, d);
      tempDate.setDate(tempDate.getDate() - 1);
      todayVal = `${tempDate.getFullYear()}${String(tempDate.getMonth() + 1).padStart(2, "0")}${String(tempDate.getDate()).padStart(2, "0")}`;
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      dowVal = weekdays[tempDate.getDay()];
      timeStr = `${String(h + 24).padStart(2, "0")}:${minStr}:${secStr}`;
    } else {
      todayVal = `${year}${month}${day}`;
      dowVal = dow.toLowerCase();
      timeStr = `${hourStr}:${minStr}:${secStr}`;
    }

    const rpcUrl = `${ctx.env.SUPABASE_URL}/rest/v1/rpc/get_active_gtt_services`;
    const rpcRes = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "apikey": ctx.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Accept-Profile": "api",
        "Content-Profile": "api"
      },
      body: JSON.stringify({ today_val: todayVal, dow_val: dowVal })
    });

    if (!rpcRes.ok) throw new Error(`Active service RPC returned HTTP ${rpcRes.status}`);

    const activeServices = (await rpcRes.json()) as { service_id: string }[];
    const activeServiceIds = new Set(activeServices.map(s => s.service_id));
    const nowSecs = timeToSeconds(timeStr);
    const searchWindowSecs = 3 * 3600;

    const originStopIds = originStops.map(s => s.stop_id);
    const destStopIds = destinationStops.map(s => s.stop_id);

    // Fetch lines serving origin and destination stops
    const [originStopLines, destStopLines] = await Promise.all([
      sbFetch(ctx.env, `gtt_stop_lines?stop_id=in.(${originStopIds.join(",")})`),
      sbFetch(ctx.env, `gtt_stop_lines?stop_id=in.(${destStopIds.join(",")})`)
    ]);

    const originLinesList = Array.isArray(originStopLines) ? originStopLines : [];
    const destLinesList = Array.isArray(destStopLines) ? destStopLines : [];

    const originLinesSet = new Set<string>();
    for (const item of originLinesList) {
      if (item.line) originLinesSet.add(String(item.line));
    }

    const destLinesSet = new Set<string>();
    for (const item of destLinesList) {
      if (item.line) destLinesSet.add(String(item.line));
    }

    // -----------------------------------------------------------------------
    // Candidate stop discovery
    // -----------------------------------------------------------------------
    let originLineStopCandidatesCount = 0;
    let destinationLineStopCandidatesCount = 0;

    const originLinesArr = [...originLinesSet].map(encodeURIComponent);
    const destLinesArr = [...destLinesSet].map(encodeURIComponent);

    const [stopsByOriginLinesRaw, stopsByDestLinesRaw] = await Promise.all([
      originLinesArr.length > 0 ? sbFetch(ctx.env, `gtt_stop_lines?line=in.(${originLinesArr.join(",")})`) : [],
      destLinesArr.length > 0 ? sbFetch(ctx.env, `gtt_stop_lines?line=in.(${destLinesArr.join(",")})`) : []
    ]);

    const stopsByOriginLines = Array.isArray(stopsByOriginLinesRaw) ? stopsByOriginLinesRaw : [];
    const stopsByDestLines = Array.isArray(stopsByDestLinesRaw) ? stopsByDestLinesRaw : [];

    const linesByStop = new Map<string, Set<string>>();
    const addLineForStop = (stopId: any, line: any) => {
      if (!stopId || !line) return;
      const id = String(stopId);
      if (!linesByStop.has(id)) linesByStop.set(id, new Set<string>());
      linesByStop.get(id)!.add(String(line));
    };

    const originSideStopIds = new Set<string>();
    for (const item of stopsByOriginLines) {
      if (!item?.stop_id) continue;
      originSideStopIds.add(String(item.stop_id));
      addLineForStop(item.stop_id, item.line);
    }

    const destSideStopIds = new Set<string>();
    for (const item of stopsByDestLines) {
      if (!item?.stop_id) continue;
      destSideStopIds.add(String(item.stop_id));
      addLineForStop(item.stop_id, item.line);
    }

    originLineStopCandidatesCount = originSideStopIds.size;
    destinationLineStopCandidatesCount = destSideStopIds.size;

    async function fetchStopsByIds(ids: string[], maxTotal: number): Promise<Stop[]> {
      const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, maxTotal);
      const fetched: any[] = [];
      const chunkSize = 350;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const idChunk = uniqueIds.slice(i, i + chunkSize);
        if (idChunk.length === 0) continue;
        const rows = await sbFetch(
          ctx.env,
          `gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon&stop_id=in.(${idChunk.join(",")})`
        );
        if (Array.isArray(rows)) fetched.push(...rows);
      }
      return fetched
        .map((stop: any) => {
          const stopLat = Number(stop.stop_lat);
          const stopLon = Number(stop.stop_lon);
          if (!Number.isFinite(stopLat) || !Number.isFinite(stopLon)) return null;
          return {
            stop_id: String(stop.stop_id),
            stop_code: stop.stop_code,
            stop_name: stop.stop_name,
            stop_lat: stopLat,
            stop_lon: stopLon,
            distance_m: 0
          } as Stop;
        })
        .filter(Boolean) as Stop[];
    }

    function scoreTransferStop(stop: Stop, purpose: "alight" | "board"): number {
      const fromKm = getHaversineDistance(fromLat, fromLon, stop.stop_lat, stop.stop_lon);
      const toKm = getHaversineDistance(stop.stop_lat, stop.stop_lon, toLat, toLon);
      let score = fromKm + toKm;
      const lines = [...(linesByStop.get(stop.stop_id) || [])];
      if (lines.some(l => getTransitMode(l) === "metro")) score -= 1.2;
      if (lines.some(l => getTransitMode(l) === "tram")) score -= 0.4;
      // For alighting stops, avoid stops extremely far from the origin corridor.
      // For boarding stops, prefer stops reasonably close to the destination side.
      if (purpose === "alight") score += Math.max(0, fromKm - 8) * 0.8;
      if (purpose === "board") score += Math.max(0, toKm - 8) * 0.8;
      return score;
    }

    const originLineStopsAll = await fetchStopsByIds([...originSideStopIds], 3500);
    const destinationLineStopsAll = await fetchStopsByIds([...destSideStopIds], 3500);

    // Force transit-important stops to stay in the candidate pool.
    // The previous version sorted purely by geographic score, so metro stations and line-64
    // boarding stops could be sliced out before any M1→64 candidate was ever built.
    const forcedOriginReachableStops = originLineStopsAll.filter(stop =>
      stopHasMode(linesByStop, stop.stop_id, "metro") ||
      stopHasLine(linesByStop, stop.stop_id, "42") ||
      stopHasLine(linesByStop, stop.stop_id, "66")
    );

    const forcedDestinationBoardingStops = destinationLineStopsAll.filter(stop =>
      stopHasLine(linesByStop, stop.stop_id, "64") ||
      stopHasLine(linesByStop, stop.stop_id, "66") ||
      stopHasLine(linesByStop, stop.stop_id, "42") ||
      stopHasMode(linesByStop, stop.stop_id, "metro")
    );

    const scoredOriginReachableStops = originLineStopsAll
      .map(s => ({ ...s, _score: scoreTransferStop(s, "alight") }))
      .sort((a: any, b: any) => a._score - b._score)
      .map(({ _score, ...s }: any) => s as Stop);

    const scoredDestinationBoardingStops = destinationLineStopsAll
      .map(s => ({ ...s, _score: scoreTransferStop(s, "board") }))
      .sort((a: any, b: any) => a._score - b._score)
      .map(({ _score, ...s }: any) => s as Stop);

    // These are NOT an intersection. They are independent sets used to build transfer pairs.
    // Forced stops are placed first so M1 stations and bus-64 stops survive the cap.
    const originReachableTransferStops = uniqStopsById(
      [...forcedOriginReachableStops, ...scoredOriginReachableStops],
      420
    );

    const destinationBoardingStops = uniqStopsById(
      [...forcedDestinationBoardingStops, ...scoredDestinationBoardingStops],
      420
    );

    // Kept for backward-compatible debug naming: now this is the union of useful transfer/boarding stops,
    // not the old exact-intersection candidate set.
    const candidateTransferStops = uniqStops([...originReachableTransferStops, ...destinationBoardingStops], 700);

    const allStops = uniqStops([...originStops, ...destinationStops, ...originReachableTransferStops, ...destinationBoardingStops], 900);
    const stopIds = allStops.map(s => s.stop_id);

    async function fetchSchedulesForStopIds(ids: string[]): Promise<any[]> {
      const uniqueIds = [...new Set(ids)].filter(Boolean);
      const rows: any[] = [];
      const chunkSize = 250;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const idChunk = uniqueIds.slice(i, i + chunkSize);
        if (idChunk.length === 0) continue;
        const part = await sbFetch(ctx.env, `gtt_stop_schedules?stop_id=in.(${idChunk.join(",")})`);
        if (Array.isArray(part)) rows.push(...part);
      }
      return rows;
    }

    const dbSchedules = await fetchSchedulesForStopIds(stopIds);
    const schedulesMap = new Map<string, ScheduleStopEntry[]>();
    const stopById = new Map<string, Stop>();
    for (const stop of allStops) stopById.set(stop.stop_id, stop);

    if (Array.isArray(dbSchedules)) {
      for (const row of dbSchedules) {
        if (!row || !row.stop_id) continue;
        const stop = stopById.get(String(row.stop_id));
        if (!stop) continue;
        const normalized: ScheduleStopEntry[] = [];
        for (const entry of row.schedule || []) {
          try {
            const parsed = normalizeSchedule(entry, stop);
            // Metro services (M1/M1S) are present in gtt_stop_schedules, but in some imports
            // their service_id is not returned by get_active_gtt_services even when the
            // timetable entry is valid for the current operating day. If we strictly
            // filter them out here, metro candidates never get generated. Keep the
            // active-service filter for bus/tram, but allow metro entries through and
            // rely on the normal time-window filter later.
            if (parsed) {
              const mode = getTransitMode(parsed.line);
              const active = activeServiceIds.has(parsed.serviceId);
              // Metro exists in the JSON schedules, but some metro service_ids are not
              // returned by the active-service RPC. Do not let all-day/all-service metro
              // entries through, because that explodes candidate generation on Workers.
              // Keep only metro entries that are actually relevant to the next few hours.
              const relevantMetro = mode === "metro" && isInWindow(parsed.timeSec, nowSecs, -600, searchWindowSecs + 5400);
              if (active || relevantMetro) {
                normalized.push(parsed);
              }
            }
          } catch {
            // skip malformed entries
          }
        }
        schedulesMap.set(String(row.stop_id), normalized);
      }
    }

    const candidates: any[] = [];
    const originsByTrip = new Map<string, ScheduleStopEntry[]>();
    const transferByTrip = new Map<string, ScheduleStopEntry[]>();
    const destinationsByTrip = new Map<string, ScheduleStopEntry[]>();
    const boardDeparturesByStop = new Map<string, ScheduleStopEntry[]>();

    for (const originStop of originStops) {
      for (const entry of schedulesMap.get(originStop.stop_id) || []) {
        if (!isUpcoming(entry.timeSec, nowSecs, searchWindowSecs)) continue;
        if (!originsByTrip.has(entry.tripId)) originsByTrip.set(entry.tripId, []);
        originsByTrip.get(entry.tripId)!.push(entry);
      }
    }

    for (const transferStop of originReachableTransferStops) {
      for (const entry of schedulesMap.get(transferStop.stop_id) || []) {
        if (!isInWindow(entry.timeSec, nowSecs, -300, searchWindowSecs + 2700)) continue;
        if (!transferByTrip.has(entry.tripId)) transferByTrip.set(entry.tripId, []);
        transferByTrip.get(entry.tripId)!.push(entry);
      }
    }

    for (const boardStop of destinationBoardingStops) {
      const usableDepartures = (schedulesMap.get(boardStop.stop_id) || [])
        .filter(entry => isInWindow(entry.timeSec, nowSecs, -300, searchWindowSecs + 5400))
        .sort((a, b) => a.timeSec - b.timeSec)
        .slice(0, 90);
      if (usableDepartures.length > 0) boardDeparturesByStop.set(boardStop.stop_id, usableDepartures);
    }

    for (const destStop of destinationStops) {
      for (const entry of schedulesMap.get(destStop.stop_id) || []) {
        if (!isInWindow(entry.timeSec, nowSecs, 0, searchWindowSecs + 5400)) continue;
        if (!destinationsByTrip.has(entry.tripId)) destinationsByTrip.set(entry.tripId, []);
        destinationsByTrip.get(entry.tripId)!.push(entry);
      }
    }

    let directCandidatesCount = 0;
    const directCandidateChainsRaw: string[] = [];
    let direct66CandidateCount = 0;
    let direct42CandidateCount = 0;

    // --- Direct candidates ---
    for (const [tripId, origins] of originsByTrip.entries()) {
      const dests = destinationsByTrip.get(tripId);
      if (!dests) continue;
      for (const origin of origins) {
        for (const dest of dests) {
          if (origin.stopSeq >= dest.stopSeq) continue;
          const walkToStopM = originStops.find(s => s.stop_id === origin.stop.stop_id)?.distance_m ?? 0;
          const walkFromStopM = destinationStops.find(s => s.stop_id === dest.stop.stop_id)?.distance_m ?? 0;
          try {
            const cand = makeDirectCandidate(origin, dest, walkToStopM, walkFromStopM, fromLat, fromLon, toLat, toLon);
            if (cand) {
              candidates.push(cand);
              directCandidatesCount++;
              directCandidateChainsRaw.push(cand.line_chain_label);
              const norm = normalizeLineName(origin.line);
              if (norm === "66") direct66CandidateCount++;
              if (norm === "42") direct42CandidateCount++;
            }
          } catch {
            // skip
          }
        }
      }
    }

    // --- First-leg arrivals at all origin-reachable alighting stops ---
    const firstLegsByAlightStop = new Map<string, Array<{ origin: ScheduleStopEntry; transferArr: ScheduleStopEntry; walkToStopM: number }>>();

    for (const [tripId, origins] of originsByTrip.entries()) {
      const transferEntries = transferByTrip.get(tripId);
      if (!transferEntries) continue;
      for (const origin of origins) {
        for (const transferArr of transferEntries) {
          if (origin.stop.stop_id === transferArr.stop.stop_id) continue;
          if (origin.stopSeq >= transferArr.stopSeq) continue;
          const walkToStopM = originStops.find(s => s.stop_id === origin.stop.stop_id)?.distance_m ?? 0;
          const key = transferArr.stop.stop_id;
          if (!firstLegsByAlightStop.has(key)) firstLegsByAlightStop.set(key, []);
          const bucket = firstLegsByAlightStop.get(key)!;
          // Cap per alight stop to keep Cloudflare Workers CPU/memory under control.
          // Entries are time-windowed already; this still leaves enough alternatives for frequent metro.
          if (bucket.length < 140) bucket.push({ origin, transferArr, walkToStopM });
        }
      }
    }

    // --- Transfer-pair model: same stop OR walking transfer to destination-side boarding stop ---
    const WALK_TRANSFER_RADIUS_M = 500;
    const transferPairsByAlightStop = new Map<string, Array<{ board_stop_id: string; walk_m: number }>>();
    let transferPairsSameStopCount = 0;
    let transferPairsWalkingCount = 0;

    const destinationBoardingById = new Map<string, Stop>();
    for (const stop of destinationBoardingStops) destinationBoardingById.set(stop.stop_id, stop);

    for (const alightStop of originReachableTransferStops) {
      const pairs: Array<{ board_stop_id: string; walk_m: number }> = [];

      if (destinationBoardingById.has(alightStop.stop_id)) {
        pairs.push({ board_stop_id: alightStop.stop_id, walk_m: 0 });
        transferPairsSameStopCount++;
      }

      const walkingPairs: Array<{ board_stop_id: string; walk_m: number }> = [];
      for (const boardStop of destinationBoardingStops) {
        if (boardStop.stop_id === alightStop.stop_id) continue;
        const distM = Math.round(getHaversineDistance(alightStop.stop_lat, alightStop.stop_lon, boardStop.stop_lat, boardStop.stop_lon) * 1000);
        if (distM <= WALK_TRANSFER_RADIUS_M) {
          walkingPairs.push({ board_stop_id: boardStop.stop_id, walk_m: distM });
        }
      }

      walkingPairs.sort((a, b) => a.walk_m - b.walk_m);
      for (const pair of walkingPairs.slice(0, 24)) {
        pairs.push(pair);
        transferPairsWalkingCount++;
      }

      if (pairs.length > 0) transferPairsByAlightStop.set(alightStop.stop_id, pairs);
    }

    let rejectedSameLineCount = 0;

    for (const [alightStopId, firstLegs] of firstLegsByAlightStop.entries()) {
      const transferPairs = transferPairsByAlightStop.get(alightStopId);
      if (!transferPairs || transferPairs.length === 0) continue;

      for (const firstLeg of firstLegs.slice(0, 140)) {
        for (const pair of transferPairs) {
          const transferDepartures = boardDeparturesByStop.get(pair.board_stop_id) || [];
          if (transferDepartures.length === 0) continue;

          for (const transferDep of transferDepartures) {
            const walkSec = Math.round((pair.walk_m / 70) * 60);
            const effectiveArrSec = firstLeg.transferArr.timeSec + walkSec;
            const waitTimeSec = transferDep.timeSec - effectiveArrSec;
            if (waitTimeSec < 2 * 60 || waitTimeSec > 45 * 60) continue;

            if (normalizeLineName(firstLeg.origin.line) === normalizeLineName(transferDep.line)) {
              rejectedSameLineCount++;
              continue;
            }

            const dests = destinationsByTrip.get(transferDep.tripId);
            if (!dests) continue;
            for (const dest of dests) {
              if (transferDep.stopSeq >= dest.stopSeq) continue;
              if (pair.board_stop_id === dest.stop.stop_id) continue;
              const walkFromStopM = destinationStops.find(s => s.stop_id === dest.stop.stop_id)?.distance_m ?? 0;
              try {
                const cand = makeTransferCandidate(
                  firstLeg.origin, firstLeg.transferArr, transferDep, dest,
                  firstLeg.walkToStopM, walkFromStopM,
                  fromLat, fromLon, toLat, toLon,
                  pair.walk_m
                );
                if (cand) candidates.push(cand);
              } catch {
                // skip malformed candidate
              }
            }
          }
        }
      }
    }

    const rawCandidatesCount = candidates.length;
    const forcedOriginMetroStopsCount = forcedOriginReachableStops.length;
    const forcedDestination64StopsCount = forcedDestinationBoardingStops.filter(s => stopHasLine(linesByStop, s.stop_id, "64")).length;
    const originReachableMetroStopsWithSchedulesCount = originReachableTransferStops
      .filter(s => stopHasMode(linesByStop, s.stop_id, "metro") && (schedulesMap.get(s.stop_id) || []).length > 0)
      .length;
    const destination64BoardStopsWithSchedulesCount = destinationBoardingStops
      .filter(s => stopHasLine(linesByStop, s.stop_id, "64") && (schedulesMap.get(s.stop_id) || []).length > 0)
      .length;

    const chainMatches = (cand: any, a: string, b?: string) => {
      const chain = Array.isArray(cand?.line_chain) ? cand.line_chain.map(normalizeLineName) : [];
      if (b === undefined) return chain.length === 1 && chain[0] === normalizeLineName(a);
      return chain.length >= 2 && chain[0] === normalizeLineName(a) && chain[1] === normalizeLineName(b);
    };

    const m1To64CandidateCount = candidates.filter(c => {
      const chain = Array.isArray(c?.line_chain) ? c.line_chain.map(normalizeLineName) : [];
      return chain.length >= 2 && (chain[0] === "M1" || chain[0] === "M1S") && chain[1] === "64";
    }).length;
    const bus42To64CandidateCount = candidates.filter(c => chainMatches(c, "42", "64")).length;
    const metroCandidatesRawCount = candidates.filter(c => Array.isArray(c?.line_chain) && chainHasMode(c.line_chain, "metro")).length;

    // Quality filters
    const maxWalkM = 2200;
    const qualityFiltered = candidates.filter(cand => {
      if (!cand || cand.total_duration_min <= 0) return false;
      const totalWalk = (cand.walk_to_stop_m || 0) + (cand.walk_from_stop_m || 0);
      const transferWalk = Array.isArray(cand.legs)
        ? cand.legs.reduce((sum: number, leg: any) => sum + (leg.type === "transfer" ? Number(leg.transfer_walk_m || 0) : 0), 0)
        : 0;
      if (totalWalk + transferWalk > maxWalkM) return false;
      if (cand.route_type === "one_transfer" && (cand.transfer_wait_min || 0) > 45) return false;
      return true;
    });

    const afterQualityFilterCount = qualityFiltered.length;

    const beforeFinalSafetyCount = qualityFiltered.length;
    const sameLineSafeFiltered = qualityFiltered.filter(cand => !isSameLineTransferCandidate(cand));
    const rejectedSameLineFinalSafetyCount = beforeFinalSafetyCount - sameLineSafeFiltered.length;

    // Score each candidate (mode-aware scoring applied here)
    const scored = sameLineSafeFiltered.map(cand => ({ ...cand, _score: scoreRoute(cand, nowSecs) }));

    // Multi-level deduplication
    const deduped = deduplicateCandidates(scored);
    const afterExactDedupeCount = deduped.length;

    // Diversity selection
    const result = selectDiverseRoutes(deduped, finalLimit);

    // --- Enrich transit legs with GTFS shape geometry ---
    const tripIdsNeeded = new Set<string>();
    for (const cand of result) {
      for (const leg of cand.legs || []) {
        if (leg.type === "transit" && leg._trip_id) {
          tripIdsNeeded.add(leg._trip_id);
        }
      }
    }

    const tripSeqMap  = new Map<string, any[]>();   // trip_id → stops[]
    const tripShapeId = new Map<string, string>();   // trip_id → shape_id
    if (tripIdsNeeded.size > 0) {
      const tripIdList = [...tripIdsNeeded];
      const seqData = await sbFetch(
        ctx.env,
        `gtt_trip_stop_sequences?select=trip_id,shape_id,stops&trip_id=in.(${tripIdList.join(",")})`
      );
      if (Array.isArray(seqData)) {
        for (const row of seqData) {
          if (row && row.trip_id) {
            if (Array.isArray(row.stops)) tripSeqMap.set(String(row.trip_id), row.stops);
            if (row.shape_id) tripShapeId.set(String(row.trip_id), String(row.shape_id));
          }
        }
      }
    }

    const shapeMap = new Map<string, any[]>(); // shape_id → [{lat,lon,seq}]
    const shapeIdsNeeded = new Set<string>([...tripShapeId.values()]);
    if (shapeIdsNeeded.size > 0) {
      const shapeIdList = [...shapeIdsNeeded];
      const shapeData = await sbFetch(
        ctx.env,
        `gtt_shapes?select=shape_id,points&shape_id=in.(${shapeIdList.join(",")})`
      );
      if (Array.isArray(shapeData)) {
        for (const row of shapeData) {
          if (row && row.shape_id && Array.isArray(row.points)) {
            shapeMap.set(String(row.shape_id), row.points);
          }
        }
      }
    }

    function nearestShapeIdx(pts: any[], lat: number, lon: number): number {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dlat = pts[i].lat - lat;
        const dlon = pts[i].lon - lon;
        const d = dlat * dlat + dlon * dlon;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    }

    function downsamplePoints(pts: any[], maxPts: number): any[] {
      if (pts.length <= maxPts) return pts;
      const step = pts.length / maxPts;
      const out: any[] = [];
      for (let i = 0; i < maxPts; i++) out.push(pts[Math.round(i * step)]);
      const last = pts[pts.length - 1];
      if (out[out.length - 1] !== last) out.push(last);
      return out;
    }

    const MAX_SHAPE_PTS_PER_LEG   = 300;
    const MAX_SHAPE_PTS_PER_ROUTE = 800;

    const cleanResult = result.map(({ _score, _exactKey, ...rest }: any) => {
      let routeShapePts = 0;
      const enrichedLegs = (rest.legs || []).map((leg: any) => {
        if (leg.type !== "transit") return leg;
        const { _trip_id, _from_seq, _to_seq, ...cleanLeg } = leg;

        const shapeId = _trip_id ? tripShapeId.get(_trip_id) : undefined;
        const shapePts = shapeId ? shapeMap.get(shapeId) : undefined;

        if (_trip_id && tripSeqMap.has(_trip_id)) {
          const allStops = tripSeqMap.get(_trip_id)!;
          const pathStops = allStops.filter(
            (s: any) => s.seq >= (_from_seq ?? 0) && s.seq <= (_to_seq ?? 99999)
          );
          cleanLeg.path_points = pathStops
            .filter((s: any) => s.lat != null && s.lon != null)
            .map((s: any) => [s.lat, s.lon, s.name || null, s.code || null, s.arrival_time || null]);
        }

        if (shapePts && shapePts.length > 1 &&
            cleanLeg.from_stop?.stop_lat && cleanLeg.to_stop?.stop_lat) {
          const fromLat2 = Number(cleanLeg.from_stop.stop_lat);
          const fromLon2 = Number(cleanLeg.from_stop.stop_lon);
          const toLat2   = Number(cleanLeg.to_stop.stop_lat);
          const toLon2   = Number(cleanLeg.to_stop.stop_lon);

          const fromIdx = nearestShapeIdx(shapePts, fromLat2, fromLon2);
          const toIdx   = nearestShapeIdx(shapePts, toLat2, toLon2);

          let sliced: any[];
          if (fromIdx <= toIdx) {
            sliced = shapePts.slice(fromIdx, toIdx + 1);
          } else {
            sliced = shapePts.slice(toIdx, fromIdx + 1).reverse();
          }

          if (sliced.length >= 2) {
            const remaining = MAX_SHAPE_PTS_PER_ROUTE - routeShapePts;
            const legMax = Math.min(MAX_SHAPE_PTS_PER_LEG, remaining);
            if (legMax > 1) {
              sliced = downsamplePoints(sliced, legMax);
              routeShapePts += sliced.length;
              cleanLeg.path_shape_points = sliced.map((p: any) => [p.lat, p.lon]);
            }
          }
        }

        return cleanLeg;
      });
      return { ...rest, legs: enrichedLegs };
    });

    // --- FIX 10: Improved debug output ---
    if (debugMode) {
      const lineChainsFound = [...new Set(deduped.map((c: any) => c.line_chain_label))];
      const lineChainsRaw = [...new Set(candidates.map((c: any) => c.line_chain_label))];

      // Mode counts among deduplicated candidates
      const modeCounts = { metro: 0, tram: 0, bus: 0 };
      for (const c of deduped) {
        const chain: string[] = c.line_chain || [];
        if (chainHasMode(chain, "metro")) modeCounts.metro++;
        else if (chainHasMode(chain, "tram")) modeCounts.tram++;
        else modeCounts.bus++;
      }

      return okJSON({
        routes: cleanResult,
        debug: {
          originStopsCount: originStops.length,
          destinationStopsCount: destinationStops.length,
          originLines: [...originLinesSet],
          destinationLines: [...destLinesSet],
          originLinesCount: originLinesSet.size,
          destinationLinesCount: destLinesSet.size,
          candidateTransferStopsCount: candidateTransferStops.length,
          candidateTransferStopsSample: candidateTransferStops.slice(0, 10).map(s => s.stop_name),
          originReachableTransferStopsCount: originReachableTransferStops.length,
          destinationBoardingStopsCount: destinationBoardingStops.length,
          originLineStopCandidatesCount,
          destinationLineStopCandidatesCount,
          forcedOriginMetroStopsCount,
          forcedDestination64StopsCount,
          originReachableMetroStopsWithSchedulesCount,
          destination64BoardStopsWithSchedulesCount,
          schedulesFetchedCount: schedulesMap.size,
          originTripsCount: originsByTrip.size,
          transferTripsCount: transferByTrip.size,
          destinationTripsCount: destinationsByTrip.size,
          boardStopsWithSchedulesCount: boardDeparturesByStop.size,
          rawCandidatesCount,
          afterQualityFilterCount,
          afterExactDedupeCount,
          lineChainsRaw,
          finalRoutesCount: cleanResult.length,
          lineChainsFound,
          finalLineChains: cleanResult.map((r: any) => r.line_chain_label),
          directCandidateChainsRaw: [...new Set(directCandidateChainsRaw)],
          directCandidatesCount,
          direct66CandidateCount,
          direct42CandidateCount,
          hasDirect66Candidate: direct66CandidateCount > 0,
          hasDirect42Candidate: direct42CandidateCount > 0,
          transferPairsSameStopCount,
          transferPairsWalkingCount,
          metroCandidatesRawCount,
          m1To64CandidateCount,
          bus42To64CandidateCount,
          rejectedSameLineTransfersCount: rejectedSameLineCount,
          rejectedSameLineFinalSafetyCount,
          modeCounts,
          metroInOriginLines: [...originLinesSet].some(l => getTransitMode(l) === "metro"),
          metroInDestLines: [...destLinesSet].some(l => getTransitMode(l) === "metro"),
          stopSearchRadiusM: stopSearchRadius,
          walkTransferRadiusM: WALK_TRANSFER_RADIUS_M,
          walkTransferAdjacencyPairs: transferPairsWalkingCount
        }
      }, { "Cache-Control": "private, no-cache, no-store, must-revalidate" });
    }

    return okJSON(cleanResult, {
      "Cache-Control": "private, no-cache, no-store, must-revalidate"
    });
  } catch (error: any) {
    return errJSON(500, "Failed to find route candidates.");
  }
};
