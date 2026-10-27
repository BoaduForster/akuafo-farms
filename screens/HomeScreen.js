import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

/* =========================================================================
 * Akuafo-Boafo: Home screen
 *
 * Lands after the splash. It is built around what the app really does today
 * (see review.txt), and nothing more:
 *   - four crops: maize, cabbage, pepper, tomato
 *   - fertilizer (N-P-K) is the main model; weedicide and pesticide are
 *     demonstration inputs only
 *   - the model uses crop, farm size, soil N-P-K, input choices and a
 *     normal / dry / wet season. It does NOT yet use location, soil type,
 *     pH or planting date, and the screen says so
 *   - results are a full-season, week-by-week projection and are indicative
 *   - there is no saved-scenario database yet, so "recent" only appears if
 *     the parent app passes scenarios in
 *
 * The top of the screen is a small animated farm: goat and hens roaming the
 * field, maize, tomato, pepper and cabbage ripening, clouds drifting. Same
 * technique as the splash: only opacity/transform, native driver, no packages,
 * and it stands still when Reduce Motion is on.
 * ======================================================================= */

const API_BASE = 'http://localhost:8000'; // change for a real device / emulator

const C = {
  night: '#04170D',
  card: '#0B2A19',
  cardAlt: '#123A24',
  line: 'rgba(246, 241, 224, 0.10)',

  gold: '#F2B33D',
  goldPressed: '#D99A24',
  goldSoft: 'rgba(242, 179, 61, 0.16)',
  goldLine: 'rgba(242, 179, 61, 0.45)',

  cream: '#F6F1E0',
  mint: '#BFE5C0',
  sage: '#8FC39A',
  sageDim: 'rgba(143, 195, 154, 0.62)',
  warn: '#E8A83A',
  good: '#7FCB86',
};

// All user-facing text. Fill in `tw` with the same keys and an English/Twi
// switch appears on the scene automatically.
const COPY = {
  en: {
    greeting: 'Akwaaba',
    headline: 'Plan before you plant.',
    startTitle: 'Start a virtual farm',
    startSub: 'Pick a crop, set your soil and inputs, then watch the season unfold week by week.',
    startCta: 'Start simulation',
    indicative: 'Indicative estimates',
    weatherTitle: 'Season weather',
    weather: { normal: 'Normal', dry: 'Dry', wet: 'Wet' },
    cropsTitle: 'Or start with a crop',
    weeks: (n) => `about ${n} weeks`,
    crops: { maize: 'Maize', cabbage: 'Cabbage', pepper: 'Pepper', tomato: 'Tomato' },
    testTitle: 'What you can test',
    fert: {
      title: 'Fertilizer',
      body: 'Nitrogen, phosphorus and potassium: too little, the right amount or too much, applied once or split.',
    },
    weed: {
      title: 'Weedicide',
      body: 'See how weed pressure and crop injury risk change with the amount applied.',
    },
    pest: {
      title: 'Pesticide',
      body: 'See how pest pressure and crop damage risk change with the amount applied.',
    },
    levels: { none: 'None', under: 'Under', right: 'Recommended', over: 'Over' },
    demo: 'Demonstration only',
    compareTitle: 'Compare scenarios',
    compareSub: 'Put two or three plans side by side and rank them by estimated profit.',
    scenarioNames: { a: 'Underuse', b: 'Recommended', c: 'Overuse' },
    recentTitle: 'Recent scenarios',
    estProfit: 'est. profit',
    indicativeYield: 'Indicative yield',
    assumptionsTitle: 'What the estimates use',
    show: 'Show',
    hide: 'Hide',
    used: 'Used in the calculation',
    notUsed: 'Saved for your records, but not used yet',
    usedItems: ['Crop', 'Farm size', 'Soil nitrogen, phosphorus and potassium', 'Your input choices', 'Season weather'],
    notUsedItems: ['Location', 'Soil type', 'Soil pH', 'Planting date'],
    caveats: [
      'Yield ranges are provisional bands, not measured uncertainty.',
      'Weedicide and pesticide choices are demonstrations, not advice on what to spray.',
    ],
    footerNote:
      'Estimates are not field-validated. Use them to plan and compare, and keep soil testing and advice from an extension officer.',
    offline: 'Could not reach the server. Showing the default crops.',
    retry: 'Retry',
    welcomeBack: 'Welcome back',
  },
  tw: null,
};

const CROP_EMOJI = { maize: '🌽', cabbage: '🥬', pepper: '🌶️', tomato: '🍅' };
const FALLBACK_CROPS = [
  { key: 'maize' },
  { key: 'cabbage' },
  { key: 'pepper' },
  { key: 'tomato' },
];

// ---- helpers ---------------------------------------------------------------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const serif = Platform.select({ ios: 'Georgia', default: 'serif' });
const LIN = (x) => x;
const INOUT = Easing.inOut(Easing.cubic);

// Eased/linear keyframes over a 0..1 loop value. Output runs natively.
// frames: [[0..1, value], ...] ascending. unit: e.g. 'deg' for rotations.
function track(val, frames, { easing = LIN, steps = 1, unit = '' } = {}) {
  const input = [];
  const output = [];
  const push = (x, v) => {
    const xr = Math.round(clamp(x, 0, 1) * 1e5) / 1e5;
    const vr = Math.round(v * 1000) / 1000;
    const last = input.length ? input[input.length - 1] : -1;
    if (xr < last) return;
    if (xr === last) {
      output[output.length - 1] = vr;
      return;
    }
    input.push(xr);
    output.push(vr);
  };
  push(0, frames[0][1]);
  frames.forEach(([x, v], i) => {
    if (i === 0) {
      push(x, v);
      return;
    }
    const [px, pv] = frames[i - 1];
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      push(px + (x - px) * f, pv + (v - pv) * easing(f));
    }
  });
  push(1, frames[frames.length - 1][1]);
  return val.interpolate({
    inputRange: input,
    outputRange: unit ? output.map((v) => `${v}${unit}`) : output,
    extrapolate: 'clamp',
  });
}

// Alternating frames across [u0, u1]: rest at both ends, a/b in between.
function zig(u0, u1, n, a, b, rest) {
  const f = [[u0, rest]];
  for (let i = 1; i < n; i += 1) f.push([u0 + (u1 - u0) * (i / n), i % 2 ? a : b]);
  f.push([u1, rest]);
  return f;
}

// Everything an animal needs to walk to one side, pause, turn, and come back.
function walkTracks(cyc, { range, cycleMs, moveEnd = 0.44, stepMs = 440, amp = 26 }) {
  const n = Math.max(2, Math.round((moveEnd * cycleMs) / stepMs));
  const half = 0.5;
  const back = half + moveEnd;
  const flip = 0.04;
  return {
    x: track(cyc, [[0, 0], [moveEnd, range], [half, range], [back, 0], [1, 0]]),
    face: track(cyc, [
      [0, 1], [moveEnd + 0.01, 1], [moveEnd + 0.01 + flip, -1],
      [back, -1], [back + 0.01, -1], [back + 0.01 + flip, 1], [1, 1],
    ]),
    legA: track(cyc, [...zig(0, moveEnd, n, -amp, amp, 0), ...zig(half, back, n, -amp, amp, 0), [1, 0]], { unit: 'deg' }),
    legB: track(cyc, [...zig(0, moveEnd, n, amp, -amp, 0), ...zig(half, back, n, amp, -amp, 0), [1, 0]], { unit: 'deg' }),
    bob: track(cyc, [...zig(0, moveEnd, n * 2, 0, -1.6, 0), ...zig(half, back, n * 2, 0, -1.6, 0), [1, 0]]),
    // head movement: nodding while walking, pecking while paused
    nod: track(cyc, [...zig(0, moveEnd, n * 2, 0, 2.5, 0), ...zig(half, back, n * 2, 0, 2.5, 0), [1, 0]]),
    peck: track(cyc, [[0, 0], ...zig(moveEnd + 0.01, half, 6, 0, 4, 0), ...zig(back + 0.01, 1, 6, 0, 4, 0)]),
  };
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
function gradient(stops, n) {
  return Array.from({ length: n }, (_, i) => {
    const p = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1][0]) k += 1;
    const [p0, c0] = stops[k];
    const [p1, c1] = stops[k + 1];
    const f = clamp((p - p0) / (p1 - p0), 0, 1);
    const a = hexToRgb(c0);
    const b = hexToRgb(c1);
    return rgbToHex(a.map((v, j) => v + (b[j] - v) * f));
  });
}

// Golden morning, the sky the splash ended on.
const MORNING_SKY = gradient(
  [[0, '#2C6B83'], [0.45, '#7DB9AE'], [0.8, '#F2D08E'], [1, '#FBE6B0']],
  32
);

// Pivot helpers: rotate about the bottom or the top edge of a box of height h.
const aboutBottom = (h, rotate) => [{ translateY: h / 2 }, { rotate }, { translateY: -h / 2 }];
const aboutTop = (h, rotate) => [{ translateY: -h / 2 }, { rotate }, { translateY: h / 2 }];

// ---------------------------------------------------------------------------
// The animated farm (decorative)
// ---------------------------------------------------------------------------

const SCENE_H = 292;

function Leg({ left, top, h, w = 3.5, color, rotate }) {
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        borderRadius: w / 2,
        backgroundColor: color,
        transform: aboutTop(h, rotate),
      }}
    />
  );
}

function Goat({ walk }) {
  const leg = '#5A4632';
  return (
    <Animated.View style={{ width: 66, height: 46, transform: [{ translateX: walk.x }, { scaleX: walk.face }] }}>
      <Leg left={12} top={27} h={15} color={leg} rotate={walk.legA} />
      <Leg left={41} top={27} h={15} color={leg} rotate={walk.legA} />
      <Leg left={17} top={27} h={15} color={leg} rotate={walk.legB} />
      <Leg left={36} top={27} h={15} color={leg} rotate={walk.legB} />
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 66, height: 46, transform: [{ translateY: walk.bob }] }}>
        <View style={[s.abs, { left: 4, top: 9, width: 4, height: 10, borderRadius: 2, backgroundColor: '#D9CDB0', transform: [{ rotate: '-25deg' }] }]} />
        <View style={[s.abs, { left: 8, top: 12, width: 38, height: 17, borderRadius: 9, backgroundColor: '#E9DFC8' }]} />
        <View style={[s.abs, { left: 15, top: 14, width: 12, height: 8, borderRadius: 5, backgroundColor: '#B58E63' }]} />
        <View style={[s.abs, { left: 40, top: 7, width: 9, height: 17, borderRadius: 4, backgroundColor: '#E9DFC8', transform: [{ rotate: '24deg' }] }]} />
        <View style={[s.abs, { left: 46, top: 3, width: 15, height: 11, borderRadius: 6, backgroundColor: '#E9DFC8', transform: [{ rotate: '10deg' }] }]} />
        <View style={[s.abs, { left: 56, top: 8, width: 7, height: 5, borderRadius: 3, backgroundColor: '#8C6B4A' }]} />
        <View style={[s.abs, { left: 44, top: 3, width: 7, height: 4, borderRadius: 3, backgroundColor: '#B58E63', transform: [{ rotate: '-28deg' }] }]} />
        <View style={[s.abs, { left: 49, top: -3, width: 3, height: 9, borderRadius: 2, backgroundColor: '#6B5A44', transform: [{ rotate: '-18deg' }] }]} />
        <View style={[s.abs, { left: 53, top: 5, width: 2, height: 2, borderRadius: 1, backgroundColor: '#2B2118' }]} />
        <View style={[s.abs, { left: 57, top: 13, width: 3, height: 6, borderRadius: 2, backgroundColor: '#D9CDB0' }]} />
      </Animated.View>
    </Animated.View>
  );
}

function Hen({ walk, body = '#C97B3C', dark = '#9C5A27' }) {
  const leg = '#E59A3B';
  return (
    <Animated.View style={{ width: 34, height: 30, transform: [{ translateX: walk.x }, { scaleX: walk.face }] }}>
      <Leg left={11} top={21} h={9} w={1.8} color={leg} rotate={walk.legA} />
      <Leg left={16} top={21} h={9} w={1.8} color={leg} rotate={walk.legB} />
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 34, height: 30, transform: [{ translateY: walk.bob }] }}>
        <View style={[s.abs, { left: 0, top: 4, width: 8, height: 12, borderRadius: 5, backgroundColor: dark, transform: [{ rotate: '-30deg' }] }]} />
        <View style={[s.abs, { left: 3, top: 8, width: 22, height: 14, borderRadius: 8, backgroundColor: body }]} />
        <View style={[s.abs, { left: 9, top: 12, width: 11, height: 7, borderRadius: 5, backgroundColor: dark }]} />
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 34, height: 30, transform: [{ translateX: walk.nod }, { translateY: walk.peck }] }}>
          <View style={[s.abs, { left: 21, top: 3, width: 9, height: 9, borderRadius: 5, backgroundColor: body }]} />
          <View style={[s.abs, { left: 24, top: 0, width: 5, height: 4, borderRadius: 2, backgroundColor: '#D64A3A' }]} />
          <View style={[s.abs, { left: 29.5, top: 6, width: 0, height: 0, borderTopWidth: 2.2, borderBottomWidth: 2.2, borderLeftWidth: 5, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#F2A33D' }]} />
          <View style={[s.abs, { left: 26, top: 6, width: 1.8, height: 1.8, borderRadius: 1, backgroundColor: '#2B2118' }]} />
          <View style={[s.abs, { left: 27, top: 11, width: 2, height: 3, borderRadius: 1, backgroundColor: '#D64A3A' }]} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// A fruit that ripens: green and ripe layers cross-fade on the ripen clock.
function Fruit({ ripen, style, green, ripe }) {
  return (
    <View style={[s.abs, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: green, opacity: 1 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: ripe, opacity: ripen }]} />
    </View>
  );
}

function Maize({ sway, ripen }) {
  const H = 100;
  return (
    <Animated.View style={{ width: 64, height: H, transform: aboutBottom(H, sway) }}>
      <View style={[s.abs, { left: 30, bottom: 0, width: 4, height: 94, borderRadius: 2, backgroundColor: '#5FA45B' }]} />
      <View style={[s.abs, { left: 30, bottom: 28, width: 28, height: 6, borderRadius: 3, backgroundColor: '#76BD6F', transform: [{ rotate: '-24deg' }] }]} />
      <View style={[s.abs, { left: 6, bottom: 44, width: 28, height: 6, borderRadius: 3, backgroundColor: '#6AB064', transform: [{ rotate: '24deg' }] }]} />
      <View style={[s.abs, { left: 31, bottom: 60, width: 26, height: 5, borderRadius: 3, backgroundColor: '#76BD6F', transform: [{ rotate: '-30deg' }] }]} />
      <View style={[s.abs, { left: 8, bottom: 74, width: 24, height: 5, borderRadius: 3, backgroundColor: '#6AB064', transform: [{ rotate: '30deg' }] }]} />
      <View style={[s.abs, { left: 28, bottom: 90, width: 8, height: 12, borderRadius: 4, backgroundColor: '#D9C56A' }]} />
      <Fruit ripen={ripen} green="#8FC45F" ripe="#F1C232" style={{ left: 34, bottom: 40, width: 10, height: 22 }} />
      <Fruit ripen={ripen} green="#86BC58" ripe="#EDBB2C" style={{ left: 20, bottom: 54, width: 9, height: 19 }} />
    </Animated.View>
  );
}

function Tomato({ sway, ripen }) {
  const H = 76;
  const g = '#76B24F';
  const r = '#E0452F';
  return (
    <Animated.View style={{ width: 62, height: H, transform: aboutBottom(H, sway) }}>
      <View style={[s.abs, { left: 30, bottom: 0, width: 2.5, height: 72, backgroundColor: '#C9B58A' }]} />
      <View style={[s.abs, { left: 12, bottom: 38, width: 38, height: 34, borderRadius: 19, backgroundColor: '#4E9A53' }]} />
      <View style={[s.abs, { left: 2, bottom: 22, width: 28, height: 28, borderRadius: 14, backgroundColor: '#5BAA5C' }]} />
      <View style={[s.abs, { left: 32, bottom: 20, width: 26, height: 26, borderRadius: 13, backgroundColor: '#468F4B' }]} />
      <Fruit ripen={ripen} green={g} ripe={r} style={{ left: 8, bottom: 24, width: 12, height: 12 }} />
      <Fruit ripen={ripen} green={g} ripe={r} style={{ left: 40, bottom: 26, width: 11, height: 11 }} />
      <Fruit ripen={ripen} green={g} ripe={r} style={{ left: 24, bottom: 14, width: 12, height: 12 }} />
      <Fruit ripen={ripen} green={g} ripe={r} style={{ left: 22, bottom: 44, width: 10, height: 10 }} />
    </Animated.View>
  );
}

function Pepper({ sway, ripen }) {
  const H = 62;
  const g = '#79B65A';
  const r = '#D6402E';
  const pod = { width: 6, height: 16, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 };
  return (
    <Animated.View style={{ width: 54, height: H, transform: aboutBottom(H, sway) }}>
      <View style={[s.abs, { left: 25, bottom: 0, width: 3, height: 34, borderRadius: 2, backgroundColor: '#5F9C58' }]} />
      <View style={[s.abs, { left: 6, bottom: 24, width: 42, height: 32, borderRadius: 16, backgroundColor: '#4F9B55' }]} />
      <View style={[s.abs, { left: 14, bottom: 38, width: 28, height: 22, borderRadius: 11, backgroundColor: '#5AA85D' }]} />
      {[10, 20, 31, 40].map((x, i) => (
        <View key={x} style={[s.abs, { left: x, bottom: i % 2 ? 12 : 8, width: 6, height: 16 }]}>
          <View style={[StyleSheet.absoluteFill, pod, { backgroundColor: g }]} />
          <Animated.View style={[StyleSheet.absoluteFill, pod, { backgroundColor: r, opacity: ripen }]} />
        </View>
      ))}
    </Animated.View>
  );
}

function Cabbage({ sway, grow }) {
  const H = 44;
  return (
    <Animated.View style={{ width: 60, height: H, transform: aboutBottom(H, sway) }}>
      <Animated.View style={{ position: 'absolute', left: 0, bottom: 0, width: 60, height: H, transform: [{ translateY: H / 2 }, { scale: grow }, { translateY: -H / 2 }] }}>
        <View style={[s.abs, { left: 2, bottom: 2, width: 56, height: 16, borderRadius: 8, backgroundColor: '#5E9F61', transform: [{ rotate: '-6deg' }] }]} />
        <View style={[s.abs, { left: 4, bottom: 10, width: 52, height: 14, borderRadius: 7, backgroundColor: '#6FB06C', transform: [{ rotate: '8deg' }] }]} />
        <View style={[s.abs, { left: 12, bottom: 4, width: 36, height: 36, borderRadius: 18, backgroundColor: '#9AD08B' }]} />
        <View style={[s.abs, { left: 18, bottom: 9, width: 24, height: 25, borderRadius: 13, backgroundColor: '#B5E0A6' }]} />
        <View style={[s.abs, { left: 24, bottom: 15, width: 12, height: 13, borderRadius: 7, backgroundColor: '#CFEDC3' }]} />
      </Animated.View>
    </Animated.View>
  );
}

function Cloud({ x, y, scale, opacity }) {
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: y, opacity, transform: [{ translateX: x }, { scale }] }}>
      <View style={[s.abs, { left: 0, top: 8, width: 54, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }]} />
      <View style={[s.abs, { left: 10, top: 0, width: 24, height: 22, borderRadius: 12, backgroundColor: '#FFFFFF' }]} />
      <View style={[s.abs, { left: 26, top: 4, width: 22, height: 18, borderRadius: 10, backgroundColor: '#FFFFFF' }]} />
    </Animated.View>
  );
}

function Barn({ left, top }) {
  return (
    <View style={[s.abs, { left, top, width: 44, height: 34 }]}>
      <View style={[s.abs, { left: 0, bottom: 0, width: 44, height: 22, backgroundColor: '#A4482A' }]} />
      <View style={[s.abs, { left: -3, top: 0, width: 0, height: 0, borderLeftWidth: 25, borderRightWidth: 25, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#7E3520' }]} />
      <View style={[s.abs, { left: 15, bottom: 0, width: 14, height: 15, backgroundColor: '#F6F1E0', opacity: 0.92 }]} />
      <View style={[s.abs, { left: 21.5, bottom: 0, width: 1.5, height: 15, backgroundColor: '#A4482A' }]} />
    </View>
  );
}

function Fence({ left, top, count }) {
  return (
    <View style={[s.abs, { left, top, height: 18, width: count * 14 }]}>
      <View style={[s.abs, { left: 0, right: 0, top: 4, height: 2, backgroundColor: '#8A6A47' }]} />
      <View style={[s.abs, { left: 0, right: 0, top: 11, height: 2, backgroundColor: '#8A6A47' }]} />
      {Array.from({ length: count + 1 }, (_, i) => (
        <View key={i} style={[s.abs, { left: i * 14, top: 0, width: 3, height: 18, borderRadius: 1, backgroundColor: '#A07C55' }]} />
      ))}
    </View>
  );
}

// Tiny static plants in the back rows
function BackRows({ width, top }) {
  const rows = [
    { y: 0, n: 22, sc: 0.7, color: '#4F9B55' },
    { y: 12, n: 18, sc: 0.9, color: '#5AA85D' },
  ];
  return (
    <View style={[s.abs, { left: 0, top, width, height: 30 }]}>
      {rows.map((r, ri) =>
        Array.from({ length: r.n }, (_, i) => {
          const x = ((i + 0.5) / r.n) * width + (((i * 37 + ri * 11) % 7) - 3);
          return (
            <View key={`${ri}-${i}`} style={[s.abs, { left: x - 4, top: r.y, width: 8, height: 9, transform: [{ scale: r.sc }] }]}>
              <View style={[s.abs, { left: 3.4, bottom: 0, width: 1.4, height: 6, backgroundColor: r.color }]} />
              <View style={[s.abs, { left: 0, bottom: 3, width: 4.5, height: 4, borderTopRightRadius: 5, borderBottomLeftRadius: 5, backgroundColor: r.color }]} />
              <View style={[s.abs, { left: 4, bottom: 4, width: 4.5, height: 4, borderTopLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#7FCB86' }]} />
            </View>
          );
        })
      )}
    </View>
  );
}

function FarmScene({ width, reduceMotion }) {
  const [breeze] = useState(() => new Animated.Value(0));
  const [ripen] = useState(() => new Animated.Value(1));
  const [goatC] = useState(() => new Animated.Value(0));
  const [hen1C] = useState(() => new Animated.Value(0));
  const [hen2C] = useState(() => new Animated.Value(0));
  const [cloud1] = useState(() => new Animated.Value(0));
  const [cloud2] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion === null) return undefined;
    if (reduceMotion) {
      ripen.setValue(1);
      return undefined;
    }

    const loopLinear = (val, ms) =>
      Animated.loop(Animated.timing(val, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    const swing = (val, ms) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );

    ripen.setValue(0);
    const ripenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ripen, { toValue: 1, duration: 7000, easing: INOUT, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(ripen, { toValue: 0, duration: 800, easing: INOUT, useNativeDriver: true }),
        Animated.delay(900),
      ])
    );

    cloud1.setValue(0.35);
    cloud2.setValue(0.7);
    const drift = (val, from, ms) =>
      Animated.sequence([
        Animated.timing(val, { toValue: 1, duration: (1 - from) * ms, easing: Easing.linear, useNativeDriver: true }),
        loopLinear(val, ms),
      ]);

    const all = Animated.parallel([
      swing(breeze, 2800),
      ripenLoop,
      loopLinear(goatC, 17000),
      loopLinear(hen1C, 11000),
      loopLinear(hen2C, 14000),
      drift(cloud1, 0.35, 70000),
      drift(cloud2, 0.7, 52000),
    ]);
    all.start();
    return () => all.stop();
  }, [reduceMotion, breeze, ripen, goatC, hen1C, hen2C, cloud1, cloud2]);

  const W = width;
  const swayA = breeze.interpolate({ inputRange: [0, 1], outputRange: ['-2.5deg', '2.5deg'] });
  const swayB = breeze.interpolate({ inputRange: [0, 1], outputRange: ['2deg', '-3deg'] });
  const grow = ripen.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const haloScale = breeze.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  const goat = useMemo(() => walkTracks(goatC, { range: W * 0.46, cycleMs: 17000 }), [goatC, W]);
  const hen1 = useMemo(() => walkTracks(hen1C, { range: W * 0.24, cycleMs: 11000, stepMs: 300, amp: 30 }), [hen1C, W]);
  const hen2 = useMemo(() => walkTracks(hen2C, { range: W * 0.3, cycleMs: 14000, stepMs: 320, amp: 30 }), [hen2C, W]);

  const cloudX = (val, w) => val.interpolate({ inputRange: [0, 1], outputRange: [-90, w + 40] });

  const sunX = W * 0.8;
  const sunY = 84;
  const groundTop = 182;

  return (
    <View style={[s.scene, { width: W, height: SCENE_H }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* sky */}
      <View style={StyleSheet.absoluteFill}>
        {MORNING_SKY.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>

      {/* sun */}
      <Animated.View style={[s.abs, { left: sunX - 60, top: sunY - 60, width: 120, height: 120, transform: [{ scale: haloScale }] }]}>
        <View style={[s.abs, { left: 0, top: 0, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255, 226, 160, 0.22)' }]} />
        <View style={[s.abs, { left: 22, top: 22, width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255, 226, 160, 0.38)' }]} />
        <View style={[s.abs, { left: 36, top: 36, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE9AE' }]} />
      </Animated.View>

      {/* clouds */}
      <Cloud x={cloudX(cloud1, W)} y={38} scale={0.9} opacity={0.5} />
      <Cloud x={cloudX(cloud2, W)} y={104} scale={0.7} opacity={0.4} />

      {/* hills and barn */}
      <View style={[s.abs, { width: W * 1.9, height: W * 1.9, borderRadius: W * 0.95, left: -W * 0.25, top: 142, backgroundColor: '#4E9B68' }]} />
      <Barn left={W * 0.6} top={120} />
      <View style={[s.abs, { width: W * 2.1, height: W * 2.1, borderRadius: W * 1.05, left: -W * 1.0, top: 160, backgroundColor: '#3A8556' }]} />

      {/* field */}
      <View style={[s.abs, { width: W * 2.6, height: W * 2.6, borderRadius: W * 1.3, left: -W * 0.8, top: groundTop, backgroundColor: '#1F5E38', borderWidth: 2, borderColor: 'rgba(168,230,161,0.22)' }]} />
      <Fence left={W * 0.03} top={groundTop - 6} count={Math.floor((W * 0.52) / 14)} />
      <BackRows width={W} top={groundTop + 6} />

      {/* animals, drawn far to near */}
      <View style={[s.abs, { left: W * 0.3, top: 214 - 30 }]}>
        <Hen walk={hen2} body="#F1E9D8" dark="#CDBF9F" />
      </View>
      <View style={[s.abs, { left: W * 0.1, top: 228 - 46 }]}>
        <Goat walk={goat} />
      </View>
      <View style={[s.abs, { left: W * 0.52, top: 246 - 30, transform: [{ scale: 1.15 }] }]}>
        <Hen walk={hen1} />
      </View>

      {/* the crops, with their produce, in the foreground corners */}
      <View style={[s.abs, { left: W * 0.02, top: SCENE_H - 100 + 4 }]}>
        <Maize sway={swayA} ripen={ripen} />
      </View>
      <View style={[s.abs, { left: W * 0.17, top: SCENE_H - 76 + 6 }]}>
        <Tomato sway={swayB} ripen={ripen} />
      </View>
      <View style={[s.abs, { left: W * 0.72, top: SCENE_H - 62 + 6 }]}>
        <Pepper sway={swayA} ripen={ripen} />
      </View>
      <View style={[s.abs, { left: W * 0.84, top: SCENE_H - 44 + 6 }]}>
        <Cabbage sway={swayB} grow={grow} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// UI pieces
// ---------------------------------------------------------------------------

function PressableCard({ onPress, children, style, accessibilityLabel }) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v) => Animated.spring(scale, { toValue: v, friction: 6, tension: 220, useNativeDriver: true }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => to(0.98)}
        onPressOut={() => to(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function Tag({ label, tone = 'default' }) {
  const tones = {
    default: { bg: 'rgba(246,241,224,0.06)', border: 'rgba(246,241,224,0.22)', fg: C.cream },
    gold: { bg: C.goldSoft, border: C.goldLine, fg: C.gold },
    warn: { bg: 'rgba(232,168,58,0.14)', border: 'rgba(232,168,58,0.45)', fg: C.warn },
  };
  const t = tones[tone];
  return (
    <View style={[s.tag, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[s.tagText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

function LanguageSwitch({ language, onChange }) {
  return (
    <View style={s.langWrap}>
      {[
        { id: 'en', label: 'English' },
        { id: 'tw', label: 'Twi' },
      ].map((l) => {
        const active = language === l.id;
        return (
          <Pressable
            key={l.id}
            onPress={() => onChange(l.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            hitSlop={8}
            style={[s.langItem, active && s.langItemActive]}
          >
            <Text style={[s.langText, active && s.langTextActive]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InputCard({ title, body, levels, demo, demoLabel }) {
  return (
    <View style={s.inputCard}>
      <View style={s.inputHead}>
        <Text style={s.inputTitle}>{title}</Text>
        {demo ? <Tag label={demoLabel} tone="warn" /> : null}
      </View>
      <Text style={s.inputBody}>{body}</Text>
      <View style={s.levelRow}>
        {levels.map((l) => (
          <View key={l.key} style={[s.level, l.key === 'right' && s.levelRight]}>
            <Text style={[s.levelText, l.key === 'right' && s.levelTextRight]}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Reads crop length from the catalogue if the backend provides it. The field
// name is not in the review, so a few likely names are tried. Nothing is
// shown if none is present, rather than guessing.
function weeksOf(crop) {
  if (typeof crop.duration_weeks === 'number') return Math.round(crop.duration_weeks);
  if (typeof crop.weeks === 'number') return Math.round(crop.weeks);
  const days = crop.duration_days ?? crop.durationDays ?? crop.duration;
  return typeof days === 'number' && days > 0 ? Math.round(days / 7) : null;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HomeScreen({
  onNavigate, // ('simulate' | 'compare' | 'result', payload) => void
  language = 'en',
  onLanguageChange,
  userName,
  recentScenarios = [], // supplied by the app (device storage); backend does not save scenarios yet
  fetchCatalogue, // optional override for tests
  apiBase = API_BASE,
}) {
  const { width } = useWindowDimensions();
  const copy = COPY[language] || COPY.en;

  const [reduceMotion, setReduceMotion] = useState(null);
  const [weather, setWeather] = useState('normal');
  const [catalogue, setCatalogue] = useState(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => mounted && setReduceMotion(!!on))
      .catch(() => mounted && setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduceMotion(!!on));
    return () => {
      mounted = false;
      if (sub && sub.remove) sub.remove();
    };
  }, []);

  const loadCatalogue = useCallback(async () => {
    try {
      const data = fetchCatalogue
        ? await fetchCatalogue()
        : await fetch(`${apiBase}/api/catalog`).then((r) => {
            if (!r.ok) throw new Error(`catalog ${r.status}`);
            return r.json();
          });
      setCatalogue(data);
      setOffline(false);
    } catch (e) {
      setOffline(true); // the default crops below keep the screen useful
    }
  }, [apiBase, fetchCatalogue]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCatalogue();
    setRefreshing(false);
  };

  const crops = useMemo(() => {
    const list = Array.isArray(catalogue?.crops) && catalogue.crops.length ? catalogue.crops : FALLBACK_CROPS;
    return list.map((c) => {
      const key = c.key ?? c.id ?? String(c.name || '').toLowerCase();
      const weeks = weeksOf(c);
      return {
        key,
        name: copy.crops[key] || c.name || key,
        emoji: CROP_EMOJI[key] || '🌱',
        note: weeks ? copy.weeks(weeks) : null,
      };
    });
  }, [catalogue, copy]);

  const go = (screen, payload) => onNavigate && onNavigate(screen, payload);
  const tileW = (width - 24 * 2 - 12) / 2;
  const TOP = Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 24) + 14;

  const fertLevels = ['under', 'right', 'over'].map((k) => ({ key: k, label: copy.levels[k] }));
  const protLevels = ['none', 'under', 'right', 'over'].map((k) => ({ key: k, label: copy.levels[k] }));

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2C6B83" translucent={Platform.OS === 'android'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} colors={[C.gold]} />}
      >
        {/* ============ SCENE + GREETING ============ */}
        <View style={s.sceneWrap}>
          <FarmScene width={width} reduceMotion={reduceMotion} />
          {!!COPY.tw && <LanguageSwitch language={language} onChange={(id) => onLanguageChange && onLanguageChange(id)} />}
          <View style={[s.greeting, { top: TOP + 34 }]} pointerEvents="none">
            <Text style={s.eyebrow}>{userName ? `${copy.welcomeBack}, ${userName}` : copy.greeting}</Text>
            <Text style={s.h1}>{copy.headline}</Text>
          </View>
        </View>

        <View style={s.body}>
          {/* ============ START ============ */}
          <View style={s.startCard}>
            <View style={s.startTop}>
              <Tag label={copy.indicative} tone="gold" />
            </View>
            <Text style={s.startTitle}>{copy.startTitle}</Text>
            <Text style={s.startSub}>{copy.startSub}</Text>

            <Text style={s.miniLabel}>{copy.weatherTitle}</Text>
            <View style={s.segment}>
              {['normal', 'dry', 'wet'].map((w) => {
                const active = weather === w;
                return (
                  <Pressable
                    key={w}
                    onPress={() => setWeather(w)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[s.segItem, active && s.segItemActive]}
                  >
                    <Text style={[s.segText, active && s.segTextActive]}>{copy.weather[w]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <PressableCard onPress={() => go('simulate', { weather })} accessibilityLabel={copy.startCta} style={{ marginTop: 16 }}>
              <View style={s.cta}>
                <Text style={s.ctaText}>{copy.startCta}</Text>
              </View>
            </PressableCard>
          </View>

          {/* ============ CROPS ============ */}
          <Text style={s.sectionTitle}>{copy.cropsTitle}</Text>
          {offline ? (
            <View style={s.notice}>
              <Text style={s.noticeText}>{copy.offline}</Text>
              <Pressable onPress={loadCatalogue} hitSlop={10}>
                <Text style={s.noticeAction}>{copy.retry}</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={s.cropGrid}>
            {crops.map((c) => (
              <PressableCard
                key={c.key}
                onPress={() => go('simulate', { crop: c.key, weather })}
                accessibilityLabel={`${copy.startCta}: ${c.name}`}
                style={{ width: tileW, margin: 6 }}
              >
                <View style={s.cropCard}>
                  <Text style={s.cropEmoji}>{c.emoji}</Text>
                  <Text style={s.cropName}>{c.name}</Text>
                  {c.note ? <Text style={s.cropNote}>{c.note}</Text> : null}
                </View>
              </PressableCard>
            ))}
          </View>

          {/* ============ WHAT YOU CAN TEST ============ */}
          <Text style={s.sectionTitle}>{copy.testTitle}</Text>
          <InputCard title={copy.fert.title} body={copy.fert.body} levels={fertLevels} />
          <InputCard title={copy.weed.title} body={copy.weed.body} levels={protLevels} demo demoLabel={copy.demo} />
          <InputCard title={copy.pest.title} body={copy.pest.body} levels={protLevels} demo demoLabel={copy.demo} />

          {/* ============ COMPARE ============ */}
          <PressableCard onPress={() => go('compare')} accessibilityLabel={copy.compareTitle} style={{ marginTop: 22 }}>
            <View style={s.compareCard}>
              <Text style={s.compareTitle}>{copy.compareTitle}</Text>
              <Text style={s.compareSub}>{copy.compareSub}</Text>
              <View style={s.scenarioRow}>
                {['a', 'b', 'c'].map((k) => (
                  <View key={k} style={s.scenarioPill}>
                    <Text style={s.scenarioLetter}>{k.toUpperCase()}</Text>
                    <Text style={s.scenarioName}>{copy.scenarioNames[k]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </PressableCard>

          {/* ============ RECENT (only when the app supplies them) ============ */}
          {recentScenarios.length > 0 ? (
            <>
              <Text style={s.sectionTitle}>{copy.recentTitle}</Text>
              {recentScenarios.slice(0, 4).map((r) => (
                <PressableCard key={r.id} onPress={() => go('result', { scenario: r })} accessibilityLabel={`${r.cropKey} ${r.weather}`} style={{ marginBottom: 10 }}>
                  <View style={s.recentCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recentTitle}>
                        {CROP_EMOJI[r.cropKey] || '🌱'} {copy.crops[r.cropKey] || r.cropName || r.cropKey}
                      </Text>
                      <Text style={s.recentMeta}>
                        {copy.weather[r.weather] || r.weather}
                        {r.dateLabel ? `, ${r.dateLabel}` : ''}
                      </Text>
                      {r.yieldMid != null ? (
                        <Text style={s.recentMeta}>
                          {copy.indicativeYield}: {Number(r.yieldMid).toFixed(1)} t/ha
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.recentProfit}>{r.profit != null ? `GH₵ ${Math.round(r.profit).toLocaleString()}` : '–'}</Text>
                      <Text style={s.recentProfitLabel}>{copy.estProfit}</Text>
                    </View>
                  </View>
                </PressableCard>
              ))}
            </>
          ) : null}

          {/* ============ ASSUMPTIONS ============ */}
          <View style={s.assumeCard}>
            <Pressable
              onPress={() => setShowAssumptions((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAssumptions }}
              style={s.assumeHead}
            >
              <Text style={s.assumeTitle}>{copy.assumptionsTitle}</Text>
              <Text style={s.assumeToggle}>{showAssumptions ? copy.hide : copy.show}</Text>
            </Pressable>
            {showAssumptions ? (
              <View style={{ marginTop: 12 }}>
                <Text style={s.assumeLabel}>{copy.used}</Text>
                {copy.usedItems.map((i) => (
                  <Text key={i} style={s.assumeItem}>{`•  ${i}`}</Text>
                ))}
                <Text style={[s.assumeLabel, { marginTop: 12 }]}>{copy.notUsed}</Text>
                {copy.notUsedItems.map((i) => (
                  <Text key={i} style={s.assumeItem}>{`•  ${i}`}</Text>
                ))}
                <View style={s.assumeDivider} />
                {copy.caveats.map((c) => (
                  <Text key={c} style={s.assumeCaveat}>{c}</Text>
                ))}
              </View>
            ) : null}
          </View>

          <Text style={s.footerNote}>{copy.footerNote}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.night },
  abs: { position: 'absolute' },

  scene: { overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  sceneWrap: { height: SCENE_H },
  greeting: { position: 'absolute', left: 24, right: 24, maxWidth: '62%' },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    color: C.cream,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 6,
  },
  h1: {
    marginTop: 4,
    fontFamily: serif,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 8,
  },

  langWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 24) + 10,
    left: 20,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(246,241,224,0.45)',
    backgroundColor: 'rgba(4,23,13,0.25)',
    padding: 3,
  },
  langItem: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 9 },
  langItemActive: { backgroundColor: C.cream },
  langText: { fontSize: 12, fontWeight: '700', color: C.cream },
  langTextActive: { color: C.night },

  body: { paddingHorizontal: 24, paddingTop: 22 },

  // Start card
  startCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.line,
  },
  startTop: { flexDirection: 'row', marginBottom: 12 },
  startTitle: { fontFamily: serif, fontSize: 24, lineHeight: 30, fontWeight: '700', color: C.cream },
  startSub: { marginTop: 6, fontSize: 14, lineHeight: 20, color: C.mint },
  miniLabel: { marginTop: 18, marginBottom: 8, fontSize: 12, fontWeight: '700', color: C.sage },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(246,241,224,0.06)',
    borderWidth: 1,
    borderColor: C.line,
  },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segItemActive: { backgroundColor: C.cream },
  segText: { fontSize: 13, fontWeight: '700', color: C.mint },
  segTextActive: { color: C.night },
  cta: { height: 54, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontWeight: '800', color: C.night },

  // Tags
  tag: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1 },
  tagText: { fontSize: 11, fontWeight: '700' },

  // Sections
  sectionTitle: { marginTop: 28, marginBottom: 12, fontSize: 15, fontWeight: '800', color: C.cream },

  // Notice
  notice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  noticeText: { flex: 1, marginRight: 12, fontSize: 12, color: C.warn },
  noticeAction: { fontSize: 12, fontWeight: '800', color: C.gold },

  // Crops
  cropGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cropCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.line,
    minHeight: 104,
  },
  cropEmoji: { fontSize: 28 },
  cropName: { marginTop: 10, fontSize: 16, fontWeight: '800', color: C.cream },
  cropNote: { marginTop: 2, fontSize: 12, color: C.sageDim },

  // Input cards
  inputCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  inputHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputTitle: { fontSize: 16, fontWeight: '800', color: C.cream },
  inputBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: C.mint },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -3 },
  level: {
    margin: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(246,241,224,0.18)',
  },
  levelRight: { backgroundColor: C.goldSoft, borderColor: C.goldLine },
  levelText: { fontSize: 12, fontWeight: '600', color: C.sage },
  levelTextRight: { color: C.gold, fontWeight: '800' },

  // Compare
  compareCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.line,
  },
  compareTitle: { fontSize: 17, fontWeight: '800', color: C.cream },
  compareSub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: C.mint },
  scenarioRow: { flexDirection: 'row', marginTop: 14, marginHorizontal: -3 },
  scenarioPill: {
    flex: 1,
    margin: 3,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(246,241,224,0.06)',
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  scenarioLetter: { fontSize: 13, fontWeight: '800', color: C.gold },
  scenarioName: { marginTop: 2, fontSize: 11, fontWeight: '600', color: C.cream },

  // Recent
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  recentTitle: { fontSize: 16, fontWeight: '800', color: C.cream },
  recentMeta: { marginTop: 3, fontSize: 12, color: C.sageDim },
  recentProfit: { fontSize: 17, fontWeight: '800', color: C.gold },
  recentProfitLabel: { marginTop: 2, fontSize: 11, color: C.sageDim },

  // Assumptions
  assumeCard: {
    marginTop: 26,
    backgroundColor: 'rgba(246,241,224,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  assumeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assumeTitle: { fontSize: 14, fontWeight: '800', color: C.cream },
  assumeToggle: { fontSize: 13, fontWeight: '800', color: C.gold },
  assumeLabel: { fontSize: 12, fontWeight: '800', color: C.sage, marginBottom: 4 },
  assumeItem: { fontSize: 13, lineHeight: 20, color: C.mint },
  assumeDivider: { height: 1, backgroundColor: C.line, marginVertical: 12 },
  assumeCaveat: { fontSize: 12, lineHeight: 18, color: C.sageDim, marginBottom: 4 },

  footerNote: { marginTop: 22, fontSize: 11, lineHeight: 16, color: C.sageDim, textAlign: 'center' },
});