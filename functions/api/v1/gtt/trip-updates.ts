// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, type Env } from "../_utils";
import { transit_realtime } from "gtfs-realtime-bindings";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Handle OPTIONS preflight requests for CORS
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout

  try {
    const url = "https://percorsieorari.gtt.to.it/das_gtfsrt/trip_update.aspx";
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TOP-Demo/0.1"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return errJSON(502, "Failed to fetch the upstream GTT feed.");
    }

    const buffer = await response.arrayBuffer();
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    const entities = feed.entity || [];
    const sampleUpdates = entities.slice(0, 10).map((e: any) => {
      const tu = e.tripUpdate;
      if (!tu) return null;

      return {
        id: e.id,
        tripId: tu.trip?.tripId || null,
        startTime: tu.trip?.startTime || null,
        startDate: tu.trip?.startDate || null,
        vehicleId: tu.vehicle?.id || null,
        vehicleLabel: tu.vehicle?.label || null,
        stopTimeUpdates: (tu.stopTimeUpdate || []).map((u: any) => {
          const updateObj: any = {
            stopSequence: u.stopSequence,
            scheduleRelationship: u.scheduleRelationship
          };
          if (u.arrival) {
            updateObj.arrival = {};
            if (u.arrival.delay !== undefined) updateObj.arrival.delay = u.arrival.delay;
            if (u.arrival.time !== undefined) updateObj.arrival.time = u.arrival.time;
          }
          if (u.departure) {
            updateObj.departure = {};
            if (u.departure.delay !== undefined) updateObj.departure.delay = u.departure.delay;
            if (u.departure.time !== undefined) updateObj.departure.time = u.departure.time;
          }
          return updateObj;
        })
      };
    }).filter(Boolean);

    const body = {
      feed_timestamp: feed.header?.timestamp ? Number(feed.header.timestamp) : null,
      entity_count: entities.length,
      sample_updates: sampleUpdates
    };

    return okJSON(body, { 
      "Cache-Control": "s-maxage=15, stale-while-revalidate=30" 
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    const publicMessage = error.name === "AbortError"
      ? "The upstream transit feed timed out."
      : "Failed to process the upstream transit feed.";

    return errJSON(500, publicMessage);
  }
};
