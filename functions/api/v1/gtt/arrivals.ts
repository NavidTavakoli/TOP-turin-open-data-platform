// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../_utils";
import { transit_realtime } from "gtfs-realtime-bindings";

function timeToSeconds(t: string): number {
  const parts = t.split(":");
  const h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  const s = parseInt(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

function addSecondsToTime(timeStr: string, seconds: number): string {
  const totalSecs = timeToSeconds(timeStr) + seconds;
  const positiveSecs = Math.max(0, totalSecs);
  const h = Math.floor(positiveSecs / 3600);
  const m = Math.floor((positiveSecs % 3600) / 60);
  const s = positiveSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Handle CORS OPTIONS preflight
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const stopId = searchParams.get("stop_id")?.trim() || "";

    // 1. Input Validation
    if (!stopId) {
      return errJSON(400, "Missing 'stop_id' query parameter.");
    }

    // 2. Determine service day and current time in Europe/Rome timezone
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
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    const hourStr = parts.find(p => p.type === 'hour')?.value || '00';
    const minStr = parts.find(p => p.type === 'minute')?.value || '00';
    const secStr = parts.find(p => p.type === 'second')?.value || '00';
    const dow = parts.find(p => p.type === 'weekday')?.value || '';

    let h = parseInt(hourStr);
    let y = parseInt(year);
    let m = parseInt(month);
    let d = parseInt(day);
    let todayVal = '';
    let dowVal = '';
    let timeStr = '';

    if (h < 4) {
      // Midnight to 4 AM: Treat as yesterday's service day with hours 24-27
      const tempDate = new Date(y, m - 1, d);
      tempDate.setDate(tempDate.getDate() - 1);
      
      const prevY = tempDate.getFullYear();
      const prevM = tempDate.getMonth() + 1;
      const prevD = tempDate.getDate();
      
      todayVal = `${prevY}${String(prevM).padStart(2, '0')}${String(prevD).padStart(2, '0')}`;
      
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      dowVal = weekdays[tempDate.getDay()];
      timeStr = `${String(h + 24).padStart(2, '0')}:${minStr}:${secStr}`;
    } else {
      todayVal = `${year}${month}${day}`;
      dowVal = dow.toLowerCase();
      timeStr = `${hourStr}:${minStr}:${secStr}`;
    }

    // 3. Query Database
    let activeServiceIds: Set<string>;
    let schedule: any[];

    try {
      // A. Query active service IDs from RPC
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

      if (!rpcRes.ok) {
        throw new Error(`RPC returned HTTP ${rpcRes.status}`);
      }

      const activeServices = (await rpcRes.json()) as { service_id: string }[];
      activeServiceIds = new Set(activeServices.map(s => s.service_id));

      // B. Fetch compact schedules
      const dbSchedules = await sbFetch(ctx.env, `gtt_stop_schedules?stop_id=eq.${stopId}`);
      if (!Array.isArray(dbSchedules) || dbSchedules.length === 0) {
        return errJSON(404, "No schedule data available for this stop.");
      }
      schedule = dbSchedules[0].schedule;
    } catch (dbErr: any) {
      return errJSON(500, `Database error: ${dbErr.message || dbErr}. Please verify Supabase connection, migrations and sync.`);
    }

    // 4. Filter schedule entries to only active & upcoming (within window [now - 5 mins, now + 3 hours])
    const nowSecs = timeToSeconds(timeStr);
    const filteredSchedules = schedule.filter((entry: any) => {
      const [, , arrivalTime, , , serviceId] = entry;
      if (!activeServiceIds.has(serviceId)) return false;
      const arrSecs = timeToSeconds(arrivalTime);
      return arrSecs >= nowSecs - 300 && arrSecs <= nowSecs + 10800;
    });

    // 5. Fetch GTFS-RT Trip Updates (with 5 seconds timeout fallback)
    let rtFeedEntities: any[] = [];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const rtUrl = "https://percorsieorari.gtt.to.it/das_gtfsrt/trip_update.aspx";
      const response = await fetch(rtUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TOP-Demo/0.1"
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        rtFeedEntities = feed.entity || [];
      }
    } catch (rtErr: any) {
      clearTimeout(timeoutId);
      // Log warning but continue; we fallback gracefully to static schedule
      console.warn("GTFS-RT fetch failed, falling back to static times:", rtErr.message);
    }

    // Map RT updates by trip_id + stop_sequence for fast lookup
    const rtMap = new Map<string, any>();
    for (const entity of rtFeedEntities) {
      const tu = entity.tripUpdate;
      if (!tu || !tu.trip || !tu.trip.tripId) continue;
      const tripId = tu.trip.tripId;
      const updates = tu.stopTimeUpdate || [];
      for (const u of updates) {
        if (u.stopSequence !== undefined) {
          rtMap.set(`${tripId}_${u.stopSequence}`, u);
        }
      }
    }

    // 6. Match RT updates & generate estimated times
    const finalArrivals = filteredSchedules.map((entry: any) => {
      const [tripId, stopSeq, arrivalTime, line, headsign] = entry;
      const key = `${tripId}_${stopSeq}`;
      
      let estimatedTime = arrivalTime;
      let delaySec = 0;
      let realtime = false;
      
      const rtUpdate = rtMap.get(key);
      if (rtUpdate && rtUpdate.arrival) {
        realtime = true;
        if (rtUpdate.arrival.delay !== undefined) {
          delaySec = rtUpdate.arrival.delay;
          estimatedTime = addSecondsToTime(arrivalTime, delaySec);
        } else if (rtUpdate.arrival.time !== undefined) {
          const rtTimeSecs = Number(rtUpdate.arrival.time);
          const rtDate = new Date(rtTimeSecs * 1000);
          
          const rtParts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          }).formatToParts(rtDate);
          
          const rtHStr = rtParts.find(p => p.type === 'hour')?.value || '00';
          const rtMStr = rtParts.find(p => p.type === 'minute')?.value || '00';
          const rtSStr = rtParts.find(p => p.type === 'second')?.value || '00';
          
          let rtHour = parseInt(rtHStr);
          const schedSecs = timeToSeconds(arrivalTime);
          if (schedSecs >= 86400 && rtHour < 4) {
            rtHour += 24;
          }
          
          estimatedTime = `${String(rtHour).padStart(2, '0')}:${rtMStr}:${rtSStr}`;
          delaySec = timeToSeconds(estimatedTime) - schedSecs;
        }
      }
      
      return {
        line,
        headsign,
        scheduled_time: arrivalTime,
        estimated_time: estimatedTime,
        delay_sec: delaySec,
        realtime
      };
    });

    // 7. Sort by estimated arrival time and limit to top 10
    finalArrivals.sort((a, b) => timeToSeconds(a.estimated_time) - timeToSeconds(b.estimated_time));
    const top10 = finalArrivals.slice(0, 10);

    return okJSON(top10, {
      "Cache-Control": "private, no-cache, no-store, must-revalidate"
    });
  } catch (error: any) {
    return errJSON(500, "Failed to process arrivals request.");
  }
};
