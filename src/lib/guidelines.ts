// The seller handbook: the parts that do not change with the category tree or the Islamic standard (those come
// from the database through mp_guidance(): categories, their policies, and the prohibited and restricted items).
// Shown on /sell/guidelines and its pages and in the seller dashboard. The AI screening builds its instructions from
// the same policy rows and settings, so the handbook and the checks never disagree.

export type Bi = { en: string; ar: string };
export type GuideItem = { t: Bi; d?: Bi };
export type GuideSection = { id: string; title: Bi; intro?: Bi; items: GuideItem[]; accepted?: Bi[]; rejected?: Bi[] };
export type GuidePage = { id: string; href: '/sell/categories' | '/sell/islamic-standard' | '/sell/premium-standard' | '/sell/photos' | '/sell/prohibited' | '/sell/guidelines'; title: Bi; line: Bi };

export const GUIDE_PAGES: GuidePage[] = [
  { id: 'handbook', href: '/sell/guidelines', title: { en: 'Seller handbook', ar: 'دليل البائع' }, line: { en: 'How selling on Al Mukarramah works, from application to approval.', ar: 'كيف يعمل البيع في المكرمة، من الطلب حتى الموافقة.' } },
  { id: 'categories', href: '/sell/categories', title: { en: 'What you can sell', ar: 'ما يمكنك بيعه' }, line: { en: 'Our categories, and what each one needs: details, documents, photos, returns and shipping.', ar: 'فئاتنا وما تحتاجه كل فئة: التفاصيل والمستندات والصور والإرجاع والشحن.' } },
  { id: 'islamic', href: '/sell/islamic-standard', title: { en: 'The Al Mukarramah Islamic standard', ar: 'معيار المكرمة الإسلامي' }, line: { en: 'Prohibited, restricted and allowed: the three levels every product is held to.', ar: 'ممنوع ومقيّد ومسموح: المستويات الثلاثة التي يُقاس بها كل منتج.' } },
  { id: 'premium', href: '/sell/premium-standard', title: { en: 'The premium standard', ar: 'معيار الجودة الراقية' }, line: { en: 'Who we accept, the listing quality score and the service we expect.', ar: 'من نقبل، ودرجة جودة المنتج، والخدمة التي ننتظرها.' } },
  { id: 'photos', href: '/sell/photos', title: { en: 'Photo guidelines', ar: 'إرشادات الصور' }, line: { en: 'Large, clean photos of the product itself, with no people and nothing written on top.', ar: 'صور كبيرة ونظيفة للمنتج نفسه، بلا أشخاص ولا كتابة فوقها.' } },
  { id: 'prohibited', href: '/sell/prohibited', title: { en: 'Prohibited and restricted items', ar: 'المنتجات الممنوعة والمقيّدة' }, line: { en: 'What is never accepted, and what our team decides case by case.', ar: 'ما لا يُقبل أبدًا، وما يقرّره فريقنا في كل حالة على حدة.' } },
];

export const ISLAMIC_LEVELS: { level: 'prohibited' | 'restricted' | 'allowed'; title: Bi; body: Bi }[] = [
  { level: 'prohibited', title: { en: 'Prohibited', ar: 'ممنوع' },
    body: { en: 'Never accepted. A listing with a prohibited item or image is rejected automatically, before it reaches our team, and counts as a strike on your account.',
            ar: 'لا يُقبل أبدًا. يُرفض المنتج الذي يحتوي على منتج أو صورة ممنوعة تلقائيًا قبل أن يصل إلى فريقنا، ويُحتسب مخالفة على حسابك.' } },
  { level: 'restricted', title: { en: 'Restricted', ar: 'مقيّد' },
    body: { en: 'Contested among scholars or needing proof. Our team decides each listing, following the guidance of the scholar who reviews our standard.',
            ar: 'محل خلاف بين العلماء أو يحتاج إلى إثبات. يقرّر فريقنا في كل منتج وفق توجيه العالم الذي يراجع معيارنا.' } },
  { level: 'allowed', title: { en: 'Allowed', ar: 'مسموح' },
    body: { en: 'Everything else within our categories, as long as it meets the premium standard.',
            ar: 'كل ما سوى ذلك ضمن فئاتنا، ما دام يحقق معيار الجودة الراقية.' } },
];

export const ISLAMIC_NOTE: Bi = {
  en: 'This standard is Al Mukarramah’s store policy, reviewed by a qualified scholar. It is not a fatwa, and it does not judge anyone’s practice.',
  ar: 'هذا المعيار سياسة متجر المكرمة، ويراجعه عالم مؤهل، وليس فتوى، ولا يحكم على ممارسة أحد.',
};

export const PREMIUM: GuideSection[] = [
  {
    id: 'vetting',
    title: { en: 'Who we accept', ar: 'من نقبل' },
    intro: { en: 'We look for makers and brands with something to be proud of. Your application tells us your story; our team may ask for more, or for a sample.', ar: 'نبحث عن صنّاع وعلامات لديهم ما يفخرون به. يحكي طلبك قصتك، وقد يطلب فريقنا المزيد أو عيّنة.' },
    items: [
      { t: { en: 'Your brand or maker story', ar: 'قصة علامتك أو صنعتك' }, d: { en: 'Who you are, what you make or carry, and why it belongs in a Muslim home.', ar: 'من أنت، وما الذي تصنعه أو تبيعه، ولماذا يليق ببيت المسلم.' } },
      { t: { en: 'Years in business and a portfolio', ar: 'سنوات العمل ونماذج من أعمالك' }, d: { en: 'Photos of your best pieces, and your website or social pages.', ar: 'صور لأفضل قطعك، وموقعك أو حساباتك على وسائل التواصل.' } },
      { t: { en: 'Proof of authenticity', ar: 'إثبات الأصالة' }, d: { en: 'For every brand you do not own, a letter from the brand owner naming you an authorised distributor.', ar: 'لكل علامة لا تملكها، خطاب من مالك العلامة يسمّيك موزّعًا معتمدًا.' } },
      { t: { en: 'A physical sample when we ask', ar: 'عيّنة فعلية عند الطلب' }, d: { en: 'For some categories we hold the product before we approve: requested, received, passed.', ar: 'في بعض الفئات نفحص المنتج بأيدينا قبل الموافقة: طُلبت، استُلمت، اجتازت.' } },
      { t: { en: 'Company and bank details checked', ar: 'التحقق من بيانات المنشأة والبنك' }, d: { en: 'The documents your country requires, your legal entity and an IBAN in its name.', ar: 'المستندات التي تتطلبها دولتك، وكيانك النظامي، وآيبان باسمه.' } },
    ],
    accepted: [
      { en: 'A Madinah workshop weaving prayer mats for eight years, with a portfolio, a website and its own trademark', ar: 'ورشة في المدينة تنسج سجادات الصلاة منذ ثماني سنوات، لديها نماذج أعمال وموقع وعلامة تجارية مسجّلة' },
      { en: 'An oud house reselling a famous brand with the brand owner’s signed distributor letter', ar: 'دار عود تبيع علامة مشهورة مع خطاب توزيع موقّع من مالك العلامة' },
    ],
    rejected: [
      { en: 'Unbranded goods bought from a wholesale market with no proof of where they came from', ar: 'بضائع بلا علامة مشتراة من سوق الجملة دون إثبات لمصدرها' },
      { en: 'Designer perfumes with no letter from the brand owner', ar: 'عطور مصمّمين دون خطاب من مالك العلامة' },
    ],
  },
  {
    id: 'score',
    title: { en: 'Every listing earns a quality score', ar: 'لكل منتج درجة جودة' },
    intro: { en: 'While you write a listing we score it out of 100 and tell you exactly what would raise it. A listing below the minimum score cannot be submitted.', ar: 'أثناء كتابة المنتج نمنحه درجة من ١٠٠ ونخبرك بدقة بما يرفعها، ولا يمكن إرسال منتج دون الحد الأدنى للدرجة.' },
    items: [
      { t: { en: 'Photos: enough of them, and large', ar: 'الصور: عدد كافٍ وبحجم كبير' }, d: { en: 'At least 3 photos (5 for fashion), each at least 1600 px on its long side.', ar: '٣ صور على الأقل (٥ للأزياء)، لا يقل الضلع الأطول لكل منها عن ١٦٠٠ بكسل.' } },
      { t: { en: 'Clean photos on a calm background', ar: 'صور نظيفة على خلفية هادئة' }, d: { en: 'No watermarks, stickers, collages, text, prices or contact details.', ar: 'بلا علامات مائية أو ملصقات أو صور مجمّعة أو كتابة أو أسعار أو بيانات تواصل.' } },
      { t: { en: 'Every detail the category asks for', ar: 'كل تفصيل تطلبه الفئة' }, d: { en: 'Volume and concentration for perfume, fabric and care for fashion, weight and best-before for food, and so on.', ar: 'الحجم والتركيز للعطور، والقماش والعناية للأزياء، والوزن وتاريخ الانتهاء للأطعمة، وهكذا.' } },
      { t: { en: 'Arabic and English, both written well', ar: 'العربية والإنجليزية، كلتاهما بإتقان' }, d: { en: 'A title and a description in each. Our AI can draft the second language for you to check and confirm; it never touches Quran text.', ar: 'عنوان ووصف بكل لغة. يمكن لذكائنا الاصطناعي اقتراح اللغة الثانية لتراجعها وتعتمدها، ولا يمسّ نصوص القرآن أبدًا.' } },
    ],
    accepted: [
      { en: 'Five 2400 px photos of an abaya on a ghost mannequin, fabric and care filled in, both languages written: score 96', ar: 'خمس صور بدقة ٢٤٠٠ بكسل لعباية على مجسّم شفاف، مع القماش وطريقة العناية، واللغتان مكتوبتان: الدرجة ٩٦' },
    ],
    rejected: [
      { en: 'One phone photo of a perfume on a cluttered shelf with a price sticker, English only: score 31', ar: 'صورة جوال واحدة لعطر على رف مزدحم بملصق سعر، بالإنجليزية فقط: الدرجة ٣١' },
    ],
  },
  {
    id: 'service',
    title: { en: 'The service we expect', ar: 'الخدمة التي ننتظرها' },
    items: [
      { t: { en: 'Accept orders and ship on time', ar: 'اقبل الطلبات واشحنها في موعدها' }, d: { en: 'Accept each order, then print our label within your handling time; the courier collects from your address.', ar: 'اقبل كل طلب ثم اطبع ملصق الشحن الخاص بنا خلال مدة التجهيز، ويستلم المندوب الطرد من عنوانك.' } },
      { t: { en: 'Gift-ready packaging, never a price inside', ar: 'تغليف لائق بالهدايا، ولا سعر داخل الطرد أبدًا' }, d: { en: 'Many orders are gifts: no invoices or price tags in the parcel.', ar: 'كثير من الطلبات هدايا: لا فواتير ولا بطاقات أسعار داخل الطرد.' } },
      { t: { en: 'Answer customers within two business days', ar: 'أجب العملاء خلال يومي عمل' }, d: { en: 'Through Al Mukarramah messages only. Phone numbers and links are hidden.', ar: 'عبر رسائل المكرمة فقط، وتُخفى أرقام الهواتف والروابط.' } },
      { t: { en: 'Honest prices in Saudi riyals, VAT included', ar: 'أسعار عادلة بالريال السعودي شاملة الضريبة' }, d: { en: 'The same as or lower than your own shop. Big price changes on a live listing go back to our team.', ar: 'مساوية لسعر متجرك أو أقل، والتغييرات الكبيرة في سعر منتج منشور تعود إلى فريقنا.' } },
    ],
  },
];

export const PHOTO_RULES: GuideSection[] = [
  {
    id: 'people',
    title: { en: 'The product, never people', ar: 'المنتج، لا الأشخاص' },
    intro: { en: 'We do not use people in product photos. Show garments flat, on a hanger, on a mannequin or on a ghost mannequin. A hand holding a small piece is fine.', ar: 'لا نستخدم الأشخاص في صور المنتجات. اعرض الملابس مسطّحة أو على علّاقة أو على مجسّم أو مجسّم شفاف، ولا بأس بيد تمسك قطعة صغيرة.' },
    items: [
      { t: { en: 'No models, no faces', ar: 'لا عارضين ولا وجوه' }, d: { en: 'Including faces on packaging: photograph the product without that box.', ar: 'بما في ذلك الوجوه على العلب: صوّر المنتج دون تلك العلبة.' } },
      { t: { en: 'Nothing immodest, ever', ar: 'لا شيء غير محتشم أبدًا' }, d: { en: 'An immodest image is a prohibited item: it is quarantined and counts as a strike.', ar: 'الصورة غير المحتشمة من الممنوعات: تُعزل وتُحتسب مخالفة.' } },
    ],
    accepted: [
      { en: 'A thobe on a ghost mannequin against an ivory wall', ar: 'ثوب على مجسّم شفاف أمام جدار عاجي' },
      { en: 'A tasbih resting in an open palm, nothing else of the person shown', ar: 'مسبحة في كف مفتوحة دون ظهور شيء آخر من الشخص' },
    ],
    rejected: [
      { en: 'An abaya worn by a model, even with the face cropped', ar: 'عباية ترتديها عارضة حتى لو قُصّ الوجه' },
      { en: 'A perfume advertised with a woman in the picture', ar: 'عطر يُعلن عنه بصورة فيها امرأة' },
    ],
  },
  {
    id: 'technical',
    title: { en: 'Large and sharp', ar: 'كبيرة وواضحة' },
    items: [
      { t: { en: 'At least 1600 px on the long side', ar: '١٦٠٠ بكسل على الأقل للضلع الأطول' }, d: { en: 'JPEG, PNG or WebP, up to 10 MB each. We remove hidden location data from every photo.', ar: 'بصيغة JPEG أو PNG أو WebP، حتى ١٠ ميغابايت للصورة. ونحذف بيانات الموقع المخفية من كل صورة.' } },
      { t: { en: 'At least 3 photos, 5 for fashion, up to 10', ar: '٣ صور على الأقل، و٥ للأزياء، وحتى ١٠' }, d: { en: 'The first photo is the main one: the whole product, straight on.', ar: 'الصورة الأولى هي الرئيسية: المنتج كاملًا من الأمام.' } },
      { t: { en: 'In focus and well lit', ar: 'واضحة وجيدة الإضاءة' }, d: { en: 'Daylight or soft studio light; no heavy filters.', ar: 'ضوء النهار أو إضاءة استوديو ناعمة، بلا مرشّحات ثقيلة.' } },
    ],
  },
  {
    id: 'clean',
    title: { en: 'Clean and calm', ar: 'نظيفة وهادئة' },
    items: [
      { t: { en: 'A plain or premium background', ar: 'خلفية سادة أو راقية' }, d: { en: 'Ivory, white or stone, or a calm setting of wood, linen or marble. No clutter.', ar: 'عاجي أو أبيض أو حجري، أو مشهد هادئ من الخشب أو الكتان أو الرخام، بلا ازدحام.' } },
      { t: { en: 'Nothing written on top', ar: 'لا كتابة فوق الصورة' }, d: { en: 'No watermarks, added logos, stickers, text, prices, phone numbers, social handles, links or QR codes.', ar: 'لا علامات مائية ولا شعارات مضافة ولا ملصقات ولا كتابة ولا أسعار ولا أرقام هواتف ولا حسابات تواصل ولا روابط ولا رموز QR.' } },
      { t: { en: 'One photo, one view', ar: 'صورة واحدة لزاوية واحدة' }, d: { en: 'No collages or grids of several shots.', ar: 'لا صور مجمّعة ولا شبكات من عدة لقطات.' } },
    ],
    accepted: [{ en: 'An oud bottle on a plain stone slab, soft daylight from one side', ar: 'زجاجة عود على لوح حجري سادة بضوء نهار ناعم من جانب واحد' }],
    rejected: [
      { en: 'A photo with “50% off” and a WhatsApp number across it', ar: 'صورة عليها «خصم ٥٠٪» ورقم واتساب' },
      { en: 'A collage of four bottles with the shop’s logo stamped in the corner', ar: 'صورة مجمّعة لأربع زجاجات مع شعار المتجر في الزاوية' },
    ],
  },
  {
    id: 'true',
    title: { en: 'True to the listing', ar: 'مطابقة للمنتج' },
    items: [
      { t: { en: 'Your own photos of the actual product', ar: 'صورك أنت للمنتج نفسه' }, d: { en: 'No stock images and no AI-generated product images.', ar: 'لا صور جاهزة ولا صور منتجات مولّدة بالذكاء الاصطناعي.' } },
      { t: { en: 'It must match the title and category', ar: 'يجب أن تطابق العنوان والفئة' }, d: { en: 'A photo of something else is refused.', ar: 'تُرفض صورة لشيء آخر.' } },
      { t: { en: 'Respect for what is sacred', ar: 'احترام المقدسات' }, d: { en: 'No sacred text where it would be stepped on or thrown away, and no images of prophets or Companions.', ar: 'لا نصوص مقدسة فيما يُداس أو يُرمى، ولا صور للأنبياء أو الصحابة.' } },
    ],
  },
];

export const APPROVAL: GuideSection = {
  id: 'approval',
  title: { en: 'How approval works', ar: 'كيف تتم الموافقة' },
  items: [
    { t: { en: '1. Every photo is checked as you upload it', ar: '١. تُفحص كل صورة عند رفعها' }, d: { en: 'Photos stay private. A photo that breaks the rules comes back with the reason; prohibited content is quarantined and counts as a strike.', ar: 'تبقى الصور خاصة. تعود الصورة المخالفة إليك مع السبب، ويُعزل المحتوى الممنوع ويُحتسب مخالفة.' } },
    { t: { en: '2. The whole listing is checked when you submit it', ar: '٢. يُفحص المنتج كاملًا عند إرساله' }, d: { en: 'Text, photos and the category’s requirements. If something must change, the listing comes straight back to you with reasons you can act on; it never reaches our team like that.', ar: 'النص والصور ومتطلبات الفئة. وإذا لزم تعديل شيء يعود المنتج إليك مباشرة مع أسباب واضحة يمكنك العمل بها، ولا يصل إلى فريقنا بهذه الحال.' } },
    { t: { en: '3. A person approves every listing', ar: '٣. يوافق شخص من فريقنا على كل منتج' }, d: { en: 'Nothing is public until our team approves it. Notes from the check are shown to them.', ar: 'لا يظهر شيء للعامة قبل موافقة فريقنا، وتُعرض عليهم ملاحظات الفحص.' } },
    { t: { en: '4. Never passed without a check', ar: '٤. لا شيء يمر دون فحص' }, d: { en: 'If our checking service is unavailable, your listing waits as “check pending” and is checked as soon as it is back.', ar: 'إذا تعذّر عمل خدمة الفحص ينتظر منتجك بحالة «بانتظار الفحص»، ويُفحص فور عودتها.' } },
    { t: { en: '5. Strikes', ar: '٥. المخالفات' }, d: { en: 'Three prohibited items within 90 days suspend the account until our team reviews it. A severe violation suspends the listing at once.', ar: 'ثلاث مخالفات بمنتجات ممنوعة خلال ٩٠ يومًا توقف الحساب حتى يراجعه فريقنا، والمخالفة الجسيمة توقف المنتج فورًا.' } },
    { t: { en: '6. Changes are checked again', ar: '٦. تُراجع التعديلات من جديد' }, d: { en: 'Editing a live listing sends it back for checking and approval. Stock changes do not.', ar: 'تعديل منتج منشور يعيده للفحص والموافقة، أما تحديث المخزون فلا.' } },
  ],
};
