// The Al Mukarramah family of apps. Add a new app here and it appears on /apps, in the account and in search data.
export type AppStatus = 'live_web' | 'beta' | 'coming_soon';

export type PlatformApp = {
  slug: string;
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  description_en: string;
  description_ar: string;
  features_en: string[];
  features_ar: string[];
  audience_en: string;
  audience_ar: string;
  url?: string;          // web app address
  ios?: string;          // App Store link, when published
  android?: string;      // Google Play link, when published
  icon: string;          // square icon, absolute URL or site path
  accent: string;        // brand colour of the app
  status: AppStatus;
  category: 'GameApplication' | 'EducationalApplication' | 'LifestyleApplication';
};

export const APPS: PlatformApp[] = [
  {
    slug: 'recite-with-me',
    name_en: 'Recite With Me',
    name_ar: 'رتّل معي',
    tagline_en: 'Hifz and tajweed, to the standard of the Two Holy Mosques',
    tagline_ar: 'حفظ وتجويد على منهج الحرمين الشريفين',
    description_en: 'Memorise the Quran with a daily plan for new lessons and revision, listen to the Haramain imams, recite while the app listens, and meet your teacher in live sessions. Adhkar, duas and prayer times are built in.',
    description_ar: 'احفظ القرآن الكريم بخطة يومية للحفظ الجديد والمراجعة، واستمع إلى أئمة الحرمين، ورتّل والتطبيق يستمع إليك، والتقِ بمعلّمك في جلسات مباشرة. ويضم الأذكار والأدعية ومواقيت الصلاة.',
    features_en: ['Daily hifz and muraja’a plan', 'Recite while the app listens', 'Live sessions with your teacher', 'Adhkar, duas and prayer times'],
    features_ar: ['خطة يومية للحفظ والمراجعة', 'رتّل والتطبيق يستمع إليك', 'جلسات مباشرة مع معلّمك', 'الأذكار والأدعية ومواقيت الصلاة'],
    audience_en: 'Students of hifz, their teachers and parents',
    audience_ar: 'طلاب الحفظ ومعلّموهم وأولياء أمورهم',
    url: 'https://rattilmai.com',
    icon: 'https://rattilmai.com/icons/icon-512.png',
    accent: '#0B6B4F',
    status: 'beta',
    category: 'EducationalApplication',
  },
  {
    slug: 'seerah-trails',
    name_en: 'Seerah Trails',
    name_ar: 'دروب السيرة',
    tagline_en: 'A 3D journey through the life of the Prophet ﷺ',
    tagline_ar: 'رحلة ثلاثية الأبعاد في سيرة النبي ﷺ',
    description_en: 'A halal, child-friendly 3D game through Makkah, the Hijra and Madinah. Children travel by camel, meet the people of the Seerah, answer questions from authentic sources and earn their way forward, in Arabic, English and more languages.',
    description_ar: 'لعبة ثلاثية الأبعاد آمنة ومناسبة للأطفال عبر مكة والهجرة والمدينة المنورة. يسافر الأطفال على الإبل، ويتعرفون على أحداث السيرة، ويجيبون عن أسئلة من مصادر موثوقة ويتقدمون بجهدهم، بالعربية والإنجليزية ولغات أخرى.',
    features_en: ['Makkah, the Hijra and Madinah in 3D', 'Questions from authentic Seerah sources', 'Earn your camel and supplies', 'Arabic, English, Urdu and more'],
    features_ar: ['مكة والهجرة والمدينة بتقنية ثلاثية الأبعاد', 'أسئلة من مصادر السيرة الموثوقة', 'اكسب راحلتك ومؤونتك', 'العربية والإنجليزية والأردية وغيرها'],
    audience_en: 'Children and families',
    audience_ar: 'الأطفال والعائلات',
    url: 'https://seerahtrails.com',
    icon: 'https://seerahtrails.com/icons/icon-512.png',
    accent: '#10262C',
    status: 'live_web',
    category: 'GameApplication',
  },
];

export function appLd(a: PlatformApp, site: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: a.name_en,
    alternateName: a.name_ar,
    description: a.description_en,
    applicationCategory: a.category,
    operatingSystem: 'Web, iOS, Android',
    url: a.url,
    image: a.icon,
    publisher: { '@id': `${site}/#organization` },
    inLanguage: ['ar', 'en'],
  };
}
