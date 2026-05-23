// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
/**
 * sync-gtt-stops.cjs
 * Local script to parse stops and schedules from GTT GTFS static data and upload to Supabase.
 * 
 * Usage:
 *   node scripts/sync-gtt-stops.cjs [--dry-run]
 *   node scripts/sync-gtt-stops.cjs --sync-schedules-mvp [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Load environment variables (from process.env or .env file if present)
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  const dotenvContent = fs.readFileSync(dotenvPath, 'utf8');
  dotenvContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isDryRun = process.argv.includes('--dry-run');
const isSyncSchedulesMvp = process.argv.includes('--sync-schedules-mvp');
const isSyncSchedulesFull = process.argv.includes('--sync-schedules-full');
const isSyncTripSequences = process.argv.includes('--sync-trip-sequences');
const isSyncTripShapes = process.argv.includes('--sync-trip-shapes');

console.log('--- GTT Synchronization Script ---');
console.log(`Mode: ${isDryRun ? 'DRY-RUN (No data will be uploaded)' : 'LIVE-UPDATE'}`);
let targetName = 'Stops Only';
if (isSyncSchedulesFull) targetName = 'Schedules Full (All Stops)';
else if (isSyncSchedulesMvp) targetName = 'Schedules MVP (Stops 6 & 367)';
else if (isSyncTripSequences) targetName = 'Trip Stop Sequences';
else if (isSyncTripShapes) targetName = 'Trip Shapes (shape_id-based)';
console.log(`Target: ${targetName}`);


if (!isDryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.');
  process.exit(1);
}

// 1. Locate/extract GTFS files
let stopsPath = path.join(__dirname, '..', 'scratch', 'gtt_gtfs_extracted', 'stops.txt');
// Fallback to local project directory search if not in specific workspace brain path
if (!fs.existsSync(stopsPath)) {
  stopsPath = path.join(__dirname, '..', 'scratch', 'gtt_gtfs_extracted', 'stops.txt');
}

let gtfsDir = '';

if (!fs.existsSync(stopsPath)) {
  console.log(`Stops file not found at ${stopsPath}.`);
  console.log('Attempting to download and extract GTFS zip...');
  
  const httpsUrl = 'https://www.gtt.to.it/open_data/gtt_gtfs.zip';
  const httpUrl = 'http://www.gtt.to.it/open_data/gtt_gtfs.zip';
  const tempDir = path.join(__dirname, '..', 'temp_gtfs');
  const zipPath = path.join(tempDir, 'gtt_gtfs.zip');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    if (process.platform === 'win32') {
      console.log('Running on Windows. Downloading with curl.exe...');
      execSync(`curl.exe -k -L -o "${zipPath}" "${httpsUrl}"`);
      console.log(`Successfully downloaded GTFS zip from: ${httpsUrl}`);
      console.log('Extracting with PowerShell Expand-Archive...');
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`);
    } else {
      console.log(`Running on ${process.platform}. Downloading with curl...`);
      let downloadSucceeded = false;
      let usedUrl = '';
      
      try {
        console.log(`Attempting HTTPS download from: ${httpsUrl}`);
        execSync(`curl --fail --location --retry 5 --retry-delay 10 --retry-all-errors --connect-timeout 20 --max-time 180 --http1.1 -A "Mozilla/5.0 (compatible; NavidCityDashboard/1.0)" -o "${zipPath}" "${httpsUrl}"`);
        downloadSucceeded = true;
        usedUrl = httpsUrl;
      } catch (httpsErr) {
        console.warn(`HTTPS download failed: ${httpsErr.message}. Retrying with fallback HTTP...`);
        try {
          console.log(`Attempting HTTP download from: ${httpUrl}`);
          execSync(`curl --fail --location --retry 5 --retry-delay 10 --retry-all-errors --connect-timeout 20 --max-time 180 --http1.1 -A "Mozilla/5.0 (compatible; NavidCityDashboard/1.0)" -o "${zipPath}" "${httpUrl}"`);
          downloadSucceeded = true;
          usedUrl = httpUrl;
        } catch (httpErr) {
          throw new Error(`Both HTTPS and HTTP download attempts failed. HTTPS error: ${httpsErr.message}. HTTP error: ${httpErr.message}`);
        }
      }
      
      if (downloadSucceeded) {
        console.log(`Successfully downloaded GTFS zip from: ${usedUrl}`);
      }
      console.log('Extracting with unzip...');
      execSync(`unzip -o "${zipPath}" -d "${tempDir}"`);
    }
    stopsPath = path.join(tempDir, 'stops.txt');
    gtfsDir = tempDir;
    console.log(`GTFS directory established at: ${gtfsDir}`);
  } catch (err) {
    console.error('Failed to download/extract GTT GTFS:', err.message);
    process.exit(1);
  }
} else {
  gtfsDir = path.dirname(stopsPath);
  console.log(`Using existing GTFS files in directory: ${gtfsDir}`);
}

// Custom CSV parser handling quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// General function to upload a batch to Supabase with retries and exponential backoff
async function uploadTableBatch(tableName, batch) {
  const maxAttempts = 3;
  const backoffDelays = [5000, 15000, 30000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const postData = JSON.stringify(batch);
        const urlObj = new URL(`${SUPABASE_URL}/rest/v1/${tableName}`);
        
        const options = {
          method: 'POST',
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Content-Profile': 'api',
            'Prefer': 'resolution=merge-duplicates'
          }
        };
        
        const req = https.request(options, (res) => {
          let responseBody = '';
          res.on('data', chunk => responseBody += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode} - ${responseBody}`));
            }
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.write(postData);
        req.end();
      });
      return; // Success, exit attempt loop
    } catch (err) {
      console.warn(`  [Attempt ${attempt}/${maxAttempts}] Failed upload to ${tableName}: ${err.message}`);
      if (attempt === maxAttempts) {
        throw new Error(`Failed upload to ${tableName} after ${maxAttempts} attempts: ${err.message}`);
      }
      const delayMs = backoffDelays[attempt - 1] || 5000;
      console.log(`  Waiting ${delayMs / 1000}s before retrying...`);
      await delay(delayMs);
    }
  }
}

// Helper function to clear all staging tables via RPC
async function clearStagingTables() {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${SUPABASE_URL}/rest/v1/rpc/clear_gtt_schedule_staging`);
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Profile': 'api',
        'Content-Profile': 'api'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseBody));
          } catch (e) {
            resolve(responseBody);
          }
        } else {
          reject(new Error(`Failed to clear staging tables: HTTP ${res.statusCode} - ${responseBody}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(JSON.stringify({}));
    req.end();
  });
}

// Helper function to invoke atomic swap RPC
async function invokeSwapRpc() {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${SUPABASE_URL}/rest/v1/rpc/swap_gtt_schedule_tables`);
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'api'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseBody));
          } catch (e) {
            resolve(responseBody);
          }
        } else {
          reject(new Error(`Failed to invoke swap RPC: HTTP ${res.statusCode} - ${responseBody}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(JSON.stringify({}));
    req.end();
  });
}

// ----------------------------------------------------
// Mode A: Sync stops
// ----------------------------------------------------
async function runStopsSync() {
  console.log('Parsing stops.txt...');
  const content = fs.readFileSync(stopsPath, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length < 2) {
    console.error('Error: stops.txt is empty or invalid.');
    process.exit(1);
  }
  
  const headers = parseCSVLine(lines[0]);
  const stopIdIdx = headers.indexOf('stop_id');
  const stopCodeIdx = headers.indexOf('stop_code');
  const stopNameIdx = headers.indexOf('stop_name');
  const stopLatIdx = headers.indexOf('stop_lat');
  const stopLonIdx = headers.indexOf('stop_lon');
  const zoneIdIdx = headers.indexOf('zone_id');
  const locTypeIdx = headers.indexOf('location_type');
  const parentStationIdx = headers.indexOf('parent_station');
  
  if (stopIdIdx === -1 || stopNameIdx === -1) {
    console.error('Error: Required headers stop_id and stop_name not found in stops.txt.');
    process.exit(1);
  }
  
  const stops = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = parseCSVLine(line);
    if (parts.length < headers.length) continue;
    
    const stopId = parts[stopIdIdx];
    const stopCode = stopCodeIdx !== -1 ? parts[stopCodeIdx] : null;
    const stopName = parts[stopNameIdx];
    const stopLat = stopLatIdx !== -1 && parts[stopLatIdx] ? parseFloat(parts[stopLatIdx]) : null;
    const stopLon = stopLonIdx !== -1 && parts[stopLonIdx] ? parseFloat(parts[stopLonIdx]) : null;
    const zoneId = zoneIdIdx !== -1 ? parts[zoneIdIdx] : null;
    const locationType = locTypeIdx !== -1 ? parts[locTypeIdx] : null;
    const parentStation = parentStationIdx !== -1 ? parts[parentStationIdx] : null;
    
    if (!stopId || !stopName) continue;
    
    stops.push({
      stop_id: stopId,
      stop_code: stopCode || null,
      stop_name: stopName,
      stop_lat: isNaN(stopLat) ? null : stopLat,
      stop_lon: isNaN(stopLon) ? null : stopLon,
      zone_id: zoneId || null,
      location_type: locationType || null,
      parent_station: parentStation || null
    });
  }
  
  console.log(`Parsed ${stops.length} stops from stops.txt.`);
  
  if (isDryRun) {
    console.log('\n--- DRY RUN SUMMARY ---');
    console.log(`Parsed stops: ${stops.length}`);
    console.log('Sample Stop Record:', JSON.stringify(stops[0], null, 2));
    console.log('No data was uploaded.');
    process.exit(0);
  }
  
  const batchSize = 1000;
  const totalBatches = Math.ceil(stops.length / batchSize);
  console.log(`Uploading stops in ${totalBatches} batches...`);
  
  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, stops.length);
    const batch = stops.slice(start, end);
    try {
      await uploadTableBatch('gtt_stops', batch);
      console.log(`  Uploaded batch ${i + 1}/${totalBatches}`);
    } catch (err) {
      console.error(`Upload failed: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('Stops synchronization completed successfully!');
}

// ----------------------------------------------------
// Mode B: Sync schedules (MVP only)
// ----------------------------------------------------
async function runSchedulesSyncMvp() {
  const tripsPath = path.join(gtfsDir, 'trips.txt');
  const routesPath = path.join(gtfsDir, 'routes.txt');
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
  const calendarPath = path.join(gtfsDir, 'calendar.txt');
  const calendarDatesPath = path.join(gtfsDir, 'calendar_dates.txt');
  
  const requiredFiles = [tripsPath, routesPath, stopTimesPath, calendarPath, calendarDatesPath];
  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      console.error(`Error: Required GTFS file not found for schedules sync: ${f}`);
      process.exit(1);
    }
  }
  
  // 1. Read routes
  console.log('Parsing routes.txt...');
  const routesContent = fs.readFileSync(routesPath, 'utf8');
  const routesLines = routesContent.split('\n');
  const routesHeaders = parseCSVLine(routesLines[0]);
  const rRouteIdIdx = routesHeaders.indexOf('route_id');
  const rShortNameIdx = routesHeaders.indexOf('route_short_name');
  
  const routesMap = {};
  for (let i = 1; i < routesLines.length; i++) {
    const line = routesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < routesHeaders.length) continue;
    routesMap[parts[rRouteIdIdx]] = parts[rShortNameIdx] || '';
  }
  
  // 2. Read trips
  console.log('Parsing trips.txt...');
  const tripsContent = fs.readFileSync(tripsPath, 'utf8');
  const tripsLines = tripsContent.split('\n');
  const tripsHeaders = parseCSVLine(tripsLines[0]);
  const tTripIdIdx = tripsHeaders.indexOf('trip_id');
  const tRouteIdIdx = tripsHeaders.indexOf('route_id');
  const tServiceIdIdx = tripsHeaders.indexOf('service_id');
  const tHeadsignIdx = tripsHeaders.indexOf('trip_headsign');
  
  const tripsMap = {};
  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < tripsHeaders.length) continue;
    tripsMap[parts[tTripIdIdx]] = {
      route_id: parts[tRouteIdIdx],
      service_id: parts[tServiceIdIdx],
      trip_headsign: parts[tHeadsignIdx] || ''
    };
  }
  
  // 3. Read stop_times, filtering for selected stop IDs: '6' and '367'
  console.log('Filtering stop_times.txt for stop_id 6 and 367...');
  const stopTimesContent = fs.readFileSync(stopTimesPath, 'utf8');
  const stopTimesLines = stopTimesContent.split('\n');
  const stopTimesHeaders = parseCSVLine(stopTimesLines[0]);
  const stStopIdIdx = stopTimesHeaders.indexOf('stop_id');
  const stTripIdIdx = stopTimesHeaders.indexOf('trip_id');
  const stArrTimeIdx = stopTimesHeaders.indexOf('arrival_time');
  const stSeqIdx = stopTimesHeaders.indexOf('stop_sequence');
  
  const targetStops = new Set(['6', '367']);
  const scheduleData = { '6': [], '367': [] };
  const usedServiceIds = new Set();
  
  for (let i = 1; i < stopTimesLines.length; i++) {
    const line = stopTimesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < stopTimesHeaders.length) continue;
    
    const stopId = parts[stStopIdIdx];
    if (targetStops.has(stopId)) {
      const tripId = parts[stTripIdIdx];
      const arrivalTime = parts[stArrTimeIdx];
      const stopSequence = parseInt(parts[stSeqIdx]);
      
      const trip = tripsMap[tripId];
      if (!trip) continue;
      
      usedServiceIds.add(trip.service_id);
      const lineName = routesMap[trip.route_id] || '';
      
      scheduleData[stopId].push([
        tripId,
        stopSequence,
        arrivalTime,
        lineName,
        trip.trip_headsign,
        trip.service_id
      ]);
    }
  }
  
  // 4. Read calendar.txt, keeping only the 10 used service IDs
  console.log('Filtering calendar.txt for used service IDs...');
  const calendarContent = fs.readFileSync(calendarPath, 'utf8');
  const calendarLines = calendarContent.split('\n');
  const calendarHeaders = parseCSVLine(calendarLines[0]);
  const cServiceIdIdx = calendarHeaders.indexOf('service_id');
  const cMonIdx = calendarHeaders.indexOf('monday');
  const cTueIdx = calendarHeaders.indexOf('tuesday');
  const cWedIdx = calendarHeaders.indexOf('wednesday');
  const cThuIdx = calendarHeaders.indexOf('thursday');
  const cFriIdx = calendarHeaders.indexOf('friday');
  const cSatIdx = calendarHeaders.indexOf('saturday');
  const cSunIdx = calendarHeaders.indexOf('sunday');
  const cStartIdx = calendarHeaders.indexOf('start_date');
  const cEndIdx = calendarHeaders.indexOf('end_date');
  
  const calendarsToUpload = [];
  for (let i = 1; i < calendarLines.length; i++) {
    const line = calendarLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < calendarHeaders.length) continue;
    
    const serviceId = parts[cServiceIdIdx];
    if (usedServiceIds.has(serviceId)) {
      calendarsToUpload.push({
        service_id: serviceId,
        monday: parts[cMonIdx] === '1',
        tuesday: parts[cTueIdx] === '1',
        wednesday: parts[cWedIdx] === '1',
        thursday: parts[cThuIdx] === '1',
        friday: parts[cFriIdx] === '1',
        saturday: parts[cSatIdx] === '1',
        sunday: parts[cSunIdx] === '1',
        start_date: parts[cStartIdx],
        end_date: parts[cEndIdx]
      });
    }
  }
  
  // 5. Read calendar_dates.txt, keeping only the 10 used service IDs
  console.log('Filtering calendar_dates.txt for used service IDs...');
  const calendarDatesContent = fs.readFileSync(calendarDatesPath, 'utf8');
  const calendarDatesLines = calendarDatesContent.split('\n');
  const calendarDatesHeaders = parseCSVLine(calendarDatesLines[0]);
  const cdServiceIdIdx = calendarDatesHeaders.indexOf('service_id');
  const cdDateIdx = calendarDatesHeaders.indexOf('date');
  const cdExceptionIdx = calendarDatesHeaders.indexOf('exception_type');
  
  const calendarDatesToUpload = [];
  for (let i = 1; i < calendarDatesLines.length; i++) {
    const line = calendarDatesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < calendarDatesHeaders.length) continue;
    
    const serviceId = parts[cdServiceIdIdx];
    if (usedServiceIds.has(serviceId)) {
      calendarDatesToUpload.push({
        service_id: serviceId,
        date: parts[cdDateIdx],
        exception_type: parseInt(parts[cdExceptionIdx])
      });
    }
  }
  
  // Prepare database rows
  const scheduleRows = [
    { stop_id: '6', schedule: scheduleData['6'] },
    { stop_id: '367', schedule: scheduleData['367'] }
  ];
  
  // Calculate size estimates
  const scheduleSizeKB = Math.round(JSON.stringify(scheduleRows).length / 1024);
  const calendarSizeKB = Math.round(JSON.stringify(calendarsToUpload).length / 1024);
  const calendarDatesSizeKB = Math.round(JSON.stringify(calendarDatesToUpload).length / 1024);
  const totalSizeKB = scheduleSizeKB + calendarSizeKB + calendarDatesSizeKB;
  
  console.log('\n--- MVP SCHEDULES ANALYSIS ---');
  console.log(`Stop 6 schedule entries: ${scheduleData['6'].length}`);
  console.log(`Stop 367 schedule entries: ${scheduleData['367'].length}`);
  console.log(`Referenced unique service IDs: ${usedServiceIds.size}`);
  console.log(`Calendar rows to upload: ${calendarsToUpload.length}`);
  console.log(`Calendar exceptions to upload: ${calendarDatesToUpload.length}`);
  console.log(`Estimated database upload size: ~${totalSizeKB} KB`);
  console.log(`  - api.gtt_stop_schedules: ~${scheduleSizeKB} KB (2 rows)`);
  console.log(`  - api.gtt_calendar: ~${calendarSizeKB} KB (${calendarsToUpload.length} rows)`);
  console.log(`  - api.gtt_calendar_dates: ~${calendarDatesSizeKB} KB (${calendarDatesToUpload.length} rows)`);
  
  if (isDryRun) {
    console.log('\nDry-run mode active. No data uploaded to Supabase.');
    process.exit(0);
  }
  
  console.log('\nUploading schedules and calendars to Supabase...');
  try {
    console.log('Uploading stop schedules...');
    await uploadTableBatch('gtt_stop_schedules', scheduleRows);
    
    console.log('Uploading calendars...');
    await uploadTableBatch('gtt_calendar', calendarsToUpload);
    
    console.log('Uploading calendar dates in batches...');
    const batchSize = 1000;
    for (let i = 0; i < calendarDatesToUpload.length; i += batchSize) {
      const batch = calendarDatesToUpload.slice(i, i + batchSize);
      await uploadTableBatch('gtt_calendar_dates', batch);
      console.log(`  Uploaded calendar dates batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(calendarDatesToUpload.length / batchSize)}`);
    }
    
    console.log('MVP schedules sync completed successfully!');
  } catch (err) {
    console.error(`Schedules sync failed: ${err.message}`);
    process.exit(1);
  }
}

// ----------------------------------------------------
// Mode C: Sync schedules (Full - Staging + Atomic Swap)
// ----------------------------------------------------
async function runSchedulesSyncFull() {

  const readline = require('readline');

  const tripsPath = path.join(gtfsDir, 'trips.txt');
  const routesPath = path.join(gtfsDir, 'routes.txt');
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
  const calendarPath = path.join(gtfsDir, 'calendar.txt');
  const calendarDatesPath = path.join(gtfsDir, 'calendar_dates.txt');
  
  const requiredFiles = [tripsPath, routesPath, stopTimesPath, calendarPath, calendarDatesPath];
  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      console.error(`Error: Required GTFS file not found for schedules sync: ${f}`);
      process.exit(1);
    }
  }
  
  // 1. Read routes
  console.log('Parsing routes.txt...');
  const routesContent = fs.readFileSync(routesPath, 'utf8');
  const routesLines = routesContent.split('\n');
  const routesHeaders = parseCSVLine(routesLines[0]);
  const rRouteIdIdx = routesHeaders.indexOf('route_id');
  const rShortNameIdx = routesHeaders.indexOf('route_short_name');
  
  const routesMap = {};
  for (let i = 1; i < routesLines.length; i++) {
    const line = routesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < routesHeaders.length) continue;
    routesMap[parts[rRouteIdIdx]] = parts[rShortNameIdx] || '';
  }
  
  // 2. Read trips
  console.log('Parsing trips.txt...');
  const tripsContent = fs.readFileSync(tripsPath, 'utf8');
  const tripsLines = tripsContent.split('\n');
  const tripsHeaders = parseCSVLine(tripsLines[0]);
  const tTripIdIdx = tripsHeaders.indexOf('trip_id');
  const tRouteIdIdx = tripsHeaders.indexOf('route_id');
  const tServiceIdIdx = tripsHeaders.indexOf('service_id');
  const tHeadsignIdx = tripsHeaders.indexOf('trip_headsign');
  
  const tripsMap = {};
  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < tripsHeaders.length) continue;
    tripsMap[parts[tTripIdIdx]] = {
      route_id: parts[tRouteIdIdx],
      service_id: parts[tServiceIdIdx],
      trip_headsign: parts[tHeadsignIdx] || ''
    };
  }
  
  // 3. Read stop_times line-by-line using streaming readline for memory safety
  console.log('Parsing stop_times.txt line-by-line...');
  const fileStream = fs.createReadStream(stopTimesPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isHeader = true;
  let stopTimesHeaders = [];
  let stStopIdIdx = -1;
  let stTripIdIdx = -1;
  let stArrTimeIdx = -1;
  let stSeqIdx = -1;

  const scheduleData = {};
  const usedServiceIds = new Set();
  const stopLinesSet = new Set();
  let totalEntries = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (isHeader) {
      stopTimesHeaders = parseCSVLine(trimmed);
      stStopIdIdx = stopTimesHeaders.indexOf('stop_id');
      stTripIdIdx = stopTimesHeaders.indexOf('trip_id');
      stArrTimeIdx = stopTimesHeaders.indexOf('arrival_time');
      stSeqIdx = stopTimesHeaders.indexOf('stop_sequence');
      isHeader = false;
      continue;
    }

    const parts = parseCSVLine(trimmed);
    if (parts.length < stopTimesHeaders.length) continue;

    const stopId = parts[stStopIdIdx];
    const tripId = parts[stTripIdIdx];
    const arrivalTime = parts[stArrTimeIdx];
    const stopSequence = parseInt(parts[stSeqIdx]);

    const trip = tripsMap[tripId];
    if (!trip) continue;

    usedServiceIds.add(trip.service_id);
    const lineName = routesMap[trip.route_id] || '';

    if (stopId && lineName) {
      stopLinesSet.add(`${stopId}\t${lineName}`);
    }

    if (!scheduleData[stopId]) {
      scheduleData[stopId] = [];
    }

    scheduleData[stopId].push([
      tripId,
      stopSequence,
      arrivalTime,
      lineName,
      trip.trip_headsign,
      trip.service_id
    ]);
    totalEntries++;
  }

  // 4. Read calendar.txt, keeping only the used service IDs
  console.log('Parsing and filtering calendar.txt...');
  const calendarContent = fs.readFileSync(calendarPath, 'utf8');
  const calendarLines = calendarContent.split('\n');
  const calendarHeaders = parseCSVLine(calendarLines[0]);
  const cServiceIdIdx = calendarHeaders.indexOf('service_id');
  const cMonIdx = calendarHeaders.indexOf('monday');
  const cTueIdx = calendarHeaders.indexOf('tuesday');
  const cWedIdx = calendarHeaders.indexOf('wednesday');
  const cThuIdx = calendarHeaders.indexOf('thursday');
  const cFriIdx = calendarHeaders.indexOf('friday');
  const cSatIdx = calendarHeaders.indexOf('saturday');
  const cSunIdx = calendarHeaders.indexOf('sunday');
  const cStartIdx = calendarHeaders.indexOf('start_date');
  const cEndIdx = calendarHeaders.indexOf('end_date');
  
  const calendarsToUpload = [];
  for (let i = 1; i < calendarLines.length; i++) {
    const line = calendarLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < calendarHeaders.length) continue;
    
    const serviceId = parts[cServiceIdIdx];
    if (usedServiceIds.has(serviceId)) {
      calendarsToUpload.push({
        service_id: serviceId,
        monday: parts[cMonIdx] === '1',
        tuesday: parts[cTueIdx] === '1',
        wednesday: parts[cWedIdx] === '1',
        thursday: parts[cThuIdx] === '1',
        friday: parts[cFriIdx] === '1',
        saturday: parts[cSatIdx] === '1',
        sunday: parts[cSunIdx] === '1',
        start_date: parts[cStartIdx],
        end_date: parts[cEndIdx]
      });
    }
  }
  
  // 5. Read calendar_dates.txt, keeping only the used service IDs
  console.log('Parsing and filtering calendar_dates.txt...');
  const calendarDatesContent = fs.readFileSync(calendarDatesPath, 'utf8');
  const calendarDatesLines = calendarDatesContent.split('\n');
  const calendarDatesHeaders = parseCSVLine(calendarDatesLines[0]);
  const cdServiceIdIdx = calendarDatesHeaders.indexOf('service_id');
  const cdDateIdx = calendarDatesHeaders.indexOf('date');
  const cdExceptionIdx = calendarDatesHeaders.indexOf('exception_type');
  
  const calendarDatesToUpload = [];
  for (let i = 1; i < calendarDatesLines.length; i++) {
    const line = calendarDatesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < calendarDatesHeaders.length) continue;
    
    const serviceId = parts[cdServiceIdIdx];
    if (usedServiceIds.has(serviceId)) {
      calendarDatesToUpload.push({
        service_id: serviceId,
        date: parts[cdDateIdx],
        exception_type: parseInt(parts[cdExceptionIdx])
      });
    }
  }

  // Compile full schedule rows for stats
  console.log('Compiling schedule database rows...');
  const scheduleRows = Object.keys(scheduleData).map(stopId => ({
    stop_id: stopId,
    schedule: scheduleData[stopId]
  }));

  const scheduleJSONString = JSON.stringify(scheduleRows);
  const scheduleSizeMB = scheduleJSONString.length / 1024 / 1024;
  const calendarSizeKB = JSON.stringify(calendarsToUpload).length / 1024;
  const calendarDatesSizeKB = JSON.stringify(calendarDatesToUpload).length / 1024;

  // Compile stop lines rows from set
  const lineStopCounts = {};
  const stopLinesRows = [];
  for (const item of stopLinesSet) {
    const [stopId, lineName] = item.split('\t');
    stopLinesRows.push({ stop_id: stopId, line: lineName });
    lineStopCounts[lineName] = (lineStopCounts[lineName] || 0) + 1;
  }

  const topLines = Object.keys(lineStopCounts)
    .map(lineName => ({ line: lineName, count: lineStopCounts[lineName] }))
    .sort((a, b) => b.count - a.count);

  const stopLinesSizeKB = JSON.stringify(stopLinesRows).length / 1024;

  // Supabase footprint estimation:
  // Supabase stores data in PostgreSQL. For JSONB, TOAST compression reduces size by ~3.5x.
  const estimatedSupabaseFootprintMB = (scheduleSizeMB / 3.5) + (calendarSizeKB / 1024) + (calendarDatesSizeKB / 1024) + (stopLinesSizeKB / 1024);

  console.log('\n=======================================');
  console.log('          FULL SYNC DRY-RUN REPORT     ');
  console.log('=======================================');
  console.log(`Total stops with schedules:      ${scheduleRows.length}`);
  console.log(`Total schedule entries:          ${totalEntries}`);
  console.log(`Total stop_lines entries:        ${stopLinesRows.length}`);
  console.log(`Estimated JSON size (schedules):  ${scheduleSizeMB.toFixed(2)} MB`);
  console.log(`Estimated calendar row count:    ${calendarsToUpload.length}`);
  console.log(`Estimated calendar_dates count:  ${calendarDatesToUpload.length}`);
  console.log(`Estimated Supabase footprint:    ~${estimatedSupabaseFootprintMB.toFixed(2)} MB (with TOAST compression estimate)`);
  console.log(`                                 ~${(scheduleSizeMB + (calendarSizeKB + calendarDatesSizeKB + stopLinesSizeKB)/1024).toFixed(2)} MB (raw uncompressed)`);

  // Top 20 lines by stop count
  console.log('\nTop 20 lines by stop count:');
  for (let i = 0; i < Math.min(20, topLines.length); i++) {
    const item = topLines[i];
    console.log(`  ${i+1}. Line: ${item.line.padEnd(10)} | Stops: ${String(item.count).padStart(5)}`);
  }

  // Top 20 largest stops by schedule size
  const sortedStops = scheduleRows
    .map(row => ({
      stop_id: row.stop_id,
      count: row.schedule.length,
      jsonSizeKB: JSON.stringify(row).length / 1024
    }))
    .sort((a, b) => b.count - a.count);

  console.log('\nTop 20 largest stops by schedule size:');
  for (let i = 0; i < Math.min(20, sortedStops.length); i++) {
    const item = sortedStops[i];
    console.log(`  ${i+1}. Stop ID: ${item.stop_id.padEnd(6)} | Entries: ${String(item.count).padStart(5)} | Est Size: ${item.jsonSizeKB.toFixed(2)} KB`);
  }

  if (isDryRun) {
    console.log('\nDry-run mode active. No data uploaded to Supabase.');
    return;
  }

  console.log('\nStarting live synchronization to staging tables...');
  try {
    console.log('Clearing staging tables via RPC...');
    await clearStagingTables();
    console.log('Staging tables cleared.');

    console.log(`Uploading ${scheduleRows.length} stop schedules in batches of 25...`);
    const scheduleBatchSize = 25;
    const totalScheduleBatches = Math.ceil(scheduleRows.length / scheduleBatchSize);
    for (let i = 0; i < scheduleRows.length; i += scheduleBatchSize) {
      const batch = scheduleRows.slice(i, i + scheduleBatchSize);
      const batchNum = Math.floor(i / scheduleBatchSize) + 1;
      const payloadSizeKB = JSON.stringify(batch).length / 1024;
      const sizeStr = payloadSizeKB >= 1024 ? `${(payloadSizeKB / 1024).toFixed(2)} MB` : `${payloadSizeKB.toFixed(2)} KB`;
      
      await uploadTableBatch('gtt_stop_schedules_staging', batch);
      
      const uploadedRows = Math.min(i + scheduleBatchSize, scheduleRows.length);
      console.log(`  [Batch ${batchNum}/${totalScheduleBatches}] Uploaded ${uploadedRows}/${scheduleRows.length} stop schedule rows | Payload size: ${sizeStr}`);
      await delay(200);
    }

    console.log(`Uploading ${calendarsToUpload.length} calendars in batches of 1000...`);
    const calendarBatchSize = 1000;
    const totalCalendarBatches = Math.ceil(calendarsToUpload.length / calendarBatchSize);
    for (let i = 0; i < calendarsToUpload.length; i += calendarBatchSize) {
      const batch = calendarsToUpload.slice(i, i + calendarBatchSize);
      await uploadTableBatch('gtt_calendar_staging', batch);
      console.log(`  Uploaded calendars batch ${Math.floor(i / calendarBatchSize) + 1}/${totalCalendarBatches}`);
      await delay(200);
    }

    console.log(`Uploading ${calendarDatesToUpload.length} calendar dates in batches of 1000...`);
    const dateBatchSize = 1000;
    const totalDateBatches = Math.ceil(calendarDatesToUpload.length / dateBatchSize);
    for (let i = 0; i < calendarDatesToUpload.length; i += dateBatchSize) {
      const batch = calendarDatesToUpload.slice(i, i + dateBatchSize);
      await uploadTableBatch('gtt_calendar_dates_staging', batch);
      console.log(`  Uploaded calendar dates batch ${Math.floor(i / dateBatchSize) + 1}/${totalDateBatches}`);
      await delay(200);
    }

    console.log(`Uploading ${stopLinesRows.length} stop lines in batches of 1000...`);
    const lineBatchSize = 1000;
    const totalLineBatches = Math.ceil(stopLinesRows.length / lineBatchSize);
    for (let i = 0; i < stopLinesRows.length; i += lineBatchSize) {
      const batch = stopLinesRows.slice(i, i + lineBatchSize);
      await uploadTableBatch('gtt_stop_lines_staging', batch);
      console.log(`  Uploaded stop lines batch ${Math.floor(i / lineBatchSize) + 1}/${totalLineBatches}`);
      await delay(200);
    }

    console.log('Invoking atomic swap RPC...');
    const swapResult = await invokeSwapRpc();
    
    console.log('\n=======================================');
    console.log('        SWAP TRANSACTION SUCCESSFUL    ');
    console.log('=======================================');
    console.log(JSON.stringify(swapResult, null, 2));
    console.log('\nFull static schedules sync completed successfully!');
  } catch (err) {
    console.error('\n=======================================');
    console.error('      LIVE SYNCHRONIZATION FAILED      ');
    console.error('=======================================');
    console.error(`Error details: ${err.message}`);
    console.error('Production tables were preserved (rollback succeeded).');
    process.exit(1);
  }
}

// ----------------------------------------------------
// Main entry point
// ----------------------------------------------------
if (isSyncSchedulesFull) {
  runSchedulesSyncFull();
} else if (isSyncSchedulesMvp) {
  runSchedulesSyncMvp();
} else if (isSyncTripSequences) {
  runTripStopSequencesSync();
} else if (isSyncTripShapes) {
  runTripShapesSync();
} else {
  runStopsSync();
}

// ----------------------------------------------------
// Mode D: Sync trip stop sequences
// ----------------------------------------------------
async function runTripStopSequencesSync() {
  const readline = require('readline');

  const tripsPath = path.join(gtfsDir, 'trips.txt');
  const routesPath = path.join(gtfsDir, 'routes.txt');
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');

  const requiredFiles = [tripsPath, routesPath, stopTimesPath];
  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      console.error(`Error: Required GTFS file not found: ${f}`);
      process.exit(1);
    }
  }

  // Parse stops.txt into metadata map: stop_id -> { name, code, lat, lon }
  console.log('Parsing stops.txt for stop metadata...');
  const stopsContent = fs.readFileSync(stopsPath, 'utf8');
  const stopsLines = stopsContent.split('\n');
  const stopsHeaders = parseCSVLine(stopsLines[0]);
  const sIdIdx   = stopsHeaders.indexOf('stop_id');
  const sCodeIdx = stopsHeaders.indexOf('stop_code');
  const sNameIdx = stopsHeaders.indexOf('stop_name');
  const sLatIdx  = stopsHeaders.indexOf('stop_lat');
  const sLonIdx  = stopsHeaders.indexOf('stop_lon');

  const stopMeta = {};
  for (let i = 1; i < stopsLines.length; i++) {
    const line = stopsLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < stopsHeaders.length) continue;
    const id = parts[sIdIdx];
    if (!id) continue;
    stopMeta[id] = {
      name: parts[sNameIdx] || '',
      code: parts[sCodeIdx] || null,
      lat:  parseFloat(parts[sLatIdx]) || null,
      lon:  parseFloat(parts[sLonIdx]) || null
    };
  }
  console.log(`  Loaded metadata for ${Object.keys(stopMeta).length} stops.`);

  // Parse routes.txt
  console.log('Parsing routes.txt...');
  const routesContent = fs.readFileSync(routesPath, 'utf8');
  const routesLines = routesContent.split('\n');
  const routesHeaders = parseCSVLine(routesLines[0]);
  const rRouteIdIdx   = routesHeaders.indexOf('route_id');
  const rShortNameIdx = routesHeaders.indexOf('route_short_name');
  const routesMap = {};
  for (let i = 1; i < routesLines.length; i++) {
    const line = routesLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < routesHeaders.length) continue;
    routesMap[parts[rRouteIdIdx]] = parts[rShortNameIdx] || '';
  }

  // Parse trips.txt
  console.log('Parsing trips.txt...');
  const tripsContent = fs.readFileSync(tripsPath, 'utf8');
  const tripsLines = tripsContent.split('\n');
  const tripsHeaders = parseCSVLine(tripsLines[0]);
  const tTripIdIdx    = tripsHeaders.indexOf('trip_id');
  const tRouteIdIdx   = tripsHeaders.indexOf('route_id');
  const tServiceIdIdx = tripsHeaders.indexOf('service_id');
  const tHeadsignIdx  = tripsHeaders.indexOf('trip_headsign');
  const tShapeIdIdx   = tripsHeaders.indexOf('shape_id');
  const tripsMap = {};
  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < tripsHeaders.length) continue;
    tripsMap[parts[tTripIdIdx]] = {
      route_id:      parts[tRouteIdIdx],
      service_id:    parts[tServiceIdIdx],
      trip_headsign: parts[tHeadsignIdx] || '',
      shape_id:      tShapeIdIdx >= 0 ? (parts[tShapeIdIdx] || null) : null
    };
  }
  console.log(`  Loaded ${Object.keys(tripsMap).length} trips.`);

  // Stream stop_times.txt and build trip -> ordered stop array
  console.log('Streaming stop_times.txt to build trip stop sequences...');
  const fileStream = fs.createReadStream(stopTimesPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // tripStops[tripId] = [ { seq, stop_id, arrival_time }, ... ]
  const tripStops = {};
  let isHeader = true;
  let stHeaders = [];
  let stTripIdx = -1, stStopIdx = -1, stArrIdx = -1, stSeqIdx2 = -1;
  let lineCount = 0;

  for await (const rawLine of rl) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (isHeader) {
      stHeaders  = parseCSVLine(trimmed);
      stTripIdx  = stHeaders.indexOf('trip_id');
      stStopIdx  = stHeaders.indexOf('stop_id');
      stArrIdx   = stHeaders.indexOf('arrival_time');
      stSeqIdx2  = stHeaders.indexOf('stop_sequence');
      isHeader   = false;
      continue;
    }

    const parts = parseCSVLine(trimmed);
    if (parts.length < stHeaders.length) continue;

    const tripId  = parts[stTripIdx];
    const stopId  = parts[stStopIdx];
    const arrTime = parts[stArrIdx];
    const seq     = parseInt(parts[stSeqIdx2]);

    if (!tripStops[tripId]) tripStops[tripId] = [];
    tripStops[tripId].push({ seq, stop_id: stopId, arrival_time: arrTime });

    lineCount++;
    if (lineCount % 500000 === 0) {
      console.log(`  Processed ${(lineCount / 1000000).toFixed(1)}M stop_time rows...`);
    }
  }

  console.log(`  Total stop_time rows processed: ${lineCount.toLocaleString()}`);
  console.log(`  Total unique trips found: ${Object.keys(tripStops).length.toLocaleString()}`);

  // Build final rows
  console.log('Building trip stop sequence rows...');
  const rows = [];
  let totalStops = 0;
  let skippedTrips = 0;

  for (const [tripId, stops] of Object.entries(tripStops)) {
    const trip = tripsMap[tripId];
    if (!trip) { skippedTrips++; continue; }

    // Sort by stop sequence
    stops.sort((a, b) => a.seq - b.seq);

    const stopsArray = stops.map(s => {
      const meta = stopMeta[s.stop_id] || {};
      return {
        stop_id:      s.stop_id,
        seq:          s.seq,
        name:         meta.name || '',
        code:         meta.code || null,
        lat:          meta.lat  || null,
        lon:          meta.lon  || null,
        arrival_time: s.arrival_time
      };
    });

    totalStops += stopsArray.length;
    rows.push({
      trip_id:    tripId,
      service_id: trip.service_id,
      line:       routesMap[trip.route_id] || '',
      headsign:   trip.trip_headsign,
      shape_id:   trip.shape_id || null,
      stops:      stopsArray
    });
  }

  const avgStopsPerTrip = rows.length > 0 ? (totalStops / rows.length).toFixed(1) : 0;
  const totalJsonSizeMB = (JSON.stringify(rows).length / 1024 / 1024).toFixed(2);
  const estimatedSupabaseMB = (parseFloat(totalJsonSizeMB) / 3.5).toFixed(2);

  // Top 10 longest trips
  const top10 = [...rows]
    .sort((a, b) => b.stops.length - a.stops.length)
    .slice(0, 10);

  console.log('\n=======================================');
  console.log('   TRIP STOP SEQUENCES DRY-RUN REPORT  ');
  console.log('=======================================');
  console.log(`Total trip sequences:         ${rows.length.toLocaleString()}`);
  console.log(`Skipped trips (no metadata):  ${skippedTrips.toLocaleString()}`);
  console.log(`Average stops per trip:       ${avgStopsPerTrip}`);
  console.log(`Estimated raw JSON size:      ${totalJsonSizeMB} MB`);
  console.log(`Estimated Supabase footprint: ~${estimatedSupabaseMB} MB (with TOAST compression)`);
  console.log('\nTop 10 longest trips:');
  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    console.log(`  ${i+1}. trip_id=${r.trip_id.padEnd(12)} line=${String(r.line).padEnd(8)} stops=${r.stops.length}`);
  }

  if (isDryRun) {
    console.log('\nDry-run mode active. No data uploaded to Supabase.');
    return;
  }

  // Live upload to staging
  console.log('\nUploading to gtt_trip_stop_sequences_staging...');
  const batchSize = 50; // Each row can be large (many stops as JSON)
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const payloadSizeKB = (JSON.stringify(batch).length / 1024).toFixed(1);
    await uploadTableBatch('gtt_trip_stop_sequences_staging', batch);
    console.log(`  [Batch ${batchNum}/${totalBatches}] Uploaded ${Math.min(i + batchSize, rows.length)}/${rows.length} rows | ${payloadSizeKB} KB`);
    await delay(150);
  }

  console.log('Trip stop sequences upload complete.');
  console.log('Invoking atomic swap RPC...');
  const swapResult = await invokeSwapRpc();
  console.log('Swap completed:', JSON.stringify(swapResult));
}

// ----------------------------------------------------
// Mode E: Sync trip shapes (shape_id-based)
// ----------------------------------------------------
async function runTripShapesSync() {
  const readline = require('readline');

  const tripsPath  = path.join(gtfsDir, 'trips.txt');
  const shapesPath = path.join(gtfsDir, 'shapes.txt');

  for (const f of [tripsPath, shapesPath]) {
    if (!fs.existsSync(f)) {
      console.error(`Error: Required GTFS file not found: ${f}`);
      process.exit(1);
    }
  }

  // --- Parse trips.txt: build trip_id → shape_id map ---
  console.log('Parsing trips.txt for shape_id mapping...');
  const tripsContent = fs.readFileSync(tripsPath, 'utf8');
  const tripsLines   = tripsContent.split('\n');
  const tripsHdrs    = parseCSVLine(tripsLines[0]);
  const tTripIdx     = tripsHdrs.indexOf('trip_id');
  const tShapeIdx    = tripsHdrs.indexOf('shape_id');

  if (tShapeIdx === -1) {
    console.error('Error: trips.txt has no shape_id column. GTT GTFS may not include shapes.');
    process.exit(1);
  }

  const tripToShape = new Map(); // trip_id → shape_id
  const shapeTrips  = new Map(); // shape_id → [trip_id, ...]  (to know which trips use each shape)

  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    const tripId  = parts[tTripIdx];
    const shapeId = parts[tShapeIdx];
    if (!tripId || !shapeId) continue;
    tripToShape.set(tripId, shapeId);
    if (!shapeTrips.has(shapeId)) shapeTrips.set(shapeId, []);
    shapeTrips.get(shapeId).push(tripId);
  }

  console.log(`  Trips with shape_id: ${tripToShape.size.toLocaleString()}`);
  console.log(`  Unique shape_ids:    ${shapeTrips.size.toLocaleString()}`);

  // --- Stream shapes.txt: group points by shape_id ---
  console.log('Streaming shapes.txt...');
  const fileStream = require('fs').createReadStream(shapesPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const shapePoints = new Map(); // shape_id → [{lat, lon, seq}]
  let isHeader = true;
  let shHdrs = [], shIdIdx = -1, shLatIdx = -1, shLonIdx = -1, shSeqIdx = -1;
  let rowCount = 0;

  for await (const rawLine of rl) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (isHeader) {
      shHdrs   = parseCSVLine(trimmed);
      shIdIdx  = shHdrs.indexOf('shape_id');
      shLatIdx = shHdrs.indexOf('shape_pt_lat');
      shLonIdx = shHdrs.indexOf('shape_pt_lon');
      shSeqIdx = shHdrs.indexOf('shape_pt_sequence');
      isHeader = false;
      continue;
    }
    const parts   = parseCSVLine(trimmed);
    const shapeId = parts[shIdIdx];
    const lat     = parseFloat(parts[shLatIdx]);
    const lon     = parseFloat(parts[shLonIdx]);
    const seq     = parseInt(parts[shSeqIdx]);
    if (!shapeId || isNaN(lat) || isNaN(lon) || isNaN(seq)) continue;

    if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
    shapePoints.get(shapeId).push({ lat, lon, seq });
    rowCount++;
    if (rowCount % 500000 === 0) {
      console.log(`  Processed ${(rowCount/1000000).toFixed(1)}M shape point rows...`);
    }
  }

  console.log(`  Total shape point rows: ${rowCount.toLocaleString()}`);
  console.log(`  Unique shapes loaded:   ${shapePoints.size.toLocaleString()}`);

  // --- Downsample helper: keep every Nth point to stay under maxPts ---
  function downsample(points, maxPts) {
    if (points.length <= maxPts) return points;
    const step = points.length / maxPts;
    const result = [];
    for (let i = 0; i < maxPts; i++) {
      result.push(points[Math.round(i * step)]);
    }
    // Always include last point
    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) result.push(last);
    return result;
  }

  // --- Build rows: one row per unique shape_id ---
  console.log('Building shape rows...');
  const MAX_POINTS = 600; // max points per shape row
  const rows = [];
  let totalPoints = 0;
  let skippedShapes = 0;

  for (const [shapeId, pts] of shapePoints.entries()) {
    pts.sort((a, b) => a.seq - b.seq);
    const sampled = downsample(pts, MAX_POINTS);
    totalPoints += sampled.length;
    rows.push({
      shape_id:    shapeId,
      points:      sampled.map(p => ({ lat: p.lat, lon: p.lon, seq: p.seq })),
      point_count: sampled.length
    });
  }

  // Sort by point_count desc for top-10 report
  const sortedRows = [...rows].sort((a, b) => b.point_count - a.point_count);
  const avgPoints       = rows.length > 0 ? (totalPoints / rows.length).toFixed(1) : 0;
  const rawJsonMB       = (JSON.stringify(rows).length / 1024 / 1024).toFixed(2);
  const estimatedDBMB   = (parseFloat(rawJsonMB) / 3.5).toFixed(2);

  console.log('\n=======================================');
  console.log('     TRIP SHAPES DRY-RUN REPORT       ');
  console.log('=======================================');
  console.log(`Unique shape_ids:             ${rows.length.toLocaleString()}`);
  console.log(`Total trips mapped:           ${tripToShape.size.toLocaleString()}`);
  console.log(`Average points per shape:     ${avgPoints}`);
  console.log(`Max points per shape (after downsample): ${MAX_POINTS}`);
  console.log(`Estimated raw JSON size:      ${rawJsonMB} MB`);
  console.log(`Estimated Supabase footprint: ~${estimatedDBMB} MB (with TOAST compression)`);
  console.log('\nTop 10 largest shapes:');
  for (let i = 0; i < Math.min(10, sortedRows.length); i++) {
    const r = sortedRows[i];
    const tripsUsing = (shapeTrips.get(r.shape_id) || []).length;
    console.log(`  ${i+1}. shape_id=${r.shape_id.padEnd(20)} points=${String(r.point_count).padEnd(5)} used_by=${tripsUsing} trips`);
  }

  if (isDryRun) {
    console.log('\nDry-run mode active. No data uploaded to Supabase.');
    return;
  }

  // --- Live upload to staging ---
  console.log('\nClearing shapes staging table...');
  // Just truncate shapes staging directly (shapes sync is independent)
  await uploadTableBatch('gtt_shapes_staging', []); // will fail gracefully, use direct truncate via RPC
  // Upload in small batches (shapes can be large JSON)
  console.log('Uploading to gtt_shapes_staging...');
  const batchSize   = 20;
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch    = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const sizeKB   = (JSON.stringify(batch).length / 1024).toFixed(1);
    await uploadTableBatch('gtt_shapes_staging', batch);
    console.log(`  [Batch ${batchNum}/${totalBatches}] Uploaded ${Math.min(i+batchSize, rows.length)}/${rows.length} shapes | ${sizeKB} KB`);
    await delay(200);
  }

  // Swap shapes staging → production directly
  console.log('\nSwapping gtt_shapes staging → production...');
  const swapResult = await invokeSwapRpc();
  console.log('Swap completed:', JSON.stringify(swapResult));
  console.log('Trip shapes sync complete.');
}
