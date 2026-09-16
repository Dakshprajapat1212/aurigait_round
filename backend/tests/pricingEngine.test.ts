import { PricingEngine } from '../src/pricingEngine';
import {
  InsufficientSeatsError,
  InvalidConfigError,
  InvalidQuantityError,
  InvalidTierError,
  OffersConfig,
  ShowConfig,
  SoldOutTierError,
} from '../src/types';
import { BillFormatter } from '../src/billFormatter';

describe('PricingEngine', () => {
  const baseShowConfig: ShowConfig = {
    showId: 'SHOW-101',
    showName: 'Inception',
    tiers: {
      silver: { name: 'Silver', pricePaisa: 15000, availableSeats: 50 }, // ₹150.00
      gold: { name: 'Gold', pricePaisa: 25000, availableSeats: 30 },     // ₹250.00
      recliner: { name: 'Recliner', pricePaisa: 40000, availableSeats: 5 }, // ₹400.00
    },
    convenienceFeePerTicketPaisa: 3000, // ₹30.00 per ticket
    gstRatePercent: 18,                // 18% GST
  };

  describe('1. Base Plain Booking Calculations', () => {
    it('calculates single ticket base pricing with fee and GST correctly', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [{ tierName: 'Silver', quantity: 1 }],
      });

      // Base: ₹150.00 (15000 paisa)
      expect(invoice.totalTickets).toBe(1);
      expect(invoice.baseTicketSubtotalPaisa).toBe(15000);
      expect(invoice.netTicketSubtotalPaisa).toBe(15000);

      // Fee: 1 * ₹30.00 = ₹30.00 (3000 paisa)
      expect(invoice.totalConvenienceFeePaisa).toBe(3000);

      // Taxable: ₹150.00 + ₹30.00 = ₹180.00 (18000 paisa)
      expect(invoice.taxableAmountPaisa).toBe(18000);

      // GST: 18% of 18000 = 3240 paisa (₹32.40)
      expect(invoice.gstAmountPaisa).toBe(3240);

      // Total: 18000 + 3240 = 21240 paisa (₹212.40)
      expect(invoice.finalTotalPaisa).toBe(21240);
      expect(invoice.finalTotalFormatted).toBe('₹212.40');
    });

    it('calculates multiple tickets in single tier', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [{ tierName: 'Gold', quantity: 3 }],
      });

      // Base: 3 * ₹250 = ₹750 (75000 paisa)
      expect(invoice.baseTicketSubtotalPaisa).toBe(75000);
      // Fee: 3 * ₹30 = ₹90 (9000 paisa)
      expect(invoice.totalConvenienceFeePaisa).toBe(9000);
      // Taxable: ₹840 (84000 paisa)
      expect(invoice.taxableAmountPaisa).toBe(84000);
      // GST: 18% of 84000 = 15120 paisa (₹151.20)
      expect(invoice.gstAmountPaisa).toBe(15120);
      // Total: 84000 + 15120 = 99120 paisa (₹991.20)
      expect(invoice.finalTotalPaisa).toBe(99120);
    });

    it('calculates multiple mixed tiers in a single booking request', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [
          { tierName: 'Silver', quantity: 2 },   // 2 * 150 = 300
          { tierName: 'Recliner', quantity: 1 }, // 1 * 400 = 400
        ],
      });

      // Total tickets: 3
      expect(invoice.totalTickets).toBe(3);
      // Base: 30000 + 40000 = 70000 paisa (₹700.00)
      expect(invoice.baseTicketSubtotalPaisa).toBe(70000);
      // Fee: 3 * 3000 = 9000 paisa (₹90.00)
      expect(invoice.totalConvenienceFeePaisa).toBe(9000);
      // Taxable: 79000 paisa (₹790.00)
      expect(invoice.taxableAmountPaisa).toBe(79000);
      // GST: 18% of 79000 = 14220 paisa (₹142.20)
      expect(invoice.gstAmountPaisa).toBe(14220);
      // Total: 79000 + 14220 = 93220 paisa (₹932.20)
      expect(invoice.finalTotalPaisa).toBe(93220);
    });

    it('supports case-insensitive tier matching', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [{ tierName: 'sILveR', quantity: 1 }],
      });
      expect(invoice.seatLineItems[0].tierName).toBe('Silver');
      expect(invoice.baseTicketSubtotalPaisa).toBe(15000);
    });
  });

  describe('2. Availability and Sold-Out Enforcement', () => {
    it('throws SoldOutTierError when tier availableSeats is 0', () => {
      const showWithSoldOut: ShowConfig = {
        ...baseShowConfig,
        tiers: {
          ...baseShowConfig.tiers,
          recliner: { name: 'Recliner', pricePaisa: 40000, availableSeats: 0 },
        },
      };

      expect(() =>
        PricingEngine.calculateInvoice(showWithSoldOut, {
          showId: 'SHOW-101',
          items: [{ tierName: 'Recliner', quantity: 1 }],
        })
      ).toThrow(SoldOutTierError);
    });

    it('throws InsufficientSeatsError when requested seats exceed available seats', () => {
      expect(() =>
        PricingEngine.calculateInvoice(baseShowConfig, {
          showId: 'SHOW-101',
          items: [{ tierName: 'Recliner', quantity: 6 }], // only 5 available
        })
      ).toThrow(InsufficientSeatsError);
    });

    it('throws InvalidTierError for non-existent tier', () => {
      expect(() =>
        PricingEngine.calculateInvoice(baseShowConfig, {
          showId: 'SHOW-101',
          items: [{ tierName: 'VIP-Box', quantity: 1 }],
        })
      ).toThrow(InvalidTierError);
    });

    it('throws InvalidQuantityError for negative or zero quantity', () => {
      expect(() =>
        PricingEngine.calculateInvoice(baseShowConfig, {
          showId: 'SHOW-101',
          items: [{ tierName: 'Silver', quantity: 0 }],
        })
      ).toThrow(InvalidQuantityError);

      expect(() =>
        PricingEngine.calculateInvoice(baseShowConfig, {
          showId: 'SHOW-101',
          items: [{ tierName: 'Silver', quantity: -2 }],
        })
      ).toThrow(InvalidQuantityError);
    });
  });

  describe('3. Promotional Offers & Discount Stacking', () => {
    const offers: OffersConfig = {
      festivalDiscountFlatPaisa: 5000, // ₹50.00
      memberDiscount: {
        percent: 10,                 // 10%
        maxCapPaisa: 10000,          // ₹100.00
      },
    };

    it('applies flat festival discount correctly', () => {
      const invoice = PricingEngine.calculateInvoice(
        baseShowConfig,
        {
          showId: 'SHOW-101',
          items: [{ tierName: 'Gold', quantity: 2 }], // Base = 50000 (₹500.00)
          applyFestivalDiscount: true,
          isMember: false,
        },
        offers
      );

      // Base: 50000
      expect(invoice.baseTicketSubtotalPaisa).toBe(50000);
      // Festival discount: 5000
      expect(invoice.discounts.festivalDiscountPaisa).toBe(5000);
      expect(invoice.discounts.memberDiscountPaisa).toBe(0);
      // Net ticket: 45000 (₹450.00)
      expect(invoice.netTicketSubtotalPaisa).toBe(45000);
      // Fees: 2 * 3000 = 6000
      // Taxable: 45000 + 6000 = 51000 (₹510.00)
      expect(invoice.taxableAmountPaisa).toBe(51000);
      // GST: 18% of 51000 = 9180 (₹91.80)
      expect(invoice.gstAmountPaisa).toBe(9180);
      // Total: 51000 + 9180 = 60180 (₹601.80)
      expect(invoice.finalTotalPaisa).toBe(60180);
    });

    it('caps festival discount at base ticket subtotal so subtotal never becomes negative', () => {
      const hugeFestivalOffer: OffersConfig = {
        festivalDiscountFlatPaisa: 20000, // ₹200.00 discount on a ₹150.00 ticket
      };

      const invoice = PricingEngine.calculateInvoice(
        baseShowConfig,
        {
          showId: 'SHOW-101',
          items: [{ tierName: 'Silver', quantity: 1 }], // Base = 15000 (₹150.00)
          applyFestivalDiscount: true,
        },
        hugeFestivalOffer
      );

      // Festival discount capped to 15000
      expect(invoice.discounts.festivalDiscountPaisa).toBe(15000);
      expect(invoice.netTicketSubtotalPaisa).toBe(0);

      // Note: Discounts do NOT reduce convenience fees or tax!
      // Total convenience fee = 3000
      // Taxable base = 0 + 3000 = 3000
      // GST 18% on 3000 = 540
      // Final total = 3000 + 540 = 3540 (₹35.40)
      expect(invoice.totalConvenienceFeePaisa).toBe(3000);
      expect(invoice.gstAmountPaisa).toBe(540);
      expect(invoice.finalTotalPaisa).toBe(3540);
    });

    it('applies member percentage discount with max cap enforcement', () => {
      const cappedOffer: OffersConfig = {
        memberDiscount: {
          percent: 20, // 20%
          maxCapPaisa: 5000, // ₹50.00 cap
        },
      };

      const invoice = PricingEngine.calculateInvoice(
        baseShowConfig,
        {
          showId: 'SHOW-101',
          items: [{ tierName: 'Recliner', quantity: 2 }], // 2 * 400 = 80000 (₹800.00)
          isMember: true,
        },
        cappedOffer
      );

      // 20% of 80000 would be 16000, but cap is 5000
      expect(invoice.discounts.memberDiscountPaisa).toBe(5000);
      expect(invoice.netTicketSubtotalPaisa).toBe(75000);
    });

    it('stacks discounts in documented order: Festival first, then Member % on remaining', () => {
      const invoice = PricingEngine.calculateInvoice(
        baseShowConfig,
        {
          showId: 'SHOW-101',
          items: [{ tierName: 'Gold', quantity: 2 }], // Base = 50000 (₹500.00)
          applyFestivalDiscount: true,
          isMember: true,
        },
        offers // Festival = 5000, Member = 10% capped at 10000
      );

      // Base: 50000
      // Step 1: Festival discount = 5000
      // Remaining = 45000
      // Step 2: Member 10% of 45000 = 4500 (below 10000 cap)
      // Total discount = 5000 + 4500 = 9500 (₹95.00)
      // Net ticket subtotal = 50000 - 9500 = 40500 (₹405.00)
      expect(invoice.discounts.festivalDiscountPaisa).toBe(5000);
      expect(invoice.discounts.memberDiscountPaisa).toBe(4500);
      expect(invoice.discounts.totalDiscountPaisa).toBe(9500);
      expect(invoice.netTicketSubtotalPaisa).toBe(40500);

      // Fees: 2 * 3000 = 6000
      // Taxable: 40500 + 6000 = 46500 (₹465.00)
      // GST: 18% of 46500 = 8370 (₹83.70)
      // Total: 46500 + 8370 = 54870 (₹548.70)
      expect(invoice.taxableAmountPaisa).toBe(46500);
      expect(invoice.gstAmountPaisa).toBe(8370);
      expect(invoice.finalTotalPaisa).toBe(54870);
    });
  });

  describe('4. Financial Precision & Exact Paisa Rounding', () => {
    it('handles fractional paisa GST correctly with ROUND_HALF_UP', () => {
      // Create a scenario where GST produces a half-paisa fraction
      // E.g., taxable amount = 15525 paisa (₹155.25), GST = 18%
      // 15525 * 0.18 = 2794.5 paisa -> rounds to 2795 paisa
      const customShow: ShowConfig = {
        showId: 'SHOW-ODD',
        showName: 'Odd Pricing Show',
        tiers: {
          custom: { name: 'Custom', pricePaisa: 15525, availableSeats: 10 },
        },
        convenienceFeePerTicketPaisa: 0,
        gstRatePercent: 18,
      };

      const invoice = PricingEngine.calculateInvoice(customShow, {
        showId: 'SHOW-ODD',
        items: [{ tierName: 'Custom', quantity: 1 }],
      });

      expect(invoice.taxableAmountPaisa).toBe(15525);
      expect(invoice.gstAmountPaisa).toBe(2795); // 2794.5 rounded up
      expect(invoice.finalTotalPaisa).toBe(15525 + 2795); // 18320
    });

    it('works with configurable GST rates including 0% and 28%', () => {
      const showZeroGST: ShowConfig = {
        ...baseShowConfig,
        gstRatePercent: 0,
      };

      const invoiceZero = PricingEngine.calculateInvoice(showZeroGST, {
        showId: 'SHOW-101',
        items: [{ tierName: 'Silver', quantity: 1 }],
      });

      expect(invoiceZero.gstAmountPaisa).toBe(0);
      expect(invoiceZero.finalTotalPaisa).toBe(invoiceZero.taxableAmountPaisa);

      const showLuxuryGST: ShowConfig = {
        ...baseShowConfig,
        gstRatePercent: 28,
      };

      const invoiceLuxury = PricingEngine.calculateInvoice(showLuxuryGST, {
        showId: 'SHOW-101',
        items: [{ tierName: 'Silver', quantity: 1 }],
      });

      // 18000 * 0.28 = 5040 paisa
      expect(invoiceLuxury.gstAmountPaisa).toBe(5040);
      expect(invoiceLuxury.finalTotalPaisa).toBe(18000 + 5040);
    });

    it('validates reconciliation assertion invariant', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [
          { tierName: 'Silver', quantity: 3 },
          { tierName: 'Gold', quantity: 2 },
          { tierName: 'Recliner', quantity: 1 },
        ],
      });

      expect(invoice.finalTotalPaisa).toBe(
        invoice.netTicketSubtotalPaisa + invoice.totalConvenienceFeePaisa + invoice.gstAmountPaisa
      );
    });
  });

  describe('5. Bill Formatter Verification', () => {
    it('produces an audit-ready line-by-line formatted string', () => {
      const invoice = PricingEngine.calculateInvoice(baseShowConfig, {
        showId: 'SHOW-101',
        items: [
          { tierName: 'Silver', quantity: 2 },
          { tierName: 'Recliner', quantity: 1 },
        ],
      });

      const formatted = BillFormatter.format(invoice);
      expect(formatted).toContain('MULTIPLEX BOOKING INVOICE');
      expect(formatted).toContain('Silver');
      expect(formatted).toContain('Recliner');
      expect(formatted).toContain('Convenience Fee');
      expect(formatted).toContain('GST (18%)');
      expect(formatted).toContain('FINAL AMOUNT PAYABLE:');
    });
  });
});
