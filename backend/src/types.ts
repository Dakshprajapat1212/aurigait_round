/**
 * Core Domain Types and Interfaces for the Cinema Ticket Pricing Engine.
 * 
 * NOTE ON MONEY:
 * All monetary amounts are handled strictly as integer Paisa (1 INR = 100 paisa)
 * to avoid JavaScript binary floating-point representation and rounding issues.
 */

export type Paisa = number;

/**
 * Seat Tier configuration for a show.
 */
export interface SeatTierConfig {
  name: string;            // Original display name, e.g., "Silver", "Gold", "Recliner"
  pricePaisa: Paisa;       // Base price per seat in integer paisa (e.g., 15000 = ₹150.00)
  availableSeats: number;  // Current available capacity (0 = sold out)
}

/**
 * Show / Cinema Counter configuration.
 * Note: gstRatePercent is a mandatory configuration with NO arbitrary default.
 */
export interface ShowConfig {
  showId: string;
  showName: string;
  tiers: Record<string, SeatTierConfig>; // Keyed by tier name (normalized lookup)
  convenienceFeePerTicketPaisa: Paisa;   // Mandatory per-ticket convenience fee in paisa
  gstRatePercent: number;                // Mandatory GST rate percentage (e.g., 18 for 18%)
}

/**
 * Promotional offers applicable to a booking calculation.
 */
export interface OffersConfig {
  festivalDiscountFlatPaisa?: Paisa; // Flat festival discount amount (paisa)
  memberDiscount?: {
    percent: number;                 // Member discount percentage (0 to 100)
    maxCapPaisa: Paisa;              // Maximum allowed discount cap (paisa)
  };
}

/**
 * An individual item in a booking request.
 */
export interface BookingItemRequest {
  tierName: string; // e.g. "Silver", "gold"
  quantity: number; // Positive integer
}

/**
 * Complete booking request payload.
 */
export interface BookingRequest {
  showId: string;
  items: BookingItemRequest[];
  isMember?: boolean;              // True if customer is a club/cinema member
  applyFestivalDiscount?: boolean; // True if festival promo is requested
}

/**
 * Breakdown of a specific seat tier line item.
 */
export interface SeatLineItemBreakdown {
  tierName: string;
  unitPricePaisa: Paisa;
  unitPriceFormatted: string;   // e.g., "₹150.00"
  quantity: number;
  lineTotalPaisa: Paisa;
  lineTotalFormatted: string;   // e.g., "₹300.00"
}

/**
 * Itemized breakdown of applied discounts.
 */
export interface DiscountBreakdown {
  festivalDiscountPaisa: Paisa;
  festivalDiscountFormatted: string;
  memberDiscountPaisa: Paisa;
  memberDiscountFormatted: string;
  totalDiscountPaisa: Paisa;
  totalDiscountFormatted: string;
}

/**
 * Complete itemized invoice produced by the pricing engine.
 */
export interface Invoice {
  showId: string;
  showName: string;
  seatLineItems: SeatLineItemBreakdown[];
  totalTickets: number;

  // 1. Base Ticket Subtotal
  baseTicketSubtotalPaisa: Paisa;
  baseTicketSubtotalFormatted: string;

  // 2. Discounts
  discounts: DiscountBreakdown;
  netTicketSubtotalPaisa: Paisa;
  netTicketSubtotalFormatted: string;

  // 3. Convenience Fees
  convenienceFeePerTicketPaisa: Paisa;
  totalConvenienceFeePaisa: Paisa;
  totalConvenienceFeeFormatted: string;

  // 4. Tax (GST)
  taxableAmountPaisa: Paisa;
  gstRatePercent: number;
  gstAmountPaisa: Paisa;
  gstAmountFormatted: string;

  // 5. Final Reconciled Amount Payable
  finalTotalPaisa: Paisa;
  finalTotalFormatted: string;
}

/**
 * Domain Validation & Pricing Error Hierarchy.
 */
export class PricingEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingEngineError';
  }
}

export class InvalidConfigError extends PricingEngineError {
  constructor(reason: string) {
    super(`Invalid Show Configuration: ${reason}`);
    this.name = 'InvalidConfigError';
  }
}

export class InvalidQuantityError extends PricingEngineError {
  constructor(tierName: string, qty: number) {
    super(`Invalid quantity ${qty} requested for tier '${tierName}'. Quantity must be a positive integer.`);
    this.name = 'InvalidQuantityError';
  }
}

export class InvalidTierError extends PricingEngineError {
  constructor(tierName: string) {
    super(`Seat tier '${tierName}' does not exist for this show.`);
    this.name = 'InvalidTierError';
  }
}

export class SoldOutTierError extends PricingEngineError {
  constructor(tierName: string) {
    super(`Seat tier '${tierName}' is sold out and cannot be booked.`);
    this.name = 'SoldOutTierError';
  }
}

export class InsufficientSeatsError extends PricingEngineError {
  constructor(tierName: string, requested: number, available: number) {
    super(`Cannot book ${requested} seats in tier '${tierName}'. Only ${available} seats are available.`);
    this.name = 'InsufficientSeatsError';
  }
}
