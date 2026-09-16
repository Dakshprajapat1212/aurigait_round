export * from './types';
export * from './money';
export * from './pricingEngine';
export * from './billFormatter';

// Quick runner demonstration when executed directly via `npx ts-node src/index.ts`
if (require.main === module) {
  const { PricingEngine } = require('./pricingEngine');
  const { BillFormatter } = require('./billFormatter');

  const demoShow = {
    showId: 'SHOW-FRIDAY-001',
    showName: 'Friday Night Blockbuster',
    tiers: {
      silver: { name: 'Silver', pricePaisa: 15000, availableSeats: 50 },
      gold: { name: 'Gold', pricePaisa: 25000, availableSeats: 30 },
      recliner: { name: 'Recliner', pricePaisa: 40000, availableSeats: 10 },
    },
    convenienceFeePerTicketPaisa: 3000, // ₹30.00
    gstRatePercent: 18, // 18% GST
  };

  const booking = {
    showId: 'SHOW-FRIDAY-001',
    items: [
      { tierName: 'Silver', quantity: 2 },
      { tierName: 'Recliner', quantity: 1 },
    ],
    isMember: true,
    applyFestivalDiscount: true,
  };

  const offers = {
    festivalDiscountFlatPaisa: 5000, // ₹50.00 flat off
    memberDiscount: {
      percent: 10, // 10% off
      maxCapPaisa: 10000, // max ₹100.00 cap
    },
  };

  const invoice = PricingEngine.calculateInvoice(demoShow, booking, offers);
  console.log(BillFormatter.format(invoice));
}
