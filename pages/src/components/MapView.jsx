import React, { useEffect } from 'react'
import L from 'leaflet'

export default function MapView({points=[]}){
  useEffect(()=>{
    const map = L.map('map').setView([45.07, 7.69], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    points.filter(p=>p.lat && p.lon).forEach(p=>{
      L.marker([p.lat, p.lon]).addTo(map).bindPopup(p.label || '')
    })
    return ()=> map.remove()
  },[JSON.stringify(points)])
  return <div id="map" style={{height: 500, border:'1px solid #ddd', borderRadius:12}} />
}
