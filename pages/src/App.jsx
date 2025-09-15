import React, { useEffect, useState } from 'react'
import MapView from './components/MapView'

export default function App(){
  const [rows, setRows] = useState([])
  useEffect(()=>{
    fetch('/api/air_quality_daily?city=eq.Turin&order=ts.desc&limit=30')
      .then(r=>r.json())
      .then(setRows)
  },[])
  return (
    <div style={{fontFamily:'system-ui', padding:16}}>
      <h1>TOP — Turin Open Data Platform</h1>
      <p>Public API: <code>/api/*</code> (proxied)</p>
      <MapView points={rows.map(r=>({lat:r.lat, lon:r.lon, label:`AQI ${r.aqi} — ${r.ts}`}))} />
    </div>
  )
}
