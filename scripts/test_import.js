const fs = require('fs');
const path = require('path');

// Run via ts-node from backend
const { TierImporter } = require('../backend/dist/tierImporter');

const samplePath = path.resolve(__dirname, '../sample_data/messy_prices.csv');
const csvText = fs.readFileSync(samplePath, 'utf8');

console.log('============================================================');
console.log('  TESTING THE TWIST: MESSY PRICE LIST IMPORTER');
console.log('============================================================');
console.log(`Reading: ${samplePath}\n`);

const rawTiers = TierImporter.parseCSVToRawTiers(csvText);
const result = TierImporter.importMessyTiers(rawTiers);
const r = result.report;

console.log('------------------------------------------------------------');
console.log('  IMPORT AUDIT SUMMARY');
console.log('------------------------------------------------------------');
console.log(`  Total Records Processed:   ${r.totalProcessed}`);
console.log(`  🟢 Unique Tiers Accepted:   ${r.importedCount}`);
console.log(`  🟡 Duplicates Removed:      ${r.deduplicatedCount}`);
console.log(`  🔴 Records Rejected:        ${r.rejectedCount}`);
console.log('------------------------------------------------------------\n');

console.log('🟢 ACCEPTED CLEAN PRICE LIST:');
for (const t of r.imported) {
  console.log(`  • ${t.name.padEnd(12)} -> ${t.priceFormatted.padStart(10)} (${t.availableSeats} seats) [Key: ${t.normalizedKey}]`);
}

console.log('\n🟡 DE-DUPLICATED RECORDS (Exact Matches):');
for (const d of r.deduplicated) {
  console.log(`  • "${d.raw.name}" (${d.raw.price}) -> ${d.reason}`);
}

console.log('\n🔴 REJECTED RECORDS (Invalid, Missing or Conflicting):');
for (const rej of r.rejected) {
  console.log(`  • Raw: ${JSON.stringify(rej.raw)}`);
  console.log(`    Reason: ${rej.reason}`);
}
console.log('============================================================');
