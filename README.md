# Cinema Ticket Pricing Engine

A deterministic, audit-ready cinema ticket pricing engine built in TypeScript on Node.js. The system sanitizes messy, inconsistent seat-class price lists into trusted tiers, computes exact customer invoices with promotional offers, fees, and taxes, and guarantees reconciliation down to the exact paisa.

---

> ### ⚡ Evaluator Quickstart (Copy & Paste)
> ```bash
> npm install         # 1. Installs all root, backend & frontend dependencies
> npm test            # 2. Runs all 35 unit tests (all passing)
> npm run test:import # 3. Runs The Twist messy price list verification
> npm run dev         # 4. Starts backend (port 4000) & frontend (port 3000)
> ```
> *Web App: Open **http://localhost:3000** for interactive 1-click test actions.*

---

## 1. Overview

This project provides a reliable pricing backend and counter interface for cinema multiplexes. Real-world cinema operations frequently face mis-pricing issues at counter checkouts due to dirty pricing sheets, ambiguous discounts, and fractional rounding errors.

The system addresses this through an end-to-end automated pipeline:

1. **Imports a messy seat-class price list** from CSV text or structured JSON.
2. **Normalizes and validates the data**, stripping extraneous symbols and whitespace.
3. **Handles case-insensitive duplicate seat names** (`Silver`, `silver`, `SILVER`).
4. **Accepts valid price formats** across integers, standard decimals, currency prefixes (`₹`, `Rs.`), suffixes (`INR`), and European comma decimals (`"180,50"`).
5. **Rejects invalid, blank, negative, and conflicting data** according to implemented validation rules.
6. **Produces a clean price list and import/cleaning report** auditing accepted, de-duplicated, and rejected records.
7. **Uses the cleaned pricing data** directly in the cinema ticket calculation engine.
8. **Applies flat festival discounts**, capped at the base ticket subtotal so ticket balances never turn negative.
9. **Applies member percentage discounts** with an enforced maximum monetary savings cap.
10. **Adds a mandatory per-ticket convenience fee**.
11. **Calculates GST** on the net taxable base using strict rounding rules.
12. **Produces an exact-paisa final total** with zero floating-point imprecision.
13. **Provides an itemized line-by-line invoice/bill** for counter display, printed receipts, and customer audit.

---

## 2. Problem Being Solved

Multiplex ticket counters operate in high-throughput environments where counter operators receive disparate price lists from distributors and management. When pricing sheets contain inconsistent labels, redundant rows, or contradictory prices, manual counter calculations fail, creating long queues and customer disputes.

To solve this, the system establishes a strict boundary between ingestion and pricing:

```
MESSY INPUT ──> CLEAN/VALIDATE ──> TRUSTED PRICE LIST ──> PRICING ENGINE ──> ITEMIZED BILL
```

### Why Separating Import/Cleaning from Pricing is Useful:
- **Separation of Concerns**: The core pricing engine relies on trusted, strictly typed invariant models (`Paisa` integers, validated capacity). It never needs to know whether the upstream distributor supplied CSV files, strings with currency symbols, or European decimal commas.
- **Fail-Safe Processing**: Bad data (such as negative prices or contradictory duplicates) is isolated and rejected at the ingestion boundary with actionable audit messages, preventing corrupted state from propagating into financial transactions.
- **Independent Testability**: Ingestion parsing logic and financial discount/tax logic are tested independently without cross-contaminating test scenarios.

---

## 3. Key Features

- **Messy Price-List Import**: Ingests raw CSV text and JSON record arrays.
- **Price Normalization**: Parses plain numbers, strings with currency symbols (`₹`, `Rs.`, `INR`), and quoted European comma decimals (`"180,50"`).
- **Case-Insensitive Seat-Class Handling**: Matches `Silver`, `silver`, and `SILVER` to a single canonical tier key.
- **Duplicate Detection**: Merges identical duplicate records without inflating inventory or re-adding tiers.
- **Invalid-Record Rejection**: Rejects missing names, blank prices, non-numeric strings, zero prices, negative prices, and conflicting duplicate rates.
- **Import Summary & Audit Report**: Returns structured metrics (`totalProcessed`, `importedCount`, `deduplicatedCount`, `rejectedCount`) alongside per-record audit reasons.
- **Exact Integer-Paisa Money Handling**: Stores all monetary values in integer Paisa (₹1.00 = 100 paisa) to eliminate IEEE 754 floating-point errors.
- **Strict Half-Up Rounding (`ROUND_HALF_UP`)**: Applies exact arithmetic rounding on fractional paisa boundaries for percentages and GST.
- **Seat Availability Validation**: Rejects booking attempts on sold-out tiers (`availableSeats = 0`) or requests exceeding remaining capacity.
- **Festival Flat Discount**: Applies a flat deduction across base ticket subtotal, safely bounded at subtotal.
- **Member Percentage Discount**: Applies percentage discount on the remaining ticket subtotal, capped at a configured maximum amount.
- **Convenience Fee**: Computes fee linearly per ticket issued.
- **Configurable GST**: Computes goods and services tax on the taxable base (Net Ticket Subtotal + Total Convenience Fee).
- **Exact Paisa Reconciliation**: Verifies runtime invariant assertion that `Final Total === Net Subtotal + Fees + GST`.
- **Itemized Invoice**: Produces structured JSON receipts and formatted line-by-line text invoices.
- **Automated Tests**: 35 unit tests validating arithmetic, business rules, edge cases, and sanitizer behavior.

---

## 4. Architecture

```
Messy Price List (CSV / JSON)
              ↓
     Price List Importer
              ↓
     Normalize + Validate
              ↓
         Deduplicate
              ↓
 Clean Price List + Import Report
              ↓
        Pricing Engine
              ↓
      Base Ticket Price
              ↓
      Festival Discount
              ↓
     Member Discount + Cap
              ↓
       Convenience Fee
              ↓
             GST
              ↓
     Itemized Invoice
```

### Component Responsibilities:
- **`Money` (`backend/src/money.ts`)**: Pure utility module managing conversion between string/number INR and integer `Paisa`, arithmetic operations, formatted display strings (`₹150.00`), and `ROUND_HALF_UP` percentage calculations.
- **`TierImporter` (`backend/src/tierImporter.ts`)**: Ingestion sanitizer that tokenizes CSV lines, cleans prices, de-duplicates records by normalized tier key, rejects invalid entries, and compiles the audit report.
- **`PricingEngine` (`backend/src/pricingEngine.ts`)**: Pure financial calculation engine. Validates seat availability, calculates base subtotal, executes the discount pipeline, adds fees, computes GST, and verifies mathematical reconciliation.
- **`BillFormatter` (`backend/src/billFormatter.ts`)**: Formats an `Invoice` domain object into a human-readable, line-by-line monospace receipt.
- **Express API (`backend/src/server.ts`)**: Exposes REST endpoints (`GET /api/show`, `POST /api/quote`, `POST /api/book`, `POST /api/tiers/import`).
- **React Counter UI (`frontend/src/App.tsx`)**: Multiplex operator interface with real-time seat counters, live bill updates, 1-click evaluator test actions, and messy price list import tools.

---

## 5. Money Handling

All monetary amounts within the engine are represented as integer **`Paisa`** (`number` constrained to integers):

$$\text{₹}1.00 = 100\text{ paisa}$$

Examples:
- $\text{₹}150.00 \rightarrow 15000\text{ paisa}$
- $\text{₹}150.50 \rightarrow 15050\text{ paisa}$
- $\text{₹}0.01 \rightarrow 1\text{ paisa}$

JavaScript floating-point arithmetic introduces well-known representation errors (e.g., `0.1 + 0.2 === 0.30000000000000004`). In financial systems, accumulating floating-point inaccuracies leads to off-by-one-cent discrepancies and failed tax audits. Storing currency as integer paisa eliminates this risk entirely.

### Implemented Rounding Rule (`ROUND_HALF_UP`)
When calculating percentage discounts or GST, fractional paisa amounts may occur. The system implements `ROUND_HALF_UP`:
$$\text{roundHalfUp}(x) = \text{sign}(x) \times \lfloor |x| + 0.5 \rfloor$$

If the fractional component of a paisa is $\ge 0.5$, it rounds up away from zero; otherwise, it rounds down.
- $121.50\text{ paisa} \rightarrow 122\text{ paisa}$
- $121.49\text{ paisa} \rightarrow 121\text{ paisa}$

---

## 6. Import/Cleaning Rules

The `TierImporter` module enforces the following rules:

### 1. Normalization
Seat tier names are trimmed of leading/trailing whitespace and lowercased to form a canonical key:
- `"Silver"`, `"silver"`, `" SILVER "` all map to canonical key `"silver"`.
- The display name stored for tickets defaults to the first clean casing encountered.

### 2. Price Parsing
The importer supports:
- Raw numeric values: `150`, `250.5`
- Plain numeric strings: `"150"`, `"400.50"`
- Currency prefixes: `"₹150"`, `"Rs. 250"`, `"RS 250"`
- Currency suffixes: `"350.50 INR"`
- Quoted European comma decimals: `"180,50"` $\rightarrow$ parsed as `180.50`

### 3. Blank & Invalid Prices
- Blank values (`""`, `null`, `undefined`) are **rejected** with reason: `"Blank or missing price"`.
- Blank tier names are **rejected** with reason: `"Blank or missing tier name (empty string)"`.
- Non-numeric strings (`"abc"`) are **rejected** with reason: `"Invalid price format: 'abc'"`.

### 4. Negative & Zero Prices
- Ticket prices must represent positive consideration.
- Prices $< 0$ (e.g., `-500`) are **rejected** with reason: `"Price cannot be negative: '-500'"`.
- Prices $== 0$ are **rejected** with reason: `"Price must be strictly positive (> 0)"`.

### 5. Duplicates (Same Price)
If a normalized tier key matches an existing imported tier with the **exact same price**, it is logged under `deduplicated`:
- `"Silver, 150"` followed by `"silver, ₹150.00"` $\rightarrow$ second record is de-duplicated; existing entry retained.

### 6. Conflicting Duplicates (Different Prices)
- **Behavior**: If a normalized tier key matches an existing imported tier but specifies a **different price** (e.g., `Silver @ 150` vs `silver @ 175`), the incoming record is **rejected** with reason:
  `"Conflicting price for tier 'Silver': existing is ₹150.00, incoming is ₹175.00."`
- **Classification**: *Design assumption*. The system refuses to silently overwrite or guess which price the distributor intended, requiring human review while keeping the clean list uncorrupted.

---

## 7. Pricing Calculation

The pricing engine computes ticket orders in the following deterministic sequence:

1. **Base Ticket Subtotal**:
   $$\text{Base Subtotal} = \sum (\text{quantity}_i \times \text{unitPrice}_i)$$
2. **Festival Discount**:
   $$\text{Festival Discount} = \min(\text{flatFestivalDiscount}, \text{Base Subtotal})$$
3. **Member Percentage Discount**:
   $$\text{Remaining Base} = \max(0, \text{Base Subtotal} - \text{Festival Discount})$$
   $$\text{Raw Member Discount} = \text{roundHalfUp}\left(\frac{\text{Remaining Base} \times \text{memberPercent}}{100}\right)$$
   $$\text{Member Discount} = \min(\text{Raw Member Discount}, \text{memberMaxCap})$$
4. **Net Ticket Subtotal**:
   $$\text{Net Subtotal} = \text{Base Subtotal} - (\text{Festival Discount} + \text{Member Discount})$$
5. **Convenience Fee**:
   $$\text{Total Convenience Fee} = \text{Total Tickets} \times \text{feePerTicket}$$
6. **Taxable Base Amount**:
   $$\text{Taxable Base} = \text{Net Subtotal} + \text{Total Convenience Fee}$$
7. **GST**:
   $$\text{GST Amount} = \text{roundHalfUp}\left(\frac{\text{Taxable Base} \times \text{gstRatePercent}}{100}\right)$$
8. **Final Total Payable**:
   $$\text{Final Total} = \text{Taxable Base} + \text{GST Amount}$$
9. **Reconciliation Assertion**:
   $$\text{Final Total} \equiv (\text{Base Subtotal} - \text{Total Discounts}) + \text{Convenience Fee} + \text{GST}$$

---

## 8. Configuration and Assumptions

| Item | Status | Explanation |
| :--- | :--- | :--- |
| **Tier Prices** | Configurable | Defined in `ShowConfig` or imported dynamically via `TierImporter`. |
| **Festival Discount** | Configurable | Set in `OffersConfig.festivalDiscountFlatPaisa` (default ₹50.00). |
| **Member Percentage** | Configurable | Set in `OffersConfig.memberDiscount.percent` (default 10%). |
| **Member Discount Cap** | Configurable | Set in `OffersConfig.memberDiscount.maxCapPaisa` (default ₹100.00). |
| **Convenience Fee** | Configurable | Set in `ShowConfig.convenienceFeePerTicketPaisa` (default ₹30.00 / ticket). |
| **GST Rate** | Configurable | Set in `ShowConfig.gstRatePercent` (default 18%). Supports 0% to any positive percentage. |
| **Discount Ordering** | Design Assumption | Festival flat discount applies first; Member percentage applies to the remaining ticket balance. |
| **Discount Scope** | Design Assumption | Discounts apply strictly to ticket charges. Mandatory convenience fees and taxes cannot be discounted. |
| **GST Taxable Base** | Design Assumption | GST applies on `Net Ticket Subtotal + Convenience Fee` (industry standard cinema taxation in India). |
| **Rounding Method** | Implemented Rule | `ROUND_HALF_UP` on fractional paisa boundaries. |
| **Conflicting Duplicates** | Design Assumption | Rejected with explanatory conflict message instead of silently overwriting. |
| **Multi-Tier Booking** | Implemented Feature | A single booking request supports multiple tiers (e.g., 2 Silver + 1 Recliner). |

---

## 9. Project Structure

```
aurigait_round/
├── README.md                 # Evaluator guide & technical documentation
├── REASONING.md              # Engineering reasoning, assumptions & architectural tradeoffs
├── AI_LOGS.md                # Complete authentic conversation logs from pair programming
├── package.json              # Workspace root scripts and devDependencies
├── sample_data/
│   ├── messy_prices.csv      # Sample messy price list in CSV format
│   └── messy_prices.json     # Sample messy price list in JSON format
├── scripts/
│   ├── dev.js                # Single-command fullstack launcher (`npm run dev`)
│   ├── test_import.js        # CLI test runner for The Twist importer (`npm run test:import`)
│   └── export_ai_logs.js     # Tool to export verbatim transcript into AI_LOGS.md
├── backend/
│   ├── package.json          # Backend dependencies (express, cors, typescript, jest)
│   ├── tsconfig.json         # TypeScript configuration
│   ├── jest.config.js        # Jest unit testing configuration
│   ├── src/
│   │   ├── types.ts          # Domain interfaces, ShowConfig, Invoice, and Error definitions
│   │   ├── money.ts          # Paisa integer arithmetic, ROUND_HALF_UP, and INR formatting
│   │   ├── pricingEngine.ts  # Validation and calculation pipeline
│   │   ├── tierImporter.ts   # The Twist: CSV tokenizer, price sanitizer, and audit engine
│   │   ├── billFormatter.ts  # Monospace itemized text bill formatter
│   │   ├── server.ts         # Express API running on port 4000
│   │   └── index.ts          # Module exports & CLI demo
│   └── tests/
│       ├── money.test.ts         # Unit tests for money parsing and rounding
│       ├── pricingEngine.test.ts # Unit tests for calculations, availability, offers, and GST
│       └── tierImporter.test.ts  # Unit tests for The Twist messy price list import
└── frontend/
    ├── package.json          # Frontend dependencies (react, react-dom, vite)
    ├── vite.config.ts        # Vite configuration (port 3000)
    ├── index.html            # Single page entry point
    └── src/
        ├── App.tsx           # React booking counter UI with 1-click test actions
        ├── main.tsx          # React application root
        └── index.css         # Modern cinema styling
```

---

## 10. Setup

### Prerequisites:
- **Node.js**: v18 or higher (v20+ recommended)
- **npm**: v9 or higher

### Install Dependencies:
From the root workspace directory, run:
```bash
npm install
```
*(The automated `postinstall` hook will automatically install dependencies for root, backend, and frontend).*

---

## 11. Running

### 1. Run Automated Unit Tests
```bash
npm test
```
Executes all 35 Jest tests across the 3 test suites.

### 2. Run CLI Twist Importer Test
```bash
npm run test:import
```
Processes `sample_data/messy_prices.csv` through `TierImporter` and prints the audit report.

### 3. Run CLI Booking Engine Demo
```bash
npm run demo
```
Calculates a sample booking (2 Silver + 1 Recliner with discounts) and prints the line-by-line invoice to stdout.

### 4. Build Backend & Frontend
```bash
npm run build
```
Type-checks and compiles both backend (`tsc`) and frontend (`vite build`).

### 5. Run Fullstack Application Concurrently
```bash
npm run dev
```
Starts:
- **Backend API**: `http://localhost:4000`
- **Frontend UI**: `http://localhost:3000`

*(To run individually: `npm run dev:backend` and `npm run dev:frontend`)*

---

## 12. Testing

The test suite covers the identified business rules and important edge cases.

### Test Breakdown (35 Tests Across 3 Suites):
1. **`tests/money.test.ts` (11 tests)**:
   - String to paisa conversion (`"150"`, `"150.50"`, `"₹250"`).
   - Numeric input conversion.
   - Throws on invalid monetary strings.
   - Paisa to formatted INR strings (`₹150.00`).
   - Integer arithmetic without float drift.
   - `ROUND_HALF_UP` behavior on exact `.5` boundaries, below `.5`, and above `.5`.
   - Rejection of negative percentage rates.
2. **`tests/pricingEngine.test.ts` (16 tests)**:
   - Single ticket pricing with fee and GST.
   - Multiple tickets in a single tier.
   - Mixed multi-tier booking in one request.
   - Case-insensitive tier matching (`silver` vs `Silver`).
   - Rejection of sold-out tiers (`SoldOutTierError`).
   - Rejection when quantity exceeds capacity (`InsufficientSeatsError`).
   - Rejection of non-existent tier (`InvalidTierError`).
   - Rejection of zero or negative ticket quantities (`InvalidQuantityError`).
   - Flat festival discount calculation.
   - Festival discount capped at ticket subtotal.
   - Member percentage discount calculation and max cap enforcement.
   - Discount stacking order: Festival first, Member % on remaining balance.
   - Fractional paisa GST with half-up rounding.
   - Configurable GST rates (0%, 18%, 28%).
   - Exact paisa reconciliation assertion invariant.
   - Itemized bill text formatter output verification.
3. **`tests/tierImporter.test.ts` (8 tests)**:
   - Clean and inconsistent price formats (`"150"`, `"₹150.00"`, `"Rs. 250"`, `"350.50 INR"`, `"180,50"`).
   - Case-insensitive deduplication when prices match.
   - Rejection of conflicting duplicate prices.
   - Rejection of blank and missing tier names.
   - Rejection of blank prices.
   - Rejection of zero and negative prices.
   - Rejection of non-numeric price strings (`"abc"`).
   - Comprehensive batch processing audit counts.
   - CSV text parsing with quoted European decimal tokens.

---

## 13. Debugging / Troubleshooting

### Common Problems & Resolutions:
- **Port In Use (EADDRINUSE 4000 or 3000)**:
  Check if a background server is already running: `lsof -i :4000` or `lsof -i :3000` and kill the lingering process.
- **Node 22 / IPv6 Localhost Binding**:
  The backend binds explicitly to `0.0.0.0:4000`. The frontend uses a fallback mechanism trying both `localhost:4000` and `127.0.0.1:4000`.
- **Malformed CSV Input**:
  Ensure CSV lines have at least tier name and price. If prices contain commas as decimal separators, enclose them in double quotes (e.g., `"180,50"`).

### Standard Debugging Workflow:
1. **Reproduce the problem**: Run the failing input through `npm run demo` or `npm run test:import`.
2. **Check input & configuration**: Verify seat tier keys, price formats, and discount parameters.
3. **Run the relevant test**: Target the affected suite: `npx jest tests/pricingEngine.test.ts`.
4. **Inspect the error message**: Check the thrown domain error class (`SoldOutTierError`, `InsufficientSeatsError`, etc.).
5. **Fix the smallest affected component**: Keep changes localized to `money.ts`, `tierImporter.ts`, or `pricingEngine.ts`.
6. **Run the full test suite again**: Ensure all 35 tests pass with `npm test`.

---

## 14. Example End-to-End Walkthrough

### 1. Messy Input (CSV):
```csv
name,price,availableSeats
Silver, ₹150, 50
silver, 150, 50
SILVER, 175, 50
GOLD, 250, 30
VIP,, 20
Club, -100, 10
```

### 2. Cleaned Result & Audit Report:
- **🟢 Accepted (2 tiers)**:
  - `Silver`: ₹150.00 (50 seats)
  - `GOLD`: ₹250.00 (30 seats)
- **🟡 De-duplicated (1 record)**:
  - `"silver" (150)` matched existing `Silver` with identical price.
- **🔴 Rejected (3 records)**:
  - `"SILVER" (175)` $\rightarrow$ Conflicting price (existing is ₹150.00, incoming is ₹175.00).
  - `"VIP" ()` $\rightarrow$ Blank or missing price.
  - `"Club" (-100)` $\rightarrow$ Price cannot be negative.

### 3. Customer Booking Request:
- Tier: `Silver` × 2 tickets (@ ₹150.00 = ₹300.00)
- Tier: `GOLD` × 1 ticket (@ ₹250.00 = ₹250.00)
- Offers: Festival Discount Active, CinePass Member Active

### 4. Generated Itemized Invoice:
```text
------------------------------------------------------------
  MULTIPLEX BOOKING INVOICE
  Show: Friday Night Blockbuster [ID: SHOW-FRIDAY-001]
------------------------------------------------------------
  SEAT BREAKDOWN:
    • Tier: Silver     | Qty:  2 ×   ₹150.00 =    ₹300.00
    • Tier: GOLD       | Qty:  1 ×   ₹250.00 =    ₹250.00
  Total Tickets: 3
  Base Ticket Subtotal:                     ₹550.00
------------------------------------------------------------
  DISCOUNTS APPLIED:
    • Festival Discount:               -     ₹50.00
    • Member Discount:                 -     ₹50.00
    Total Discount:                    -    ₹100.00
  Net Ticket Subtotal:                      ₹450.00
------------------------------------------------------------
  CONVENIENCE & TAXES:
    • Convenience Fee (3 × ₹30.00):         ₹90.00
    • Taxable Base:                         ₹540.00
    • GST (18%):                            ₹97.20
------------------------------------------------------------
  FINAL AMOUNT PAYABLE:                     ₹637.20
------------------------------------------------------------
```

---

## 15. Design Priorities

The implementation prioritizes:
- **Correctness**: Exact integer paisa calculations eliminating floating-point drift.
- **Explicit Validation**: Fails early with descriptive error classes rather than producing corrupted bills.
- **Deterministic Behavior**: The same input always produces identical monetary totals.
- **Explainable Pricing**: Every intermediate discount, fee, and tax is transparent in the line-by-line receipt.
- **Testability**: Pure domain functions without hidden I/O dependencies.
- **Simple Architecture**: Zero external database or complex microservice dependencies for lightweight, instant evaluation.

demo->

<img width="1470" height="956" alt="Screenshot 2026-09-16 at 4 45 30 PM" src="https://github.com/user-attachments/assets/be06c0f0-df07-4666-8a0b-568e2e018386" />
<img width="1470" height="956" alt="Screenshot 2026-09-16 at 4 45 43 PM" src="https://github.com/user-attachments/assets/a1873c9e-09c5-4d79-8d88-ef8da4feeb22" />

