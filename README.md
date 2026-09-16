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

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher)

### 1. Run Automated Tests
From the root directory:
```bash
npm test
```
All 27 unit tests will execute, validating:
- Integer paisa arithmetic and half-up rounding.
- Single and multi-tier booking pricing.
- Tier availability and sold-out guards.
- Festival and member discount stacking and caps.
- Convenience fee and GST calculations.
- Exact reconciliation invariant.

### 2. Run the CLI Demo Calculation
```bash
npm run demo
```
Output:
```text
------------------------------------------------------------
  MULTIPLEX BOOKING INVOICE
  Show: Friday Night Blockbuster [ID: SHOW-FRIDAY-001]
------------------------------------------------------------
  SEAT BREAKDOWN:
    • Tier: Silver     | Qty:  2 ×   ₹150.00 =    ₹300.00
    • Tier: Recliner   | Qty:  1 ×   ₹400.00 =    ₹400.00
  Total Tickets: 3
  Base Ticket Subtotal:                     ₹700.00
------------------------------------------------------------
  DISCOUNTS APPLIED:
    • Festival Discount:               -     ₹50.00
    • Member Discount:                 -     ₹65.00
    Total Discount:                    -    ₹115.00
  Net Ticket Subtotal:                      ₹585.00
------------------------------------------------------------
  CONVENIENCE & TAXES:
    • Convenience Fee (3 × ₹30.00):         ₹90.00
    • Taxable Base:                         ₹675.00
    • GST (18%):                          ₹121.50
------------------------------------------------------------
  FINAL AMOUNT PAYABLE:                     ₹796.50
------------------------------------------------------------
```

### 3. Build Both Backend & Frontend
```bash
npm run build
```

### 4. Run the Fullstack Application
In Terminal 1 (Start Backend API on port 4000):
```bash
npm run dev:backend
```

In Terminal 2 (Start React Counter UI on port 3000):
```bash
npm run dev:frontend
```
Open `http://localhost:3000` in your browser to interact with the counter UI.

### 5. Export / Update AI Logs
To refresh `AI_LOGS.md` with the latest authentic conversation logs:
```bash
npm run export:logs
```

---

## Test Summary
- **Test Runner**: Jest (`ts-jest`)
- **Total Test Suites**: 2
- **Total Tests**: 27 passed, 0 failed
- **TypeScript Compilation**: Clean (`tsc` exits with code 0)