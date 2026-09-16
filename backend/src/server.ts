import express, { Request, Response } from 'express';
import cors from 'cors';
import { PricingEngine } from './pricingEngine';
import { BillFormatter } from './billFormatter';
import { TierImporter } from './tierImporter';
import { OffersConfig, RawTierInput, ShowConfig } from './types';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// In-memory demo show configuration (cinema counter data)
const defaultShowConfig: ShowConfig = {
  showId: 'SHOW-FRIDAY-001',
  showName: 'Friday Night Blockbuster',
  tiers: {
    silver: { name: 'Silver', pricePaisa: 15000, availableSeats: 50 }, // ₹150.00
    gold: { name: 'Gold', pricePaisa: 25000, availableSeats: 30 },     // ₹250.00
    recliner: { name: 'Recliner', pricePaisa: 40000, availableSeats: 5 }, // ₹400.00
  },
  convenienceFeePerTicketPaisa: 3000, // ₹30.00 per ticket
  gstRatePercent: 18,                // 18% GST (configurable)
};

// Available promotional campaign rules
const defaultOffersConfig: OffersConfig = {
  festivalDiscountFlatPaisa: 5000, // ₹50.00 flat festival off
  memberDiscount: {
    percent: 10,                 // 10% off for members
    maxCapPaisa: 10000,          // Max cap ₹100.00
  },
};

/**
 * GET /api/show
 * Returns show configuration, seat tiers, and active promotional offers.
 */
app.get('/api/show', (_req: Request, res: Response) => {
  res.json({
    show: defaultShowConfig,
    offers: defaultOffersConfig,
  });
});

/**
 * POST /api/quote
 * Calculates real-time itemized price breakdown without booking seats.
 */
app.post('/api/quote', (req: Request, res: Response) => {
  try {
    const { bookingRequest, offersConfig } = req.body;
    if (!bookingRequest) {
      return res.status(400).json({ error: 'Missing bookingRequest in request body' });
    }

    const offersToUse = offersConfig !== undefined ? offersConfig : defaultOffersConfig;
    const invoice = PricingEngine.calculateInvoice(defaultShowConfig, bookingRequest, offersToUse);
    const formattedReceipt = BillFormatter.format(invoice);

    return res.json({
      invoice,
      formattedReceipt,
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Pricing calculation failed',
      name: error.name || 'PricingEngineError',
    });
  }
});

/**
 * POST /api/book
 * Confirms a booking and decrements inventory.
 */
app.post('/api/book', (req: Request, res: Response) => {
  try {
    const { bookingRequest, offersConfig } = req.body;
    const offersToUse = offersConfig !== undefined ? offersConfig : defaultOffersConfig;

    // Calculate invoice first (validates availability)
    const invoice = PricingEngine.calculateInvoice(defaultShowConfig, bookingRequest, offersToUse);

    // Decrement seat inventory
    for (const item of bookingRequest.items) {
      const key = item.tierName.toLowerCase().trim();
      if (defaultShowConfig.tiers[key]) {
        defaultShowConfig.tiers[key].availableSeats -= item.quantity;
      }
    }

    const formattedReceipt = BillFormatter.format(invoice);
    return res.json({
      success: true,
      message: 'Booking confirmed successfully!',
      invoice,
      formattedReceipt,
      updatedTiers: defaultShowConfig.tiers,
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Booking confirmation failed',
      name: error.name || 'PricingEngineError',
    });
  }
});
/**
 * POST /api/tiers/import
 * Imports a messy seat-class price list, sanitizes it, and returns an audit report.
 * Optionally updates the show's active tiers if `applyToShow: true`.
 */
app.post('/api/tiers/import', (req: Request, res: Response) => {
  try {
    let rawTiers: RawTierInput[] = [];

    if (req.body.csvText) {
      rawTiers = TierImporter.parseCSVToRawTiers(req.body.csvText);
    } else if (Array.isArray(req.body.rawTiers)) {
      rawTiers = req.body.rawTiers;
    } else {
      return res.status(400).json({
        error: 'Expected either `rawTiers` array or `csvText` string in request body.',
      });
    }

    const importResult = TierImporter.importMessyTiers(rawTiers);

    // If requested, apply the cleaned tiers to the active show configuration
    if (req.body.applyToShow) {
      defaultShowConfig.tiers = {
        ...defaultShowConfig.tiers,
        ...importResult.cleanedTiers,
      };
    }

    return res.json({
      success: true,
      importResult,
      activeTiers: defaultShowConfig.tiers,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Tier import failed',
    });
  }
});

if (require.main === module) {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🎬 Multiplex Pricing Engine Backend API running on http://localhost:${PORT}`);
  });
}

export default app;
