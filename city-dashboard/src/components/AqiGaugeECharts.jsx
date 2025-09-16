import React, { useMemo, useRef, useEffect, useCallback } from "react";
import ReactECharts from "echarts-for-react";

/** ---------- Utilities ---------- **/
function pickTextColor(hex) {
  const c = hex.replace('#','');
  const r = parseInt(c.substr(0,2),16)/255;
  const g = parseInt(c.substr(2,2),16)/255;
  const b = parseInt(c.substr(4,2),16)/255;
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L > 0.6 ? '#0b122a' : '#ffffff'; // روشن→تیره، تیره→روشن
}
function approxCharW(fontPx){ return fontPx * 0.62 } // تخمین عرض هر کاراکتر

/**
 * متن خمیده به‌صورت کاراکتر-به-کاراکتر روی یک قوس
 * cx, cy: مرکز
 * r: شعاع خط متن
 * mid: مقدار میانی (۰..۵۰۰) برای تعیین زاویه مرکز متن روی نیم‌دایره گیج
 * rtl: اگر true، متن از راست به چپ چیده می‌شود (برای فارسی)
 */
function makeCurvedTextElements({ cx, cy, r, mid, text, fontPx, color, rtl=false }) {
  const txtColor = "#ffffff"; // همه متن سفید
  const lines = String(text).split('\n');
  const lineGap = Math.max(2, Math.round(fontPx*0.2));
  const elems = [];

  const spacingFactor = 0.70; // هرچی بیشتر، فاصله بیشتر

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
          shadowColor: "rgba(0,0,0,.4)", // سایه برای خوانایی
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
  radius = "105%",   // درصد از ضلع کوچک کانتینر
  centerY = "82%",   // موقعیت عمودی مرکز
  lineWidth = 18,
  pointerWidth = 5,
  labelFont = 12,    // سایز فونت لیبل‌های روی قوس
  rtlLabels = false, // اگر لیبل‌ها فارسی/RTL هستند، true کن
}) {
  const v = Math.max(0, Math.min(500, Number(value) || 0));
  const chartRef = useRef(null);

  // محدوده‌ها و رنگ‌ها + متن لیبل‌ها
  const labels = useMemo(() => ([
    { mid:  25, text: "Very Good",      color: "#86efac" },
    { mid:  75, text: "Good",           color: "#22c55e" },
    { mid: 150, text: "Moderate",       color: "#facc15" },
    { mid: 250, text: "Unhealthy",      color: "#f59e0b" },
    { mid: 350, text: "Very Unhealthy", color: "#ef4444" },
    { mid: 450, text: "Hazardous",      color: "#7f1d1d" },
  ]), []);

  // پیکربندی خودِ گیج
  const option = useMemo(() => ({
    series: [{
      type: "gauge",
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 500,
      splitNumber: 10,
      center: ["50%", centerY],
      radius,
      axisLine: {
        lineStyle: {
          width: lineWidth,
          color: [
            [  50/500, "#86efac"], // Very Good
            [ 100/500, "#22c55e"], // Good
            [ 200/500, "#facc15"], // Moderate
            [ 300/500, "#f59e0b"], // Unhealthy (SG)
            [ 400/500, "#ef4444"], // Very Unhealthy
            [   1,     "#7f1d1d"], // Hazardous
          ],
        },
      },
      axisTick: { show: false },
      splitLine:{ show: false },
      axisLabel:{ show: false },
      pointer: {
        icon: "path://M2,-4 L-2,-4 L-1,70 L1,70 Z",
        length: "78%",
        width: pointerWidth,
        itemStyle: { color: "#ef4444" },
      },
      anchor: {
        show: true,
        size: Math.max(10, pointerWidth * 2 + 4),
        itemStyle: { color: "#ef4444", borderColor: "#fff", borderWidth: 2 },
      },
      title: { show: false },
      detail: {
        valueAnimation: true,
        fontSize: 88,
        color: "inherit",
        offsetCenter: [0, "-30%"],
        formatter: (val) => Math.round(val),
      },
      data: [{ value: v }],
    }],
  }), [v, radius, centerY, lineWidth, pointerWidth]);

  // رسم متن‌های خمیده
  const renderGraphic = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const W = chart.getWidth();
    const H = chart.getHeight();
    const cx = W * 0.5;
    const cy = H * (parseFloat(centerY) / 100);

    const minSide = Math.min(W, H);
    const r = (typeof radius === "string" && String(radius).includes("%"))
      ? (minSide * (parseFloat(radius) / 100)) / 2
      : Number(radius);

    // متن روی وسط ضخامت قوس قرار بگیرد
    const rLabel = r - lineWidth * 0.50;

    const elements = [];
    labels.forEach(({ mid, text, color }) => {
      const curved = makeCurvedTextElements({
        cx, cy, r: rLabel, mid, text, fontPx: labelFont, color, rtl: rtlLabels
      });
      elements.push(...curved);
    });

    chart.setOption({ graphic: { elements } }, { replaceMerge: ["graphic"] });
  }, [centerY, radius, lineWidth, labelFont, labels, rtlLabels]);

  // پس از آماده‌شدن چارت و هر بار تغییر اندازه/آپشن، متن‌ها را دوباره رسم کن
  const onReady = (inst) => {
    chartRef.current = inst;
    renderGraphic();
  };
  useEffect(() => { renderGraphic(); }, [renderGraphic, option]);
  useEffect(() => {
    const rsz = () => renderGraphic();
    window.addEventListener("resize", rsz);
    return () => window.removeEventListener("resize", rsz);
  }, [renderGraphic]);

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      opts={{ renderer: "canvas" }}
      onChartReady={onReady}
    />
  );
}
