// "How to measure" for the tailor-made thobe and abaya: a faceless diagram and a step-by-step guide (web and apps).
// All text lives in src/lib/measurements.ts (English and Arabic). Values passed in and out are always centimetres.
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { useI18n } from '@/lib/i18n';
import {
  crossCheck, formatMeasure, fromCm, GARMENT_STEPS, MEASURE_INTRO, MEASURE_UI, parseMeasure, toCm, validate,
  type Bi, type Garment, type MeasureKey, type Measurements, type Unit,
} from '@/lib/measurements';
import { colors, radius } from '@/theme';
import { Button, Card, Chip, Divider, Eyebrow, Field, Serif, T, useWide } from './ui';

// ---------- diagram ----------

type Shape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({ kind: 'line', x1, y1, x2, y2 });
const ring = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry });

// Where each measurement is drawn, in the 200 x 360 viewBox.
const GEO: Record<Garment, Partial<Record<MeasureKey, Shape>>> = {
  thobe: {
    height: line(16, 15, 16, 348),
    neck: ring(100, 60, 11, 3.5),
    shoulder: line(62, 72, 138, 72),
    chest: ring(100, 112, 37, 5),
    waist: ring(100, 158, 35, 5),
    hips: ring(100, 204, 36, 5),
    sleeve: line(62, 72, 48, 196),
    bicep: ring(57, 112, 9, 3),
    cuff: ring(50.5, 194, 8, 2.5),
    length: line(108, 61, 108, 338),
  },
  abaya: {
    height: line(16, 13, 16, 349),
    shoulder: line(64, 72, 136, 72),
    chest: ring(100, 114, 38, 5),
    waist: ring(100, 158, 38, 5),
    hips: ring(100, 204, 41, 5),
    sleeve: line(64, 72, 42, 194),
    bicep: ring(56, 114, 11, 3),
    cuff: ring(48, 194, 16, 3.5),
    length: line(108, 67, 108, 341),
  },
};

function MeasureShape({ shape, active, faint }: { shape: Shape; active: boolean; faint: { color: string; opacity: number } }) {
  if (!active) {
    const p = { stroke: faint.color, strokeOpacity: faint.opacity, strokeWidth: 1.2, strokeDasharray: '3 3', fill: 'none' };
    return shape.kind === 'line'
      ? <Line {...p} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} strokeLinecap="round" />
      : <Ellipse {...p} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  }
  const ends: [number, number][] = shape.kind === 'line'
    ? [[shape.x1, shape.y1], [shape.x2, shape.y2]]
    : [[shape.cx - shape.rx, shape.cy], [shape.cx + shape.rx, shape.cy]];
  return (
    <>
      {shape.kind === 'line' ? (
        <>
          <Line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={colors.goldBright} strokeOpacity={0.3} strokeWidth={7} strokeLinecap="round" />
          <Line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={colors.gold} strokeWidth={2.6} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill="none" stroke={colors.goldBright} strokeOpacity={0.3} strokeWidth={6} />
          <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill="none" stroke={colors.gold} strokeWidth={2.6} />
        </>
      )}
      {ends.map(([x, y], k) => <Circle key={k} cx={x} cy={y} r={3.2} fill={colors.gold} stroke={colors.white} strokeWidth={1} />)}
    </>
  );
}

function ThobeBody() {
  const cloth = { fill: colors.white, stroke: colors.brass, strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  const skin = { fill: colors.sand, stroke: colors.brass, strokeWidth: 1 };
  return (
    <>
      <Ellipse cx={100} cy={348} rx={52} ry={3.5} fill={colors.sand} opacity={0.7} />
      <Ellipse {...skin} cx={90} cy={344} rx={9} ry={3.5} />
      <Ellipse {...skin} cx={110} cy={344} rx={9} ry={3.5} />
      {/* Plain head shape: no features. */}
      <Ellipse {...skin} cx={100} cy={34} rx={15} ry={19} />
      <Rect {...skin} x={93} y={48} width={14} height={12} />
      <Path {...cloth} d="M92 60 L62 72 L66 104 L68 200 L70 338 L130 338 L132 200 L134 104 L138 72 L108 60 Z" />
      <Path d="M100 64 V132" stroke={colors.champagne} strokeWidth={1.2} />
      {[78, 94, 110].map((y) => <Circle key={y} cx={100} cy={y} r={1.4} fill={colors.brass} />)}
      <Path {...cloth} d="M62 72 Q51 76 50 92 L44 196 L57 197 L65 110 Z" />
      <Path {...cloth} d="M138 72 Q149 76 150 92 L156 196 L143 197 L135 110 Z" />
      <Ellipse {...skin} cx={50.5} cy={205} rx={5.5} ry={8} />
      <Ellipse {...skin} cx={149.5} cy={205} rx={5.5} ry={8} />
      {/* Stand collar */}
      <Rect {...cloth} x={90} y={55} width={20} height={8} rx={3} />
    </>
  );
}

function AbayaBody() {
  const cloth = { fill: colors.navy, stroke: colors.goldLine, strokeWidth: 1, strokeLinejoin: 'round' as const };
  const skin = { fill: colors.sand, stroke: colors.brass, strokeWidth: 1 };
  return (
    <>
      <Ellipse cx={100} cy={349} rx={58} ry={3.5} fill={colors.sand} opacity={0.7} />
      <Ellipse cx={90} cy={346} rx={9} ry={3} fill={colors.ink} />
      <Ellipse cx={110} cy={346} rx={9} ry={3} fill={colors.ink} />
      <Path {...cloth} d="M64 72 L66 106 C62 180 56 260 48 338 Q100 344 152 338 C144 260 138 180 134 106 L136 72 Z" />
      <Path {...cloth} d="M64 72 Q50 76 49 92 L32 194 Q48 200 64 194 L66 110 Z" />
      <Path {...cloth} d="M136 72 Q150 76 151 92 L168 194 Q152 200 136 194 L134 110 Z" />
      <Ellipse {...skin} cx={48} cy={205} rx={5.5} ry={8} />
      <Ellipse {...skin} cx={152} cy={205} rx={5.5} ry={8} />
      {/* Head covering draped over the shoulders: no face. */}
      <Path fill={colors.nightSoft} stroke={colors.goldLine} strokeWidth={1} d="M100 13 C82 13 79 28 80 44 C81 56 76 64 64 72 L136 72 C124 64 119 56 120 44 C121 28 118 13 100 13 Z" />
    </>
  );
}

/** Faceless standing figure in a thobe or abaya, with every measurement faint and the highlighted one in pulsing gold. */
export function MeasureFigure({ garment, highlight, size = 200 }: { garment: Garment; highlight?: MeasureKey; size?: number }) {
  const { lang } = useI18n();
  const [bright, setBright] = useState(true);

  useEffect(() => {
    setBright(true);
    if (!highlight) return undefined;
    const id = setInterval(() => setBright((b) => !b), 700);
    return () => clearInterval(id);
  }, [highlight]);

  const steps = GARMENT_STEPS[garment];
  const geo = GEO[garment];
  const title = steps.find((s) => s.key === highlight)?.title;
  const faintFor = (k: MeasureKey) =>
    garment === 'abaya' && k !== 'height' ? { color: colors.line, opacity: 0.6 } : { color: colors.inputLine, opacity: 1 };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={MEASURE_UI.figureLabel(garment, title)[lang]} style={{ width: size, height: size * 1.8 }}>
      <Svg width={size} height={size * 1.8} viewBox="0 0 200 360" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {garment === 'thobe' ? <ThobeBody /> : <AbayaBody />}
        {steps.map((s) => {
          const shape = geo[s.key];
          return shape && s.key !== highlight ? <MeasureShape key={s.key} shape={shape} active={false} faint={faintFor(s.key)} /> : null;
        })}
        {highlight && geo[highlight] ? (
          <G opacity={bright ? 1 : 0.5}>
            <MeasureShape shape={geo[highlight] as Shape} active faint={faintFor(highlight)} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

// ---------- guide ----------

function NumberDot({ n, size = 24 }: { n: number; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
      <T w={700} size={12} color={colors.brassText}>{n}</T>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 4, borderRadius: radius.pill, backgroundColor: colors.gold }} />
    </View>
  );
}

function VideoArea({ url, title }: { url: string; title: string }) {
  const { lang } = useI18n();
  if (Platform.OS === 'web') {
    return (
      <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.night, marginBottom: 18 }}>
        {React.createElement('video', {
          src: url, controls: true, playsInline: true, preload: 'metadata', 'aria-label': title,
          style: { width: '100%', maxHeight: 420, display: 'block', backgroundColor: colors.night },
        })}
      </View>
    );
  }
  return (
    <Button
      kind="secondary" size="sm" label={MEASURE_UI.watchVideo[lang]}
      onPress={() => { Linking.openURL(url).catch(() => undefined); }}
      style={{ alignSelf: 'flex-start', marginBottom: 18 }}
    />
  );
}

/**
 * Step-by-step measuring wizard ending in a review of every value with consistency warnings.
 * `values` are centimetres; `unit` is only how they are shown and typed.
 */
export function MeasureGuide({ garment, values, onChange, unit, onUnitChange, onDone }: {
  garment: Garment;
  values: Measurements;
  onChange: (v: Measurements) => void;
  unit: Unit;
  onUnitChange: (u: Unit) => void;
  /** Optional: shows a Done button on the review once every value is valid. */
  onDone?: () => void;
}) {
  const { lang, isRTL } = useI18n();
  const wide = useWide();
  const L = (b: Bi) => b[lang];
  const steps = GARMENT_STEPS[garment];
  const total = steps.length;

  const [index, setIndex] = useState(0); // index === total is the review
  const [fromReview, setFromReview] = useState(false);
  const [text, setText] = useState('');
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    setIndex(0);
    setFromReview(false);
  }, [garment]);

  const atReview = index >= total;
  const step = atReview ? undefined : steps[index];
  const stepKey = step?.key;

  // Fill the input from the stored value when the step or the unit changes.
  useEffect(() => {
    if (!stepKey) return;
    const cm = valuesRef.current[stepKey];
    setText(typeof cm === 'number' ? formatMeasure(cm, unit) : '');
  }, [stepKey, unit]);

  const unitLabel = L(MEASURE_UI.unit[unit]);
  const backArrow = isRTL ? '→' : '←';
  const nextArrow = isRTL ? '←' : '→';

  const unitChips = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['cm', 'in'] as const).map((u) => (
        <Chip key={u} size="sm" label={L(MEASURE_UI.unit[u])} active={unit === u} onPress={() => onUnitChange(u)} />
      ))}
    </View>
  );

  if (atReview) {
    const warnings = crossCheck(garment, values);
    const rows = steps.map((s) => {
      const cm = values[s.key];
      const err = typeof cm === 'number' ? validate(s, cm, unit) : null;
      return { s, cm, err };
    });
    const complete = rows.every((r) => typeof r.cm === 'number' && !r.err);
    return (
      <Card pad={wide ? 28 : 18} style={{ borderColor: colors.champagne }}>
        <View style={{ marginBottom: 20 }}><ProgressBar value={1} /></View>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 18 }}>
          {wide ? (
            <View style={{ width: 240, alignItems: 'center', backgroundColor: colors.sandSoft, borderRadius: 18, padding: 14, alignSelf: 'flex-start' }}>
              <MeasureFigure garment={garment} size={200} />
            </View>
          ) : null}
          <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Eyebrow size={12}>{L(MEASURE_UI.reviewKicker)}</Eyebrow>
                <Serif role="h2" size={wide ? 34 : 28} style={{ marginTop: 4 }}>{L(MEASURE_UI.reviewTitle)}</Serif>
              </View>
              {unitChips}
            </View>
            <T size={14} color={colors.muted} lh={1.5} style={{ marginTop: 6, marginBottom: 14 }}>{L(MEASURE_UI.reviewSub)}</T>

            <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
              {rows.map(({ s, cm, err }, k) => (
                <View key={s.key} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <NumberDot n={k + 1} size={22} />
                    <T w={600} size={15} color={colors.navy} style={{ flex: 1 }}>{L(s.title)}</T>
                    <T w={700} size={15} color={typeof cm === 'number' ? colors.navy : colors.muted}>
                      {typeof cm === 'number' ? `${formatMeasure(cm, unit)} ${unitLabel}` : L(MEASURE_UI.notSet)}
                    </T>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${L(MEASURE_UI.edit)}: ${L(s.title)}`}
                      onPress={() => { setFromReview(true); setIndex(k); }}
                      hitSlop={8}
                      style={{ marginStart: 4, paddingVertical: 4 }}>
                      <T w={700} size={13} color={colors.brassText} style={{ textDecorationLine: 'underline' }}>{L(MEASURE_UI.edit)}</T>
                    </Pressable>
                  </View>
                  {err ? <T size={12} w={500} color={colors.danger} style={{ marginTop: 4, marginStart: 34 }}>{L(err)}</T> : null}
                </View>
              ))}
            </View>

            <View style={{ gap: 8, marginTop: 16 }}>
              {warnings.map((w, k) => (
                <View key={k} accessibilityRole="alert" style={{ backgroundColor: colors.warnBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
                  <T w={600} size={13.5} color={colors.warn} lh={1.45}>{L(w)}</T>
                </View>
              ))}
              {complete && warnings.length === 0 ? (
                <View style={{ backgroundColor: colors.successBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
                  <T w={600} size={13.5} color={colors.success}>{L(MEASURE_UI.allGood)}</T>
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
              <Button kind="secondary" label={`${backArrow} ${L(MEASURE_UI.back)}`} onPress={() => { setFromReview(false); setIndex(total - 1); }} />
              {onDone ? <Button kind="primary" label={L(MEASURE_UI.done)} disabled={!complete} onPress={onDone} /> : null}
            </View>
          </View>
        </View>
      </Card>
    );
  }

  const s = step as NonNullable<typeof step>;
  const parsed = parseMeasure(text);
  const empty = text.trim() === '';
  const error: Bi | null = empty ? null : !Number.isFinite(parsed) ? { en: 'Please enter a number.', ar: 'يُرجى إدخال رقم.' } : validate(s, toCm(parsed, unit), unit);
  const valid = !empty && !error;

  const onText = (t: string) => {
    setText(t);
    const n = parseMeasure(t);
    const next: Measurements = { ...values };
    if (Number.isFinite(n) && n > 0) next[s.key] = toCm(n, unit);
    else delete next[s.key];
    onChange(next);
  };

  const goNext = () => {
    if (!valid) return;
    if (fromReview) {
      setFromReview(false);
      setIndex(total);
    } else {
      setIndex(index + 1);
    }
  };

  const nextLabel = fromReview ? L(MEASURE_UI.backToReview) : index === total - 1 ? L(MEASURE_UI.toReview) : L(MEASURE_UI.next);
  const lo = fromCm(s.minCm, unit);
  const hi = fromCm(s.maxCm, unit);

  return (
    <Card pad={wide ? 28 : 18} style={{ borderColor: colors.champagne }}>
      <View style={{ marginBottom: 20 }}><ProgressBar value={index / total} /></View>

      {index === 0 && !fromReview ? (
        <View style={{ backgroundColor: colors.ivory, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 16, padding: 16, marginBottom: 20, gap: 8 }}>
          <T w={700} size={15} color={colors.navy}>{L(MEASURE_UI.beforeStart)}</T>
          {MEASURE_INTRO[lang].map((line, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 6, height: 6, marginTop: 8, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />
              <T size={14} lh={1.5} style={{ flexShrink: 1 }}>{line}</T>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 18 }}>
        <View style={{ width: wide ? 260 : '100%', alignItems: 'center', backgroundColor: colors.sandSoft, borderRadius: 18, padding: 14, gap: 8, alignSelf: wide ? 'flex-start' : 'stretch' }}>
          <MeasureFigure garment={garment} highlight={s.key} size={wide ? 220 : 150} />
          {!s.videoUrl ? <T size={12} color={colors.muted} center>{L(MEASURE_UI.videoSoon)}</T> : null}
        </View>

        <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          <Eyebrow size={12}>{L(MEASURE_UI.stepOf(index + 1, total))}</Eyebrow>
          <Serif role="h2" size={wide ? 36 : 28} style={{ marginTop: 4, marginBottom: 14 }}>{L(s.title)}</Serif>

          <T w={700} size={13} color={colors.navy} style={{ marginBottom: 8 }}>{L(MEASURE_UI.howTo)}</T>
          <View style={{ gap: 10, marginBottom: 16 }}>
            {s.how[lang].map((line, k) => (
              <View key={k} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <NumberDot n={k + 1} />
                <T size={15} lh={1.5} style={{ flexShrink: 1, marginTop: 1 }}>{line}</T>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: colors.goldSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 18 }}>
            <T w={700} size={12} color={colors.brassText} style={{ marginBottom: 2 }}>{L(MEASURE_UI.tip)}</T>
            <T size={14} color={colors.brassText} lh={1.5}>{L(s.tip)}</T>
          </View>

          {s.videoUrl ? <VideoArea url={s.videoUrl} title={L(s.title)} /> : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Field
                label={`${L(MEASURE_UI.yourMeasurement)} (${unitLabel})`}
                value={text}
                onChangeText={onText}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={goNext}
                maxLength={6}
                error={error ? L(error) : null}
                hint={L(MEASURE_UI.rangeHint(lo, hi, MEASURE_UI.unit[unit]))}
              />
            </View>
            <View style={{ marginTop: 25 }}>{unitChips}</View>
          </View>

          <Divider style={{ marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Button kind="secondary" label={`${backArrow} ${L(MEASURE_UI.back)}`} disabled={index === 0} onPress={() => setIndex(Math.max(0, index - 1))} />
            <Button kind="primary" label={`${nextLabel} ${nextArrow}`} disabled={!valid} onPress={goNext} />
          </View>
        </View>
      </View>
    </Card>
  );
}
