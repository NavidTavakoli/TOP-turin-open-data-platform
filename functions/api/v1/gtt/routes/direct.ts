// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../../_utils";

// Haversine formula to compute distance in km between two lat/lon coordinates
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
  return R * c;
};

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

async function getNearbyStops(env: Env, lat: number, lon: number, radiusM: number, limit: number): Promise<Stop[]> {
  const deltaLat = radiusM / 111000;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const deltaLon = radiusM / (111000 * cosLat);

  const minLat = lat - deltaLat;
  const maxLat = lat + deltaLat;
  const minLon = lon - deltaLon;
  const maxLon = lon + deltaLon;

  const queryPath =
    `gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon` +
    `&stop_lat=gte.${minLat}&stop_lat=lte.${maxLat}` +
    `&stop_lon=gte.${minLon}&stop_lon=lte.${maxLon}`;

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

async function getStopsByName(env: Env, names: string[], limitPerName = 8): Promise<Stop[]> {
  const all: Stop[] = [];
  for (const name of names) {
    const safe = encodeURIComponent(`*${name}*`);
    const rows = await sbFetch(env, `gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon&stop_name=ilike.${safe}&limit=${limitPerName}`);
    if (Array.isArray(rows)) {
      for (const stop of rows) {
        all.push({
          stop_id: String(stop.stop_id),
          stop_code: stop.stop_code,
          stop_name: stop.stop_name,
          stop_lat: Number(stop.stop_lat),
          stop_lon: Number(stop.stop_lon),
          distance_m: 0
        });
      }
    }
  }
  return all;
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
  return sec >= nowSecs - 300 && sec <= nowSecs + windowSecs;
}

function makeDirectCandidate(origin: ScheduleStopEntry, dest: ScheduleStopEntry, walkFrom: number, walkTo: number) {
  const durationMin = Math.round((dest.timeSec - origin.timeSec) / 60);
  if (durationMin <= 0) return null;

  const candidate: any = {
    type: "direct",
    line: origin.line,
    headsign: origin.headsign,
    from_stop: origin.stop,
    to_stop: dest.stop,
    departure_time: origin.time,
    arrival_time: dest.time,
    duration_min: durationMin,
    total_duration_min: durationMin,
    walk_to_stop_m: walkFrom,
    walk_from_stop_m: walkTo,
    transfer_count: 0,
    realtime: false
  };

  candidate.legs = [
    {
      type: "transit",
      line: origin.line,
      headsign: origin.headsign,
      from_stop: origin.stop,
      to_stop: dest.stop,
      departure_time: origin.time,
      arrival_time: dest.time,
      duration_min: durationMin,
      realtime: false
    }
  ];

  return candidate;
}

function makeTransferCandidate(first: ScheduleStopEntry, transferArr: ScheduleStopEntry, transferDep: ScheduleStopEntry, dest: ScheduleStopEntry, walkFrom: number, walkTo: number) {
  const firstDuration = Math.round((transferArr.timeSec - first.timeSec) / 60);
  const waitMin = Math.round((transferDep.timeSec - transferArr.timeSec) / 60);
  const secondDuration = Math.round((dest.timeSec - transferDep.timeSec) / 60);
  const totalDuration = Math.round((dest.timeSec - first.timeSec) / 60);

  if (firstDuration <= 0 || secondDuration <= 0 || waitMin < 2 || waitMin > 45 || totalDuration <= 0) return null;

  const candidate: any = {
    type: "transfer",
    line: `${first.line} → ${transferDep.line}`,
    lines: [first.line, transferDep.line],
    headsign: dest.headsign || transferDep.headsign,
    transfer_stop: transferArr.stop,
    from_stop: first.stop,
    to_stop: dest.stop,
    departure_time: first.time,
    arrival_time: dest.time,
    duration_min: totalDuration,
    total_duration_min: totalDuration,
    walk_to_stop_m: walkFrom,
    walk_from_stop_m: walkTo,
    transfer_count: 1,
    wait_min: waitMin,
    realtime: false
  };

  candidate.legs = [
    {
      type: "transit",
      line: first.line,
      headsign: first.headsign,
      from_stop: first.stop,
      to_stop: transferArr.stop,
      departure_time: first.time,
      arrival_time: transferArr.time,
      duration_min: firstDuration,
      realtime: false
    },
    {
      type: "transfer",
      at_stop: transferArr.stop,
      wait_min: waitMin,
      arrival_time: transferArr.time,
      departure_time: transferDep.time
    },
    {
      type: "transit",
      line: transferDep.line,
      headsign: transferDep.headsign,
      from_stop: transferDep.stop,
      to_stop: dest.stop,
      departure_time: transferDep.time,
      arrival_time: dest.time,
      duration_min: secondDuration,
      realtime: false
    }
  ];

  return candidate;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const fromLatStr = searchParams.get("from_lat");
    const fromLonStr = searchParams.get("from_lon");
    const toLatStr = searchParams.get("to_lat");
    const toLonStr = searchParams.get("to_lon");

    let radiusM = 800;
    const radiusParam = searchParams.get("radius_m");
    if (radiusParam) {
      const parsedRadius = parseFloat(radiusParam);
      if (!isNaN(parsedRadius) && parsedRadius > 0) radiusM = Math.min(parsedRadius, 1500);
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

    const originStops = await getNearbyStops(ctx.env, fromLat, fromLon, radiusM, 8);
    const destinationStops = await getNearbyStops(ctx.env, toLat, toLon, radiusM, 8);

    if (originStops.length === 0 || destinationStops.length === 0) return okJSON([]);

    // Determine service day in Europe/Rome timezone.
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "long"
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === "year")?.value || "";
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    const hourStr = parts.find(p => p.type === "hour")?.value || "00";
    const minStr = parts.find(p => p.type === "minute")?.value || "00";
    const secStr = parts.find(p => p.type === "second")?.value || "00";
    const dow = parts.find(p => p.type === "weekday")?.value || "";

    let h = parseInt(hourStr);
    let y = parseInt(year);
    let m = parseInt(month);
    let d = parseInt(day);
    let todayVal = "";
    let dowVal = "";
    let timeStr = "";

    if (h < 4) {
      const tempDate = new Date(y, m - 1, d);
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

    // Candidate transfer stops: near the trip midpoint + a few common Turin hubs.
    const midLat = (fromLat + toLat) / 2;
    const midLon = (fromLon + toLon) / 2;
    const transferRadiusM = Math.min(Math.max(radiusM * 2, 1800), 3000);
    const midpointStops = await getNearbyStops(ctx.env, midLat, midLon, transferRadiusM, 30);
    const hubStops = await getStopsByName(ctx.env, [
      "PORTA NUOVA",
      "PORTA SUSA",
      "XVIII DICEMBRE",
      "CASTELLO",
      "STATUTO",
      "DANTE",
      "LINGOTTO",
      "MASSAUA"
    ], 6);

    const transferStops = uniqStops([...midpointStops, ...hubStops], 60);
    const allStops = uniqStops([...originStops, ...destinationStops, ...transferStops], 90);
    const stopIds = allStops.map(s => s.stop_id);

    const dbSchedules = await sbFetch(ctx.env, `gtt_stop_schedules?stop_id=in.(${stopIds.join(",")})`);
    const schedulesMap = new Map<string, ScheduleStopEntry[]>();
    const stopById = new Map<string, Stop>();
    for (const stop of allStops) stopById.set(stop.stop_id, stop);

    if (Array.isArray(dbSchedules)) {
      for (const row of dbSchedules) {
        const stop = stopById.get(String(row.stop_id));
        if (!stop) continue;
        const normalized: ScheduleStopEntry[] = [];
        for (const entry of row.schedule || []) {
          const parsed = normalizeSchedule(entry, stop);
          if (parsed && activeServiceIds.has(parsed.serviceId)) normalized.push(parsed);
        }
        schedulesMap.set(String(row.stop_id), normalized);
      }
    }

    const candidates: any[] = [];
    const originsByTrip = new Map<string, ScheduleStopEntry[]>();
    const transferByTrip = new Map<string, ScheduleStopEntry[]>();
    const destinationsByTrip = new Map<string, ScheduleStopEntry[]>();

    for (const originStop of originStops) {
      for (const entry of schedulesMap.get(originStop.stop_id) || []) {
        if (!isUpcoming(entry.timeSec, nowSecs, searchWindowSecs)) continue;
        if (!originsByTrip.has(entry.tripId)) originsByTrip.set(entry.tripId, []);
        originsByTrip.get(entry.tripId)!.push(entry);
      }
    }

    for (const transferStop of transferStops) {
      for (const entry of schedulesMap.get(transferStop.stop_id) || []) {
        // Transfer stop entries can be slightly outside the initial departure window because
        // the first leg reaches them after departure.
        if (entry.timeSec < nowSecs - 300 || entry.timeSec > nowSecs + searchWindowSecs + 2700) continue;
        if (!transferByTrip.has(entry.tripId)) transferByTrip.set(entry.tripId, []);
        transferByTrip.get(entry.tripId)!.push(entry);
      }
    }

    for (const destStop of destinationStops) {
      for (const entry of schedulesMap.get(destStop.stop_id) || []) {
        if (entry.timeSec < nowSecs || entry.timeSec > nowSecs + searchWindowSecs + 5400) continue;
        if (!destinationsByTrip.has(entry.tripId)) destinationsByTrip.set(entry.tripId, []);
        destinationsByTrip.get(entry.tripId)!.push(entry);
      }
    }

    // Direct candidates.
    for (const [tripId, origins] of originsByTrip.entries()) {
      const dests = destinationsByTrip.get(tripId);
      if (!dests) continue;
      for (const origin of origins) {
        for (const dest of dests) {
          if (origin.stopSeq < dest.stopSeq) {
            const walkFrom = originStops.find(s => s.stop_id === origin.stop.stop_id)?.distance_m ?? 0;
            const walkTo = destinationStops.find(s => s.stop_id === dest.stop.stop_id)?.distance_m ?? 0;
            const cand = makeDirectCandidate(origin, dest, walkFrom, walkTo);
            if (cand) candidates.push(cand);
          }
        }
      }
    }

    // One-transfer candidates.
    // First leg: origin -> transfer on trip A. Second leg: transfer -> destination on trip B.
    const firstLegsByTransferStop = new Map<string, any[]>();
    for (const [tripId, origins] of originsByTrip.entries()) {
      const transferEntries = transferByTrip.get(tripId);
      if (!transferEntries) continue;
      for (const origin of origins) {
        for (const transferArr of transferEntries) {
          if (origin.stop.stop_id === transferArr.stop.stop_id) continue;
          if (origin.stopSeq >= transferArr.stopSeq) continue;
          const walkFrom = originStops.find(s => s.stop_id === origin.stop.stop_id)?.distance_m ?? 0;
          const key = transferArr.stop.stop_id;
          if (!firstLegsByTransferStop.has(key)) firstLegsByTransferStop.set(key, []);
          firstLegsByTransferStop.get(key)!.push({ origin, transferArr, walkFrom });
        }
      }
    }

    for (const [transferStopId, firstLegs] of firstLegsByTransferStop.entries()) {
      const transferDepartures = schedulesMap.get(transferStopId) || [];
      for (const firstLeg of firstLegs.slice(0, 40)) {
        for (const transferDep of transferDepartures) {
          if (!isUpcoming(transferDep.timeSec, firstLeg.transferArr.timeSec, 45 * 60)) continue;
          if (transferDep.timeSec - firstLeg.transferArr.timeSec < 120) continue;

          const dests = destinationsByTrip.get(transferDep.tripId);
          if (!dests) continue;

          for (const dest of dests) {
            if (transferDep.stopSeq >= dest.stopSeq) continue;
            const walkTo = destinationStops.find(s => s.stop_id === dest.stop.stop_id)?.distance_m ?? 0;
            const cand = makeTransferCandidate(firstLeg.origin, firstLeg.transferArr, transferDep, dest, firstLeg.walkFrom, walkTo);
            if (cand) candidates.push(cand);
          }
        }
      }
    }

    const uniqueCandidates: any[] = [];
    const seenKeys = new Set<string>();
    for (const cand of candidates) {
      const lineKey = Array.isArray(cand.lines) ? cand.lines.join("_") : cand.line;
      const transferKey = cand.transfer_stop?.stop_id || "direct";
      const key = `${cand.type}_${lineKey}_${cand.from_stop.stop_id}_${transferKey}_${cand.to_stop.stop_id}_${cand.departure_time}_${cand.arrival_time}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueCandidates.push(cand);
      }
    }

    uniqueCandidates.sort((a, b) => {
      const aDep = timeToSeconds(a.departure_time);
      const bDep = timeToSeconds(b.departure_time);
      if (aDep !== bDep) return aDep - bDep;

      const aTransfers = a.transfer_count || 0;
      const bTransfers = b.transfer_count || 0;
      if (aTransfers !== bTransfers) return aTransfers - bTransfers;

      const aWalk = (a.walk_to_stop_m || 0) + (a.walk_from_stop_m || 0);
      const bWalk = (b.walk_to_stop_m || 0) + (b.walk_from_stop_m || 0);
      if (aWalk !== bWalk) return aWalk - bWalk;

      return (a.total_duration_min || a.duration_min || 9999) - (b.total_duration_min || b.duration_min || 9999);
    });

    const result = uniqueCandidates.slice(0, finalLimit);

    return okJSON(result, {
      "Cache-Control": "private, no-cache, no-store, must-revalidate"
    });
  } catch (error: any) {
    return errJSON(500, "Failed to find route candidates.");
  }
};
