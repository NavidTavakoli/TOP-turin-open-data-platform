// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import ReactECharts from "echarts-for-react";

/** ---------- Utilities ---------- **/
function pickTextColor(hex) {
  const c = hex.replace('#','');
  const r = parseInt(c.substr(0,2),16)/255;
  const g = parseInt(c.substr(2,2),16)/255;
  const b = parseInt(c.substr(4,2),16)/255;
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L > 0.6 ? '#0b122a' : '#ffffff'; // Light backgrounds get dark text, dark backgrounds get light text.
}
function approxCharW(fontPx){ return fontPx * 0.62 } // Approximate character width.

/**
 * Render curved text character-by-character on an arc.
 * cx, cy: center point.
 * r: text baseline radius.
 * mid: middle value used to place text on the gauge arc.
 * rtl: when true, text is laid out right-to-left.
 */
function makeCurvedTextElements({ cx, cy, r, mid, text, fontPx, color, rtl=false }) {
  const txtColor = "#ffffff"; // Keep all text white.
  const lines = String(text).split('\n');
  const lineGap = Math.max(2, Math.round(fontPx*0.2));
  const elems = [];

  const spacingFactor = 0.70; // Higher value means wider spacing.

  lines.forEach((line, li) => {
    if (!line) return;

    let chars = Array.from(line);
    if (rtl) chars = chars.reverse();

    const charW = fontPx * spacingFactor;
    const arcLen = chars.length * charW;
    const rLine = r - li * (fontPx + lineGap);

    const degMid = 180 - 180 * (mid / 500);
    const radMid = (degMid * Math.PI) / 180;

    const totalAngle = arcLen / rLine;
    const step = -(charW / rLine);
    const start = radMid + totalAngle / 2;

    chars.forEach((ch, i) => {
      const theta = start + ((i + 0.5) * step);
      let rotation = theta + Math.PI / 2;
      if (rotation > Math.PI/2 || rotation < -Math.PI/2) {
        rotation -= Math.PI;
      }
      const x = cx + rLine * Math.cos(theta);
      const y = cy - rLine * Math.sin(theta);

      elems.push({
        type: 'text',
        position: [x, y],
        rotation,
        silent: true,
        z: 1002,
        zlevel: 10,
        style: {
          text: ch,
          fontSize: fontPx,
          fontWeight: 700,
          fill: txtColor,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          shadowColor: "rgba(0,0,0,.4)", // Shadow for readability.
          shadowBlur: 4,
        },
      });
    });
  });

  return elems;
}

/** ---------- Component ---------- **/
export default function AqiGaugeECharts({
  value = 0,
  height = 260,
  radius = "105%",
  centerY = "82%",
  lineWidth = 18,
  pointerWidth = 5,
  labelFont = 12,
  rtlLabels = false,
}) {
  const v = Math.max(0, Math.min(500, Number(value) || 0));
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(0);

  // Scale font sizes based on container width
  const scaledLabelFont = Math.max(7, Math.min(labelFont, labelFont * (containerW / 320)));
  const scaledValueFont = Math.max(32, Math.min(88, Math.round(containerW * 0.22)));
  const scaledLineWidth = Math.max(8, Math.min(lineWidth, lineWidth * (containerW / 320)));
  const scaledPointerWidth = Math.max(3, Math.min(pointerWidth, pointerWidth * (containerW / 320)));

  const labels = useMemo(() => ([
    { mid:  25, text: "Very Good",      color: "#86efac" },
    { mid:  75, text: "Good",           color: "#22c55e" },
    { mid: 150, text: "Moderate",       color: "#facc15" },
    { mid: 250, text: "Unhealthy",      color: "#f59e0b" },
    { mid: 350, text: "Very Unhealthy", color: "#ef4444" },
    { mid: 450, text: "Hazardous",      color: "#7f1d1d" },
  ]), []);

  // On mobile keep radius/centerY at default — labels are hidden so no overflow risk
  const responsiveRadius  = radius;
  const responsiveCenterY = centerY;

  const option = useMemo(() => ({
    series: [{
      type: "gauge",
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 500,
      splitNumber: 10,
      center: ["50%", responsiveCenterY],
      radius: responsiveRadius,
      axisLine: {
        lineStyle: {
          width: scaledLineWidth,
          color: [
            [  50/500, "#86efac"],
            [ 100/500, "#22c55e"],
            [ 200/500, "#facc15"],
            [ 300/500, "#f59e0b"],
            [ 400/500, "#ef4444"],
            [   1,     "#7f1d1d"],
          ],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: {
        icon: "path://M2,-4 L-2,-4 L-1,70 L1,70 Z",
        length: "78%",
        width: scaledPointerWidth,
        itemStyle: { color: "#ef4444" },
      },
      anchor: {
        show: true,
        size: Math.max(8, scaledPointerWidth * 2 + 4),
        itemStyle: { color: "#ef4444", borderColor: "#fff", borderWidth: 2 },
      },
      title: { show: false },
      detail: {
        valueAnimation: true,
        fontSize: scaledValueFont,
        color: "inherit",
        offsetCenter: [0, "-30%"],
        formatter: (val) => Math.round(val),
      },
      data: [{ value: v }],
    }],
  }), [v, responsiveRadius, responsiveCenterY, scaledLineWidth, scaledPointerWidth, scaledValueFont]);

  // On mobile (< 480px) skip curved labels entirely — show legend below instead
  const showCurvedLabels = containerW === 0 || containerW >= 480;

  const renderGraphic = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const W = chart.getWidth();
    const H = chart.getHeight();
    if (!W || !H) return;

    // On small screens clear any existing graphic elements and return
    if (W < 480) {
      chart.setOption({ graphic: { elements: [] } }, { replaceMerge: ["graphic"] });
      return;
    }

    const activeCenterY = centerY;
    const activeRadius  = radius;

    const cx = W * 0.5;
    const cy = H * (parseFloat(activeCenterY) / 100);

    const minSide = Math.min(W, H);
    const r = (typeof activeRadius === "string" && String(activeRadius).includes("%"))
      ? (minSide * (parseFloat(activeRadius) / 100)) / 2
      : Number(activeRadius);

    const dynamicFont = Math.max(8, Math.min(labelFont, labelFont * (W / 480)));
    const rLabel = r - scaledLineWidth * 0.50;

    const elements = [];
    labels.forEach(({ mid, text, color }) => {
      const curved = makeCurvedTextElements({
        cx, cy, r: rLabel, mid, text, fontPx: dynamicFont, color, rtl: rtlLabels
      });
      elements.push(...curved);
    });

    chart.setOption({ graphic: { elements } }, { replaceMerge: ["graphic"] });
  }, [centerY, radius, scaledLineWidth, labelFont, labels, rtlLabels, containerW]);

  const onReady = (inst) => {
    chartRef.current = inst;
    renderGraphic();
  };

  useEffect(() => { renderGraphic(); }, [renderGraphic, option]);

  // ResizeObserver on the container — catches grid/layout changes, not just window resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      setContainerW(w);
      // also re-render graphic after ECharts has a chance to resize
      requestAnimationFrame(() => renderGraphic());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderGraphic]);

  // Keep window resize as fallback
  useEffect(() => {
    const rsz = () => renderGraphic();
    window.addEventListener("resize", rsz);
    return () => window.removeEventListener("resize", rsz);
  }, [renderGraphic]);

  // Shrink height on small containers so gauge doesn't overflow
  const responsiveHeight = useMemo(() => {
    if (!containerW) return height;
    if (containerW < 280) return Math.min(height, 180);
    if (containerW < 360) return Math.min(height, 210);
    if (containerW < 480) return Math.min(height, 230);
    return height;
  }, [containerW, height]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <ReactECharts
        option={option}
        style={{ height: responsiveHeight, width: "100%" }}
        opts={{ renderer: "canvas" }}
        onChartReady={onReady}
      />
      {/* Mobile legend — shown only when curved labels are hidden */}
      {!showCurvedLabels && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px 12px",
          padding: "0 8px 8px",
          marginTop: "-4px"
        }}>
          {labels.map(({ text, color }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: color, flexShrink: 0,
                boxShadow: `0 0 0 2px ${color}44`
              }} />
              <span style={{ fontSize: 11, color: "var(--color-slate-600, #475569)", fontWeight: 500 }}>
                {text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}