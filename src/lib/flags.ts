// Build flags for the marketplace (kept tiny so every page can read them without loading the marketplace data).
/** The screenshot build only: marketplace screens show example data (src/lib/market-demo.ts). Never set in a real deployment. */
export const MARKET_DEMO = process.env.EXPO_PUBLIC_MARKET_DEMO === '1';
/** Set once the marketplace migrations are applied (docs/marketplace/SWITCH-ON.md). Until then the site reads only the
 *  columns and tables the live database has, and the seller handbook uses the snapshot built into the site. */
export const MARKET_LIVE = process.env.EXPO_PUBLIC_MARKET_LIVE === '1' && !MARKET_DEMO;
