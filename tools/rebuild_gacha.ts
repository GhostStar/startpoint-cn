/**
 * Rebuild assets/gacha.json from CDN source data + character_table.json.
 * Replaces scripts/generate_gacha.py with TypeScript toolchain.
 *
 * Usage: npx tsx tools/rebuild_gacha.ts
 *
 * See tools/gacha/ for module structure:
 *   types.ts      — interfaces and types
 *   constants.ts  — paths, config maps, hardcoded lists
 *   template.ts   — pool template builders + element detection
 *   up-extract.ts — UP extraction + limited-attribute detection + accumulation
 *   banner.ts     — core buildBanner function
 *   validate.ts   — L1/L2/L6/L7 validation functions
 *   runner.ts     — main() orchestrator
 */
import { main } from "./gacha/runner";
main();
