import {
  DeduplicatedTier,
  ImportedTier,
  Paisa,
  RawTierInput,
  RejectedTier,
  SeatTierConfig,
  TierImportResult,
} from './types';
import { Money } from './money';

/**
 * Robust Importer and Sanitizer for messy seat-class price lists (The Twist).
 * 
 * Rules:
 * 1. Duplicate names in different cases:
 *    - Same normalized name + same price -> deduplicated (keep original, report duplicate).
 *    - Same normalized name + conflicting price -> rejected (safely flag price conflict rather than guessing).
 * 2. Prices must be strictly positive (> 0). Free (0) or negative prices are rejected.
 * 3. Inconsistent price formats (₹, Rs., INR, whitespace, comma decimals) are normalized into exact integer Paisa.
 * 4. Blank names or blank prices are rejected with descriptive reasons.
 * 5. Full audit report detailing accepted unique tiers, duplicates removed, and rejected records.
 */
export class TierImporter {
  /**
   * Imports and sanitizes an array of raw, messy tier records.
   */
  static importMessyTiers(rawTiers: RawTierInput[]): TierImportResult {
    const cleanedTiers: Record<string, SeatTierConfig> = {};
    const imported: ImportedTier[] = [];
    const deduplicated: DeduplicatedTier[] = [];
    const rejected: RejectedTier[] = [];

    if (!Array.isArray(rawTiers)) {
      throw new Error('Input to importMessyTiers must be an array.');
    }

    for (const raw of rawTiers) {
      // 1. Validate Tier Name
      if (raw.name === null || raw.name === undefined) {
        rejected.push({ raw, reason: 'Blank or missing tier name (null/undefined)' });
        continue;
      }

      const rawNameStr = String(raw.name).trim();
      if (rawNameStr === '') {
        rejected.push({ raw, reason: 'Blank or missing tier name (empty string)' });
        continue;
      }

      const normalizedKey = rawNameStr.toLowerCase();

      // 2. Validate & Parse Price
      if (raw.price === null || raw.price === undefined || String(raw.price).trim() === '') {
        rejected.push({ raw, reason: 'Blank or missing price' });
        continue;
      }

      const parseResult = TierImporter.parsePriceToPaisa(raw.price);
      if (!parseResult.success) {
        rejected.push({ raw, reason: parseResult.error });
        continue;
      }

      const pricePaisa = parseResult.paisa;

      // 3. Parse Available Seats (Optional, default to 50 if unspecified)
      let availableSeats = 50;
      if (raw.availableSeats !== undefined && raw.availableSeats !== null && String(raw.availableSeats).trim() !== '') {
        const parsedSeats = parseInt(String(raw.availableSeats).trim(), 10);
        if (isNaN(parsedSeats) || parsedSeats < 0) {
          rejected.push({
            raw,
            reason: `Invalid availableSeats: '${raw.availableSeats}'. Must be a non-negative integer.`,
          });
          continue;
        }
        availableSeats = parsedSeats;
      }

      // 4. Duplicate Name Check (Case-Insensitive)
      if (cleanedTiers[normalizedKey]) {
        const existing = cleanedTiers[normalizedKey];

        if (pricePaisa === existing.pricePaisa) {
          // Exact duplicate (same name + same price) -> Deduplicate
          deduplicated.push({
            raw,
            normalizedKey,
            matchedWith: existing.name,
            reason: `Exact duplicate of tier '${existing.name}' with matching price ${Money.toFormattedINR(pricePaisa)}.`,
          });
        } else {
          // Conflicting duplicate (same name + DIFFERENT price) -> Reject conflict safely!
          rejected.push({
            raw,
            reason: `Conflicting price for tier '${existing.name}': existing is ${Money.toFormattedINR(existing.pricePaisa)}, incoming is ${Money.toFormattedINR(pricePaisa)}.`,
          });
        }
        continue;
      }

      // 5. Canonical Title-Cased Name for display
      const canonicalName = rawNameStr.charAt(0).toUpperCase() + rawNameStr.slice(1);

      // Successfully imported new unique tier
      const tierConfig: SeatTierConfig = {
        name: canonicalName,
        pricePaisa,
        availableSeats,
      };

      cleanedTiers[normalizedKey] = tierConfig;

      imported.push({
        normalizedKey,
        name: canonicalName,
        pricePaisa,
        priceFormatted: Money.toFormattedINR(pricePaisa),
        availableSeats,
      });
    }

    return {
      cleanedTiers,
      report: {
        totalProcessed: rawTiers.length,
        importedCount: imported.length,
        deduplicatedCount: deduplicated.length,
        rejectedCount: rejected.length,
        imported,
        deduplicated,
        rejected,
      },
    };
  }

  /**
   * Robust price parser converting inconsistent price representations into integer Paisa.
   * Enforces strictly positive pricing (> 0).
   */
  static parsePriceToPaisa(rawPrice: any): { success: true; paisa: Paisa } | { success: false; error: string } {
    // Number handling
    if (typeof rawPrice === 'number') {
      if (!isFinite(rawPrice) || isNaN(rawPrice)) {
        return { success: false, error: 'Price is not a finite number' };
      }
      if (rawPrice <= 0) {
        return {
          success: false,
          error: rawPrice < 0 ? `Price cannot be negative: ${rawPrice}` : 'Price must be strictly positive (> 0)',
        };
      }
      return { success: true, paisa: Money.roundHalfUp(rawPrice * 100) };
    }

    // String handling
    if (typeof rawPrice === 'string') {
      const trimmed = rawPrice.trim();
      if (trimmed === '') {
        return { success: false, error: 'Price is an empty string' };
      }

      // Check for negative signs
      if (trimmed.includes('-') || trimmed.startsWith('(')) {
        return { success: false, error: `Price cannot be negative: '${rawPrice}'` };
      }

      // Sanitize currency symbols and text: "₹", "Rs", "INR", "$", spaces
      // Replace comma decimal separators: "150,50" -> "150.50"
      let sanitized = trimmed
        .replace(/₹|rs\.?|inr|\$/gi, '')
        .trim()
        .replace(',', '.');

      // Validate numeric pattern
      if (!/^\d+(\.\d+)?$/.test(sanitized)) {
        return { success: false, error: `Invalid price format: '${rawPrice}'` };
      }

      try {
        const paisa = Money.fromINR(sanitized);
        if (paisa <= 0) {
          return {
            success: false,
            error: paisa < 0 ? `Price cannot be negative: '${rawPrice}'` : 'Price must be strictly positive (> 0)',
          };
        }
        return { success: true, paisa };
      } catch (err: any) {
        return { success: false, error: `Failed to parse monetary value: '${rawPrice}'` };
      }
    }

    return { success: false, error: `Unsupported price type: ${typeof rawPrice}` };
  }

  /**
   * Helper to parse raw CSV text into messy tier records.
   */
  static parseCSVToRawTiers(csvText: string): RawTierInput[] {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) return [];

    const rawTiers: RawTierInput[] = [];
    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      rawTiers.push({
        name: parts[0] !== undefined ? parts[0] : '',
        price: parts[1] !== undefined ? parts[1] : '',
        availableSeats: parts[2] !== undefined && parts[2] !== '' ? parts[2] : undefined,
      });
    }

    return rawTiers;
  }
}
