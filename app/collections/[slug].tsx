// Collection pages (/collections/prayer-mats …): pre-rendered for search engines with their own title, list and answers.
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ShopView } from '../(shop)/shop';
import { snapshot } from '@/lib/snapshot';

export function generateStaticParams(): { slug: string }[] {
  return snapshot.categories.map((c) => ({ slug: c.slug }));
}

export default function Collection() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ShopView fixedCat={slug} />;
}
