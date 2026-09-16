import { TierImporter } from '../src/tierImporter';
import { RawTierInput } from '../src/types';

describe('TierImporter (The Twist: Messy Price List Sanitizer)', () => {
  it('correctly imports clean and inconsistent price formats', () => {
    const rawTiers: RawTierInput[] = [
      { name: 'Silver', price: 150 },                 // Plain integer number
      { name: 'Gold', price: '₹250.00' },             // ₹ symbol with decimals
      { name: 'Recliner', price: 'Rs. 400' },          // Rs. text prefix
      { name: 'Balcony', price: ' 350.50 INR ' },     // whitespace and INR suffix
      { name: 'Executive', price: '180,50' },         // comma decimal separator
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(5);
    expect(result.report.rejectedCount).toBe(0);
    expect(result.report.deduplicatedCount).toBe(0);

    expect(result.cleanedTiers['silver'].pricePaisa).toBe(15000);
    expect(result.cleanedTiers['gold'].pricePaisa).toBe(25000);
    expect(result.cleanedTiers['recliner'].pricePaisa).toBe(40000);
    expect(result.cleanedTiers['balcony'].pricePaisa).toBe(35050);
    expect(result.cleanedTiers['executive'].pricePaisa).toBe(18050);
  });

  it('de-duplicates tier names case-insensitively when prices match', () => {
    const rawTiers: RawTierInput[] = [
      { name: 'Silver', price: 150 },
      { name: 'silver', price: '150.00' },           // Exact duplicate
      { name: 'SILVER', price: '₹150' },             // Exact duplicate
      { name: '  Silver  ', price: ' 150 INR ' },    // Exact duplicate
      { name: 'Gold', price: 250 },
      { name: 'GOLD', price: 'Rs. 250.00' },         // Exact duplicate
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(2); // Only Silver & Gold
    expect(result.report.deduplicatedCount).toBe(4);
    expect(result.report.rejectedCount).toBe(0);

    expect(result.cleanedTiers['silver'].pricePaisa).toBe(15000);
    expect(result.cleanedTiers['gold'].pricePaisa).toBe(25000);

    // Verify deduplication audit entries
    expect(result.report.deduplicated[0].matchedWith).toBe('Silver');
    expect(result.report.deduplicated[0].reason).toContain('Exact duplicate');
    expect(result.report.deduplicated[3].matchedWith).toBe('Gold');
  });

  it('safely rejects conflicting duplicate prices instead of guessing', () => {
    const rawTiers: RawTierInput[] = [
      { name: 'Silver', price: 150 },
      { name: 'silver', price: 175 }, // CONFLICT: ₹175 vs ₹150
      { name: 'Gold', price: 250 },
      { name: 'GOLD', price: 300 },   // CONFLICT: ₹300 vs ₹250
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(2); // Silver @ 150, Gold @ 250
    expect(result.report.deduplicatedCount).toBe(0);
    expect(result.report.rejectedCount).toBe(2);

    expect(result.report.rejected[0].reason).toContain("Conflicting price for tier 'Silver'");
    expect(result.report.rejected[0].reason).toContain('existing is ₹150.00, incoming is ₹175.00');

    expect(result.report.rejected[1].reason).toContain("Conflicting price for tier 'Gold'");
  });

  it('rejects blank and missing values with specific reasons', () => {
    const rawTiers: RawTierInput[] = [
      { name: '', price: 150 },                   // Blank name
      { name: '   ', price: 200 },                // Whitespace name
      { name: null, price: 250 },                 // Null name
      { name: undefined, price: 300 },            // Undefined name
      { name: 'VIP', price: '' },                 // Blank price
      { name: 'Platinum', price: null },          // Null price
      { name: 'Box', price: undefined },          // Undefined price
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(0);
    expect(result.report.rejectedCount).toBe(7);

    expect(result.report.rejected[0].reason).toContain('Blank or missing tier name');
    expect(result.report.rejected[1].reason).toContain('Blank or missing tier name');
    expect(result.report.rejected[2].reason).toContain('Blank or missing tier name');
    expect(result.report.rejected[4].reason).toContain('Blank or missing price');
    expect(result.report.rejected[5].reason).toContain('Blank or missing price');
  });

  it('rejects zero and negative prices with explicit error reasons', () => {
    const rawTiers: RawTierInput[] = [
      { name: 'Silver', price: -150 },
      { name: 'Gold', price: '-₹250.00' },
      { name: 'Recliner', price: 0 },
      { name: 'Free-Pass', price: '0.00' },
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(0);
    expect(result.report.rejectedCount).toBe(4);
    expect(result.report.rejected[0].reason).toContain('Price cannot be negative');
    expect(result.report.rejected[1].reason).toContain('Price cannot be negative');
    expect(result.report.rejected[2].reason).toContain('Price must be strictly positive (> 0)');
    expect(result.report.rejected[3].reason).toContain('Price must be strictly positive (> 0)');
  });

  it('rejects unparseable non-numeric prices', () => {
    const rawTiers: RawTierInput[] = [
      { name: 'Silver', price: 'free' },
      { name: 'Gold', price: 'N/A' },
      { name: 'VIP', price: 'TBD' },
    ];

    const result = TierImporter.importMessyTiers(rawTiers);

    expect(result.report.importedCount).toBe(0);
    expect(result.report.rejectedCount).toBe(3);
    expect(result.report.rejected[0].reason).toContain('Invalid price format');
  });

  it('handles a comprehensive messy batch and audits correctly', () => {
    const messyBatch: RawTierInput[] = [
      { name: 'Silver', price: '₹150.00', availableSeats: 50 }, // Valid #1
      { name: 'silver', price: '150.00' },                     // Exact Duplicate -> deduplicated
      { name: '', price: 200 },                                // Rejected (blank name)
      { name: 'Gold', price: 'Rs. 250', availableSeats: 30 },  // Valid #2
      { name: 'GOLD', price: '300.00' },                       // Conflicting Duplicate -> rejected!
      { name: 'Recliner', price: -400 },                       // Rejected (negative)
      { name: 'Recliner', price: '₹400.00', availableSeats: 5 }, // Valid #3
      { name: 'VIP', price: '' },                              // Rejected (blank price)
      { name: 'Club', price: 'invalid_price' },                // Rejected (invalid format)
      { name: 'Club', price: ' 500 INR ' },                    // Valid #4
    ];

    const result = TierImporter.importMessyTiers(messyBatch);

    expect(result.report.totalProcessed).toBe(10);
    expect(result.report.importedCount).toBe(4);     // Silver, Gold, Recliner, Club
    expect(result.report.deduplicatedCount).toBe(1); // silver (150)
    expect(result.report.rejectedCount).toBe(5);     // blank name, conflicting GOLD (300 vs 250), negative recliner, blank VIP, invalid club

    expect(result.report.totalProcessed).toBe(
      result.report.importedCount + result.report.deduplicatedCount + result.report.rejectedCount
    );

    expect(result.cleanedTiers['silver']).toBeDefined();
    expect(result.cleanedTiers['gold']).toBeDefined();
    expect(result.cleanedTiers['recliner']).toBeDefined();
    expect(result.cleanedTiers['club']).toBeDefined();
  });

  it('correctly parses messy CSV text into raw records', () => {
    const csv = `
      name, price, availableSeats
      Silver, ₹150.00, 50
      silver, 150, 50
      Gold, Rs. 250, 30
      , 200, 10
      Recliner, -100, 5
    `;

    const raw = TierImporter.parseCSVToRawTiers(csv);
    expect(raw.length).toBe(5);

    const result = TierImporter.importMessyTiers(raw);
    expect(result.report.importedCount).toBe(2);     // Silver, Gold
    expect(result.report.deduplicatedCount).toBe(1); // silver
    expect(result.report.rejectedCount).toBe(2);     // blank name, negative recliner
  });
});
