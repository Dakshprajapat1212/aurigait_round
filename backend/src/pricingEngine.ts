import {
  BookingRequest,
  DiscountBreakdown,
  InsufficientSeatsError,
  InvalidConfigError,
  InvalidQuantityError,
  InvalidTierError,
  Invoice,
  OffersConfig,
  Paisa,
  SeatLineItemBreakdown,
  SeatTierConfig,
  ShowConfig,
  SoldOutTierError,
} from './types';
import { Money } from './money';

/**
 * Pure, deterministic pricing engine for multiplex ticket bookings.
 */
export class PricingEngine {
  /**
   * Calculates a complete, reconciled line-by-line invoice for a booking request.
   * 
   * @param showConfig Show and pricing rules configuration
   * @param bookingRequest Customer booking request
   * @param offersConfig Optional promotional offers
   * @returns Detailed itemized Invoice
   */
  static calculateInvoice(
    showConfig: ShowConfig,
    bookingRequest: BookingRequest,
    offersConfig?: OffersConfig
  ): Invoice {
    // -------------------------------------------------------------
    // Step 1: Configuration & Input Validation
    // -------------------------------------------------------------
    if (typeof showConfig.gstRatePercent !== 'number' || isNaN(showConfig.gstRatePercent) || showConfig.gstRatePercent < 0) {
      throw new InvalidConfigError(
        `'gstRatePercent' is a required non-negative number. Received: ${showConfig.gstRatePercent}`
      );
    }

    if (
      typeof showConfig.convenienceFeePerTicketPaisa !== 'number' ||
      isNaN(showConfig.convenienceFeePerTicketPaisa) ||
      showConfig.convenienceFeePerTicketPaisa < 0 ||
      !Number.isInteger(showConfig.convenienceFeePerTicketPaisa)
    ) {
      throw new InvalidConfigError(
        `'convenienceFeePerTicketPaisa' must be a non-negative integer paisa. Received: ${showConfig.convenienceFeePerTicketPaisa}`
      );
    }

    if (!bookingRequest.items || !Array.isArray(bookingRequest.items) || bookingRequest.items.length === 0) {
      throw new InvalidConfigError('Booking request must contain at least one seat item.');
    }

    // Validate optional offers config if provided
    if (offersConfig) {
      if (
        offersConfig.festivalDiscountFlatPaisa !== undefined &&
        (offersConfig.festivalDiscountFlatPaisa < 0 || !Number.isInteger(offersConfig.festivalDiscountFlatPaisa))
      ) {
        throw new InvalidConfigError(
          `'festivalDiscountFlatPaisa' must be a non-negative integer paisa. Received: ${offersConfig.festivalDiscountFlatPaisa}`
        );
      }

      if (offersConfig.memberDiscount) {
        const { percent, maxCapPaisa } = offersConfig.memberDiscount;
        if (typeof percent !== 'number' || percent < 0 || percent > 100) {
          throw new InvalidConfigError(
            `Member discount percent must be between 0 and 100. Received: ${percent}`
          );
        }
        if (typeof maxCapPaisa !== 'number' || maxCapPaisa < 0 || !Number.isInteger(maxCapPaisa)) {
          throw new InvalidConfigError(
            `Member discount maxCapPaisa must be a non-negative integer paisa. Received: ${maxCapPaisa}`
          );
        }
      }
    }

    // -------------------------------------------------------------
    // Step 2: Tier Normalization, Validation & Availability Check
    // -------------------------------------------------------------
    const normalizedTiers = new Map<string, SeatTierConfig>();
    for (const key of Object.keys(showConfig.tiers)) {
      const tier = showConfig.tiers[key];
      normalizedTiers.set(tier.name.toLowerCase().trim(), tier);
    }

    let totalTickets = 0;
    let baseTicketSubtotalPaisa: Paisa = 0;
    const seatLineItems: SeatLineItemBreakdown[] = [];

    for (const item of bookingRequest.items) {
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new InvalidQuantityError(item.tierName, item.quantity);
      }

      const normalizedKey = (item.tierName || '').toLowerCase().trim();
      const tierConfig = normalizedTiers.get(normalizedKey);

      if (!tierConfig) {
        throw new InvalidTierError(item.tierName);
      }

      // Check availability: Sold-out vs Insufficient seats
      if (tierConfig.availableSeats <= 0) {
        throw new SoldOutTierError(tierConfig.name);
      }

      if (item.quantity > tierConfig.availableSeats) {
        throw new InsufficientSeatsError(tierConfig.name, item.quantity, tierConfig.availableSeats);
      }

      // Calculate line total for tier
      const lineTotalPaisa = Money.multiply(tierConfig.pricePaisa, item.quantity);
      baseTicketSubtotalPaisa = Money.add(baseTicketSubtotalPaisa, lineTotalPaisa);
      totalTickets += item.quantity;

      seatLineItems.push({
        tierName: tierConfig.name,
        unitPricePaisa: tierConfig.pricePaisa,
        unitPriceFormatted: Money.toFormattedINR(tierConfig.pricePaisa),
        quantity: item.quantity,
        lineTotalPaisa,
        lineTotalFormatted: Money.toFormattedINR(lineTotalPaisa),
      });
    }

    // -------------------------------------------------------------
    // Step 3: Promotional Offers & Discount Evaluation
    // Pipeline order: Base Subtotal -> Festival Flat -> Member % on remainder
    // -------------------------------------------------------------
    let festivalDiscountPaisa: Paisa = 0;
    if (bookingRequest.applyFestivalDiscount && offersConfig?.festivalDiscountFlatPaisa) {
      // Festival discount cannot exceed base ticket subtotal
      festivalDiscountPaisa = Math.min(offersConfig.festivalDiscountFlatPaisa, baseTicketSubtotalPaisa);
    }

    const remainingAfterFestival = Money.subtract(baseTicketSubtotalPaisa, festivalDiscountPaisa);

    let memberDiscountPaisa: Paisa = 0;
    if (bookingRequest.isMember && offersConfig?.memberDiscount && remainingAfterFestival > 0) {
      const { percent, maxCapPaisa } = offersConfig.memberDiscount;
      const rawDiscount = Money.calculatePercentage(remainingAfterFestival, percent);
      // Capped at member maxCap and remaining ticket balance
      memberDiscountPaisa = Math.min(rawDiscount, maxCapPaisa, remainingAfterFestival);
    }

    const totalDiscountPaisa = Money.add(festivalDiscountPaisa, memberDiscountPaisa);
    const netTicketSubtotalPaisa = Money.subtract(baseTicketSubtotalPaisa, totalDiscountPaisa);

    const discounts: DiscountBreakdown = {
      festivalDiscountPaisa,
      festivalDiscountFormatted: Money.toFormattedINR(festivalDiscountPaisa),
      memberDiscountPaisa,
      memberDiscountFormatted: Money.toFormattedINR(memberDiscountPaisa),
      totalDiscountPaisa,
      totalDiscountFormatted: Money.toFormattedINR(totalDiscountPaisa),
    };

    // -------------------------------------------------------------
    // Step 4: Convenience Fee Computation
    // -------------------------------------------------------------
    const totalConvenienceFeePaisa = Money.multiply(
      showConfig.convenienceFeePerTicketPaisa,
      totalTickets
    );

    // -------------------------------------------------------------
    // Step 5: Taxable Base & GST Computation
    // Taxable base = net ticket subtotal + total convenience fee
    // -------------------------------------------------------------
    const taxableAmountPaisa = Money.add(netTicketSubtotalPaisa, totalConvenienceFeePaisa);
    const gstAmountPaisa = Money.calculatePercentage(taxableAmountPaisa, showConfig.gstRatePercent);

    // -------------------------------------------------------------
    // Step 6: Reconciliation & Final Payable Total
    // -------------------------------------------------------------
    const finalTotalPaisa = Money.add(taxableAmountPaisa, gstAmountPaisa);

    // Exact reconciliation assertion
    if (finalTotalPaisa !== netTicketSubtotalPaisa + totalConvenienceFeePaisa + gstAmountPaisa) {
      throw new Error(
        `Financial reconciliation mismatch: Final total (${finalTotalPaisa}) != Net tickets (${netTicketSubtotalPaisa}) + Fee (${totalConvenienceFeePaisa}) + GST (${gstAmountPaisa})`
      );
    }

    return {
      showId: showConfig.showId,
      showName: showConfig.showName,
      seatLineItems,
      totalTickets,
      baseTicketSubtotalPaisa,
      baseTicketSubtotalFormatted: Money.toFormattedINR(baseTicketSubtotalPaisa),
      discounts,
      netTicketSubtotalPaisa,
      netTicketSubtotalFormatted: Money.toFormattedINR(netTicketSubtotalPaisa),
      convenienceFeePerTicketPaisa: showConfig.convenienceFeePerTicketPaisa,
      totalConvenienceFeePaisa,
      totalConvenienceFeeFormatted: Money.toFormattedINR(totalConvenienceFeePaisa),
      taxableAmountPaisa,
      gstRatePercent: showConfig.gstRatePercent,
      gstAmountPaisa,
      gstAmountFormatted: Money.toFormattedINR(gstAmountPaisa),
      finalTotalPaisa,
      finalTotalFormatted: Money.toFormattedINR(finalTotalPaisa),
    };
  }
}
