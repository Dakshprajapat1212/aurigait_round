# Multiplex Ticket Pricing Engine

A reliable, deterministic, and audit-ready cinema ticket pricing engine built in TypeScript on Node.js with a dedicated Express API and React Counter UI for the Auriga IT Round 2 (Builder) assessment.

---

## Repository Structure

```
aurigait_round/
├── README.md               # Setup, running, and testing guide (Required root file)
├── REASONING.md            # Problem reasoning, assumptions, and architectural design (Required root file)
├── AI_LOGS.md              # Complete authentic conversation logs with the AI assistant (Required root file)
├── package.json            # Root workspace orchestrator
├── scripts/
│   └── export_ai_logs.js   # Script to refresh AI_LOGS.md directly from system transcript
├── backend/                # Core Pricing Engine & Express API
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── src/
│   │   ├── types.ts          # Domain models, ShowConfig, BookingRequest, and Error classes
│   │   ├── money.ts          # Exact integer paisa arithmetic, formatting, and ROUND_HALF_UP
│   │   ├── pricingEngine.ts  # Core pricing pipeline and validation engine
│   │   ├── billFormatter.ts  # Itemized line-by-line bill text formatter
│   │   ├── server.ts         # Express REST API (/api/show, /api/quote, /api/book)
│   │   └── index.ts          # Module exports and CLI demo runner
│   └── tests/
│       ├── money.test.ts         # Unit tests for money conversion and rounding
│       └── pricingEngine.test.ts # Unit tests for business rules, discounts, and edge cases
└── frontend/               # React + Vite Counter Interface
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx          # Real-time interactive multiplex counter with live line-by-line receipt
        ├── main.tsx
        └── index.css        # Cinema counter styling
```

---

## Key Features

1. **Exact Money Handling (Paisa Precision)**:
   - Eliminates JavaScript floating-point errors by representing money internally as integer `Paisa` (₹1.00 = 100 paisa).
   - Strict `ROUND_HALF_UP` rounding on percentage calculations (discounts and GST).
   - Mathematical assertion guaranteeing that the final total reconciles with line items to the exact paisa.

2. **Availability & Sold-Out Enforcement**:
   - Rejects bookings for sold-out tiers (`SoldOutTierError`).
   - Rejects bookings exceeding available capacity (`InsufficientSeatsError`).
   - Normalizes tier lookups for case-insensitivity (`Silver`, `silver`, `SILVER`).

3. **Multi-Tier & Mixed Bookings**:
   - Supports bookings with multiple seat tiers in a single transaction (e.g., 2 Silver + 1 Recliner).

4. **Promotional Offers & Discount Pipeline**:
   - Flat Festival Discount (capped at base ticket subtotal).
   - Member Percentage Discount (calculated on remaining balance, capped at `maxCap`).
   - Stacking order: **Festival Flat** $\rightarrow$ **Member % on remaining balance**.
   - Discounts apply exclusively to ticket base charges (fees and taxes are non-discountable).

5. **Mandatory Fees & GST**:
   - Per-ticket convenience fee.
   - Configurable GST rate applied on the taxable base (Net Ticket Subtotal + Convenience Fee).

6. **Dual Presentation Layers**:
   - **CLI / Text Receipt**: Formatted line-by-line receipt for counter receipts.
   - **Interactive Web UI**: Modern React counter interface with live calculation and booking confirmation.

7. **The Twist: Messy Price List Importer & Audit Reporter**:
   - Sanitizes messy input lists with duplicate names in different cases (`Silver`, `silver`, `SILVER`).
   - Normalizes inconsistent price formats (`₹150.00`, `Rs. 250`, ` 350.50 INR `, `180,50`).
   - Automatically catches and rejects blank values and negative prices.
   - Produces a detailed audit report: Total Processed = Imported + De-duplicated + Rejected.

---

## ⚡ Evaluator Quick Testing Guide (Under 60 Seconds)

To verify the entire project immediately:

### 1. Run Automated Unit Tests (35 Tests Passing)
```bash
npm test
```
Runs all 35 test cases across 3 test suites:
- `tests/money.test.ts` (Exact Paisa integer math, rounding half-up, formatting)
- `tests/pricingEngine.test.ts` (Tiers, sold-out enforcement, discounts, fees, GST, exact reconciliation)
- `tests/tierImporter.test.ts` (The Twist: case deduplication, format cleaning, rejection audit)

### 2. Test "The Twist" (Messy Price List Importer & Cleaner)
```bash
npm run test:import
```
Processes [`sample_data/messy_prices.csv`](sample_data/messy_prices.csv) (containing mixed casing, whitespace, currency symbols, blank values, and negative numbers) and outputs the complete color-coded audit summary:
- 🟢 **5 Accepted Clean Tiers**
- 🟡 **4 De-duplicated Records**
- 🔴 **7 Rejected Records** (with specific rejection reasons)

### 3. Run the Fullstack App & Test via Web UI
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser. Right at the top of the counter, use the **Evaluator Quick Actions**:
1. Click **🎫 1-Click Test Booking**: Instantly loads 2 Silver + 1 Gold seats + Member Discount + Festival Offer, displaying the live calculated itemized receipt with exact paisa reconciliation.
2. Click **🧪 1-Click Test "The Twist"**: Automatically loads messy sample data, cleans it, displays the audit report, and updates the active booking tiers.
3. Click **🔄 Reset All**: Clears selections back to default show configuration.

---

## Repository Structure

```
aurigait_round/
├── README.md               # Setup, running, and testing guide (Required root file)
├── REASONING.md            # Problem reasoning, assumptions, and architectural design (Required root file)
├── AI_LOGS.md              # Complete authentic conversation logs with the AI assistant (Required root file)
├── package.json            # Root workspace orchestrator
├── sample_data/            # Sample test data for The Twist
│   ├── messy_prices.csv    # Real-world dirty CSV (case duplicates, blanks, negatives)
│   └── messy_prices.json   # Real-world dirty JSON equivalent
├── scripts/
│   ├── dev.js              # One-command fullstack launcher (`npm run dev`)
│   ├── test_import.js      # CLI test runner for The Twist (`npm run test:import`)
│   └── export_ai_logs.js   # Script to refresh AI_LOGS.md directly from system transcript
├── backend/                # Core Pricing Engine & Express API
│   ├── src/
│   │   ├── types.ts          # Domain models, ShowConfig, BookingRequest, and Error classes
│   │   ├── money.ts          # Exact integer paisa arithmetic, formatting, and ROUND_HALF_UP
│   │   ├── pricingEngine.ts  # Core pricing pipeline and validation engine
│   │   ├── tierImporter.ts   # The Twist: Sanitizer, deduplicator & audit report generator
│   │   ├── billFormatter.ts  # Itemized line-by-line bill text formatter
│   │   ├── server.ts         # Express REST API (/api/show, /api/quote, /api/book, /api/tiers/import)
│   │   └── index.ts          # Module exports and CLI demo runner
│   └── tests/
│       ├── money.test.ts         # Unit tests for money conversion and rounding
│       ├── pricingEngine.test.ts # Unit tests for business rules, discounts, and edge cases
│       └── tierImporter.test.ts  # Unit tests for The Twist messy list import
└── frontend/               # React + Vite Counter Interface
    └── src/
        ├── App.tsx          # Real-time interactive multiplex counter with 1-click test actions
        ├── main.tsx
        └── index.css        # Cinema counter styling
```

---

## Test Summary
- **Test Runner**: Jest (`ts-jest`)
- **Total Test Suites**: 3
- **Total Tests**: 35 passed, 0 failed
- **TypeScript Compilation**: Clean (`tsc` exits with code 0)