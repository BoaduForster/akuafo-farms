import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

/* =========================================================================
 * Akuafo-Boafo: cinematic splash
 *
 * A 12 second dawn over a Ghanaian farm. The scene holds on the final frame
 * until the farmer taps "Get started". Skip is available almost immediately.
 *
 * HOW IT WORKS
 * - ONE master clock (0 → 1 over TOTAL_MS) drives the whole choreography.
 *   Every element is an eased keyframe track of that clock (see `kf`).
 * - Three small ambient loops (wind sway, wing flap, button pulse) run on top.
 * - Only `opacity` and `transform` are animated, so everything runs on the
 *   native driver (no layout props, which is what crashed the old version).
 * - Zero dependencies by default.
 *
 * OPTIONAL REAL ASSETS (all props are optional, nothing breaks without them)
 * - backdropSource: a photo, e.g. require('./assets/farm-dawn.jpg'). Replaces
 *   the drawn sky and hills with the photo, which fades up from darkness.
 * - heroSource + LottieComponent: a Lottie plant-growth animation that replaces
 *   the drawn seedlings. You pass in LottieView yourself, so this file never
 *   imports lottie-react-native and still bundles if it isn't installed.
 * ======================================================================= */

const TOTAL_MS = 12000;
const SKIP_AT_MS = 1200;
const CTA_AT_MS = 10600;

// Beat timings (ms). Change these to re-time the whole scene.
const B = {
  hills: 300,
  dawn: [1200, 5400],
  sun: [1800, 6400],
  stars: [1500, 4200],
  moon: [1400, 3400],
  seedlings: 5000,
  field: 6200,
  butterflies: [8200, 11800],
  title: 8300,
  tagline: 9100,
  subtitle: 9500,
  chips: 9800,
  cta: CTA_AT_MS,
};

const C = {
  night: '#04170D',
  ground: '#0B2D1A',
  groundRim: 'rgba(168, 230, 161, 0.20)',
  hillFar: '#1B4B3B',
  hillMid: '#14402A',
  veil: '#03100A',

  soil: '#B5532B',
  soilSpeck: 'rgba(255, 214, 170, 0.35)',
  stem: '#7FCB86',
  leaf: '#A8E6A1',
  leafDeep: '#6FBF7A',
  crop: '#4C8A52',

  gold: '#F2B33D',
  goldPressed: '#D99A24',
  goldSoft: 'rgba(242, 179, 61, 0.30)',
  sunCore: '#FFE2A0',
  star: '#F6F1E0',
  bird: '#0A1A12',

  cream: '#F6F1E0',
  mint: '#BFE5C0',
  sage: '#8FC39A',
  chipBorder: 'rgba(246, 241, 224, 0.22)',
  chipFill: 'rgba(246, 241, 224, 0.07)',
};

// All user-facing text lives here. Fill in `tw` (same keys as `en`) with your
// Twi text and an English/Twi switch appears in the top-left automatically.
const COPY = {
  en: {
    appName: 'Akuafo-Boafo',
    tagline: 'Your smart digital farming companion',
    subtitle: 'Test it virtually before applying it to the real farm.',
    start: 'Get started',
    skip: 'Skip',
    footer: 'Built for Ghanaian farmers',
    version: 'Version 0.1.0',
    crops: { maize: 'Maize', cabbage: 'Cabbage', pepper: 'Pepper', tomato: 'Tomato' },
  },
  tw: null,
};

const CROPS = [
  { key: 'maize', emoji: '🌽' },
  { key: 'cabbage', emoji: '🥬' },
  { key: 'pepper', emoji: '🌶️' },
  { key: 'tomato', emoji: '🍅' },
];

// ---- scene data ----------------------------------------------------------

const STARS = [
  [0.08, 0.06, 2.5], [0.18, 0.14, 2], [0.27, 0.05, 3], [0.36, 0.12, 2],
  [0.45, 0.07, 2.5], [0.54, 0.16, 2], [0.63, 0.04, 3], [0.72, 0.11, 2],
  [0.81, 0.07, 2.5], [0.9, 0.15, 2], [0.14, 0.26, 1.8], [0.58, 0.27, 1.8],
  [0.33, 0.3, 1.6], [0.78, 0.3, 1.6],
].map(([x, y, s]) => ({ x, y, s }));

const SEEDLINGS = [
  { x: 0.5, scale: 1.0, delay: 0 },
  { x: 0.24, scale: 0.68, delay: 260 },
  { x: 0.76, scale: 0.68, delay: 520 },
];

// Crop rows in perspective: far rows are small and tight, near rows are larger.
const ROWS = [
  { y: 8, count: 11, size: 0.55 },
  { y: 24, count: 9, size: 0.8 },
  { y: 44, count: 7, size: 1.1 },
];
const FIELD_GROUPS = 6;

const BIRDS = [
  { y: 0.16, delay: 0, size: 1 },
  { y: 0.23, delay: 700, size: 0.8 },
  { y: 0.12, delay: 1300, size: 0.65 },
];

const BUTTERFLIES = [
  { x: 0.16, y: 0.66, dx: 0.26, dy: -0.08, delay: 0 },
  { x: 0.8, y: 0.62, dx: -0.22, dy: -0.06, delay: 700 },
];

// Seedling geometry (drawn on a 120 x 160 canvas)
const SEED_W = 120;
const SEED_H = 160;
const STEM_H = 92;
const LEAF = 30;

// ---- helpers ---------------------------------------------------------------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const t = (ms) => clamp(ms / TOTAL_MS, 0, 1);
const serif = Platform.select({ ios: 'Georgia', default: 'serif' });

const EASE = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  linear: (x) => x,
  pop: Easing.out(Easing.back(1.7)),
};

// Eased keyframe track on the master clock.
// frames: [[ms, value], ...] in ascending time order.
// The output is piecewise-linear sampled from the easing curve, so it runs
// natively and still looks smooth. Holds first/last value outside the range.
function kf(clock, frames, easing = EASE.inOut, steps = 8) {
  const input = [];
  const output = [];
  const push = (ms, value) => {
    const x = t(ms);
    const last = input.length ? input[input.length - 1] : -1;
    if (x < last) return;
    if (x === last) {
      output[output.length - 1] = value;
      return;
    }
    input.push(x);
    output.push(value);
  };
  push(0, frames[0][1]);
  frames.forEach(([ms, value], i) => {
    if (i === 0) {
      push(ms, value);
      return;
    }
    const [pms, pvalue] = frames[i - 1];
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      push(pms + (ms - pms) * f, pvalue + (value - pvalue) * easing(f));
    }
  });
  push(TOTAL_MS, frames[frames.length - 1][1]);
  return clock.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Smooth vertical gradient made from thin bands (no gradient package needed).
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

const BANDS = 40;
const NIGHT_SKY = gradient(
  [[0, '#020806'], [0.55, '#06180F'], [1, '#0C2D1D']],
  BANDS
);
const DAWN_SKY = gradient(
  [[0, '#10283D'], [0.3, '#2A5868'], [0.55, '#C98A55'], [0.8, '#F4B462'], [1, '#FAD58A']],
  BANDS
);

// ---- small components ------------------------------------------------------

function Bands({ colors }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {colors.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

function LanguageSwitch({ language, onChange }) {
  return (
    <View style={styles.langWrap}>
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
            accessibilityLabel={l.label}
            hitSlop={8}
            style={[styles.langItem, active && styles.langItemActive]}
          >
            <Text style={[styles.langText, active && styles.langTextActive]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// One drawn seedling. All geometry is static; only opacity/transform animate.
function Seedling({ left, top, scale, mound, stemP, leafP, budP, swayDeg }) {
  const half = LEAF / 2;
  const stemHalf = STEM_H / 2;
  const leafFade = leafP.interpolate({ inputRange: [0, 0.2], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: SEED_W,
        height: SEED_H,
        // scale about the bottom edge so every seedling stays planted
        transform: [{ translateY: SEED_H / 2 }, { scale }, { translateY: -SEED_H / 2 }],
      }}
    >
      <Animated.View
        style={[
          styles.mound,
          { opacity: mound, transform: [{ translateY: mound.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}
      >
        <View style={[styles.speck, { left: 14, top: 9 }]} />
        <View style={[styles.speck, { left: 34, top: 13, width: 5, height: 5 }]} />
        <View style={[styles.speck, { left: 52, top: 8, width: 4, height: 4 }]} />
      </Animated.View>

      {/* Stem group sways about its base */}
      <Animated.View
        style={[
          styles.stemGroup,
          { transform: [{ translateY: stemHalf }, { rotate: swayDeg }, { translateY: -stemHalf }] },
        ]}
      >
        <Animated.View
          style={[
            styles.stem,
            {
              transform: [
                { translateY: stemP.interpolate({ inputRange: [0, 1], outputRange: [stemHalf, 0] }) },
                { scaleY: stemP },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.leafLeft,
            {
              opacity: leafFade,
              transform: [
                { translateX: leafP.interpolate({ inputRange: [0, 1], outputRange: [half, 0] }) },
                { translateY: leafP.interpolate({ inputRange: [0, 1], outputRange: [half, 0] }) },
                { scale: leafP },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.leafRight,
            {
              opacity: leafFade,
              transform: [
                { translateX: leafP.interpolate({ inputRange: [0, 1], outputRange: [-half, 0] }) },
                { translateY: leafP.interpolate({ inputRange: [0, 1], outputRange: [half, 0] }) },
                { scale: leafP },
              ],
            },
          ]}
        />
        <Animated.View style={[styles.bud, { opacity: budP, transform: [{ scale: budP }] }]} />
      </Animated.View>
    </View>
  );
}

// ---- main ------------------------------------------------------------------

export default function SplashScreen({
  onFinish,
  initialLanguage = 'en',
  onLanguageChange,
  autoAdvanceAfterMs = null, // null = hold on the final frame until the farmer taps
  backdropSource = null,
  heroSource = null,
  LottieComponent = null,
}) {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(null);
  const [language, setLanguage] = useState(COPY.tw ? initialLanguage : 'en');
  const [skipReady, setSkipReady] = useState(false);
  const [ctaReady, setCtaReady] = useState(false);

  const [clock] = useState(() => new Animated.Value(0));
  const [breeze] = useState(() => new Animated.Value(0));
  const [flap] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(1));

  const doneRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const lottieRef = useRef(null);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (onFinishRef.current) onFinishRef.current();
  }, []);

  const copy = COPY[language] || COPY.en;
  const compact = height < 760;
  const sceneH = Math.round(height * (compact ? 0.46 : 0.5));
  const groundTop = Math.round(sceneH * 0.88);
  const useLottie = !!(LottieComponent && heroSource);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => mounted && setReduceMotion(!!on))
      .catch(() => mounted && setReduceMotion(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return undefined;

    // Reduce Motion: show the finished scene immediately, no loops.
    if (reduceMotion) {
      clock.setValue(1);
      setCtaReady(true);
      return undefined;
    }

    const master = Animated.timing(clock, {
      toValue: 1,
      duration: TOTAL_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    master.start();

    const swing = (val, ms) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    const ambient = Animated.parallel([swing(breeze, 3000), swing(flap, 170), swing(pulse, 1500)]);
    ambient.start();

    const timers = [
      setTimeout(() => setSkipReady(true), SKIP_AT_MS),
      setTimeout(() => setCtaReady(true), CTA_AT_MS),
    ];
    if (autoAdvanceAfterMs != null) timers.push(setTimeout(finish, TOTAL_MS + autoAdvanceAfterMs));
    if (useLottie) {
      timers.push(
        setTimeout(() => {
          if (lottieRef.current && lottieRef.current.play) lottieRef.current.play();
        }, B.seedlings)
      );
    }

    return () => {
      master.stop();
      ambient.stop();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const changeLanguage = (id) => {
    setLanguage(id);
    if (onLanguageChange) onLanguageChange(id);
  };

  const pressTo = (to) =>
    Animated.spring(press, { toValue: to, friction: 6, tension: 220, useNativeDriver: true }).start();

  // ---- tracks driven by the master clock -----------------------------------

  const dawnP = kf(clock, [[B.dawn[0], 0], [B.dawn[1], 1]]);
  const starsO = kf(clock, [[B.stars[0], 1], [B.stars[1], 0]]);
  const moonO = kf(clock, [[B.moon[0], 1], [B.moon[1], 0]]);
  const moonY = kf(clock, [[B.moon[0], 0], [B.moon[1], 40]], EASE.inOut);
  const veilO = kf(clock, [[900, 0.82], [B.dawn[1], 0]]);
  const hillsO = kf(clock, [[B.hills, 0], [B.hills + 1100, 1]]);

  const sunY = kf(clock, [[B.sun[0], sceneH * 0.5], [B.sun[1], 0]], EASE.out);
  const sunO = kf(clock, [[B.sun[0], 0], [B.sun[0] + 500, 1]]);
  const sunScale = kf(clock, [[B.sun[0], 0.85], [B.sun[1], 1.08], [TOTAL_MS, 1.02]]);
  const glowO = kf(clock, [[B.dawn[0] + 600, 0], [B.dawn[1] + 800, 1]]);

  const backdropO = kf(clock, [[300, 0], [1600, 1]]);
  const kenBurns = kf(clock, [[0, 1.12], [TOTAL_MS, 1.0]], EASE.linear, 2);

  const swayA = breeze.interpolate({ inputRange: [0, 1], outputRange: ['-2.5deg', '2.5deg'] });
  const swayB = breeze.interpolate({ inputRange: [0, 1], outputRange: ['2deg', '-3deg'] });

  const skipO = kf(clock, [[SKIP_AT_MS, 0], [SKIP_AT_MS + 400, 1]], EASE.out);

  const titleO = kf(clock, [[B.title, 0], [B.title + 700, 1]], EASE.out);
  const titleY = kf(clock, [[B.title, 18], [B.title + 700, 0]], EASE.out);
  const ruleS = kf(clock, [[B.title + 400, 0], [B.title + 1100, 1]], EASE.out);
  const taglineO = kf(clock, [[B.tagline, 0], [B.tagline + 500, 1]], EASE.out);
  const taglineY = kf(clock, [[B.tagline, 12], [B.tagline + 500, 0]], EASE.out);
  const subtitleO = kf(clock, [[B.subtitle, 0], [B.subtitle + 500, 1]], EASE.out);
  const ctaO = kf(clock, [[B.cta, 0], [B.cta + 500, 1]], EASE.out);
  const ctaY = kf(clock, [[B.cta, 22], [B.cta + 500, 0]], EASE.out);

  const chipO = CROPS.map((_, i) => kf(clock, [[B.chips + i * 120, 0], [B.chips + i * 120 + 380, 1]], EASE.out));
  const chipS = CROPS.map((_, i) => kf(clock, [[B.chips + i * 120, 0.8], [B.chips + i * 120 + 380, 1]], EASE.pop));

  const seedlingTracks = SEEDLINGS.map((s) => {
    const a = B.seedlings + s.delay;
    return {
      mound: kf(clock, [[a, 0], [a + 500, 1]], EASE.out),
      stem: kf(clock, [[a + 300, 0], [a + 1300, 1]], EASE.out),
      leaf: kf(clock, [[a + 1100, 0], [a + 1800, 1]], EASE.pop),
      bud: kf(clock, [[a + 1600, 0], [a + 2000, 1]], EASE.pop),
    };
  });

  const fieldTracks = Array.from({ length: FIELD_GROUPS }, (_, g) =>
    kf(clock, [[B.field + g * 190, 0], [B.field + g * 190 + 1100, 1]], EASE.pop)
  );

  // ---- render -----------------------------------------------------------------

  const sunX = width * 0.68;
  const horizonY = sceneH * 0.6;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.night} />

      {/* =============== SCENE (decorative) =============== */}
      <View
        style={[styles.scene, { height: sceneH }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {backdropSource ? (
          <>
            <Animated.Image
              source={backdropSource}
              resizeMode="cover"
              style={[StyleSheet.absoluteFill, { opacity: backdropO, transform: [{ scale: kenBurns }] }]}
            />
            {/* the photo comes up out of the dark */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.night, opacity: veilO }]} />
          </>
        ) : (
          <>
            {/* Sky: night, then dawn fades over it */}
            <Bands colors={NIGHT_SKY} />
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: dawnP }]}>
              <Bands colors={DAWN_SKY} />
            </Animated.View>

            {/* Stars and moon */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: starsO }]}>
              {STARS.map((s, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: width * s.x,
                    top: sceneH * s.y,
                    width: s.s,
                    height: s.s,
                    borderRadius: s.s / 2,
                    backgroundColor: C.star,
                    opacity: 0.85,
                  }}
                />
              ))}
            </Animated.View>
            <Animated.View
              style={{
                position: 'absolute',
                left: width * 0.16,
                top: sceneH * 0.1,
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: C.cream,
                opacity: moonO,
                transform: [{ translateY: moonY }],
              }}
            />

            {/* Horizon glow */}
            <Animated.View
              style={{
                position: 'absolute',
                left: sunX - width * 0.8,
                top: horizonY - width * 0.28,
                width: width * 1.6,
                height: width * 0.56,
                borderRadius: width * 0.4,
                backgroundColor: 'rgba(255, 190, 90, 0.22)',
                opacity: glowO,
              }}
            />

            {/* Sun, rising from behind the far hill */}
            <Animated.View
              style={{
                position: 'absolute',
                left: sunX - 45,
                top: sceneH * 0.34 - 45,
                width: 90,
                height: 90,
                opacity: sunO,
                transform: [{ translateY: sunY }, { scale: sunScale }],
              }}
            >
              <View style={styles.sunHalo} />
              <View style={styles.sunMid} />
              <View style={styles.sunCore} />
            </Animated.View>

            {/* Birds crossing at first light */}
            {BIRDS.map((b, i) => {
              const a = 3000 + b.delay;
              return (
                <Animated.View
                  key={`bird-${i}`}
                  style={{
                    position: 'absolute',
                    top: sceneH * b.y,
                    left: 0,
                    opacity: kf(clock, [[a, 0], [a + 300, 1], [a + 3100, 1], [a + 3500, 0]], EASE.linear, 2),
                    transform: [
                      { translateX: kf(clock, [[a, -40], [a + 3500, width + 40]], EASE.linear, 2) },
                      { translateY: kf(clock, [[a, 0], [a + 1700, -12], [a + 3500, 6]], EASE.inOut) },
                      { scale: b.size },
                    ],
                  }}
                >
                  <Animated.View
                    style={[
                      styles.wing,
                      { left: -14, transform: [{ rotate: flap.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '12deg'] }) }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.wing,
                      { left: 0, transform: [{ rotate: flap.interpolate({ inputRange: [0, 1], outputRange: ['24deg', '-12deg'] }) }] },
                    ]}
                  />
                </Animated.View>
              );
            })}

            {/* Hills */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: hillsO }]}>
              <View
                style={{
                  position: 'absolute',
                  width: width * 2.2,
                  height: width * 2.2,
                  borderRadius: width * 1.1,
                  left: -width * 0.6,
                  top: sceneH * 0.6,
                  backgroundColor: C.hillFar,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  width: width * 2.0,
                  height: width * 2.0,
                  borderRadius: width * 1.0,
                  left: -width * 0.05,
                  top: sceneH * 0.72,
                  backgroundColor: C.hillMid,
                }}
              />
            </Animated.View>

            {/* Night veil over the hills, lifting with the dawn */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.veil, opacity: veilO }]} />
          </>
        )}

        {/* Butterflies near the plants */}
        {BUTTERFLIES.map((b, i) => {
          const a = B.butterflies[0] + b.delay;
          const z = B.butterflies[1];
          return (
            <Animated.View
              key={`bf-${i}`}
              style={{
                position: 'absolute',
                left: width * b.x,
                top: sceneH * b.y,
                opacity: kf(clock, [[a, 0], [a + 500, 1], [z - 500, 1], [z, 0]], EASE.linear, 2),
                transform: [
                  { translateX: kf(clock, [[a, 0], [z, width * b.dx]], EASE.inOut) },
                  { translateY: kf(clock, [[a, 0], [z, sceneH * b.dy]], EASE.inOut) },
                ],
              }}
            >
              <Animated.View
                style={{
                  transform: [
                    { translateY: breeze.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
                    { scaleX: flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }) },
                  ],
                }}
              >
                <View style={styles.bfWingL} />
                <View style={styles.bfWingR} />
              </Animated.View>
            </Animated.View>
          );
        })}
      </View>

      {/* =============== SEEDLINGS (decorative) =============== */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {useLottie ? (
          <LottieComponent
            ref={lottieRef}
            source={heroSource}
            autoPlay={false}
            loop={false}
            progress={reduceMotion ? 1 : undefined}
            style={{
              position: 'absolute',
              left: width / 2 - 130,
              top: groundTop + 12 - 260,
              width: 260,
              height: 260,
            }}
          />
        ) : (
          SEEDLINGS.map((s, i) => (
            <Seedling
              key={`seed-${i}`}
              left={width * s.x - SEED_W / 2}
              top={groundTop + 10 - SEED_H}
              scale={s.scale}
              mound={seedlingTracks[i].mound}
              stemP={seedlingTracks[i].stem}
              leafP={seedlingTracks[i].leaf}
              budP={seedlingTracks[i].bud}
              swayDeg={i === 1 ? swayB : swayA}
            />
          ))
        )}
      </View>

      {/* =============== GROUND + CROP ROWS (decorative) =============== */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.groundClip, { top: groundTop }]}
      >
        <View
          style={{
            position: 'absolute',
            width: width * 2.6,
            height: width * 2.6,
            borderRadius: width * 1.3,
            left: -width * 0.8,
            top: 0,
            backgroundColor: C.ground,
            borderWidth: 2,
            borderColor: C.groundRim,
          }}
        />
        {ROWS.map((row, r) =>
          Array.from({ length: row.count }, (_, i) => {
            const jitter = ((i * 53 + r * 17) % 9) - 4;
            const x = ((i + 0.5) / row.count) * width + jitter;
            const p = fieldTracks[(i + r * 2) % FIELD_GROUPS];
            return (
              <View
                key={`crop-${r}-${i}`}
                style={{
                  position: 'absolute',
                  left: x - 8,
                  top: row.y,
                  width: 16,
                  height: 18,
                  transform: [{ translateY: 9 }, { scale: row.size }, { translateY: -9 }],
                }}
              >
                <Animated.View
                  style={{
                    flex: 1,
                    transform: [
                      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) },
                      { scaleY: p },
                    ],
                  }}
                >
                  <View style={styles.cropLeafL} />
                  <View style={styles.cropLeafR} />
                  <View style={styles.cropStem} />
                </Animated.View>
              </View>
            );
          })
        )}
      </View>

      {/* =============== BRAND + CTA =============== */}
      <View style={[styles.lower, { top: groundTop + 66 }]} pointerEvents="box-none">
        <View style={styles.brand}>
          <Animated.Text
            style={[styles.title, { opacity: titleO, transform: [{ translateY: titleY }] }]}
            accessibilityRole="header"
          >
            {copy.appName}
          </Animated.Text>
          <Animated.View style={[styles.rule, { transform: [{ scaleX: ruleS }] }]} />
          <Animated.Text style={[styles.tagline, { opacity: taglineO, transform: [{ translateY: taglineY }] }]}>
            {copy.tagline}
          </Animated.Text>
          {!compact && (
            <Animated.Text style={[styles.subtitle, { opacity: subtitleO }]}>{copy.subtitle}</Animated.Text>
          )}
          <View style={styles.crops}>
            {CROPS.map((c, i) => (
              <Animated.View
                key={c.key}
                style={[styles.chip, { opacity: chipO[i], transform: [{ scale: chipS[i] }] }]}
              >
                <Text style={styles.chipEmoji}>{c.emoji}</Text>
                <Text style={styles.chipText}>{copy.crops[c.key]}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View
          style={[styles.footer, { opacity: ctaO, transform: [{ translateY: ctaY }] }]}
          pointerEvents={ctaReady ? 'auto' : 'none'}
          accessibilityElementsHidden={!ctaReady}
          importantForAccessibility={ctaReady ? 'auto' : 'no-hide-descendants'}
        >
          <Animated.View style={{ width: '100%', transform: [{ scale: press }] }}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ctaHalo,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
                },
              ]}
            />
            <Pressable
              onPress={finish}
              onPressIn={() => pressTo(0.97)}
              onPressOut={() => pressTo(1)}
              accessibilityRole="button"
              accessibilityLabel={copy.start}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: C.goldPressed }]}
            >
              <View pointerEvents="none" style={styles.buttonHighlight} />
              <Text style={styles.buttonText}>{copy.start}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.footerText}>{copy.footer}</Text>
          <Text style={styles.versionText}>{copy.version}</Text>
        </Animated.View>
      </View>

      {/* =============== TOP CONTROLS =============== */}
      {!!COPY.tw && <LanguageSwitch language={language} onChange={changeLanguage} />}

      {!reduceMotion && (
        <Animated.View
          pointerEvents={skipReady ? 'auto' : 'none'}
          style={[styles.skipWrap, { opacity: skipO }]}
        >
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel={copy.skip}
            hitSlop={12}
            style={({ pressed }) => [styles.skipButton, pressed && { backgroundColor: 'rgba(246,241,224,0.16)' }]}
          >
            <Text style={styles.skipText}>{copy.skip}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const TOP_INSET = Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 24) + 14;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.night, overflow: 'hidden' },
  scene: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  groundClip: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },

  // Sun
  sunHalo: {
    position: 'absolute',
    width: 230, height: 230, borderRadius: 115,
    left: -70, top: -70,
    backgroundColor: 'rgba(247, 201, 107, 0.10)',
  },
  sunMid: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    left: -30, top: -30,
    backgroundColor: 'rgba(247, 201, 107, 0.22)',
  },
  sunCore: {
    position: 'absolute',
    width: 90, height: 90, borderRadius: 45,
    left: 0, top: 0,
    backgroundColor: C.sunCore,
  },

  // Birds
  wing: {
    position: 'absolute',
    top: 0,
    width: 14, height: 2, borderRadius: 1,
    backgroundColor: C.bird,
  },

  // Seedling
  mound: {
    position: 'absolute',
    left: (SEED_W - 70) / 2,
    bottom: 0,
    width: 70, height: 22,
    backgroundColor: C.soil,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    overflow: 'hidden',
  },
  speck: {
    position: 'absolute',
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: C.soilSpeck,
  },
  stemGroup: {
    position: 'absolute',
    left: SEED_W / 2 - 3,
    bottom: 16,
    width: 6,
    height: STEM_H,
  },
  stem: {
    position: 'absolute',
    left: 0, bottom: 0,
    width: 6, height: STEM_H,
    borderRadius: 3,
    backgroundColor: C.stem,
  },
  leafLeft: {
    position: 'absolute',
    width: LEAF, height: LEAF,
    left: -LEAF + 1,
    bottom: 50,
    backgroundColor: C.leafDeep,
    borderTopRightRadius: LEAF,
    borderBottomLeftRadius: LEAF,
  },
  leafRight: {
    position: 'absolute',
    width: LEAF, height: LEAF,
    left: 5,
    bottom: 64,
    backgroundColor: C.leaf,
    borderTopLeftRadius: LEAF,
    borderBottomRightRadius: LEAF,
  },
  bud: {
    position: 'absolute',
    width: 12, height: 12, borderRadius: 6,
    left: -3,
    bottom: STEM_H - 5,
    backgroundColor: C.leaf,
  },

  // Crop rows
  cropStem: {
    position: 'absolute',
    left: 7, bottom: 0,
    width: 2, height: 12,
    borderRadius: 1,
    backgroundColor: C.crop,
  },
  cropLeafL: {
    position: 'absolute',
    left: 0, bottom: 7,
    width: 8, height: 7,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: C.leafDeep,
  },
  cropLeafR: {
    position: 'absolute',
    left: 8, bottom: 9,
    width: 8, height: 7,
    borderTopLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: C.leaf,
  },

  // Butterflies
  bfWingL: {
    position: 'absolute',
    width: 8, height: 10,
    left: -8, top: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: 'rgba(247, 201, 107, 0.9)',
  },
  bfWingR: {
    position: 'absolute',
    width: 8, height: 10,
    left: 0, top: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: 'rgba(247, 201, 107, 0.9)',
  },

  // Lower area (brand on top, call to action at the bottom)
  lower: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  brand: { alignItems: 'center' },
  title: {
    fontFamily: serif,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    color: C.cream,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  rule: {
    width: 56, height: 3, borderRadius: 2,
    marginTop: 8, marginBottom: 10,
    backgroundColor: C.gold,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: C.mint,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 300,
    fontSize: 13,
    lineHeight: 19,
    color: C.sage,
    textAlign: 'center',
  },
  crops: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    marginHorizontal: -4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 4,
    paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.chipBorder,
    backgroundColor: C.chipFill,
  },
  chipEmoji: { fontSize: 14, marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: C.cream },

  // Footer
  footer: { alignItems: 'center' },
  ctaHalo: {
    position: 'absolute',
    left: -8, right: -8, top: -8, bottom: -8,
    borderRadius: 22,
    backgroundColor: C.goldSoft,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.gold,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  buttonHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  buttonText: { fontSize: 17, fontWeight: '700', color: C.night },
  footerText: { marginTop: 14, fontSize: 13, fontWeight: '600', color: C.mint },
  versionText: { marginTop: 2, fontSize: 11, color: C.sage },

  // Top controls
  langWrap: {
    position: 'absolute',
    top: TOP_INSET,
    left: 20,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.chipBorder,
    padding: 3,
    zIndex: 5,
  },
  langItem: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 9 },
  langItemActive: { backgroundColor: C.cream },
  langText: { fontSize: 13, fontWeight: '600', color: C.mint },
  langTextActive: { color: C.night },
  skipWrap: { position: 'absolute', top: TOP_INSET, right: 20, zIndex: 5 },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.chipBorder,
    backgroundColor: 'rgba(246, 241, 224, 0.08)',
  },
  skipText: { fontSize: 13, fontWeight: '700', color: C.cream, letterSpacing: 0.3 },
});