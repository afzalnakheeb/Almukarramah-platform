// Seller guidelines: what may and may not be sold on Al Mukarramah, and the quality every listing must meet.
// Shown on /sell/guidelines and in the seller dashboard. The AI listing check (supabase/functions/_shared/guidelines.ts)
// applies the same rules: when you change a rule here, change it there too.

export type Bi = { en: string; ar: string };
export type GuideSection = { id: string; title: Bi; intro?: Bi; items: { t: Bi; d?: Bi }[] };

export const ALLOWED: GuideSection = {
  id: 'allowed',
  title: { en: 'What you can sell', ar: 'ما يمكنك بيعه' },
  intro: {
    en: 'Al Mukarramah is a marketplace for Islamic gifts and modest living. Only products in these groups are accepted.',
    ar: 'المكرمة سوق للهدايا الإسلامية والحياة المحتشمة، ولا نقبل إلا المنتجات ضمن هذه المجموعات.',
  },
  items: [
    { t: { en: 'Prayer essentials', ar: 'مستلزمات الصلاة' }, d: { en: 'Prayer mats and rugs, prayer clothes, tasbih and misbaha, prayer caps, qibla compasses.', ar: 'سجادات الصلاة، ملابس الصلاة، السبح والمسابح، الطواقي، بوصلات القبلة.' } },
    { t: { en: 'Quran and Islamic books', ar: 'المصاحف والكتب الإسلامية' }, d: { en: 'Printed copies of the Quran only from officially authorised printers, Quran stands, and books of tafsir, seerah, hadith and learning from known publishers.', ar: 'المصاحف المطبوعة من المطابع المعتمدة رسميًا فقط، وحوامل المصحف، وكتب التفسير والسيرة والحديث والتعليم من دور نشر معروفة.' } },
    { t: { en: 'Fragrance', ar: 'العطور' }, d: { en: 'Attar and perfume oils, oud, bakhoor, incense burners and perfumes. Alcohol-based sprays can only be delivered within Saudi Arabia.', ar: 'العطور الزيتية ودهن العود والبخور والمباخر والعطور. العطور البخاخة المحتوية على الكحول توصل داخل السعودية فقط.' } },
    { t: { en: 'Dates, honey and halal food', ar: 'التمور والعسل والأطعمة الحلال' }, d: { en: 'Sealed, labelled and halal-certified, with ingredients, origin and an expiry date at least 3 months away.', ar: 'مغلّفة ومُعلَّمة وحاصلة على شهادة حلال، مع المكونات وبلد المنشأ وتاريخ انتهاء لا يقل عن ٣ أشهر.' } },
    { t: { en: 'Modest fashion, ready-made', ar: 'الأزياء المحتشمة الجاهزة' }, d: { en: 'Thobes, abayas, modest dresses, jilbabs, hijabs and scarves, prayer clothes and modest kids’ wear, in sizes with a size chart.', ar: 'الثياب والعبايات والفساتين المحتشمة والجلابيب والحجابات والشالات وملابس الصلاة وملابس الأطفال المحتشمة، بمقاسات مع جدول مقاسات.' } },
    { t: { en: 'Modest fashion, tailor-made', ar: 'الأزياء المحتشمة حسب الطلب' }, d: { en: 'Garments made to the customer’s measurements and chosen design (collar, sleeve, cuff, pocket, fabric). You must state the tailoring time.', ar: 'ملابس تُفصَّل على مقاسات العميل وتصميمه المختار (الياقة والكم والكبك والجيب والقماش)، مع ذكر مدة التفصيل.' } },
    { t: { en: 'Home and art', ar: 'المنزل والفن' }, d: { en: 'Islamic calligraphy, geometric art, Haramain-inspired décor, lanterns, Ramadan and Eid decorations.', ar: 'الخط العربي والفن الهندسي الإسلامي وديكورات مستوحاة من الحرمين والفوانيس وزينة رمضان والعيد.' } },
    { t: { en: 'Hajj, Umrah and gift sets', ar: 'الحج والعمرة وأطقم الهدايا' }, d: { en: 'Ihram and travel essentials for pilgrims, and gift sets made of allowed items.', ar: 'ملابس الإحرام ومستلزمات سفر الحاج والمعتمر، وأطقم الهدايا المكوّنة من منتجات مسموحة.' } },
    { t: { en: 'Children’s learning', ar: 'تعليم الأطفال' }, d: { en: 'Arabic letters, Quran learning aids, puzzles and educational games without faces of people.', ar: 'الحروف العربية ووسائل تعليم القرآن والألغاز والألعاب التعليمية الخالية من وجوه الأشخاص.' } },
  ],
};

export const NOT_ALLOWED: GuideSection = {
  id: 'not-allowed',
  title: { en: 'What you cannot sell', ar: 'ما لا يمكنك بيعه' },
  intro: { en: 'Listings with any of these are blocked and can lead to your seller account being closed.', ar: 'تُمنع أي قائمة تحتوي على أحد هذه الأمور، وقد يؤدي ذلك إلى إغلاق حساب البائع.' },
  items: [
    { t: { en: 'Anything haram or unlawful', ar: 'كل ما هو محرّم أو مخالف للنظام' }, d: { en: 'Alcoholic drinks, pork or non-halal food, gambling items, tobacco, vapes and shisha, drugs.', ar: 'المشروبات الكحولية، ولحم الخنزير أو الأطعمة غير الحلال، وأدوات القمار، والتبغ والسجائر الإلكترونية والشيشة، والمخدرات.' } },
    { t: { en: 'People’s faces', ar: 'وجوه الأشخاص' }, d: { en: 'No faces in photos, on the product or on its packaging. Clothing is shown flat, on a hanger or on a faceless mannequin.', ar: 'لا وجوه في الصور ولا على المنتج ولا على غلافه. تُعرض الملابس مسطّحة أو على علّاقة أو على مجسّم بلا وجه.' } },
    { t: { en: 'Depictions of prophets or Companions', ar: 'تصوير الأنبياء أو الصحابة' }, d: { en: 'In any form: images, figures, toys or illustrations.', ar: 'بأي شكل: صور أو مجسّمات أو ألعاب أو رسومات.' } },
    { t: { en: 'Amulets and protection claims', ar: 'التمائم وادعاءات الحماية' }, d: { en: 'Taweez, charms, “evil eye” items, or anything claiming protection, luck, healing or barakah.', ar: 'التمائم والتعاويذ وما يُعلّق لدفع العين، وكل ما يُدّعى أنه يجلب الحماية أو الحظ أو الشفاء أو البركة.' } },
    { t: { en: 'Relic and origin claims', ar: 'ادعاءات الآثار والمصدر' }, d: { en: 'Pieces said to be from the Kiswah or the Haramain without official documents, and Zamzam water.', ar: 'قطع يُدّعى أنها من كسوة الكعبة أو من الحرمين دون وثائق رسمية، وماء زمزم.' } },
    { t: { en: 'Quran verses on items that are disrespected', ar: 'الآيات القرآنية على ما يُمتهن' }, d: { en: 'Verses or the names of Allah on things that are stepped on, sat on or thrown away: floor rugs, cushions, shoes, disposable items.', ar: 'الآيات أو أسماء الله على ما يُداس أو يُجلس عليه أو يُرمى: سجاد الأرضيات والوسائد والأحذية والمنتجات التي تُستعمل مرة واحدة.' } },
    { t: { en: 'Fakes and unauthorised brands', ar: 'المقلّد والعلامات غير المرخّصة' }, d: { en: 'Counterfeit, replica or “inspired by” branded goods, or brands you are not authorised to sell.', ar: 'المنتجات المقلّدة أو المستنسخة أو «المستوحاة» من علامات تجارية، أو علامات لا تملك تفويضًا ببيعها.' } },
    { t: { en: 'Health and cure claims', ar: 'ادعاءات صحية وعلاجية' }, d: { en: 'Medicines, supplements, herbal remedies, ruqyah oils or waters, or any product claiming to treat or cure.', ar: 'الأدوية والمكملات والوصفات العشبية وزيوت أو مياه الرقية، وأي منتج يُدّعى أنه يعالج أو يشفي.' } },
    { t: { en: 'Immodest or offensive items', ar: 'غير المحتشم أو المسيء' }, d: { en: 'Immodest clothing or images, political, sectarian or extremist material, or anything that mocks any faith or people.', ar: 'الملابس أو الصور غير المحتشمة، والمواد السياسية أو الطائفية أو المتطرفة، وكل ما يسخر من دين أو من الناس.' } },
    { t: { en: 'Other restricted items', ar: 'منتجات أخرى مقيّدة' }, d: { en: 'Weapons, live animals, digital downloads and services, and anything that needs a licence you do not have.', ar: 'الأسلحة، والحيوانات الحية، والملفات الرقمية والخدمات، وكل ما يحتاج إلى ترخيص لا تملكه.' } },
  ],
};

export const PHOTOS: GuideSection = {
  id: 'photos',
  title: { en: 'Photo rules', ar: 'قواعد الصور' },
  items: [
    { t: { en: 'Your own real photos of the actual product', ar: 'صورك الحقيقية للمنتج نفسه' }, d: { en: 'No stock images and no AI-generated product images.', ar: 'لا صور جاهزة من الإنترنت ولا صور منتجات مولّدة بالذكاء الاصطناعي.' } },
    { t: { en: 'No faces', ar: 'بلا وجوه' }, d: { en: 'Hands are fine. Clothing flat, on a hanger or on a faceless mannequin.', ar: 'لا مانع من ظهور اليدين. الملابس مسطّحة أو على علّاقة أو على مجسّم بلا وجه.' } },
    { t: { en: 'Clean and clear', ar: 'نظيفة وواضحة' }, d: { en: 'Light plain background, product in focus, at least 1000 px on the short side, JPEG, PNG or WEBP up to 5 MB, 1 to 8 photos.', ar: 'خلفية فاتحة سادة، والمنتج واضح، و١٠٠٠ بكسل على الأقل للضلع الأقصر، بصيغة JPEG أو PNG أو WEBP حتى ٥ ميغابايت، من ١ إلى ٨ صور.' } },
    { t: { en: 'Nothing written over the photo', ar: 'لا كتابة على الصورة' }, d: { en: 'No watermarks, prices, phone numbers, links or promotional text.', ar: 'لا علامات مائية ولا أسعار ولا أرقام هواتف ولا روابط ولا عبارات ترويجية.' } },
  ],
};

export const QUALITY: GuideSection = {
  id: 'quality',
  title: { en: 'Quality every listing must meet', ar: 'معايير الجودة لكل منتج' },
  items: [
    { t: { en: 'Clear names and descriptions in English and Arabic', ar: 'اسم ووصف واضحان بالإنجليزية والعربية' }, d: { en: 'Our AI check can suggest an Arabic version for you to check.', ar: 'يمكن لفحصنا الذكي اقتراح نسخة عربية لتراجعها.' } },
    { t: { en: 'Honest details', ar: 'تفاصيل صادقة' }, d: { en: 'Materials, size, weight or volume and origin. Perfume: concentration and whether it contains alcohol. Food: ingredients, halal certificate, expiry. Clothing: fabric and a size chart.', ar: 'الخامات والمقاس والوزن أو الحجم وبلد المنشأ. العطور: التركيز وهل تحتوي على كحول. الأطعمة: المكونات وشهادة الحلال وتاريخ الانتهاء. الملابس: نوع القماش وجدول المقاسات.' } },
    { t: { en: 'Fair prices in Saudi riyals, VAT included', ar: 'أسعار عادلة بالريال السعودي شاملة الضريبة' }, d: { en: 'The same as or lower than on your own website.', ar: 'مساوية لسعرك في موقعك أو أقل.' } },
    { t: { en: 'Only what you have', ar: 'ما يتوفر لديك فقط' }, d: { en: 'Keep stock up to date. Tailor-made items must state the tailoring time.', ar: 'حدّث المخزون باستمرار، واذكر مدة التفصيل للمنتجات حسب الطلب.' } },
    { t: { en: 'Ship on time with tracking', ar: 'الشحن في الموعد مع رقم تتبع' }, d: { en: 'Within your stated handling time (5 business days at most for ready-made items), always with a tracking number.', ar: 'خلال مدة التجهيز المعلنة (٥ أيام عمل كحد أقصى للمنتجات الجاهزة)، ودائمًا برقم تتبع.' } },
    { t: { en: 'Gift-ready packaging, no prices inside', ar: 'تغليف لائق بالهدايا ولا أسعار داخله' }, d: { en: 'Never put prices or invoices inside the parcel: many orders are gifts.', ar: 'لا تضع الأسعار أو الفواتير داخل الطرد، فكثير من الطلبات هدايا.' } },
    { t: { en: 'Reply to customers within 2 business days', ar: 'الرد على العملاء خلال يومي عمل' } },
  ],
};

export const REVIEW: GuideSection = {
  id: 'review',
  title: { en: 'How approval works', ar: 'كيف تتم الموافقة' },
  items: [
    { t: { en: '1. Our AI checks every listing', ar: '١. يفحص الذكاء الاصطناعي كل منتج' }, d: { en: 'It reads your text and looks at every photo against these rules, and tells you exactly what to fix. Listings it blocks cannot be submitted.', ar: 'يقرأ النص ويفحص كل صورة وفق هذه القواعد، ويخبرك بدقة بما يلزم تعديله. المنتجات التي يمنعها لا يمكن إرسالها.' } },
    { t: { en: '2. Our team approves every listing', ar: '٢. يوافق فريقنا على كل منتج' }, d: { en: 'Nothing you upload is public until Al Mukarramah approves it. Your photos stay private until then.', ar: 'لا يظهر أي شيء ترفعه للعامة قبل موافقة المكرمة، وتبقى صورك خاصة حتى ذلك الحين.' } },
    { t: { en: '3. Changes are checked again', ar: '٣. تُراجع التعديلات من جديد' }, d: { en: 'Changing the content of a live listing sends it back for checking and approval. Stock changes do not.', ar: 'تعديل محتوى منتج منشور يعيده للفحص والموافقة، أما تحديث المخزون فلا.' } },
    { t: { en: '4. Breaking the rules', ar: '٤. مخالفة القواعد' }, d: { en: 'Can lead to listings being removed and the seller account being closed.', ar: 'قد تؤدي إلى حذف المنتجات وإغلاق حساب البائع.' } },
  ],
};

export const GUIDE_SECTIONS = [ALLOWED, NOT_ALLOWED, PHOTOS, QUALITY, REVIEW];
