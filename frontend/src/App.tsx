import React, { useState, useEffect } from 'react';

interface SeatTier {
  name: string;
  pricePaisa: number;
  availableSeats: number;
}

interface ShowConfig {
  showId: string;
  showName: string;
  tiers: Record<string, SeatTier>;
  convenienceFeePerTicketPaisa: number;
  gstRatePercent: number;
}

interface Invoice {
  showId: string;
  showName: string;
  totalTickets: number;
  baseTicketSubtotalFormatted: string;
  discounts: {
    festivalDiscountPaisa: number;
    festivalDiscountFormatted: string;
    memberDiscountPaisa: number;
    memberDiscountFormatted: string;
    totalDiscountPaisa: number;
    totalDiscountFormatted: string;
  };
  netTicketSubtotalFormatted: string;
  convenienceFeePerTicketPaisa: number;
  totalConvenienceFeeFormatted: string;
  taxableAmountPaisa: number;
  gstRatePercent: number;
  gstAmountFormatted: string;
  finalTotalFormatted: string;
  seatLineItems: Array<{
    tierName: string;
    quantity: number;
    unitPriceFormatted: string;
    lineTotalFormatted: string;
  }>;
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const urls = [
    `http://localhost:4000/api${path}`,
    `http://127.0.0.1:4000/api${path}`,
    `/api${path}`,
  ];
  let lastErr: any = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, options);
      if (res.status < 500) {
        return res;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to connect to backend server');
}

const SAMPLE_MESSY_CSV = `name,price,availableSeats
Silver, ₹150, 50
silver, 150, 50
SILVER, ₹150.00, 50
silver, 175, 50
GOLD, 250, 30
Gold, ₹250, 30
GOLD, 300, 30
Recliner, ₹400.50, 10
recliner, 400.50, 10
Balcony, 350.50 INR, 20
Executive, "180,50", 15
VIP,, 20
, 200, 10
Premium, -500, 5
FreePass, 0, 10
Club, abc, 15`;

const SAMPLE_MESSY_JSON = `[
  { "name": "Silver", "price": "₹150", "availableSeats": 50 },
  { "name": "silver", "price": 150, "availableSeats": 50 },
  { "name": "SILVER", "price": "₹150.00", "availableSeats": 50 },
  { "name": "silver", "price": 175, "availableSeats": 50 },
  { "name": "GOLD", "price": 250, "availableSeats": 30 },
  { "name": "Gold", "price": "₹250", "availableSeats": 30 },
  { "name": "GOLD", "price": 300, "availableSeats": 30 },
  { "name": "Recliner", "price": "₹400.50", "availableSeats": 10 },
  { "name": "recliner", "price": 400.50, "availableSeats": 10 },
  { "name": "Balcony", "price": "350.50 INR", "availableSeats": 20 },
  { "name": "Executive", "price": "180,50", "availableSeats": 15 },
  { "name": "VIP", "price": "", "availableSeats": 20 },
  { "name": "", "price": 200, "availableSeats": 10 },
  { "name": "Premium", "price": -500, "availableSeats": 5 },
  { "name": "FreePass", "price": 0, "availableSeats": 10 },
  { "name": "Club", "price": "abc", "availableSeats": 15 }
]`;

export function App() {
  const [show, setShow] = useState<ShowConfig | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<Record<string, number>>({});
  const [isMember, setIsMember] = useState(false);
  const [applyFestivalDiscount, setApplyFestivalDiscount] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showImporter, setShowImporter] = useState(false);
  const [importText, setImportText] = useState(SAMPLE_MESSY_CSV);
  const [importReport, setImportReport] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const executeImport = async (textToImport: string) => {
    try {
      setImporting(true);
      setErrorMsg(null);
      const isJson = textToImport.trim().startsWith('[');
      const payload = isJson
        ? { rawTiers: JSON.parse(textToImport), applyToShow: true }
        : { csvText: textToImport, applyToShow: true };

      const res = await apiFetch('/tiers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to import');
      } else {
        setImportReport(data.importResult.report);
        setShow((prev) => (prev ? { ...prev, tiers: data.activeTiers } : null));
        const reset: Record<string, number> = {};
        for (const key of Object.keys(data.activeTiers)) {
          reset[key] = 0;
        }
        setSelectedSeats(reset);
        setSuccessMsg(
          `Price list cleaned & imported! (${data.importResult.report.importedCount} accepted, ${data.importResult.report.deduplicatedCount} de-duplicated, ${data.importResult.report.rejectedCount} rejected)`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to import price list');
    } finally {
      setImporting(false);
    }
  };

  const handleImportTiers = () => executeImport(importText);

  // 1-Click Tester Actions
  const handleQuickTestBooking = () => {
    if (!show) return;
    const initial: Record<string, number> = {};
    for (const key of Object.keys(show.tiers)) {
      initial[key] = 0;
    }
    const keys = Object.keys(show.tiers);
    if (keys.length > 0) initial[keys[0]] = 2; // e.g. 2 Silver
    if (keys.length > 1) initial[keys[1]] = 1; // e.g. 1 Gold
    setSelectedSeats(initial);
    setIsMember(true);
    setApplyFestivalDiscount(true);
    setSuccessMsg('⚡ Quick Test Loaded: 2 Silver + 1 Gold tickets + Member Discount + Festival Offer');
    setErrorMsg(null);
  };

  const handleQuickTestTheTwist = () => {
    setShowImporter(true);
    setImportText(SAMPLE_MESSY_CSV);
    executeImport(SAMPLE_MESSY_CSV);
  };

  const handleResetAll = async () => {
    await fetchShow();
    setIsMember(false);
    setApplyFestivalDiscount(false);
    setInvoice(null);
    setImportReport(null);
    setShowImporter(false);
    setSuccessMsg('Reset all selections to default show settings');
    setErrorMsg(null);
  };

  // Fetch show details
  const fetchShow = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/show');
      const data = await res.json();
      setShow(data.show);
      // Initialize quantities to 0
      const initial: Record<string, number> = {};
      for (const key of Object.keys(data.show.tiers)) {
        initial[key] = 0;
      }
      setSelectedSeats(initial);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg('Failed to connect to backend server. Ensure backend is running on port 4000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShow();
  }, []);

  // Update quote calculation whenever selections change
  useEffect(() => {
    if (!show) return;

    const items = Object.keys(selectedSeats)
      .filter((key) => selectedSeats[key] > 0)
      .map((key) => ({
        tierName: show.tiers[key].name,
        quantity: selectedSeats[key],
      }));

    if (items.length === 0) {
      setInvoice(null);
      setErrorMsg(null);
      return;
    }

    const payload = {
      bookingRequest: {
        showId: show.showId,
        items,
        isMember,
        applyFestivalDiscount,
      },
    };

    apiFetch('/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error);
          setInvoice(null);
        } else {
          setInvoice(data.invoice);
          setErrorMsg(null);
        }
      })
      .catch(() => {
        setErrorMsg('Error calculating price quote');
      });
  }, [selectedSeats, isMember, applyFestivalDiscount, show]);

  const handleSeatChange = (key: string, delta: number) => {
    if (!show) return;
    const current = selectedSeats[key] || 0;
    const next = Math.max(0, current + delta);
    setSelectedSeats((prev) => ({
      ...prev,
      [key]: next,
    }));
    setSuccessMsg(null);
  };

  const handleBooking = async () => {
    if (!show || !invoice) return;

    const items = Object.keys(selectedSeats)
      .filter((key) => selectedSeats[key] > 0)
      .map((key) => ({
        tierName: show.tiers[key].name,
        quantity: selectedSeats[key],
      }));

    try {
      const res = await apiFetch('/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingRequest: {
            showId: show.showId,
            items,
            isMember,
            applyFestivalDiscount,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error);
      } else {
        setSuccessMsg(`Booking successful! Final amount paid: ${data.invoice.finalTotalFormatted}`);
        setShow((prev) => (prev ? { ...prev, tiers: data.updatedTiers } : null));
        // Reset quantities
        const reset: Record<string, number> = {};
        for (const key of Object.keys(data.updatedTiers)) {
          reset[key] = 0;
        }
        setSelectedSeats(reset);
        setInvoice(null);
      }
    } catch {
      setErrorMsg('Failed to process booking');
    }
  };

  if (loading) {
    return (
      <div className="counter-container">
        <p>Loading multiplex counter...</p>
      </div>
    );
  }

  return (
    <div className="counter-container">
      <header className="counter-header">
        <div>
          <h1>🎬 Multiplex Booking Counter</h1>
          <p style={{ color: '#94a3b8', marginTop: 4 }}>
            Show: <strong style={{ color: '#f8fafc' }}>{show?.showName}</strong> (ID: {show?.showId})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="btn-counter"
            style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
            onClick={() => setShowImporter(!showImporter)}
          >
            {showImporter ? '✕ Close Importer' : '📥 The Twist: Import Messy Price List'}
          </button>
          <span className="counter-badge">Pricing Engine v1.0</span>
        </div>
      </header>

      {/* ⚡ Tester Quick Actions Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          padding: '12px 16px',
          background: '#1e293b',
          borderRadius: 8,
          marginBottom: 20,
          alignItems: 'center',
          border: '1px solid #475569',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>⚡ Evaluator / Tester Quick Actions:</span>
        <button
          type="button"
          className="btn-counter"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 13, background: '#0284c7', color: '#fff' }}
          onClick={handleQuickTestBooking}
        >
          🎫 1-Click Test Booking (2 Silver + 1 Gold + Offers)
        </button>
        <button
          type="button"
          className="btn-counter"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 13, background: '#7c3aed', color: '#fff' }}
          onClick={handleQuickTestTheTwist}
        >
          🧪 1-Click Test "The Twist" (Import Messy Prices)
        </button>
        <button
          type="button"
          className="btn-counter"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 13, background: '#334155', color: '#cbd5e1' }}
          onClick={handleResetAll}
        >
          🔄 Reset All
        </button>
      </div>

      {errorMsg && <div className="alert alert-error">⚠️ {errorMsg}</div>}
      {successMsg && <div className="alert alert-success">✅ {successMsg}</div>}

      {/* The Twist: Messy Price List Sanitizer Panel */}
      {showImporter && (
        <div className="panel" style={{ marginBottom: 24, borderColor: '#3b82f6' }}>
          <div className="panel-title">
            <span>📥 The Twist: Messy Seat-Class Price List Importer</span>
            <span style={{ fontSize: 12, color: '#38bdf8' }}>De-duplicates, Cleans Formats & Audits</span>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            Input raw, inconsistent tiers (with duplicate names in different cases, currency symbols, whitespace, blank values, and negative prices). The engine will clean it into a valid price list and provide a full audit report.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>Presets:</span>
            <button
              type="button"
              className="btn-counter"
              style={{ width: 'auto', padding: '4px 10px', fontSize: 12, background: '#334155', color: '#f8fafc' }}
              onClick={() => setImportText(SAMPLE_MESSY_CSV)}
            >
              📄 Load Sample CSV
            </button>
            <button
              type="button"
              className="btn-counter"
              style={{ width: 'auto', padding: '4px 10px', fontSize: 12, background: '#334155', color: '#f8fafc' }}
              onClick={() => setImportText(SAMPLE_MESSY_JSON)}
            >
              📋 Load Sample JSON
            </button>
          </div>

          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#090d16',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: 12,
              color: '#f8fafc',
              fontFamily: 'monospace',
              fontSize: 13,
              marginBottom: 12,
            }}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn-book"
              style={{ width: 'auto', padding: '10px 20px', marginTop: 0 }}
              disabled={importing}
              onClick={handleImportTiers}
            >
              {importing ? 'Processing...' : 'Clean & Import Price List'}
            </button>
          </div>

          {importReport && (
            <div style={{ marginTop: 18, borderTop: '1px solid #334155', paddingTop: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 10, color: '#e2e8f0' }}>
                📋 Import Audit Report (Processed: {importReport.totalProcessed})
              </h3>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>🟢 Imported: {importReport.importedCount}</span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>🟡 De-duplicated: {importReport.deduplicatedCount}</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>🔴 Rejected: {importReport.rejectedCount}</span>
              </div>

              {importReport.imported.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: '#10b981', fontSize: 13 }}>Cleaned & Imported Tiers:</strong>
                  <ul style={{ fontSize: 13, marginLeft: 20, color: '#cbd5e1', marginTop: 4 }}>
                    {importReport.imported.map((t: any, idx: number) => (
                      <li key={idx}>
                        <strong>{t.name}</strong>: {t.priceFormatted} ({t.availableSeats} seats)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importReport.deduplicated.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: '#f59e0b', fontSize: 13 }}>De-duplicated Tiers (Ignored redundant entries):</strong>
                  <ul style={{ fontSize: 13, marginLeft: 20, color: '#94a3b8', marginTop: 4 }}>
                    {importReport.deduplicated.map((d: any, idx: number) => (
                      <li key={idx}>{d.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importReport.rejected.length > 0 && (
                <div>
                  <strong style={{ color: '#ef4444', fontSize: 13 }}>Rejected Entries:</strong>
                  <ul style={{ fontSize: 13, marginLeft: 20, color: '#fca5a5', marginTop: 4 }}>
                    {importReport.rejected.map((r: any, idx: number) => (
                      <li key={idx}>
                        {JSON.stringify(r.raw)} &rarr; <em>{r.reason}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid-layout">
        {/* Left Column: Seat Selection & Offers */}
        <div className="panel">
          <h2 className="panel-title">Seat Selection</h2>

          {show &&
            Object.keys(show.tiers).map((key) => {
              const tier = show.tiers[key];
              const isSoldOut = tier.availableSeats <= 0;
              const qty = selectedSeats[key] || 0;

              return (
                <div key={key} className={`tier-card ${isSoldOut ? 'sold-out' : ''}`}>
                  <div className="tier-info">
                    <h3>{tier.name}</h3>
                    <p>
                      ₹{(tier.pricePaisa / 100).toFixed(2)} |{' '}
                      {isSoldOut ? (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>SOLD OUT</span>
                      ) : (
                        `${tier.availableSeats} seats available`
                      )}
                    </p>
                  </div>

                  <div className="tier-controls">
                    <button
                      type="button"
                      className="btn-counter"
                      disabled={qty <= 0}
                      onClick={() => handleSeatChange(key, -1)}
                    >
                      -
                    </button>
                    <span className="qty-display">{qty}</span>
                    <button
                      type="button"
                      className="btn-counter"
                      disabled={isSoldOut || qty >= tier.availableSeats}
                      onClick={() => handleSeatChange(key, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}

          {/* Offers Section */}
          <div className="offers-section">
            <h2 className="panel-title" style={{ fontSize: 16 }}>
              Promotional Offers
            </h2>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={applyFestivalDiscount}
                onChange={(e) => setApplyFestivalDiscount(e.target.checked)}
              />
              <span>Apply Flat Festival Discount (₹50.00 off base tickets)</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isMember}
                onChange={(e) => setIsMember(e.target.checked)}
              />
              <span>Customer is Club Member (10% off remaining subtotal, capped at ₹100)</span>
            </label>
          </div>
        </div>

        {/* Right Column: Live Line-by-Line Receipt */}
        <div className="panel">
          <h2 className="panel-title">
            <span>Line-by-Line Bill</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Exact Paisa Reconciliation</span>
          </h2>

          {!invoice ? (
            <div className="receipt-box" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              Select seat tiers on the left to generate real-time itemized bill.
            </div>
          ) : (
            <div className="receipt-box">
              <div style={{ marginBottom: 8, fontWeight: 600, color: '#38bdf8' }}>
                SEATS BREAKDOWN:
              </div>
              {invoice.seatLineItems.map((item, idx) => (
                <div key={idx} className="receipt-line">
                  <span>
                    • {item.tierName} ({item.quantity} × {item.unitPriceFormatted})
                  </span>
                  <span>{item.lineTotalFormatted}</span>
                </div>
              ))}

              <div className="receipt-line subtotal">
                <span>Base Ticket Subtotal:</span>
                <span>{invoice.baseTicketSubtotalFormatted}</span>
              </div>

              {invoice.discounts.totalDiscountPaisa > 0 && (
                <>
                  <div style={{ marginTop: 8, marginBottom: 4, fontWeight: 600, color: '#10b981' }}>
                    DISCOUNTS APPLIED:
                  </div>
                  {invoice.discounts.festivalDiscountPaisa > 0 && (
                    <div className="receipt-line discount">
                      <span>• Festival Discount:</span>
                      <span>-{invoice.discounts.festivalDiscountFormatted}</span>
                    </div>
                  )}
                  {invoice.discounts.memberDiscountPaisa > 0 && (
                    <div className="receipt-line discount">
                      <span>• Member Discount:</span>
                      <span>-{invoice.discounts.memberDiscountFormatted}</span>
                    </div>
                  )}
                  <div className="receipt-line discount" style={{ fontWeight: 600 }}>
                    <span>Total Discount:</span>
                    <span>-{invoice.discounts.totalDiscountFormatted}</span>
                  </div>
                  <div className="receipt-line">
                    <span>Net Ticket Subtotal:</span>
                    <span>{invoice.netTicketSubtotalFormatted}</span>
                  </div>
                </>
              )}

              <div style={{ marginTop: 12, marginBottom: 4, fontWeight: 600, color: '#94a3b8' }}>
                FEES & TAXES:
              </div>
              <div className="receipt-line">
                <span>• Convenience Fee ({invoice.totalTickets} × ₹30.00):</span>
                <span>{invoice.totalConvenienceFeeFormatted}</span>
              </div>
              <div className="receipt-line">
                <span>• Taxable Base:</span>
                <span>₹{(invoice.taxableAmountPaisa / 100).toFixed(2)}</span>
              </div>
              <div className="receipt-line">
                <span>• GST ({invoice.gstRatePercent}%):</span>
                <span>{invoice.gstAmountFormatted}</span>
              </div>

              <div className="receipt-line total">
                <span>TOTAL PAYABLE:</span>
                <span>{invoice.finalTotalFormatted}</span>
              </div>

              <button
                type="button"
                className="btn-book"
                onClick={handleBooking}
              >
                Confirm Booking & Print ({invoice.finalTotalFormatted})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
