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
 * Robust Importer and Sanitizer for messy seat-class price lists.
 * 
 * Handles:
 * - Duplicate names in different cases ("Silver", "silver", "SILVER")
 * - Prices in inconsistent formats ("₹150.00", "Rs. 200", " 350.50 ", 400, "150,50")
 * - Blank or missing values (null, undefined, empty strings)
 * - Negative prices (-100, "-₹50")
 * - Generates an audit report detailing what was imported, de-duplicated, and rejected.
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
          rejected.push({ raw, reason: `Invalid availableSeats: '${raw.availableSeats}'. Must be a non-negative integer.` });
          continue;
        }
        availableSeats = parsedSeats;
      }

      // 4. De-duplication Check (Case-Insensitive)
      if (cleanedTiers[normalizedKey]) {
        const existing = cleanedTiers[normalizedKey];
        deduplicated.push({
          raw,
          normalizedKey,
          matchedWith: existing.name,
          reason: `Duplicate tier name '${rawNameStr}' matches already imported tier '${existing.name}' (case-insensitive).`,
        });
        continue;
      }

      // 5. Canonical Title-Cased Name
      const canonicalName = rawNameStr.charAt(0).toUpperCase() + rawNameStr.slice(1);

      // Successfully imported
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
   */
  static parsePriceToPaisa(rawPrice: any): { success: true; paisa: Paisa } | { success: false; error: string } {
    // Number handling
    if (typeof rawPrice === 'number') {
      if (!isFinite(rawPrice) || isNaN(rawPrice)) {
        return { success: false, error: 'Price is not a finite number' };
      }
      if (rawPrice < 0) {
        return { success: false, error: `Price cannot be negative: ${rawPrice}` };
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
        if (paisa < 0) {
          return { success: false, error: `Price cannot be negative: '${rawPrice}'` };
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
