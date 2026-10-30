// "How to measure" for the tailor-made thobe and abaya service: steps, ranges, checks and all the text (English and Arabic).
// Values are always stored in centimetres; inches are only for display and input.
// Arabic: thobe steps address a man, abaya steps address a woman; shared lines use neutral phrasing.

export type Garment = 'thobe' | 'abaya';
export type MeasureKey = 'height' | 'neck' | 'shoulder' | 'chest' | 'waist' | 'hips' | 'sleeve' | 'bicep' | 'cuff' | 'length';
export type Unit = 'cm' | 'in';
export type Bi = { en: string; ar: string };
export type Measurements = Partial<Record<MeasureKey, number>>;

export type Step = {
  key: MeasureKey;
  title: Bi;
  how: { en: string[]; ar: string[] };
  tip: Bi;
  minCm: number;
  maxCm: number;
  /** A short phone video of this measurement (MP4 or a page that plays it). */
  videoUrl?: string;
};

const RANGE: Record<MeasureKey, [number, number]> = {
  height: [140, 210],
  neck: [30, 55],
  shoulder: [30, 60],
  chest: [70, 160],
  waist: [55, 160],
  hips: [70, 170],
  sleeve: [45, 75],
  bicep: [22, 55],
  cuff: [14, 30],
  length: [110, 170],
};

const step = (key: MeasureKey, s: Omit<Step, 'key' | 'minCm' | 'maxCm'>): Step => ({ key, minCm: RANGE[key][0], maxCm: RANGE[key][1], ...s });

const THOBE: Step[] = [
  step('height', {
    title: { en: 'Height', ar: 'طول القامة' },
    how: {
      en: [
        'Stand barefoot with your back and heels against a wall, looking straight ahead.',
        'Lay a flat book on top of your head, level, and mark where it meets the wall.',
        'Step away and measure from the floor up to the mark.',
      ],
      ar: [
        'قف حافي القدمين وظهرك وكعباك ملاصقان للحائط، وانظر إلى الأمام.',
        'ضع كتابًا مسطّحًا فوق رأسك أفقيًا، وضع علامة حيث يلامس الحائط.',
        'ابتعد عن الحائط وقِس المسافة من الأرض حتى العلامة.',
      ],
    },
    tip: {
      en: 'Ask someone to place the book and mark the wall for you; it is far more accurate.',
      ar: 'اطلب من أحدٍ أن يضع الكتاب ويعلّم الحائط بدلًا منك؛ فالنتيجة أدقّ بكثير.',
    },
  }),
  step('neck', {
    title: { en: 'Neck (collar)', ar: 'محيط الرقبة (الياقة)' },
    how: {
      en: [
        'Wrap the tape around the base of your neck, where the collar of a thobe sits.',
        'Slip one finger between the tape and your neck so the collar is not tight.',
        'Keep the tape level all the way round and read the measurement at the front.',
      ],
      ar: [
        'لُفّ الشريط حول أسفل الرقبة، في الموضع الذي تستقر فيه ياقة الثوب.',
        'أدخِل إصبعًا واحدًا بين الشريط والرقبة حتى لا تكون الياقة ضيّقة.',
        'حافظ على استواء الشريط من جميع الجهات، واقرأ القياس من الأمام.',
      ],
    },
    tip: {
      en: 'If you have a thobe whose collar fits well, lay the collar flat and measure it from the button to the far end of the buttonhole.',
      ar: 'إن كان لديك ثوب ياقته مريحة، فافرد الياقة وقِسها من الزر حتى طرف العروة.',
    },
  }),
  step('shoulder', {
    title: { en: 'Shoulder width', ar: 'عرض الكتف' },
    how: {
      en: [
        'Stand relaxed with your arms by your sides.',
        'Find the outer edge of each shoulder, where the shoulder seam of a well-fitting shirt sits.',
        'Measure across the back from one shoulder point to the other, following the natural curve.',
      ],
      ar: [
        'قف مسترخيًا وذراعاك إلى جانبيك.',
        'حدّد الطرف الخارجي لكل كتف، حيث تقع خياطة الكتف في قميص مقاسه مناسب.',
        'قِس عبر الظهر من طرف الكتف إلى الطرف الآخر، متتبّعًا انحناءه الطبيعي.',
      ],
    },
    tip: {
      en: 'This one is much easier with a helper standing behind you.',
      ar: 'يسهل هذا القياس كثيرًا إذا وقف أحدٌ خلفك وقاسه لك.',
    },
  }),
  step('chest', {
    title: { en: 'Chest', ar: 'محيط الصدر' },
    how: {
      en: [
        'Raise your arms a little and pass the tape under them, around the fullest part of your chest.',
        'Lower your arms and keep the tape level across your back.',
        'Breathe normally and read the measurement: snug, not tight.',
      ],
      ar: [
        'ارفع ذراعيك قليلًا ومرّر الشريط تحت الإبطين حول أعرض جزء من الصدر.',
        'أنزل ذراعيك، وتأكّد أن الشريط مستوٍ أفقيًا على الظهر.',
        'تنفّس بشكل طبيعي واقرأ القياس؛ يكون الشريط ملاصقًا غير مشدود.',
      ],
    },
    tip: {
      en: 'A thobe needs room to move. We add that ease when cutting, so give your true body measurement.',
      ar: 'يحتاج الثوب إلى سعة للحركة، ونحن نضيفها عند التفصيل، فأعطنا مقاس جسمك الفعلي.',
    },
  }),
  step('waist', {
    title: { en: 'Waist', ar: 'محيط الخصر' },
    how: {
      en: [
        'Find your waist at the level of your navel.',
        'Wrap the tape around, keeping it level all the way round.',
        'Stand relaxed and do not pull your stomach in.',
      ],
      ar: [
        'حدّد خصرك عند مستوى السُّرّة.',
        'لُفّ الشريط حوله مع إبقائه مستويًا من جميع الجهات.',
        'قف مسترخيًا ولا تشدّ بطنك إلى الداخل.',
      ],
    },
    tip: {
      en: 'Measure over light clothing only, not over a belt or thick fabric.',
      ar: 'قِس فوق ملابس خفيفة فقط، لا فوق حزام أو قماش سميك.',
    },
  }),
  step('hips', {
    title: { en: 'Hips', ar: 'محيط الورك' },
    how: {
      en: [
        'Stand with your feet together.',
        'Wrap the tape around the fullest part of your hips and seat.',
        'Check in a mirror that the tape is level, then read the measurement.',
      ],
      ar: [
        'قف وقدماك متلاصقتان.',
        'لُفّ الشريط حول أعرض جزء من الوركين والأرداف.',
        'تأكّد أمام المرآة أن الشريط مستوٍ، ثم اقرأ القياس.',
      ],
    },
    tip: {
      en: 'This keeps the thobe from pulling across the hips when you sit or pray.',
      ar: 'يمنع هذا القياس الثوب من الشدّ عند الوركين حين تجلس أو تصلّي.',
    },
  }),
  step('sleeve', {
    title: { en: 'Sleeve length', ar: 'طول الكم' },
    how: {
      en: [
        'Let your arm hang relaxed by your side.',
        'Place the end of the tape at the shoulder point, where the shoulder seam sits.',
        'Run it down the outside of the arm to the wrist bone.',
      ],
      ar: [
        'اترك ذراعك مسترخيةً إلى جانبك.',
        'ضع بداية الشريط عند طرف الكتف، في موضع خياطة الكتف.',
        'مرّره على الجهة الخارجية للذراع حتى عظمة الرسغ.',
      ],
    },
    tip: {
      en: 'Keep the arm straight but relaxed; a bent arm adds length that is not needed.',
      ar: 'أبقِ ذراعك مستقيمةً ومسترخية؛ فثني الذراع يضيف طولًا لا حاجة إليه.',
    },
  }),
  step('bicep', {
    title: { en: 'Upper arm (bicep)', ar: 'محيط العضد' },
    how: {
      en: [
        'Let your arm hang relaxed.',
        'Wrap the tape around the fullest part of the upper arm, about halfway between shoulder and elbow.',
        'Keep one finger inside the tape for comfort.',
      ],
      ar: [
        'اترك ذراعك مسترخيةً.',
        'لُفّ الشريط حول أعرض جزء من العضد، في منتصف المسافة تقريبًا بين الكتف والمرفق.',
        'أدخِل إصبعًا واحدًا داخل الشريط للراحة.',
      ],
    },
    tip: {
      en: 'This sets the width of the sleeve so it moves freely, including when you raise your hands in prayer.',
      ar: 'يحدّد هذا القياس عرض الكم ليتحرّك بحرية، حتى عند رفع اليدين في الصلاة.',
    },
  }),
  step('cuff', {
    title: { en: 'Cuff (wrist)', ar: 'محيط الكبك (فتحة الكم)' },
    how: {
      en: [
        'Wrap the tape around your wrist, just over the wrist bone, where the cuff will sit.',
        'Allow for comfort: slip one or two fingers under the tape.',
        'If you usually wear a watch, measure with it on.',
      ],
      ar: [
        'لُفّ الشريط حول المعصم فوق عظمة الرسغ مباشرةً، حيث سيستقر الكبك.',
        'اترك مساحة للراحة بإدخال إصبع أو إصبعين تحت الشريط.',
        'إن كنت تلبس ساعة عادةً، فقِس وهي في يدك.',
      ],
    },
    tip: {
      en: 'A comfortable cuff is easy to turn back when you make wudu.',
      ar: 'الكبك المريح يسهل رفعه عند الوضوء.',
    },
  }),
  step('length', {
    title: { en: 'Full length', ar: 'الطول الكامل' },
    how: {
      en: [
        'Stand straight, barefoot, with your feet together.',
        'Place the end of the tape at the highest point of the shoulder, right next to the neck.',
        'Let it fall straight down over the chest to the ankle bone.',
      ],
      ar: [
        'قف مستقيمًا حافي القدمين، وقدماك متلاصقتان.',
        'ضع بداية الشريط عند أعلى نقطة في الكتف، بجوار الرقبة مباشرةً.',
        'دعه ينسدل مستقيمًا فوق الصدر حتى عظمة الكاحل.',
      ],
    },
    tip: {
      en: 'Many prefer the hem at or just above the ankle bone; note any preference in your order.',
      ar: 'يفضّل كثيرون أن ينتهي الثوب عند عظمة الكاحل أو فوقها بقليل؛ اذكر رغبتك في ملاحظات الطلب.',
    },
  }),
];

const ABAYA: Step[] = [
  step('height', {
    title: { en: 'Height', ar: 'طول القامة' },
    how: {
      en: [
        'Stand barefoot with your back and heels against a wall, looking straight ahead.',
        'Lay a flat book on top of your head, level, and mark where it meets the wall.',
        'Step away and measure from the floor up to the mark.',
      ],
      ar: [
        'قفي حافيةَ القدمين وظهرك وكعباك ملاصقان للحائط، وانظري إلى الأمام.',
        'ضعي كتابًا مسطّحًا فوق رأسك أفقيًا، وضعي علامة حيث يلامس الحائط.',
        'ابتعدي عن الحائط وقيسي المسافة من الأرض حتى العلامة.',
      ],
    },
    tip: {
      en: 'Ask a family member or friend to place the book and mark the wall for you; it is far more accurate.',
      ar: 'اطلبي من إحدى قريباتك أو صديقاتك أن تضع الكتاب وتعلّم الحائط؛ فالنتيجة أدقّ بكثير.',
    },
  }),
  step('shoulder', {
    title: { en: 'Shoulder width', ar: 'عرض الكتف' },
    how: {
      en: [
        'Stand relaxed with your arms by your sides.',
        'Find the outer edge of each shoulder, where the shoulder seam of a well-fitting garment sits.',
        'Measure across the back from one shoulder point to the other, following the natural curve.',
      ],
      ar: [
        'قفي مسترخيةً وذراعاك إلى جانبيك.',
        'حدّدي الطرف الخارجي لكل كتف، حيث تقع خياطة الكتف في ثوب مقاسه مناسب.',
        'قيسي عبر الظهر من طرف الكتف إلى الطرف الآخر، متتبّعةً انحناءه الطبيعي.',
      ],
    },
    tip: {
      en: 'This one is much easier with a helper standing behind you.',
      ar: 'يسهل هذا القياس كثيرًا إذا قاسته لك قريبة أو صديقة من الخلف.',
    },
  }),
  step('chest', {
    title: { en: 'Bust', ar: 'محيط الصدر' },
    how: {
      en: [
        'Wearing your usual light clothing, pass the tape around the fullest part of the bust.',
        'Keep the tape level across your back, just below the shoulder blades.',
        'Breathe normally and read the measurement: snug, not tight.',
      ],
      ar: [
        'وأنتِ ترتدين ملابس خفيفة كالمعتاد، مرّري الشريط حول أعرض جزء من الصدر.',
        'تأكّدي أن الشريط مستوٍ أفقيًا على الظهر، أسفل لوحَي الكتف.',
        'تنفّسي بشكل طبيعي واقرئي القياس؛ يكون الشريط ملاصقًا غير مشدود.',
      ],
    },
    tip: {
      en: 'An abaya needs room to move. We add that ease when cutting, so give your true body measurement.',
      ar: 'تحتاج العباءة إلى سعة للحركة، ونحن نضيفها عند التفصيل، فأعطينا مقاس جسمك الفعلي.',
    },
  }),
  step('waist', {
    title: { en: 'Waist', ar: 'محيط الخصر' },
    how: {
      en: [
        'Find the narrowest part of your waist, usually just above the navel.',
        'Wrap the tape around, keeping it level all the way round.',
        'Stand relaxed and breathe normally.',
      ],
      ar: [
        'حدّدي أضيق جزء من الخصر، ويكون عادةً فوق السُّرّة بقليل.',
        'لُفّي الشريط حوله مع إبقائه مستويًا من جميع الجهات.',
        'قفي مسترخيةً وتنفّسي بشكل طبيعي.',
      ],
    },
    tip: {
      en: 'Measure over light clothing only, not over a belt or thick fabric.',
      ar: 'قيسي فوق ملابس خفيفة فقط، لا فوق حزام أو قماش سميك.',
    },
  }),
  step('hips', {
    title: { en: 'Hips', ar: 'محيط الورك' },
    how: {
      en: [
        'Stand with your feet together.',
        'Wrap the tape around the fullest part of your hips and seat.',
        'Check in a mirror that the tape is level, then read the measurement.',
      ],
      ar: [
        'قفي وقدماك متلاصقتان.',
        'لُفّي الشريط حول أعرض جزء من الوركين والأرداف.',
        'تأكّدي أمام المرآة أن الشريط مستوٍ، ثم اقرئي القياس.',
      ],
    },
    tip: {
      en: 'This lets the abaya fall straight without pulling when you sit or pray.',
      ar: 'يجعل هذا القياس العباءة تنسدل باستقامة دون شدّ حين تجلسين أو تصلّين.',
    },
  }),
  step('sleeve', {
    title: { en: 'Sleeve length', ar: 'طول الكم' },
    how: {
      en: [
        'Let your arm hang relaxed by your side.',
        'Place the end of the tape at the shoulder point, where the shoulder seam sits.',
        'Run it down the outside of the arm to where the sleeve should end, usually the wrist bone or just past it.',
      ],
      ar: [
        'اتركي ذراعك مسترخيةً إلى جانبك.',
        'ضعي بداية الشريط عند طرف الكتف، في موضع خياطة الكتف.',
        'مرّريه على الجهة الخارجية للذراع حتى الموضع الذي تريدين أن ينتهي عنده الكم، وعادةً عند عظمة الرسغ أو بعدها بقليل.',
      ],
    },
    tip: {
      en: 'Keep the arm straight but relaxed; a bent arm adds length that is not needed.',
      ar: 'أبقي ذراعك مستقيمةً ومسترخية؛ فثني الذراع يضيف طولًا لا حاجة إليه.',
    },
  }),
  step('bicep', {
    title: { en: 'Upper arm (bicep)', ar: 'محيط العضد' },
    how: {
      en: [
        'Let your arm hang relaxed.',
        'Wrap the tape around the fullest part of the upper arm, about halfway between shoulder and elbow.',
        'Keep one finger inside the tape for comfort.',
      ],
      ar: [
        'اتركي ذراعك مسترخيةً.',
        'لُفّي الشريط حول أعرض جزء من العضد، في منتصف المسافة تقريبًا بين الكتف والمرفق.',
        'أدخلي إصبعًا واحدًا داخل الشريط للراحة.',
      ],
    },
    tip: {
      en: 'This sets the width of the sleeve so it moves freely, including when you raise your hands in prayer.',
      ar: 'يحدّد هذا القياس عرض الكم ليتحرّك بحرية، حتى عند رفع اليدين في الصلاة.',
    },
  }),
  step('cuff', {
    title: { en: 'Sleeve opening (wrist)', ar: 'فتحة الكم' },
    how: {
      en: [
        'Bring your fingers together and tuck your thumb into your palm.',
        'Wrap the tape around the widest part of the hand, over the knuckles.',
        'This is the smallest opening your hand can pass through; we add ease for the sleeve style you choose.',
      ],
      ar: [
        'ضمّي أصابعك معًا، وأدخلي الإبهام نحو باطن الكف.',
        'لُفّي الشريط حول أعرض جزء من الكف، فوق مفاصل الأصابع.',
        'هذا أصغر اتساع يمكن أن تمرّ منه يدك، ونحن نضيف السعة بحسب طراز الكم الذي تختارينه.',
      ],
    },
    tip: {
      en: 'Wide or butterfly sleeves are cut wider than this; tell us your preferred style in the order notes.',
      ar: 'الأكمام الواسعة وأكمام الفراشة تُفصَّل أوسع من هذا القياس؛ اذكري الطراز الذي تفضّلينه في ملاحظات الطلب.',
    },
  }),
  step('length', {
    title: { en: 'Full length', ar: 'الطول الكامل' },
    how: {
      en: [
        'Stand straight in the shoes you usually wear with an abaya.',
        'Place the end of the tape at the highest point of the shoulder, right next to the neck.',
        'Let it fall straight down to where the abaya should end: the ankle or the floor.',
      ],
      ar: [
        'قفي مستقيمةً بالحذاء الذي تلبسينه عادةً مع العباءة.',
        'ضعي بداية الشريط عند أعلى نقطة في الكتف، بجوار الرقبة مباشرةً.',
        'دعيه ينسدل مستقيمًا حتى الموضع الذي تريدين أن تنتهي عنده العباءة: الكاحل أو الأرض.',
      ],
    },
    tip: {
      en: 'Ask your helper to read the tape at the floor while you stand still and look ahead.',
      ar: 'اطلبي ممّن تساعدك أن تقرأ القياس عند الأرض وأنتِ واقفة بثبات تنظرين إلى الأمام.',
    },
  }),
];

export const GARMENT_STEPS: Record<Garment, Step[]> = { thobe: THOBE, abaya: ABAYA };

/** Before-you-start advice (neutral Arabic, shown under the heading MEASURE_UI.beforeStart). */
export const MEASURE_INTRO: { en: string[]; ar: string[] } = {
  en: [
    "Use a soft tailor's tape measure, not a metal one.",
    'Wear light, close-fitting clothing and stand naturally.',
    'Ask someone to help: measurements taken by another person are more accurate.',
    'Keep the tape flat and snug against the body, never tight, and measure each one twice.',
  ],
  ar: [
    'استخدام شريط قياس قماشي ليّن كالذي يستخدمه الخيّاط، لا شريط معدني.',
    'ارتداء ملابس خفيفة ملاصقة للجسم، والوقوف بشكل طبيعي.',
    'الاستعانة بشخص آخر؛ فالقياس الذي يأخذه غيرك أدقّ.',
    'إبقاء الشريط مستويًا وملاصقًا للجسم دون شدّ، وتكرار كل قياس مرتين.',
  ],
};

/** Interface text for the measuring guide. */
export const MEASURE_UI = {
  beforeStart: { en: 'Before you start', ar: 'قبل البدء' },
  stepOf: (n: number, total: number): Bi => ({ en: `Step ${n} of ${total}`, ar: `الخطوة ${n} من ${total}` }),
  howTo: { en: 'How to measure', ar: 'طريقة القياس' },
  tip: { en: 'Tip', ar: 'نصيحة' },
  videoSoon: { en: 'Video coming soon', ar: 'الفيديو قريبًا' },
  watchVideo: { en: 'Watch the video', ar: 'مشاهدة الفيديو' },
  yourMeasurement: { en: 'Your measurement', ar: 'قياسك' },
  rangeHint: (lo: number, hi: number, u: Bi): Bi => ({ en: `Usually ${lo}–${hi} ${u.en}`, ar: `عادةً من ${lo} إلى ${hi} ${u.ar}` }),
  unit: { cm: { en: 'cm', ar: 'سم' }, in: { en: 'in', ar: 'إنش' } } as Record<Unit, Bi>,
  back: { en: 'Back', ar: 'السابق' },
  next: { en: 'Next', ar: 'التالي' },
  toReview: { en: 'Review', ar: 'المراجعة' },
  backToReview: { en: 'Back to review', ar: 'العودة إلى المراجعة' },
  reviewKicker: { en: 'Final check', ar: 'التحقق الأخير' },
  reviewTitle: { en: 'Review your measurements', ar: 'مراجعة القياسات' },
  reviewSub: { en: 'Check each value before you continue. Tap Edit to measure again.', ar: 'يُرجى التحقق من كل قياس قبل المتابعة، واختيار «تعديل» لإعادة أي قياس.' },
  allGood: { en: 'Everything looks consistent.', ar: 'تبدو القياسات متناسقة.' },
  edit: { en: 'Edit', ar: 'تعديل' },
  notSet: { en: 'Not set', ar: 'لم يُحدَّد' },
  done: { en: 'Done', ar: 'تم' },
  garment: { thobe: { en: 'thobe', ar: 'الثوب' }, abaya: { en: 'abaya', ar: 'العباءة' } } as Record<Garment, Bi>,
  figureLabel: (g: Garment, title?: Bi): Bi => ({
    en: `Diagram of a ${g} showing where to measure${title ? `: ${title.en}` : ''}`,
    ar: `رسم توضيحي يبيّن مواضع القياس على ${g === 'thobe' ? 'الثوب' : 'العباءة'}${title ? `: ${title.ar}` : ''}`,
  }),
};

// ---------- units ----------

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A value typed in `unit` converted to centimetres (one decimal). */
export const toCm = (value: number, unit: Unit): number => round1(unit === 'in' ? value * 2.54 : value);

/** Centimetres converted to `unit` (one decimal). */
export const fromCm = (cm: number, unit: Unit): number => round1(unit === 'in' ? cm / 2.54 : cm);

/** Display text for a stored value, e.g. "152.5" (no unit). */
export const formatMeasure = (cm: number, unit: Unit): string => String(fromCm(cm, unit));

/** Parse what someone typed: accepts Arabic-Indic digits and the Arabic decimal separator or a comma. NaN if not a number. */
export function parseMeasure(text: string): number {
  const s = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.');
  if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return NaN;
  return Number(s);
}

// ---------- checks ----------

/** Range check for one step. `unit` only changes how the range is written in the message. */
export function validate(step: Step, cm: number, unit: Unit = 'cm'): null | Bi {
  if (!Number.isFinite(cm) || cm <= 0) return { en: 'Please enter a number.', ar: 'يُرجى إدخال رقم.' };
  if (cm >= step.minCm && cm <= step.maxCm) return null;
  const lo = fromCm(step.minCm, unit);
  const hi = fromCm(step.maxCm, unit);
  const u = MEASURE_UI.unit[unit];
  return {
    en: `That looks outside the usual range (${lo}–${hi} ${u.en}). Please measure again.`,
    ar: `يبدو هذا القياس خارج النطاق المعتاد (من ${lo} إلى ${hi} ${u.ar}). يُرجى إعادة القياس.`,
  };
}

/** Consistency warnings across measurements (only for pairs that are both filled in). */
export function crossCheck(garment: Garment, values: Measurements): Bi[] {
  const steps = GARMENT_STEPS[garment];
  const has = (k: MeasureKey) => steps.some((s) => s.key === k) && typeof values[k] === 'number' && (values[k] as number) > 0;
  const v = (k: MeasureKey) => values[k] as number;
  const title = (k: MeasureKey): Bi => steps.find((s) => s.key === k)?.title ?? { en: k, ar: k };
  const out: Bi[] = [];

  if (has('length') && has('height')) {
    if (v('length') >= v('height')) {
      out.push({ en: 'Full length is longer than your height. Please check both.', ar: 'الطول الكامل أكبر من طول القامة. يُرجى التحقق من القياسين.' });
    } else if (v('length') < v('height') * 0.6) {
      out.push({ en: 'Full length looks short for your height. Measure from the shoulder beside the neck down to the hem.', ar: 'يبدو الطول الكامل قصيرًا بالنسبة إلى طول القامة. يُقاس من الكتف بجوار الرقبة حتى نهاية الثوب.' });
    }
  }
  if (has('cuff') && has('bicep') && v('cuff') > v('bicep')) {
    const c = title('cuff');
    const b = title('bicep');
    out.push({
      en: `${c.en} is larger than ${b.en}. The two may have been swapped.`,
      ar: `${c.ar} أكبر من ${b.ar}، فربما وُضع أحدهما مكان الآخر.`,
    });
  }
  if (has('neck') && has('chest') && v('neck') > v('chest') / 2) {
    out.push({ en: 'Neck looks large compared with chest. Please check both.', ar: 'يبدو محيط الرقبة كبيرًا مقارنةً بمحيط الصدر. يُرجى التحقق من القياسين.' });
  }
  if (has('sleeve') && has('height')) {
    if (v('sleeve') < v('height') * 0.25) {
      out.push({ en: 'Sleeve length looks short for your height. Measure from the shoulder point to the wrist bone.', ar: 'يبدو طول الكم قصيرًا بالنسبة إلى طول القامة. يُقاس من طرف الكتف حتى عظمة الرسغ.' });
    } else if (v('sleeve') > v('height') * 0.45) {
      out.push({ en: 'Sleeve length looks long for your height. Keep the arm straight and relaxed while measuring.', ar: 'يبدو طول الكم طويلًا بالنسبة إلى طول القامة. تُبقى الذراع مستقيمةً ومسترخية أثناء القياس.' });
    }
  }
  if (has('shoulder') && has('chest') && v('shoulder') > v('chest') * 0.65) {
    out.push({ en: 'Shoulder width looks large compared with chest. Measure straight across the back, shoulder point to shoulder point.', ar: 'يبدو عرض الكتف كبيرًا مقارنةً بمحيط الصدر. يُقاس عبر الظهر من طرف الكتف إلى الطرف الآخر.' });
  }
  return out;
}

// ---------- filming ----------

/** Shot lists for filming each measurement on a phone later. No faces: film from the neck down or use a dress form. */
export const VIDEO_SCRIPTS: Record<MeasureKey, { en: string }> = {
  height: {
    en: 'Film from the side, framed from the neck down to the floor, with the person standing barefoot against a plain wall (or use a full-height dress form). Cut to a close-up framed on the wall only: a hand lays a flat book on top of the head, level, and pencils a small mark where it meets the wall. Pull the tape from the floor up to the mark and hold on the reading for two seconds. Finish on a caption with the value in cm and inches.',
  },
  neck: {
    en: 'Use a faceless dress form, or film a person from the chin down, front-on, in a plain T-shirt. In close-up, wrap the tape around the base of the neck where a thobe collar sits. Slip one finger between tape and neck to show the allowance. Pull back slightly to show the tape level all round, then hold on the reading at the front.',
  },
  shoulder: {
    en: 'Film from behind, framed from the neck to the waist, with the person standing relaxed, arms down. A helper taps the outer edge of each shoulder bone with a fingertip. Stretch the tape across the back from one shoulder point to the other, following the curve. End on a close-up of the reading.',
  },
  chest: {
    en: 'Front view from the neck down, or a dress form. Show the arms raised slightly while the tape passes under them around the fullest part of the chest, then the arms lowered. Cut to a side angle to show the tape level across the back. Close-up on the reading with the caption "snug, not tight".',
  },
  waist: {
    en: 'Front view from the chest down. Point to navel level for a thobe, or the narrowest part just above it for an abaya. Wrap the tape and turn the dress form (or move the camera) slowly to show it level all round. Close-up on the reading with the caption "relax, do not hold your breath in".',
  },
  hips: {
    en: 'Side view from the waist to the knees, feet together. Wrap the tape around the fullest part of the hips and seat. Show the tape level from a second angle or in a mirror, keeping the frame below the shoulders. Close-up on the reading.',
  },
  sleeve: {
    en: 'Side view from the neck down, arm hanging relaxed. Hold the tape end at the shoulder point and run it down the outside of the arm. Close-up of the tape at the wrist bone, then hold on the reading. Record a second take for the abaya ending just past the wrist.',
  },
  bicep: {
    en: 'Close-up of the upper arm only, hanging relaxed. Mark the point halfway between shoulder and elbow with a fingertip. Wrap the tape around the fullest part and slip one finger inside it. Hold on the reading for two seconds.',
  },
  cuff: {
    en: 'Close-up of the wrist and hand only, on a plain background. For the thobe, wrap the tape just over the wrist bone, slip one or two fingers under it and read the value. For the abaya, fold the thumb into the palm, bring the fingers together and wrap the tape over the knuckles. Hold each reading for two seconds.',
  },
  length: {
    en: 'Full side view from the neck down to the floor, or a dress form, standing straight. Close-up of the tape end held at the highest point of the shoulder beside the neck. Follow the tape down the front of the body to the ankle bone for a thobe, or to the floor for an abaya. A helper kneels to read the value; finish on a close-up of the reading.',
  },
};
