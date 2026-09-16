# Reasoning & Architecture Document
## Cinema Ticket Pricing Engine (Builder Assessment)

### 1. Problem Understanding & Objective
The multiplex booking counter frequently mis-prices tickets, causing customer dissatisfaction and counter delays. The counter deals with real-world financial rules that must be accurately and deterministically computed down to the exact paisa (0.01 INR):
- Multiple seat tiers (e.g. Silver, Gold, Recliner) with distinct base prices.
- Seat availability constraints where sold-out tiers must not be bookable.
- Promotional offers: a flat festival discount and a percentage member discount with a maximum cap.
- Mandatory per-ticket convenience fee and GST.
- Transparent line-by-line itemized receipt.
- Configurable rules applicable to any cinema counter / show, rather than one hardcoded setup.

---

### 2. Requirements vs. Assumptions vs. Configurable Values

To maintain absolute engineering discipline and transparency, we explicitly classify each business rule:

#### A. Explicit Requirements (From Official Problem Statement)
1. **Multi-tier Seat Pricing**: Distinct tiers at different base prices.
2. **Sold-Out Prevention**: Sold-out tiers must be blocked from booking.
3. **Flat Festival Discount**: An available flat promo offer.
4. **Capped Member Discount**: A percentage discount for members with an upper limit cap.
5. **Per-Ticket Convenience Fee**: Fixed fee added per ticket.
6. **GST**: Added on top.
7. **Exact Paisa Totals**: Reconciles to 0.01 INR without floating-point errors.
8. **Line-by-Line Breakdown**: Itemized receipt for customer clarity.
9. **Generic Multi-Show Engine**: Configurable for any cinema counter.

#### B. Documented Assumptions (Resolving Inherent Ambiguities)
1. **Discount Stacking Sequence**:
   - **Step 1**: Calculate base ticket subtotal: $\sum (\text{unitPrice} \times \text{quantity})$.
   - **Step 2**: Apply Flat Festival Discount on base ticket subtotal (capped at base subtotal).
   - **Step 3**: Apply Member Percentage Discount on the *remaining* ticket balance, subject to the member discount cap.
   - **Reasoning**: Retail discount best practice prevents percentage calculations on already-discounted amounts, protecting the cinema against negative balances or double-dipping.
2. **Discount Scope**: Discounts apply **exclusively to base ticket charges**. Convenience fees and GST are mandatory service additions and are strictly non-discountable.
3. **GST Taxable Base**: The problem statement does not specify the GST taxable base. We therefore selected **$(\text{Net Ticket Subtotal} + \text{Total Convenience Fee})$** as an explicit implementation assumption.
4. **Rounding Rule**: Financial **`ROUND_HALF_UP`** to the nearest integer paisa is used for percentage discount and GST calculations.
5. **Case-Insensitive Tier Matching**: Tier names (e.g., `Silver`, `silver`, `SILVER`) are normalized to lowercase to prevent human-error rejections at the counter.
6. **Multi-Tier Booking Requests**: A single transaction can contain multiple tiers (e.g., 2 Silver + 1 Recliner).

#### C. Configurable Values (Never Hardcoded)
- Base seat price per tier (in paisa).
- Available seat inventory per tier.
- Flat festival discount amount (in paisa).
- Member discount percentage (%) and maximum cap (in paisa).
- Convenience fee per ticket (in paisa).
- GST rate percentage (`gstRatePercent` is a mandatory required input with no arbitrary default).

---

### 3. Architecture & Domain Model

The engine is built with a decoupled, pure domain architecture in TypeScript on Node.js.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Inputs                                     │
│     (ShowConfig + BookingRequest + Optional OffersConfig)               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PricingEngine.calculateInvoice                      │
│                                                                         │
│  [Step 1] Input Validation (rates >= 0, non-empty items)                │
│  [Step 2] Tier Normalization & Availability Guard                       │
│           • Check tier exists (InvalidTierError)                        │
│           • Check quantity > 0 integer (InvalidQuantityError)           │
│           • Check availableSeats > 0 (SoldOutTierError)                 │
│           • Check requested <= availableSeats (InsufficientSeatsError)  │
│  [Step 3] Base Ticket Subtotal Calculation                              │
│  [Step 4] Offers Evaluation (Festival Flat -> Member % Capped)          │
│  [Step 5] Convenience Fee (per ticket * total tickets)                  │
│  [Step 6] GST Calculation (ROUND_HALF_UP on Taxable Base)               │
│  [Step 7] Total Reconciliation Invariant Check                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             Outputs                                     │
│           • Structured Immutable `Invoice` Object                       │
│           • `BillFormatter`: Line-by-Line Formatted Text Receipt        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Monetary Representation & Precision Handling

JavaScript uses IEEE 754 double-precision floating-point numbers, where expressions like `0.1 + 0.2 === 0.30000000000000004` lead to compounding rounding drift.

**Our Precision Strategy:**
- All internal monetary values are stored as **integer `Paisa`** (`type Paisa = number;` where ₹1.00 = 100 paisa).
- Arithmetic operations (addition, subtraction, integer multiplication) remain on integer values with zero float inaccuracy.
- Percentage operations (discounts, taxes) use explicit `ROUND_HALF_UP` rounding:
  $$\text{Paisa}_{\text{rounded}} = \lfloor \text{raw} + 0.5 + 10^{-12} \rfloor$$
- A strict financial reconciliation check is enforced before returning any invoice:
  $$\text{finalTotalPaisa} \equiv \text{netTicketSubtotalPaisa} + \text{totalConvenienceFeePaisa} + \text{gstAmountPaisa}$$

---

### 5. Error & Validation Hierarchy

Errors are modeled as specific domain exceptions derived from `PricingEngineError`:
- `InvalidConfigError`: When configurations (GST rate, fees, offers) are invalid or negative.
- `InvalidQuantityError`: When requested quantity is $\le 0$ or non-integer.
- `InvalidTierError`: When a requested tier does not exist for the show.
- `SoldOutTierError`: When the tier has $0$ available seats.
- `InsufficientSeatsError`: When requested count exceeds current capacity.

---

### 6. Automated Testing Strategy

A comprehensive Jest test suite (`27 tests`) covers all business rules and edge cases:
1. **Single & Multi-seat calculations**: Single tickets, multiple tickets in one tier, and mixed multi-tier bookings.
2. **Case-Insensitive matching**: `sILveR` matches `Silver`.
3. **Availability & Sold-out enforcement**: Sold-out rejections, insufficient capacity rejections, zero/negative quantity rejections.
4. **Discount Edge Cases**:
   - Flat festival discount alone.
   - Festival discount larger than ticket base price (capped at subtotal, preventing negative amounts).
   - Member discount alone and hitting maximum cap.
   - Member discount with non-member customer (`isMember: false`).
   - Combined discount stacking order verification.
5. **Convenience Fee & Tax Invariants**:
   - Multi-ticket fee scaling.
   - Verified that discounts do NOT reduce convenience fee.
   - Configurable GST rates (0%, 18%, 28%).
   - Fractional paisa half-up rounding boundary tests (.4999 vs .5000).
   - Final reconciliation invariant check.
