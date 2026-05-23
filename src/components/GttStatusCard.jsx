// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import React, { useEffect, useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Bus, Wifi, WifiOff, RefreshCcw, Clock, Search, X, MapPin } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents, Polyline } from "react-leaflet";

const getMinutesFromNow = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, seconds || 0, 0);
  
  let diffMs = target.getTime() - now.getTime();
  
  if (diffMs < -18 * 60 * 60 * 1000) {
    target.setDate(target.getDate() + 1);
    diffMs = target.getTime() - now.getTime();
  } else if (diffMs > 18 * 60 * 60 * 1000) {
    target.setDate(target.getDate() - 1);
    diffMs = target.getTime() - now.getTime();
  }
  
  return Math.round(diffMs / 60000);
};

const geocodingCache = new Map();

function MapController({ selectedStop, searchResults, nearbyStops, userLocation, tripFrom, tripTo, activeRoute }) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    
    const points = [];
    
    if (activeRoute) {
      if (Array.isArray(activeRoute.legs)) {
        activeRoute.legs.forEach((leg) => {
          if (leg.type === "walk") {
            if (leg.from?.lat !== undefined && leg.from?.lon !== undefined) {
              points.push([Number(leg.from.lat), Number(leg.from.lon)]);
            }
            if (leg.to?.lat !== undefined && leg.to?.lon !== undefined) {
              points.push([Number(leg.to.lat), Number(leg.to.lon)]);
            }
          } else if (leg.type === "transit") {
            if (leg.from_stop?.stop_lat !== undefined && leg.from_stop?.stop_lon !== undefined) {
              points.push([Number(leg.from_stop.stop_lat), Number(leg.from_stop.stop_lon)]);
            }
            if (leg.to_stop?.stop_lat !== undefined && leg.to_stop?.stop_lon !== undefined) {
              points.push([Number(leg.to_stop.stop_lat), Number(leg.to_stop.stop_lon)]);
            }
          } else if (leg.type === "transfer") {
            if (leg.stop?.stop_lat !== undefined && leg.stop?.stop_lon !== undefined) {
              points.push([Number(leg.stop.stop_lat), Number(leg.stop.stop_lon)]);
            }
          }
        });
      } else {
        if (tripFrom?.lat && tripFrom?.lon) {
          points.push([Number(tripFrom.lat), Number(tripFrom.lon)]);
        }
        if (tripTo?.lat && tripTo?.lon) {
          points.push([Number(tripTo.lat), Number(tripTo.lon)]);
        }
      }
    } else {
      if (selectedStop && selectedStop.stop_lat && selectedStop.stop_lon) {
        points.push([Number(selectedStop.stop_lat), Number(selectedStop.stop_lon)]);
      }
      if (userLocation && userLocation.lat && userLocation.lng) {
        points.push([userLocation.lat, userLocation.lng]);
      }
      if (tripFrom && tripFrom.lat && tripFrom.lon) {
        points.push([Number(tripFrom.lat), Number(tripFrom.lon)]);
      }
      if (tripTo && tripTo.lat && tripTo.lon) {
        points.push([Number(tripTo.lat), Number(tripTo.lon)]);
      }
      if (searchResults && searchResults.length > 0) {
        searchResults.forEach(stop => {
          if (stop.stop_lat && stop.stop_lon) {
            points.push([Number(stop.stop_lat), Number(stop.stop_lon)]);
          }
        });
      }
      if (nearbyStops && nearbyStops.length > 0) {
        nearbyStops.forEach(stop => {
          if (stop.stop_lat && stop.stop_lon) {
            points.push([Number(stop.stop_lat), Number(stop.stop_lon)]);
          }
        });
      }
    }

    if (points.length === 0) {
      map.setView([45.0705, 7.6868], 13);
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
  }, [selectedStop, searchResults, nearbyStops, userLocation, tripFrom, tripTo, activeRoute, map]);

  return null;
}

// Handles map clicks for pin mode
function MapClickHandler({ mapPinMode, setMapPinMode, setTripFrom, setTripTo, setPendingTo }) {
  useMapEvents({
    click(e) {
      if (!mapPinMode) return;
      const { lat, lng } = e.latlng;
      const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (mapPinMode === "from") {
        setTripFrom({ type: "pin", label, lat, lon: lng });
        setMapPinMode(null);
      } else if (mapPinMode === "to") {
        setPendingTo({ type: "pin", label, lat, lon: lng });
        setMapPinMode(null);
      }
    }
  });
  return null;
}

export default function GttStatusCard({ tick }) {
  // Always call APIs on the same domain that is serving the current page.
  // This prevents the app from being pinned to an old Cloudflare Pages preview URL.
  const API_ROOT = "";
  // Feed status states
  const [feedData, setFeedData] = useState(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalsError, setArrivalsError] = useState(null);
  const [arrivalsLastUpdated, setArrivalsLastUpdated] = useState(null);

  // Geolocation states
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Nearby stops states
  const [nearbyStops, setNearbyStops] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState(null);

  // Trip planner states
  const [activeTab, setActiveTab] = useState("arrivals");
  const [tripFrom, setTripFrom] = useState(null);
  const [tripTo, setTripTo] = useState(null);
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromCandidates, setFromCandidates] = useState([]);
  const [toCandidates, setToCandidates] = useState([]);
  const [fromLoading, setFromLoading] = useState(false);
  const [toLoading, setToLoading] = useState(false);
  const [fromError, setFromError] = useState(null);
  const [toError, setToError] = useState(null);

  // Direct/transfer route states
  const [routeCandidates, setRouteCandidates] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState(null);
  const [routesFetched, setRoutesFetched] = useState(false);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);

  // Map pin mode: null | "from" | "to"
  const [mapPinMode, setMapPinMode] = useState(null);
  // Pending destination preview (before confirmation)
  const [pendingTo, setPendingTo] = useState(null);

  const activeRoute = useMemo(() => {
    if (routeCandidates && routeCandidates.length > 0) {
      return routeCandidates[activeRouteIdx] || routeCandidates[0] || null;
    }
    return null;
  }, [routeCandidates, activeRouteIdx]);

  useEffect(() => {
    setActiveRouteIdx(0);
  }, [routeCandidates]);

  // Autocomplete refs
  const fromAbortControllerRef = useRef(null);
  const toAbortControllerRef = useRef(null);
  const fromTimeoutRef = useRef(null);
  const toTimeoutRef = useRef(null);

  // Theme observer state for Map dark/light tiles
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    setIsDark(document.documentElement.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Calculate distance between two lat/lon coordinates in km using Haversine formula
  const getHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
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

  const formatDistance = (km) => {
    if (km === null || km === undefined) return "";
    if (km < 1) {
      return `${Math.round(km * 1000)} m`;
    }
    return `${km.toFixed(1)} km`;
  };


  const getTransitLegs = (route) => {
    if (!route) return [];
    if (Array.isArray(route.legs)) {
      return route.legs.filter((leg) => leg.type === "transit");
    }
    if (route.from_stop && route.to_stop) {
      return [{
        type: "transit",
        line: route.line,
        headsign: route.headsign,
        from_stop: route.from_stop,
        to_stop: route.to_stop,
        departure_time: route.departure_time,
        arrival_time: route.arrival_time,
        duration_min: route.duration_min,
        realtime: route.realtime
      }];
    }
    return [];
  };

  const activeRouteTransitLegs = useMemo(() => getTransitLegs(activeRoute), [activeRoute]);

  const activeRouteWalkSegments = useMemo(() => {
    if (!activeRoute || !Array.isArray(activeRoute.legs)) return [];
    return activeRoute.legs
      .filter((leg) => leg.type === "walk" && leg.from && leg.to)
      .map((leg, idx) => ({
        key: `walk-segment-${idx}`,
        color: idx === 0 ? "#6366f1" : "#f43f5e",
        from: [Number(leg.from.lat), Number(leg.from.lon)],
        to: [Number(leg.to.lat), Number(leg.to.lon)]
      }));
  }, [activeRoute]);

  // Sort search results client-side from currently available search results by distance if userLocation is available
  const sortedSearchResults = useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [];
    if (!userLocation) return searchResults;

    return [...searchResults]
      .map(stop => {
        if (stop.stop_lat && stop.stop_lon) {
          const dist = getHaversineDistance(
            userLocation.lat,
            userLocation.lng,
            Number(stop.stop_lat),
            Number(stop.stop_lon)
          );
          return { ...stop, distance: dist };
        }
        return { ...stop, distance: Infinity };
      })
      .sort((a, b) => a.distance - b.distance);
  }, [searchResults, userLocation]);

  const fetchNearbyStops = async (lat, lon) => {
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const url = `${API_ROOT}/api/v1/gtt/stops/nearby?lat=${lat}&lon=${lon}`;
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) {
        throw new Error("Request failed.");
      }
      setNearbyStops(Array.isArray(json) ? json : []);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setNearbyError("Failed to fetch nearby stops.");
      setNearbyStops([]);
    } finally {
      setNearbyLoading(false);
    }
  };

  const handleGetLocation = () => {
    if (userLocation) {
      setUserLocation(null);
      setLocationError(null);
      setNearbyStops([]);
      setNearbyError(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        setLocationLoading(false);
        fetchNearbyStops(lat, lng);
      },
      (error) => {
        if (import.meta.env.DEV) console.error(error);
        let msg = "Failed to detect location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location info unavailable.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out.";
        }
        setLocationError(msg);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const searchAddress = async (query, type, signal = null) => {
    if (!query || query.trim().length < 3) {
      const errMsg = "Query must be at least 3 characters.";
      if (type === "from") {
        setFromCandidates([]);
        setFromError(errMsg);
      } else {
        setToCandidates([]);
        setToError(errMsg);
      }
      return;
    }
    const trimmedQuery = query.trim();
    const cacheKey = trimmedQuery.toLowerCase();

    if (geocodingCache.has(cacheKey)) {
      const cachedData = geocodingCache.get(cacheKey);
      if (type === "from") {
        setFromCandidates(cachedData);
        setFromError(null);
      } else {
        setToCandidates(cachedData);
        setToError(null);
      }
      return;
    }

    if (type === "from") {
      setFromLoading(true);
      setFromError(null);
      setFromCandidates([]);
    } else {
      setToLoading(true);
      setToError(null);
      setToCandidates([]);
    }

    try {
      const lowercaseQuery = trimmedQuery.toLowerCase();
      const searchQuery = lowercaseQuery.includes("torin") || lowercaseQuery.includes("turin")
        ? trimmedQuery
        : `${trimmedQuery}, Torino, Italy`;

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=it&bounded=1&viewbox=7.52,44.97,7.82,45.16`;
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error("Address search failed.");
      }

      const json = await response.json();
      const results = json.map(item => {
        // Shorten display_name: keep first 2-3 parts (street, district, city)
        const parts = item.display_name.split(",").map(p => p.trim());
        const shortLabel = parts.slice(0, 3).join(", ");
        return {
          type: "address",
          label: shortLabel,
          fullLabel: item.display_name,
          lat: Number(item.lat),
          lon: Number(item.lon)
        };
      });

      geocodingCache.set(cacheKey, results);

      if (type === "from") {
        setFromCandidates(results);
        if (results.length === 0) {
          setFromError("No results found in Turin.");
        }
      } else {
        setToCandidates(results);
        if (results.length === 0) {
          setToError("No results found in Turin.");
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      if (import.meta.env.DEV) console.error(err);
      const errMsg = "Failed to search address. Please try again.";
      if (type === "from") {
        setFromError(errMsg);
      } else {
        setToError(errMsg);
      }
    } finally {
      if (type === "from") {
        setFromLoading(false);
      } else {
        setToLoading(false);
      }
    }
  };

  const handleImmediateSearch = (query, type) => {
    const timeoutRef = type === "from" ? fromTimeoutRef : toTimeoutRef;
    const abortRef = type === "from" ? fromAbortControllerRef : toAbortControllerRef;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    searchAddress(query, type, controller.signal);
  };

  // Autocomplete for From input
  useEffect(() => {
    const trimmed = fromQuery.trim();
    if (trimmed.length < 3) {
      setFromCandidates([]);
      setFromError(null);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    if (geocodingCache.has(cacheKey)) {
      setFromCandidates(geocodingCache.get(cacheKey));
      setFromError(null);
      return;
    }

    if (fromAbortControllerRef.current) {
      fromAbortControllerRef.current.abort();
    }
    if (fromTimeoutRef.current) {
      clearTimeout(fromTimeoutRef.current);
    }

    const controller = new AbortController();
    fromAbortControllerRef.current = controller;

    fromTimeoutRef.current = setTimeout(() => {
      searchAddress(fromQuery, "from", controller.signal);
    }, 900);

    return () => {
      if (fromTimeoutRef.current) {
        clearTimeout(fromTimeoutRef.current);
      }
      controller.abort();
    };
  }, [fromQuery]);

  // Autocomplete for To input
  useEffect(() => {
    const trimmed = toQuery.trim();
    if (trimmed.length < 3) {
      setToCandidates([]);
      setToError(null);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    if (geocodingCache.has(cacheKey)) {
      setToCandidates(geocodingCache.get(cacheKey));
      setToError(null);
      return;
    }

    if (toAbortControllerRef.current) {
      toAbortControllerRef.current.abort();
    }
    if (toTimeoutRef.current) {
      clearTimeout(toTimeoutRef.current);
    }

    const controller = new AbortController();
    toAbortControllerRef.current = controller;

    toTimeoutRef.current = setTimeout(() => {
      searchAddress(toQuery, "to", controller.signal);
    }, 900);

    return () => {
      if (toTimeoutRef.current) {
        clearTimeout(toTimeoutRef.current);
      }
      controller.abort();
    };
  }, [toQuery]);


  // 1. Fetch live GTT feed status
  const fetchFeedStatus = async () => {
    try {
      if (!feedData) {
        setFeedLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setFeedError(null);
      const url = `${API_ROOT}/api/v1/gtt/trip-updates`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Request failed.");
      }
      const json = await response.json();
      setFeedData(json);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setFeedError("Failed to fetch live transit feed status.");
    } finally {
      setFeedLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedStatus();
  }, [tick]);

  // Fetch live arrivals for selected stop
  const fetchArrivals = async (stopId) => {
    if (!stopId) {
      setArrivals([]);
      setArrivalsError(null);
      setArrivalsLastUpdated(null);
      return;
    }
    setArrivalsLoading(true);
    setArrivalsError(null);
    try {
      const url = `${API_ROOT}/api/v1/gtt/arrivals?stop_id=${encodeURIComponent(stopId)}`;
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) {
        throw new Error("Request failed.");
      }
      setArrivals(Array.isArray(json) ? json : []);
      setArrivalsLastUpdated(new Date());
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setArrivalsError("Failed to fetch arrivals.");
      setArrivals([]);
    } finally {
      setArrivalsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStop) {
      fetchArrivals(selectedStop.stop_id);
    } else {
      setArrivals([]);
      setArrivalsError(null);
      setArrivalsLastUpdated(null);
    }
  }, [selectedStop, tick]);

  // 2. Debounced search for stops
  useEffect(() => {
    const trimmed = searchQuery.trim();
    const isNumeric = /^\d+$/.test(trimmed);

    // Enforce backend validation: code is checked numeric; text query must be at least 2 chars
    if (!trimmed || (!isNumeric && trimmed.length < 2)) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        let url = `${API_ROOT}/api/v1/gtt/stops`;
        if (isNumeric) {
          url += `?code=${encodeURIComponent(trimmed)}`;
        } else {
          url += `?q=${encodeURIComponent(trimmed)}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          await response.json().catch(() => ({}));
          throw new Error("Request failed.");
        }

        const json = await response.json();
        setSearchResults(Array.isArray(json) ? json.slice(0, 8) : []);
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
        setSearchError("Failed to query stops.");
      } finally {
        setSearchLoading(false);
      }
    }, 350); // 350ms debounce

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Fetch route plan when From and To are selected
  useEffect(() => {
    if (!tripFrom || !tripTo) {
      setRouteCandidates([]);
      setRoutesError(null);
      setRoutesFetched(false);
      return;
    }

    const fetchRoutePlan = async () => {
      setRoutesLoading(true);
      setRoutesError(null);
      try {
        const fromLat = tripFrom.lat;
        const fromLon = tripFrom.lon;
        const toLat = tripTo.lat;
        const toLon = tripTo.lon;

        const url = `${API_ROOT}/api/v1/gtt/routes/plan?from_lat=${fromLat}&from_lon=${fromLon}&to_lat=${toLat}&to_lon=${toLon}&radius_m=1500&limit=10`;
        const response = await fetch(url);
        const json = await response.json();
        
        if (!response.ok) {
          throw new Error("Request failed.");
        }
        
        setRouteCandidates(Array.isArray(json) ? json : []);
        setRoutesFetched(true);
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
        setRoutesError("Failed to find route candidates.");
        setRouteCandidates([]);
      } finally {
        setRoutesLoading(false);
      }
    };

    fetchRoutePlan();
  }, [tripFrom, tripTo]);

  const lastUpdated = feedData?.feed_timestamp
    ? new Date(feedData.feed_timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const arrivalsLastUpdatedStr = arrivalsLastUpdated
    ? arrivalsLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <motion.div
      className={
        "card-neon rounded-2xl border border-slate-200/60 dark:border-slate-800/60 " +
        "bg-white/65 dark:bg-slate-900/60 backdrop-blur-md " +
        "shadow-[0_1px_1px_rgba(0,0,0,.04),0_10px_30px_rgba(2,6,23,.10)] " +
        "transition-all duration-200 p-5 relative overflow-hidden flex flex-col gap-4"
      }
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Background soft glow */}
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />

      {/* Main Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="icon-neon inline-flex items-center justify-center w-7 h-7 rounded-xl
                           bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700">
            <Bus size={16} className="text-blue-600 dark:text-blue-400" />
          </span>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">GTT Live Transit</h3>
        </div>
        <button
          onClick={fetchFeedStatus}
          disabled={feedLoading || isRefreshing}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
          title="Refresh Feed Status"
        >
          <RefreshCcw size={12} className={isRefreshing ? "animate-spin text-emerald-500" : ""} />
        </button>
      </div>

      {/* Responsive 2-panel Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Feed Status + Stop Search */}
        <div className="md:col-span-5 space-y-4">
          {/* Feed Status Block */}
          <div className="space-y-3 bg-slate-50/30 dark:bg-slate-950/10 border border-slate-100/50 dark:border-slate-800/30 rounded-xl p-3.5">
            <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
              Live Feed Status
            </div>

            {/* Loading feed state */}
            {feedLoading && !feedData && (
              <div className="py-4 flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-[11px] text-slate-400">Connecting to GTT...</span>
              </div>
            )}

            {/* Feed error state */}
            {feedError && (
              <div className="py-1">
                <div className="flex items-center gap-2 text-rose-500 mb-1.5">
                  <WifiOff size={14} />
                  <span className="text-xs font-semibold">Feed Offline</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-2 rounded-lg">
                  {feedError}
                </p>
              </div>
            )}

            {/* Feed data display */}
            {!feedLoading && feedData && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Feed Status</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Active Updates</span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">
                    {feedData.entity_count?.toLocaleString() || "0"} trips
                  </span>
                </div>

                {/* Feed sample trip previews */}
                {feedData.sample_updates && feedData.sample_updates.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/40">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 font-medium">
                      Live Sample Trips
                    </div>
                    <div className="space-y-1.5">
                      {feedData.sample_updates.slice(0, 3).map((trip, idx) => {
                        const label = trip.vehicleLabel || `Trip #${trip.tripId || idx + 1}`;
                        return (
                          <div
                            key={trip.id || idx}
                            className="flex items-center justify-between text-xs bg-slate-50/60 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800/30 px-2 py-1 rounded-lg"
                          >
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                              {label}
                            </span>
                            {trip.startTime && (
                              <span className="text-[10px] text-slate-400 tabular-nums flex items-center gap-1">
                                <Clock size={10} />
                                {trip.startTime}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Last update metadata */}
                {lastUpdated && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                    <Clock size={10} />
                    <span>Feed timestamp: {lastUpdated}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stop Search Block */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Search size={12} />
                <span>Stop Lookup</span>
              </div>
              
              {/* Geolocation Button */}
              <button
                onClick={handleGetLocation}
                disabled={locationLoading}
                className="text-[10px] font-semibold flex items-center gap-1 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
              >
                {locationLoading ? (
                  <>
                    <span className="w-2.5 h-2.5 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    Locating...
                  </>
                ) : (
                  <>
                    <MapPin size={10} />
                    {userLocation ? "Location On" : "Use My Location"}
                  </>
                )}
              </button>
            </div>

            {/* Input box */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stop name or code..."
                className="w-full text-xs px-3 py-2 pr-12 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/30 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchError(null);
                  }}
                  className="absolute right-3 top-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Geolocation Error */}
            {locationError && (
              <div className="text-[10px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                <span>{locationError}</span>
                <button onClick={() => setLocationError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Search Results Section */}
            {searchQuery.trim() && (
              <div className="space-y-2">
                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
                  Search Results ({sortedSearchResults.length})
                </div>
                {searchLoading && (
                  <div className="text-[11px] text-slate-400 animate-pulse flex items-center gap-2 py-1">
                    <div className="w-3.5 h-3.5 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    Searching stops...
                  </div>
                )}
                {searchError && (
                  <div className="text-[10px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                    {searchError}
                  </div>
                )}
                {!searchLoading && !searchError && sortedSearchResults.length === 0 && (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 py-1 italic">
                    No stops found matching your search.
                  </div>
                )}
                {sortedSearchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {sortedSearchResults.map((stop) => {
                      const isSelected = selectedStop?.stop_id === stop.stop_id;
                      return (
                        <div
                          key={stop.stop_id}
                          className={`w-full text-left text-xs px-2.5 py-2 rounded-xl border transition-all duration-200 flex items-center justify-between gap-2 ${
                            isSelected
                              ? "bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,.15)]"
                              : "bg-slate-50/50 dark:bg-slate-950/10 border-slate-100/50 dark:border-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/30"
                          }`}
                        >
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => setSelectedStop(stop)}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <span className="font-semibold truncate">{stop.stop_name}</span>
                              {stop.distance !== undefined && stop.distance !== Infinity && (
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                                  {formatDistance(stop.distance)}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                              Code: {stop.stop_code || "N/A"} · ID: {stop.stop_id}
                            </span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTripFrom({
                                  type: "stop",
                                  label: stop.stop_name,
                                  lat: Number(stop.stop_lat),
                                  lon: Number(stop.stop_lon),
                                  stop_id: stop.stop_id
                                });
                                setActiveTab("planner");
                              }}
                              className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-colors"
                            >
                              Set From
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTripTo({
                                  type: "stop",
                                  label: stop.stop_name,
                                  lat: Number(stop.stop_lat),
                                  lon: Number(stop.stop_lon),
                                  stop_id: stop.stop_id
                                });
                                setActiveTab("planner");
                              }}
                              className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                            >
                              Set To
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Nearby Stops Section */}
            {userLocation && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                  <MapPin size={10} />
                  <span>Nearby Stops ({nearbyStops.length})</span>
                </div>
                
                {nearbyLoading && (
                  <div className="text-[11px] text-slate-400 animate-pulse flex items-center gap-2 py-1">
                    <div className="w-3.5 h-3.5 border border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    Finding nearby stops...
                  </div>
                )}

                {nearbyError && (
                  <div className="text-[10px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                    {nearbyError}
                  </div>
                )}

                {!nearbyLoading && !nearbyError && nearbyStops.length === 0 && (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 py-1 italic">
                    No nearby stops found within 800m.
                  </div>
                )}
                {nearbyStops.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {nearbyStops.map((stop) => {
                      const isSelected = selectedStop?.stop_id === stop.stop_id;
                      return (
                        <div
                          key={`nearby-${stop.stop_id}`}
                          className={`w-full text-left text-xs px-2.5 py-2 rounded-xl border transition-all duration-200 flex items-center justify-between gap-2 ${
                            isSelected
                              ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,.15)]"
                              : "bg-slate-50/50 dark:bg-slate-950/10 border-slate-100/50 dark:border-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-emerald-500/5 dark:hover:bg-emerald-500/5 hover:border-emerald-500/20"
                          }`}
                        >
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => setSelectedStop(stop)}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <span className="font-semibold truncate">{stop.stop_name}</span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                                {formatDistance(stop.distance_m / 1000)}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                              Code: {stop.stop_code || "N/A"} · ID: {stop.stop_id}
                            </span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTripFrom({
                                  type: "stop",
                                  label: stop.stop_name,
                                  lat: Number(stop.stop_lat),
                                  lon: Number(stop.stop_lon),
                                  stop_id: stop.stop_id
                                });
                                setActiveTab("planner");
                              }}
                              className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-colors"
                            >
                              Set From
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTripTo({
                                  type: "stop",
                                  label: stop.stop_name,
                                  lat: Number(stop.stop_lat),
                                  lon: Number(stop.stop_lon),
                                  stop_id: stop.stop_id
                                });
                                setActiveTab("planner");
                              }}
                              className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                            >
                              Set To
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Selected Stop + Arrivals / Trip Planner */}
        <div className="md:col-span-7 md:border-l md:border-slate-100/50 md:dark:border-slate-800/30 md:pl-6 flex flex-col justify-start h-full min-h-[260px] w-full">
          {/* Tabs header */}
          <div className="flex border-b border-slate-100 dark:border-slate-800/60 mb-4 gap-4">
            <button
              onClick={() => setActiveTab("arrivals")}
              className={`pb-2 text-xs font-semibold transition-all relative ${
                activeTab === "arrivals"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              Arrivals
              {activeTab === "arrivals" && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("planner")}
              className={`pb-2 text-xs font-semibold transition-all relative ${
                activeTab === "planner"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              Trip Planner
              {activeTab === "planner" && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                />
              )}
            </button>
          </div>

          {activeTab === "arrivals" ? (
            selectedStop ? (
              <div className="space-y-4 w-full">
                {/* Selected stop card details */}
                <div className="bg-gradient-to-r from-blue-500/5 to-indigo-500/5 dark:from-blue-500/10 dark:to-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 blur-xl rounded-full pointer-events-none" />
                  
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
                        Selected Stop
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {selectedStop.stop_name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Code: <span className="font-mono">{selectedStop.stop_code || "N/A"}</span> · ID: <span className="font-mono">{selectedStop.stop_id}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setSelectedStop(null)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                      title="Clear Selected Stop"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Arrivals container */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Upcoming arrivals
                      </span>
                      {arrivalsLastUpdatedStr && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                          · Last updated: {arrivalsLastUpdatedStr}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {arrivalsLoading && (
                        <span className="text-[9px] text-indigo-500 dark:text-indigo-400 animate-pulse">Refreshing...</span>
                      )}
                      <button
                        onClick={() => fetchArrivals(selectedStop.stop_id)}
                        disabled={arrivalsLoading}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                        title="Refresh arrivals"
                      >
                        <RefreshCcw size={12} className={arrivalsLoading ? "animate-spin text-indigo-500" : ""} />
                      </button>
                    </div>
                  </div>

                  {/* Loading State */}
                  {arrivalsLoading && arrivals.length === 0 && (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 bg-white/40 dark:bg-slate-950/10 rounded-xl border border-slate-100/50 dark:border-slate-800/20">
                      <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <span className="text-[11px] text-slate-400">Loading arrivals...</span>
                    </div>
                  )}

                  {/* Error State */}
                  {arrivalsError && (
                    <div className="text-[11px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-2.5 rounded-xl">
                      {arrivalsError}
                    </div>
                  )}

                  {/* Empty / No Arrivals State */}
                  {!arrivalsLoading && !arrivalsError && arrivals.length === 0 && (
                    <div className="py-8 px-4 text-center text-xs text-slate-400 dark:text-slate-500 italic bg-white/40 dark:bg-slate-950/10 rounded-xl border border-slate-100/50 dark:border-slate-800/20">
                      No upcoming arrivals found for this stop right now.
                    </div>
                  )}

                  {/* Arrivals list */}
                  {arrivals.length > 0 && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {arrivals.slice(0, 10).map((arrival, idx) => {
                        const targetTimeStr = arrival.realtime && arrival.estimated_time 
                          ? arrival.estimated_time.slice(0, 5) 
                          : arrival.scheduled_time.slice(0, 5);
                        
                        const min = getMinutesFromNow(arrival.realtime && arrival.estimated_time ? arrival.estimated_time : arrival.scheduled_time);
                        let minStr = "";
                        let isDueOrNow = false;
                        if (min !== null) {
                          if (min < 0) {
                            minStr = "Due";
                            isDueOrNow = true;
                          } else if (min === 0) {
                            minStr = "Now";
                            isDueOrNow = true;
                          } else {
                            minStr = `in ${min} min`;
                          }
                        }

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/60 dark:bg-slate-950/30 border border-slate-100/50 dark:border-slate-800/20 gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors duration-150"
                          >
                            {/* Large Line Badge + Headsign / Destination */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="inline-flex items-center justify-center min-w-[38px] h-8 px-2 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs tracking-tight shrink-0 shadow-sm">
                                {arrival.line}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                  {arrival.headsign}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {arrival.realtime ? (
                                    <>
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold">
                                        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                        Live
                                      </span>
                                      {/* Delay Indicator: Only if realtime */}
                                      <span className={`text-[9px] font-semibold tracking-tight ${
                                        Math.round(arrival.delay_sec / 60) > 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400"
                                      }`}>
                                        {Math.round(arrival.delay_sec / 60) === 0 
                                          ? "On Time" 
                                          : `${Math.round(arrival.delay_sec / 60) > 0 ? "+" : ""}${Math.round(arrival.delay_sec / 60)}m`}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50 text-[9px] font-semibold">
                                      Sched
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Time & Relative countdown */}
                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`text-xs font-bold ${
                                  isDueOrNow 
                                    ? "text-emerald-600 dark:text-emerald-400 font-extrabold" 
                                    : "text-slate-800 dark:text-slate-200"
                                }`}>
                                  {minStr}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                  {targetTimeStr}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-950/5 self-stretch my-auto">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600 mb-3 shadow-[0_0_15px_rgba(0,0,0,0.02)]">
                  <Bus size={22} className="opacity-75" />
                </div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">No Stop Selected</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm">
                  Use the search bar on the left to look up a transit stop and view live incoming arrivals.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-4 w-full">
              {/* Trip Planner points */}
              <div className="space-y-3">
                {/* From Card / Input */}
                {tripFrom ? (
                  <div className="bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm w-full min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">From</div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={tripFrom.label}>
                          {tripFrom.label}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium capitalize">
                          {tripFrom.type === "stop" ? `Stop (ID: ${tripFrom.stop_id})` : tripFrom.type}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTripFrom(null);
                        setFromQuery("");
                        setFromCandidates([]);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">From (Origin)</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={fromQuery}
                        onChange={(e) => setFromQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            searchAddress(fromQuery, "from");
                          }
                        }}
                        placeholder="Search Torino address..."
                        className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/30 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
                      />
                      <button
                        onClick={() => searchAddress(fromQuery, "from")}
                        disabled={fromLoading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {fromLoading ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Search size={12} />
                        )}
                        Search
                      </button>
                    </div>

                    {/* Quick From shortcuts */}
                    <div className="flex flex-wrap gap-1">
                      {userLocation && (
                        <button
                          onClick={() => {
                            setTripFrom({
                              type: "location",
                              label: "My Location",
                              lat: userLocation.lat,
                              lon: userLocation.lng
                            });
                          }}
                          className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800/80 transition-colors"
                        >
                          My Location
                        </button>
                      )}
                      <button
                        onClick={() => setMapPinMode(mapPinMode === "from" ? null : "from")}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded border transition-colors flex items-center gap-1 ${
                          mapPinMode === "from"
                            ? "bg-indigo-500 text-white border-indigo-500"
                            : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-800/80"
                        }`}
                      >
                        <MapPin size={9} />
                        {mapPinMode === "from" ? "Click map..." : "Pin on map"}
                      </button>
                      {selectedStop && (
                        <button
                          onClick={() => {
                            setTripFrom({
                              type: "stop",
                              label: selectedStop.stop_name,
                              lat: Number(selectedStop.stop_lat),
                              lon: Number(selectedStop.stop_lon),
                              stop_id: selectedStop.stop_id
                            });
                          }}
                          className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800/80 transition-colors truncate max-w-[180px]"
                        >
                          Selected Stop: {selectedStop.stop_name}
                        </button>
                      )}
                    </div>

                    {/* From Candidates */}
                    {fromCandidates.length > 0 && (
                      <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800/55 p-1 rounded-xl">
                        {fromCandidates.map((cand, idx) => (
                          <button
                            key={`from-cand-${idx}`}
                            onClick={() => {
                              setTripFrom(cand);
                              setFromCandidates([]);
                              setFromQuery("");
                            }}
                            className="w-full text-left text-[10px] px-2 py-1.5 rounded-lg hover:bg-indigo-500/10 dark:hover:bg-indigo-500/15 text-slate-700 dark:text-slate-300 transition-colors"
                            title={cand.fullLabel || cand.label}
                          >
                            <div className="font-semibold truncate">{cand.label}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {fromError && (
                      <div className="text-[10px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                        {fromError}
                      </div>
                    )}
                  </div>
                )}

                {/* Pending destination confirmation */}
                {pendingTo && !tripTo && (
                  <div className="bg-rose-500/8 dark:bg-rose-500/12 border border-rose-500/30 rounded-xl p-3 space-y-2">
                    <div className="text-[9px] text-rose-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <MapPin size={9} />
                      Confirm destination?
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={pendingTo.fullLabel || pendingTo.label}>
                      {pendingTo.label}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setTripTo(pendingTo); setPendingTo(null); }}
                        className="flex-1 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => setPendingTo(null)}
                        className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* To Card / Input */}
                {tripTo ? (
                  <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm w-full min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">To</div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={tripTo.label}>
                          {tripTo.label}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium capitalize">
                          {tripTo.type === "stop" ? `Stop (ID: ${tripTo.stop_id})` : tripTo.type}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTripTo(null);
                        setToQuery("");
                        setToCandidates([]);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">To (Destination)</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={toQuery}
                        onChange={(e) => setToQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            searchAddress(toQuery, "to");
                          }
                        }}
                        placeholder="Search Torino address..."
                        className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/30 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all duration-200"
                      />
                      <button
                        onClick={() => searchAddress(toQuery, "to")}
                        disabled={toLoading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {toLoading ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Search size={12} />
                        )}
                        Search
                      </button>
                    </div>

                    {/* Quick To shortcuts */}
                    <div className="flex flex-wrap gap-1">
                      {userLocation && (
                        <button
                          onClick={() => {
                            setPendingTo({
                              type: "location",
                              label: "My Location",
                              lat: userLocation.lat,
                              lon: userLocation.lng
                            });
                          }}
                          className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800/80 transition-colors"
                        >
                          My Location
                        </button>
                      )}
                      <button
                        onClick={() => setMapPinMode(mapPinMode === "to" ? null : "to")}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded border transition-colors flex items-center gap-1 ${
                          mapPinMode === "to"
                            ? "bg-rose-500 text-white border-rose-500"
                            : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-800/80"
                        }`}
                      >
                        <MapPin size={9} />
                        {mapPinMode === "to" ? "Click map..." : "Pin on map"}
                      </button>
                      {selectedStop && (
                        <button
                          onClick={() => {
                            setTripTo({
                              type: "stop",
                              label: selectedStop.stop_name,
                              lat: Number(selectedStop.stop_lat),
                              lon: Number(selectedStop.stop_lon),
                              stop_id: selectedStop.stop_id
                            });
                          }}
                          className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800/80 transition-colors truncate max-w-[180px]"
                        >
                          Selected Stop: {selectedStop.stop_name}
                        </button>
                      )}
                    </div>

                    {/* To Candidates */}
                    {toCandidates.length > 0 && (
                      <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800/55 p-1 rounded-xl">
                        {toCandidates.map((cand, idx) => (
                          <button
                            key={`to-cand-${idx}`}
                            onClick={() => {
                              setPendingTo(cand);
                              setToCandidates([]);
                              setToQuery("");
                            }}
                            className="w-full text-left text-[10px] px-2 py-1.5 rounded-lg hover:bg-rose-500/10 dark:hover:bg-rose-500/15 text-slate-700 dark:text-slate-300 transition-colors"
                            title={cand.fullLabel || cand.label}
                          >
                            <div className="font-semibold truncate">{cand.label}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {toError && (
                      <div className="text-[10px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                        {toError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {tripFrom && tripTo && (
                <div className="space-y-2.5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium text-center flex items-center justify-center gap-1.5 px-2 min-w-0">
                    <span className="shrink-0 text-slate-400 dark:text-slate-500">Ready to plan:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px] md:max-w-[160px]" title={tripFrom.label}>
                      {tripFrom.label}
                    </span>
                    <span className="text-slate-400 shrink-0">→</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px] md:max-w-[160px]" title={tripTo.label}>
                      {tripTo.label}
                    </span>
                  </div>
                  {routesLoading && !routesFetched ? (
                    <div className="py-6 flex flex-col items-center justify-center gap-2 bg-white/40 dark:bg-slate-950/10 rounded-xl border border-slate-100/50 dark:border-slate-800/20 shadow-sm">
                      <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <span className="text-[11px] text-slate-400">Finding transit routes...</span>
                    </div>
                  ) : routesError ? (
                    <div className="text-[11px] text-rose-500 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-2.5 rounded-xl">
                      {routesError}
                    </div>
                  ) : routesFetched ? (
                    routeCandidates.length === 0 ? (
                      <div className="p-4 bg-slate-50/50 dark:bg-slate-950/10 border border-slate-100/50 dark:border-slate-800/40 text-slate-500 dark:text-slate-400 rounded-xl text-xs text-center flex flex-col items-center justify-center gap-1 shadow-sm">
                        <span className="font-semibold">No route found in the current search window.</span>
                        <span className="text-[10px] text-slate-400">Direct and one-transfer routes supported.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 italic text-right px-1">
                          Direct and one-transfer routes supported.
                        </div>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                          {routeCandidates.map((cand, idx) => {
                            const transitLegs = getTransitLegs(cand);
                            const firstLeg = transitLegs[0] || {};
                            const lastLeg = transitLegs[transitLegs.length - 1] || firstLeg;
                            const min = getMinutesFromNow(cand.departure_time || firstLeg.departure_time);
                            let minStr = "";
                            if (min !== null) {
                              if (min < 0) minStr = "Due";
                              else if (min === 0) minStr = "Now";
                              else minStr = `in ${min} min`;
                            }
                            const routeTitle = cand.route_type === "direct"
                              ? `Line ${firstLeg.line || ""}`
                              : `${firstLeg.line || ""} → ${transitLegs[1]?.line || ""}`;
                            const routeSub = cand.route_type === "direct"
                              ? `Direct · ${cand.total_duration_min || "—"} min`
                              : `Transfer at ${cand.legs?.find(l => l.type === "transfer")?.stop?.stop_name || transitLegs[0]?.to_stop?.stop_name || "interchange"} · ${cand.total_duration_min || "—"} min total`;
                            const isActive = idx === activeRouteIdx;
                            const walkM = (cand.walk_to_stop_m || 0) + (cand.walk_from_stop_m || 0);

                            return (
                              <div key={`route-${idx}`} className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                                isActive
                                  ? "border-indigo-500/60 shadow-[0_0_14px_rgba(99,102,241,.18)] bg-indigo-500/5 dark:bg-indigo-500/8"
                                  : "border-slate-100/50 dark:border-slate-800/20 bg-white/60 dark:bg-slate-950/30"
                              }`}>
                                {/* Compact header — always visible */}
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setActiveRouteIdx(idx)}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveRouteIdx(idx); }}}
                                  className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 shrink-0">
                                      <Bus size={12} className="text-indigo-600 dark:text-indigo-400" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{routeTitle}</div>
                                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{routeSub}</div>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                                    {minStr && <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{minStr}</div>}
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {(cand.departure_time || firstLeg.departure_time || "--:--").slice(0,5)} – {(cand.arrival_time || lastLeg.arrival_time || "--:--").slice(0,5)}
                                    </div>
                                    {walkM > 0 && <div className="text-[9px] text-slate-400">🚶 {walkM}m</div>}
                                  </div>
                                </div>

                                {/* Expanded detail — only for active card */}
                                {isActive && (
                                  <div className="border-t border-slate-100/60 dark:border-slate-800/30 px-3 pb-3 pt-2.5 relative pl-7 space-y-3 text-xs text-slate-600 dark:text-slate-400">
                                    <div className="absolute left-[18px] top-3 bottom-3 w-0.5 border-l border-dashed border-slate-200 dark:border-slate-800" />
                                    {cand.legs?.map((leg, legIdx) => {
                                      if (leg.type === "walk") {
                                        return (
                                          <div key={legIdx} className="relative flex items-start gap-2">
                                            <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full border border-slate-400 bg-white dark:bg-slate-900 z-10" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-slate-500 truncate">{legIdx === 0 ? "Walk to transit" : "Walk to destination"}</span>
                                                <span className="text-[10px] text-slate-400 shrink-0">{leg.duration_min} min</span>
                                              </div>
                                              <div className="text-[10px] text-slate-400 mt-0.5">Walk {leg.distance_m} m to {leg.to?.stop_name || "destination"}</div>
                                            </div>
                                          </div>
                                        );
                                      } else if (leg.type === "transit") {
                                        return (
                                          <React.Fragment key={legIdx}>
                                            <div className="relative flex items-start gap-2">
                                              <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full border border-indigo-500 bg-white dark:bg-slate-900 z-10" />
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">Board Line {leg.line} at {leg.from_stop?.stop_name}</span>
                                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">Dep {(leg.departure_time||"--:--").slice(0,5)}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">to direction {leg.headsign || "—"} (Code: {leg.from_stop?.stop_code || "N/A"})</div>
                                              </div>
                                            </div>
                                            <div className="relative flex items-start gap-2">
                                              <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full border border-rose-500 bg-white dark:bg-slate-900 z-10" />
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">Alight at {leg.to_stop?.stop_name}</span>
                                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">Arr {(leg.arrival_time||"--:--").slice(0,5)}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">Ride duration: {leg.duration_min} min (Code: {leg.to_stop?.stop_code || "N/A"})</div>
                                              </div>
                                            </div>
                                          </React.Fragment>
                                        );
                                      } else if (leg.type === "transfer") {
                                        return (
                                          <div key={legIdx} className="relative flex items-start gap-2">
                                            <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full border border-amber-500 bg-white dark:bg-slate-900 z-10" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-amber-600 dark:text-amber-400">Transfer Point</span>
                                                <span className="text-[10px] text-amber-500 font-semibold shrink-0">{leg.duration_min} min wait</span>
                                              </div>
                                              <div className="text-[10px] text-slate-400 mt-0.5">{leg.details} at {leg.stop?.stop_name}</div>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,.05)]">
                      <span>Route suggestions coming next.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lower full-width map row */}
      <div className="w-full mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex flex-col gap-2">
        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
          Transit Map
        </div>
        <div className={`relative h-[320px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/20 shadow-inner ${mapPinMode ? "ring-2 ring-offset-1 " + (mapPinMode === "from" ? "ring-indigo-500" : "ring-rose-500") : ""}`}
          style={mapPinMode ? { cursor: "crosshair" } : {}}>
          {mapPinMode && (
            <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-[10px] font-bold text-white shadow-lg pointer-events-none ${mapPinMode === "from" ? "bg-indigo-500" : "bg-rose-500"}`}>
              {mapPinMode === "from" ? "Click to set origin" : "Click to set destination"}
            </div>
          )}
          <MapContainer
            center={[45.0705, 7.6868]}
            zoom={13}
            style={{
              height: "100%",
              width: "100%",
              zIndex: 10,
              filter: isDark ? "brightness(0.82) contrast(1.03) saturate(0.9)" : "none"
            }}
          >
            <MapController
              selectedStop={selectedStop}
              searchResults={searchResults}
              nearbyStops={nearbyStops}
              userLocation={userLocation}
              tripFrom={tripFrom}
              tripTo={tripTo}
              activeRoute={activeRoute}
            />
            <MapClickHandler
              mapPinMode={mapPinMode}
              setMapPinMode={setMapPinMode}
              setTripFrom={setTripFrom}
              setTripTo={setTripTo}
              setPendingTo={setPendingTo}
            />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {/* Active route overlay: dashed walking legs + solid transit legs */}
            {activeRoute && tripFrom && tripTo && (
              <>
                {activeRouteWalkSegments.map((segment) => (
                  <Polyline
                    key={segment.key}
                    positions={[segment.from, segment.to]}
                    pathOptions={{
                      color: segment.color,
                      weight: 3,
                      opacity: 0.9,
                      dashArray: "6 8"
                    }}
                  />
                ))}

                {activeRouteTransitLegs.map((leg, idx) => {
                  const isMetroLine = (line) => {
                    const normalized = String(line || "").trim().toUpperCase();
                    return normalized === "M1" || normalized === "M1S";
                  };

                  const metroLine = isMetroLine(leg.line);
                  const color = metroLine ? "#ef4444" : (idx % 2 === 0 ? "#6366f1" : "#10b981");

                  // Metro: draw only a clean straight station-to-station segment.
                  // Bus/tram: keep GTFS shape geometry when available.
                  let positions = null;
                  let pathStops = []; // only for stop-sequence fallback (has name info)

                  if (
                    metroLine &&
                    leg.from_stop?.stop_lat &&
                    leg.from_stop?.stop_lon &&
                    leg.to_stop?.stop_lat &&
                    leg.to_stop?.stop_lon
                  ) {
                    positions = [
                      [Number(leg.from_stop.stop_lat), Number(leg.from_stop.stop_lon)],
                      [Number(leg.to_stop.stop_lat), Number(leg.to_stop.stop_lon)]
                    ];
                    pathStops = [];
                  } else if (leg.path_shape_points && leg.path_shape_points.length > 1) {
                    // GTFS shapes — pure [lat, lon] pairs, no stop names
                    positions = leg.path_shape_points.map((pt) => [Number(pt[0]), Number(pt[1])]);
                  } else if (leg.path_points && leg.path_points.length > 1) {
                    // Stop sequence fallback — [lat, lon, name, code, time]
                    positions = leg.path_points.map((pt) => [Number(pt[0]), Number(pt[1])]);
                    pathStops = leg.path_points;
                  } else if (leg.from_stop?.stop_lat && leg.to_stop?.stop_lat) {
                    positions = [
                      [Number(leg.from_stop.stop_lat), Number(leg.from_stop.stop_lon)],
                      [Number(leg.to_stop.stop_lat), Number(leg.to_stop.stop_lon)]
                    ];
                  }

                  if (!positions) return null;

                  // Intermediate stop markers only for non-metro stop-sequence fallback (has names)
                  const intermediateStops = metroLine ? [] : pathStops.slice(1, -1);

                  return (
                    <React.Fragment key={`transit-route-${idx}`}>
                      <Polyline
                        positions={positions}
                        pathOptions={{ color, weight: metroLine ? 6 : 5, opacity: 0.95 }}
                      />
                      {intermediateStops.map((pt, pIdx) => {
                        const lat = Number(pt[0]);
                        const lon = Number(pt[1]);
                        const stopName = pt[2] || null;
                        const stopCode = pt[3] || null;
                        const arrTime  = pt[4] || null;
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                        return (
                          <CircleMarker
                            key={`path-stop-${idx}-${pIdx}`}
                            center={[lat, lon]}
                            radius={4}
                            color="#ffffff"
                            fillColor={color}
                            fillOpacity={0.9}
                            weight={1.5}
                          >
                            {stopName && (
                              <Popup>
                                <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{stopName}</div>
                                {stopCode && <div className="text-[9px] text-slate-400">Code: {stopCode}</div>}
                                {arrTime && <div className="text-[9px] text-slate-400">Line {leg.line} · {arrTime.slice(0,5)}</div>}
                              </Popup>
                            )}
                          </CircleMarker>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </>
            )}

            {/* Small stop dots along the active route — from path_points (always has stop names/times) */}
            {activeRoute && Array.isArray(activeRoute.legs) && activeRoute.legs
              .filter(leg => leg.type === "transit")
              .map((leg, idx) => {
                const isMetroLine = (line) => {
                  const normalized = String(line || "").trim().toUpperCase();
                  return normalized === "M1" || normalized === "M1S";
                };
                if (isMetroLine(leg.line)) return null;
                const color = idx % 2 === 0 ? "#6366f1" : "#10b981";
                // path_points always has [lat, lon, name, code, time] — use for stop dots regardless of shape
                if (!leg.path_points || leg.path_points.length < 3) return null;
                return leg.path_points.slice(1, -1).map((pt, pIdx) => {
                  const lat = Number(pt[0]);
                  const lon = Number(pt[1]);
                  const name = pt[2];
                  const code = pt[3];
                  const time = pt[4];
                  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                  return (
                    <CircleMarker
                      key={`stop-dot-${idx}-${pIdx}`}
                      center={[lat, lon]}
                      radius={4}
                      color="#ffffff"
                      fillColor={color}
                      fillOpacity={1}
                      weight={1.5}
                    >
                      <Popup>
                        <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{name || "Stop"}</div>
                        {code && <div className="text-[9px] text-slate-400">Code: {code}</div>}
                        {time && <div className="text-[9px] text-slate-400">Line {leg.line} · {String(time).slice(0,5)}</div>}
                      </Popup>
                    </CircleMarker>
                  );
                });
              })}

            {/* Boarding, transfer, and alighting stop markers for the active route */}
            {activeRouteTransitLegs.map((leg, idx) => (
              <React.Fragment key={`active-route-markers-${idx}`}>
                {leg.from_stop?.stop_lat && leg.from_stop?.stop_lon && (
                  <CircleMarker
                    center={[Number(leg.from_stop.stop_lat), Number(leg.from_stop.stop_lon)]}
                    radius={10}
                    color="#ffffff"
                    fillColor={idx === 0 ? "#6366f1" : "#10b981"}
                    fillOpacity={1}
                    weight={2}
                  >
                    <Popup>
                      <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                        {idx === 0 ? "Board here" : "Transfer here"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">{leg.from_stop.stop_name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Line {leg.line} · Dep {leg.departure_time?.slice(0, 5)}</div>
                    </Popup>
                  </CircleMarker>
                )}
                {leg.to_stop?.stop_lat && leg.to_stop?.stop_lon && (
                  <CircleMarker
                    center={[Number(leg.to_stop.stop_lat), Number(leg.to_stop.stop_lon)]}
                    radius={10}
                    color="#ffffff"
                    fillColor={idx === activeRouteTransitLegs.length - 1 ? "#f43f5e" : "#10b981"}
                    fillOpacity={1}
                    weight={2}
                  >
                    <Popup>
                      <div className="text-xs font-bold text-rose-700 dark:text-rose-400">
                        {idx === activeRouteTransitLegs.length - 1 ? "Get off here" : "Transfer stop"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">{leg.to_stop.stop_name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Arr {leg.arrival_time?.slice(0, 5)}</div>
                    </Popup>
                  </CircleMarker>
                )}
              </React.Fragment>
            ))}

            {/* Transfer stop marker if route includes transfer leg */}
            {activeRoute && Array.isArray(activeRoute.legs) && activeRoute.legs.map((leg, idx) => {
              if (leg.type === "transfer" && leg.stop?.stop_lat && leg.stop?.stop_lon) {
                return (
                  <CircleMarker
                    key={`transfer-marker-${idx}`}
                    center={[Number(leg.stop.stop_lat), Number(leg.stop.stop_lon)]}
                    radius={10}
                    color="#ffffff"
                    fillColor="#f59e0b" // orange/amber for transfer
                    fillOpacity={1}
                    weight={2}
                  >
                    <Popup>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-500">
                        Transfer Point
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">{leg.stop.stop_name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{leg.details} · {leg.duration_min} min wait</div>
                    </Popup>
                  </CircleMarker>
                );
              }
              return null;
            })}

            {/* User location marker */}
            {userLocation && (
              <>
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={18}
                  color="#3b82f6"
                  fillColor="#3b82f6"
                  fillOpacity={0.15}
                  weight={1}
                />
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={6}
                  color="#ffffff"
                  fillColor="#3b82f6"
                  fillOpacity={1}
                  weight={2}
                >
                  <Popup>
                    <div className="text-xs font-bold text-slate-800">Your Location</div>
                  </Popup>
                </CircleMarker>
              </>
            )}

            {/* Origin (From) marker */}
            {tripFrom && tripFrom.lat && tripFrom.lon && (
              <CircleMarker
                center={[Number(tripFrom.lat), Number(tripFrom.lon)]}
                radius={9}
                color="#ffffff"
                fillColor="#6366f1"
                fillOpacity={0.95}
                weight={2}
              >
                <Popup>
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">Origin (From)</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{tripFrom.label}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 capitalize">Type: {tripFrom.type}</div>
                </Popup>
              </CircleMarker>
            )}

            {/* Destination (To) marker */}
            {tripTo && tripTo.lat && tripTo.lon && (
              <CircleMarker
                center={[Number(tripTo.lat), Number(tripTo.lon)]}
                radius={9}
                color="#ffffff"
                fillColor="#f43f5e"
                fillOpacity={0.95}
                weight={2}
              >
                <Popup>
                  <div className="text-xs font-bold text-rose-700 dark:text-rose-400">Destination (To)</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{tripTo.label}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 capitalize">Type: {tripTo.type}</div>
                </Popup>
              </CircleMarker>
            )}

            {/* Pending destination preview marker */}
            {pendingTo && pendingTo.lat && pendingTo.lon && (
              <CircleMarker
                center={[Number(pendingTo.lat), Number(pendingTo.lon)]}
                radius={9}
                color="#f43f5e"
                fillColor="#f43f5e"
                fillOpacity={0.5}
                weight={2.5}
                dashArray="4 3"
              >
                <Popup>
                  <div className="text-xs font-bold text-rose-600">Pending destination</div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{pendingTo.label}</div>
                  <div className="text-[9px] text-slate-400 mt-1">Confirm in the planner panel</div>
                </Popup>
              </CircleMarker>
            )}

            {/* Selected Stop marker */}
            {selectedStop && selectedStop.stop_lat && selectedStop.stop_lon && (
              <CircleMarker
                center={[Number(selectedStop.stop_lat), Number(selectedStop.stop_lon)]}
                radius={9}
                color="#ffffff"
                fillColor="#6366f1"
                fillOpacity={0.9}
                weight={2}
              >
                <Popup>
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">{selectedStop.stop_name}</div>
                  <div className="text-[10px] text-slate-500 mb-1.5">Selected stop (arrivals loaded)</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTripFrom({
                          type: "stop",
                          label: selectedStop.stop_name,
                          lat: Number(selectedStop.stop_lat),
                          lon: Number(selectedStop.stop_lon),
                          stop_id: selectedStop.stop_id
                        });
                        setActiveTab("planner");
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-colors"
                    >
                      Set From
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTripTo({
                          type: "stop",
                          label: selectedStop.stop_name,
                          lat: Number(selectedStop.stop_lat),
                          lon: Number(selectedStop.stop_lon),
                          stop_id: selectedStop.stop_id
                        });
                        setActiveTab("planner");
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                    >
                      Set To
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            )}

            {/* Nearby stops markers */}
            {userLocation && nearbyStops
              .filter(stop => stop.stop_id !== selectedStop?.stop_id)
              .map((stop, idx) => {
                const lat = Number(stop.stop_lat);
                const lon = Number(stop.stop_lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

                return (
                  <CircleMarker
                    key={`nearby-marker-${stop.stop_id || idx}`}
                    center={[lat, lon]}
                    radius={7}
                    color="#ffffff"
                    fillColor="#10b981"
                    fillOpacity={0.8}
                    weight={1.5}
                    eventHandlers={{
                      click: () => {
                        setSelectedStop(stop);
                      }
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{stop.stop_name}</div>
                      <div className="text-[10px] text-slate-500 mb-1.5">
                        Distance: {formatDistance(stop.distance_m / 1000)}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTripFrom({
                              type: "stop",
                              label: stop.stop_name,
                              lat: lat,
                              lon: lon,
                              stop_id: stop.stop_id
                            });
                            setActiveTab("planner");
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-colors"
                        >
                          Set From
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTripTo({
                              type: "stop",
                              label: stop.stop_name,
                              lat: lat,
                              lon: lon,
                              stop_id: stop.stop_id
                            });
                            setActiveTab("planner");
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                        >
                          Set To
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

            {/* Search results markers */}
            {sortedSearchResults
              .filter(stop => stop.stop_id !== selectedStop?.stop_id && !nearbyStops.some(ns => ns.stop_id === stop.stop_id))
              .map((stop, idx) => {
                const lat = Number(stop.stop_lat);
                const lon = Number(stop.stop_lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

                return (
                  <CircleMarker
                    key={`search-marker-${stop.stop_id || idx}`}
                    center={[lat, lon]}
                    radius={7}
                    color="#ffffff"
                    fillColor="#64748b"
                    fillOpacity={0.8}
                    weight={1.5}
                    eventHandlers={{
                      click: () => {
                        setSelectedStop(stop);
                      }
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{stop.stop_name}</div>
                      {stop.distance !== undefined && stop.distance !== Infinity && (
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mb-1.5">
                          Distance: {formatDistance(stop.distance)}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTripFrom({
                              type: "stop",
                              label: stop.stop_name,
                              lat: lat,
                              lon: lon,
                              stop_id: stop.stop_id
                            });
                            setActiveTab("planner");
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-colors"
                        >
                          Set From
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTripTo({
                              type: "stop",
                              label: stop.stop_name,
                              lat: lat,
                              lon: lon,
                              stop_id: stop.stop_id
                            });
                            setActiveTab("planner");
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                        >
                          Set To
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>

          {/* Map legend overlay */}
          <div className="absolute top-2 right-2 z-[400] flex flex-col gap-1.5 pointer-events-none">
            <div className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-white/95 dark:bg-slate-900/90 border border-slate-200/60 dark:border-slate-800/80 shadow-md flex flex-col gap-1">
              {userLocation && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">You</span>
                </div>
              )}
              {selectedStop && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">Selected Stop</span>
                </div>
              )}
              {userLocation && nearbyStops.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">Nearby Stops</span>
                </div>
              )}
              {sortedSearchResults.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">Search Results</span>
                </div>
              )}
              {tripFrom && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">Origin</span>
                </div>
              )}
              {tripTo && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  <span className="text-slate-600 dark:text-slate-300">Destination</span>
                </div>
              )}
              {activeRoute && (
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-indigo-500 inline-block rounded-full" />
                  <span className="text-slate-600 dark:text-slate-300">Active Route</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
