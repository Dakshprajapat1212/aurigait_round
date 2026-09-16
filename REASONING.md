# Engineering Reasoning & Architecture

This document details the engineering principles, architectural decisions, design assumptions, and tradeoffs made while implementing the Cinema Ticket Pricing Engine for the Auriga IT Round 2 (Builder) assessment.

---

## 1. Understanding the Problem

The problem asks us to build a trustworthy cinema ticket pricing engine for high-traffic multiplex counters. The problem contains two distinct operational responsibilities:

### Responsibility A: Cleaning & Importing Messy Price Lists ("The Twist")
Distributors, cinema managers, and external ticketing feeds supply raw seat-class pricing sheets that suffer from typical real-world data corruption:
- Case variations and trailing whitespace (`Silver`, `silver`, `SILVER`).
- Inconsistent price formats (`₹150`, `Rs. 250`, `350.50 INR`, `"180,50"`).
- Blank entries, missing values, non-numeric strings, and negative rates.
- Redundant rows and conflicting rates.

### Responsibility B: Calculating a Reliable, Itemized Customer Bill
Once trusted pricing data exists, the pricing engine must compute customer orders deterministically:
- Enforce seat inventory and prevent bookings on sold-out tiers.
- Calculate base ticket subtotal for multi-tier orders.
- Apply promotional discounts (flat festival discount and capped member percentage discount).
- Add mandatory per-ticket convenience fees.
- Compute GST on the taxable base.
- Guarantee exact-paisa mathematical reconciliation ($0.01\text{ INR}$).
- Deliver an itemized line-by-line breakdown for the counter and customer.

### Why Separating These Concerns Reduces Complexity
Mixing messy input parsing into the core calculation pipeline would force financial calculation routines to handle string parsing, regex sanitization, and error recovery on every transaction. By strictly separating them:
1. **The Ingestion Pipeline (`TierImporter`)** focuses solely on data hygiene, normalization, and auditing.
2. **The Pricing Pipeline (`PricingEngine`)** operates strictly on validated, strongly typed domain invariants (`Paisa` integers, valid quantities).
3. Each pipeline is isolated, bounded, and tested independently with dedicated unit test suites.

---

## 2. Requirements Identified

### Explicit Requirements (Directly Stated in Problem Statement)
- Seat classes come in tiers (e.g., Silver, Gold, Recliner) at different base prices.
- By showtime, tiers may sell out and must not be bookable.
- Support promotional offers: a flat festival discount and a percentage discount for club members (with an upper cap).
- Every booking adds a fixed per-ticket convenience fee.
- Add Goods and Services Tax (GST) on top.
- The total bill must reconcile to the exact paisa ($0.01\text{ INR}$).
- Provide a clear, line-by-line breakdown of the bill.
- The system must work generically for any cinema counter / show configuration, not just one hardcoded show.
- The Twist: Import a messy seat-class price list with duplicate names in different cases, inconsistent price formats, blank values, and negative prices.
- Clean the messy list into a correct price list and report what was imported, de-duplicated, and rejected.

### Ambiguous Requirements (Not Fully Specified in Problem Statement)
The problem statement deliberately leaves several real-world operational rules unspecified:
1. **Discount Stacking Order**: Does the flat festival discount apply before or after the member percentage discount?
2. **Discount Scope**: Do discounts apply only to base ticket prices, or do they also discount the convenience fee?
3. **Member Percentage Base**: Is the member discount calculated against the original base subtotal, or the subtotal remaining after the festival discount?
4. **GST Taxable Base**: Does GST apply only to ticket charges, or to both ticket charges and convenience fees?
5. **GST Rate**: Is the GST rate fixed, or must it be configurable per state/jurisdiction?
6. **Fractional Paisa Rounding**: When percentage discounts or taxes produce fractional paisa, what rounding method governs?
7. **Conflicting Duplicate Prices**: When duplicate tiers specify conflicting prices (e.g., `Silver @ 150` vs `silver @ 175`), which price prevails?
8. **Multi-Tier Bookings**: Can a customer purchase tickets across multiple tiers in one transaction (e.g., 2 Silver + 1 Recliner)?

---

## 3. Design Assumptions

To resolve the identified ambiguities without guessing silently, the following explicit engineering assumptions were documented and implemented:

| Ambiguity | Chosen Behavior | Architectural & Business Rationale |
| :--- | :--- | :--- |
| **Discount Ordering** | Festival flat discount applied first; Member percentage applied second. | Standard retail accounting applies universal flat promos before applying customer-tier percentage discounts on the remaining balance. |
| **Member Percentage Base** | Calculated on the *remaining* subtotal after the festival discount. | Prevents double-discounting the same base amount and avoids customer balances becoming negative. |
| **Discount Scope** | Discounts apply strictly to base ticket charges. Convenience fees and taxes cannot be discounted. | Convenience fees cover ticketing infrastructure; GST is a statutory government tax. Neither can be discounted by multiplex promos. |
| **GST Taxable Base** | $\text{Taxable Base} = \text{Net Ticket Subtotal} + \text{Total Convenience Fee}$. | In Indian taxation regulations, convenience fees charged by ticketing platforms are considered taxable service components. |
| **GST Rate** | Fully configurable in `ShowConfig.gstRatePercent` (no hardcoded tax rate). | Tax rates vary across jurisdictions, ticket price slabs (12% vs 18%), and states. |
| **Rounding Rule** | Financial `ROUND_HALF_UP` to the nearest integer paisa on all fractional calculations. | Standard banking and financial standard for INR transactions: fractional values $\ge 0.5$ round up away from zero. |
| **Conflicting Duplicates** | Reject the incoming conflicting record with an explanatory error; do not overwrite. | Silently overwriting an existing price or guessing the lower/higher rate can cause financial loss or customer disputes. Flagging the conflict forces explicit administrative resolution. |
| **Multi-Tier Bookings** | Supported: `BookingRequest` accepts an array of tier items. | Modern cinema booking systems routinely allow patrons to book seats across tiers (e.g., couple booking 1 Recliner + friends booking 2 Gold seats). |

---

## 4. Why Integer Paisa?

JavaScript represents all numbers using IEEE 754 double-precision floating-point arithmetic. Binary floating-point representation cannot accurately represent common decimal fractions:

```javascript
0.1 + 0.2 === 0.30000000000000004 // true in JavaScript
(150.50 * 0.18) = 27.090000000000003
```

In ticketing and financial applications, accumulating floating-point drift creates off-by-one-cent rounding errors that corrupt line-item sums and fail statutory financial audits.

### Solution: Integer Paisa Representation
We represent all monetary amounts internally as integer **`Paisa`**:
$$\text{₹}1.00 = 100\text{ paisa}$$
- $\text{₹}150.00 \rightarrow 15000\text{ paisa}$
- $\text{₹}150.50 \rightarrow 15050\text{ paisa}$

Calculations throughout the engine remain strictly integer-based (`+`, `-`, `*`). When division occurs (in percentage discounts and GST), we round immediately to integer paisa using `ROUND_HALF_UP`.

This guarantees that:
$$\sum (\text{Line Items}) \equiv \text{Final Total}$$
down to the exact $0.01\text{ INR}$.

---

## 5. Why Separate Importing From Pricing?

The system maintains a clear architectural boundary between **`TierImporter`** and **`PricingEngine`**:

```
[External Messy Input] ──> TierImporter ──> [Clean ShowConfig] ──> PricingEngine ──> [Invoice]
```

### Advantages:
1. **Single Responsibility**: `TierImporter` is solely responsible for parsing strings, recognizing currency symbols, and auditing errors. `PricingEngine` is solely responsible for financial math and inventory state.
2. **Defensive Programming**: Corrupt data is rejected before it can ever touch inventory counters or invoicing records.
3. **Independent Testability**: `tests/tierImporter.test.ts` validates dirty edge cases without needing booking requests; `tests/pricingEngine.test.ts` validates discounting math without needing CSV parsing.
4. **Format Flexibility**: The pricing engine accepts typed configuration. If tomorrow the input format changes from CSV to an XML feed, only the importer changes; the core pricing logic remains untouched.

---

## 6. Why Normalize Seat Names?

Human data entry creates arbitrary casing and spacing discrepancies:
- `Silver`, `silver`, `SILVER`, ` Silver `

If an engine treated these as distinct keys, the show configuration would end up with three separate tiers for the same physical seating category, resulting in split inventory and double-selling.

### Normalization Logic:
```typescript
const normalizedKey = rawName.trim().toLowerCase();
```
All lookups and de-duplication are indexed using `normalizedKey`. To preserve counter aesthetics, the display name retained on the invoice defaults to the first clean casing supplied.

---

## 7. Duplicate Handling Strategy

When importing seat tiers, `TierImporter` distinguishes between two distinct scenarios:

### Case 1: Identical Tier + Identical Price (De-duplicated)
- Example: `"Silver, 150"` followed by `"silver, ₹150.00"`.
- **Handling**: The second record is recognized as an exact duplicate. It is absorbed into the `deduplicated` audit list, and the existing tier is retained without altering seats or price.
- **Reasoning**: It is safe to ignore redundant rows that contain matching pricing information.

### Case 2: Identical Tier + Conflicting Price (Rejected)
- Example: `"Silver, 150"` followed by `"silver, 175"`.
- **Handling**: The incoming record is **rejected** with reason:
  `"Conflicting price for tier 'Silver': existing is ₹150.00, incoming is ₹175.00."`
- **Reasoning**: Silently picking the first, the last, the minimum, or the maximum price is dangerous in financial systems. If a distributor intended to update the price, or if one line is an outdated typo, the system must not guess. Rejecting the conflicting entry protects the pricing engine from accidental price degradation while alerting the operator via the audit report.

---

## 8. Validation Strategy (Fail Fast & Explicitly)

The system validates all inputs **before** executing financial calculations or mutating seat inventory. Rather than silently clamping bad values or returning generic error codes, the engine uses explicit, descriptive domain error classes:

- **`SoldOutTierError`**: Thrown when a customer attempts to book a tier with 0 available seats.
- **`InsufficientSeatsError`**: Thrown when requested seats exceed remaining capacity.
- **`InvalidTierError`**: Thrown when a requested tier does not exist in the show configuration.
- **`InvalidQuantityError`**: Thrown when quantity is $\le 0$ or not an integer.
- **`MoneyError`**: Thrown on malformed monetary strings or negative percentage rates.

### Core Validation Principle:
> "A counter application should never produce a misleading bill from invalid input; it must reject invalid states early and explain exactly why."

---

## 9. Pricing Pipeline Reasoning

The pricing calculation order is deliberately structured to reflect retail tax law and financial fairness:

```
1. Base Ticket Subtotal  (Qty × Unit Price for all items)
2. Festival Discount     (Flat promo deduction, capped at base subtotal)
3. Member Discount       (% on remaining subtotal, capped at maxCap)
4. Net Ticket Subtotal   (Base Subtotal − Total Discounts)
5. Convenience Fee       (Total Tickets × Per-Ticket Fee)
6. Taxable Base          (Net Subtotal + Convenience Fee)
7. GST                   (roundHalfUp(Taxable Base × GST %))
8. Final Total           (Taxable Base + GST)
```

### Why Discount Order Matters:
Applying percentage discounts before flat discounts produces a completely different financial total than applying flat discounts first.
- Example: Base ₹500, Festival ₹50, Member 10%.
  - **Implemented (Flat First)**:
    Remaining after Festival = ₹450.
    Member 10% = ₹45.
    Total Discount = ₹95.
  - **Alternative (Percentage First)**:
    Member 10% on ₹500 = ₹50.
    Festival = ₹50.
    Total Discount = ₹100.
We chose **Flat First** because in ticket ticketing, universal festival promotions are treated as foundational price reductions, with loyalty memberships rewarding the customer on their net checkout balance.

---

## 10. Invoice Design

The `Invoice` domain model (`backend/src/types.ts`) and `BillFormatter` (`backend/src/billFormatter.ts`) expose all intermediate line-item values rather than just a single final sum:

- `seatLineItems`: Tier name, quantity, unit price in INR, and line total.
- `baseTicketSubtotal`: Gross ticket charge.
- `discounts`: Itemized festival deduction, member deduction, and total savings.
- `netTicketSubtotal`: Ticket charges after discounts.
- `totalConvenienceFee`: Explicit ticket count multiplied by convenience fee rate.
- `taxableAmount`: The legal tax base.
- `gstAmount`: Computed GST charge with rate percentage.
- `finalTotal`: Payable total.

### Auditability:
Exposing intermediate values allows counter staff and customers to verify every line of the bill independently. If a customer questions why their 10% member discount was limited to ₹100, the invoice explicitly highlights the discount cap.

---

## 11. Testing Strategy

The test suite emphasizes testing business rules independently under isolated unit tests.

### Test Categories (35 Automated Tests):
- **Unit Arithmetic & Money (`tests/money.test.ts`)**:
  Validates string parsing, currency prefixes/suffixes, integer multiplication, `ROUND_HALF_UP` boundary tests (`.5`, `.49`, `.51`), and negative percentage guards.
- **Pricing & Business Rules (`tests/pricingEngine.test.ts`)**:
  Validates plain bookings, mixed multi-tier bookings, sold-out tier rejections, insufficient seat guards, flat festival discounting, festival discount capping at subtotal, member percentage calculation, member cap enforcement, discount stacking order, convenience fee additions, GST computation across various rates (0%, 18%, 28%), and exact paisa reconciliation.
- **The Twist Importer (`tests/tierImporter.test.ts`)**:
  Validates inconsistent price format handling, European comma decimals, case-insensitive deduplication, conflicting price rejections, blank price rejections, negative price rejections, zero price rejections, and CSV line tokenization.

---

## 12. Scope Decisions (Avoiding Premature Complexity)

For this assessment, engineering effort was strictly concentrated on the core problem: data hygiene, mathematical precision, business rules, and evaluator ease-of-use.

### Intentionally Avoided:
- **No External Database (MongoDB / PostgreSQL)**: Using in-memory configuration eliminates container setup, connection timeouts, and database provisioning failures for evaluators.
- **No Authentication / Role-Based Access Control**: Not requested in the problem statement; adding user auth would add boilerplate without improving the pricing engine.
- **No Payment Gateway Integration**: Real payments (Stripe/Razorpay) are outside the scope of a pricing and billing engine.
- **No Microservices / Distributed Systems**: A cohesive TypeScript modular architecture provides faster execution, instant startup, and zero deployment friction.

---

## 13. Tradeoffs

| Decision | Alternative Considered | Chosen Approach & Justification |
| :--- | :--- | :--- |
| **Integer Paisa vs `decimal.js`** | External decimal library (e.g. `bignumber.js`) | **Integer Paisa**: Native TypeScript integer math has zero third-party runtime dependencies, zero overhead, and native JSON serialization. |
| **In-Memory Store vs Persistent DB** | SQLite / MongoDB | **In-Memory Store**: Guarantees that any evaluator can clone the repo and run `npm test` or `npm run dev` in under 5 seconds on any OS with zero setup failures. |
| **Conflicting Duplicate Policy** | Overwrite existing price / pick lowest price | **Deterministic Rejection**: Financially safe. The system flags ambiguous prices for human review rather than silently guessing distributor intent. |
| **Pure Engine vs Coupled UI** | Embedding calculation logic in React components | **Pure Domain Engine**: UI acts strictly as a presentation layer consuming the backend API, ensuring pricing calculations can be driven by CLI, REST API, or tests. |

---

## 14. Requirement Traceability Matrix

| Requirement | Source Implementation | Automated Verification Test |
| :--- | :--- | :--- |
| **Exact Paisa Arithmetic** | [`backend/src/money.ts`](backend/src/money.ts) | `tests/money.test.ts` ("adds and subtracts paisa accurately without float errors") |
| **`ROUND_HALF_UP` Rounding** | [`backend/src/money.ts`](backend/src/money.ts) | `tests/money.test.ts` ("rounds half-up on .5 fractional paisa boundary") |
| **Multi-Tier Seat Pricing** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("calculates multiple mixed tiers in a single booking request") |
| **Sold-Out Prevention** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("throws SoldOutTierError when tier availableSeats is 0") |
| **Insufficient Capacity Guard**| [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("throws InsufficientSeatsError when requested seats exceed available seats") |
| **Festival Discount** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("applies flat festival discount correctly") |
| **Festival Subtotal Cap** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("caps festival discount at base ticket subtotal so subtotal never becomes negative") |
| **Member Capped Discount** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("applies member percentage discount with max cap enforcement") |
| **Discount Stacking Order** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("stacks discounts in documented order: Festival first, then Member % on remaining") |
| **Convenience Fee & GST** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("handles fractional paisa GST correctly with ROUND_HALF_UP") |
| **Exact Reconciliation** | [`backend/src/pricingEngine.ts`](backend/src/pricingEngine.ts) | `tests/pricingEngine.test.ts` ("validates reconciliation assertion invariant") |
| **Line-by-Line Breakdown** | [`backend/src/billFormatter.ts`](backend/src/billFormatter.ts) | `tests/pricingEngine.test.ts` ("produces an audit-ready line-by-line formatted string") |
| **The Twist: Case Normalization**| [`backend/src/tierImporter.ts`](backend/src/tierImporter.ts) | `tests/tierImporter.test.ts` ("de-duplicates tier names case-insensitively when prices match") |
| **The Twist: Format Cleaning**| [`backend/src/tierImporter.ts`](backend/src/tierImporter.ts) | `tests/tierImporter.test.ts` ("correctly imports clean and inconsistent price formats") |
| **The Twist: Conflict Rejection**| [`backend/src/tierImporter.ts`](backend/src/tierImporter.ts) | `tests/tierImporter.test.ts` ("safely rejects conflicting duplicate prices instead of guessing") |
| **The Twist: Bad Data Rejection**| [`backend/src/tierImporter.ts`](backend/src/tierImporter.ts) | `tests/tierImporter.test.ts` ("rejects zero and negative prices with explicit error reasons") |
| **The Twist: Audit Report** | [`backend/src/tierImporter.ts`](backend/src/tierImporter.ts) | `tests/tierImporter.test.ts` ("handles a comprehensive messy batch and audits correctly") |

---

## 15. Final Design Principle

The central engineering principle governing this solution is:

> **"Clean the data before trusting it, keep pricing deterministic, calculate money exactly, make every pricing step explainable, and reject invalid states clearly."**
