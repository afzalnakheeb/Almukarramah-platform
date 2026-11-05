// The three concepts we present (/concepts/<slug>): copy in src/lib/i18n.tsx (cn…), films in the investor bundle.
import type { Key } from './i18n';

export type Concept = {
  slug: string;
  clip: string;
  kicker: Key;
  title: Key;
  body: Key;
  points: Key[];
  figures: { value: Key; label: Key }[];
  note?: Key;
  links: { label: Key; href: string }[];
};

export const CONCEPTS: Concept[] = [
  {
    slug: 'elite-subscriptions', clip: 'subscriptions',
    kicker: 'cnSubsKicker', title: 'cnSubsTitle', body: 'cnSubsBody',
    points: ['cnSubsP1', 'cnSubsP2', 'cnSubsP3', 'cnSubsP4'],
    figures: [{ value: 'cnSubsF1v', label: 'cnSubsF1l' }, { value: 'cnSubsF2v', label: 'cnSubsF2l' }, { value: 'cnSubsF3v', label: 'cnSubsF3l' }],
    links: [{ label: 'cnSubsL1', href: '/membership' }, { label: 'cnSubsL2', href: '/apps' }],
  },
  {
    slug: 'global-brands', clip: 'global-brands',
    kicker: 'cnBrandsKicker', title: 'cnBrandsTitle', body: 'cnBrandsBody',
    points: ['cnBrandsP1', 'cnBrandsP2', 'cnBrandsP3', 'cnBrandsP4'],
    figures: [{ value: 'cnBrandsF1v', label: 'cnBrandsF1l' }, { value: 'cnBrandsF2v', label: 'cnBrandsF2l' }, { value: 'cnBrandsF3v', label: 'cnBrandsF3l' }],
    links: [{ label: 'cnBrandsL1', href: '/brands' }],
  },
  {
    slug: 'collabs', clip: 'collabs',
    kicker: 'cnCollabsKicker', title: 'cnCollabsTitle', body: 'cnCollabsBody',
    points: ['cnCollabsP1', 'cnCollabsP2', 'cnCollabsP3', 'cnCollabsP4'],
    figures: [{ value: 'cnCollabsF1v', label: 'cnCollabsF1l' }, { value: 'cnCollabsF2v', label: 'cnCollabsF2l' }, { value: 'cnCollabsF3v', label: 'cnCollabsF3l' }],
    note: 'cnCollabsNote',
    links: [{ label: 'cnBrandsL1', href: '/brands' }],
  },
];
