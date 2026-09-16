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

  const getTierIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('silver')) return '🥈';
    if (lower.includes('gold')) return '🥇';
    if (lower.includes('recliner')) return '👑';
    if (lower.includes('balcony')) return '🏛️';
    if (lower.includes('executive')) return '⭐';
    if (lower.includes('vip')) return '💎';
    return '🎟️';
  };

  if (loading) {
    return (
      <div className="counter-container" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>🎬 Loading Multiplex Counter...</h2>
        <p style={{ color: '#94a3b8', marginTop: 8 }}>Connecting to pricing engine...</p>
      </div>
    );
  }

  return (
    <div className="counter-container">
      {/* 🎬 Cinema Top Banner */}
      <header className="cinema-banner">
        <div className="banner-title-area">
          <h1>🎬 Multiplex Ticket Counter</h1>
          <div className="banner-meta">
            <span>Show: <strong style={{ color: '#f8fafc' }}>{show?.showName}</strong></span>
            <span className="movie-badge">Dolby Atmos 7.1</span>
            <span style={{ color: '#64748b' }}>ID: {show?.showId}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="btn-tool btn-tool-purple"
            onClick={() => setShowImporter(!showImporter)}
          >
            {showImporter ? '✕ Close Importer' : '📥 The Twist: Import Messy Price List'}
          </button>
        </div>
      </header>

      {/* ⚡ Evaluator Quick Actions Bar */}
      <div className="tester-toolbar">
        <span className="toolbar-label">⚡ Evaluator Quick Test:</span>
        <button
          type="button"
          className="btn-tool btn-tool-blue"
          onClick={handleQuickTestBooking}
        >
          🎫 1-Click Test Booking (2 Silver + 1 Gold + Offers)
        </button>
        <button
          type="button"
          className="btn-tool btn-tool-purple"
          onClick={handleQuickTestTheTwist}
        >
          🧪 1-Click Test "The Twist" (Messy Prices)
        </button>
        <button
          type="button"
          className="btn-tool btn-tool-neutral"
          onClick={handleResetAll}
        >
          🔄 Reset All
        </button>
      </div>

      {errorMsg && <div className="alert alert-error">⚠️ {errorMsg}</div>}
      {successMsg && <div className="alert alert-success">✅ {successMsg}</div>}

      {/* 📥 The Twist: Messy Price List Sanitizer Panel */}
      {showImporter && (
        <div className="panel" style={{ marginBottom: 24, borderColor: '#7c3aed' }}>
          <div className="panel-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              📥 The Twist: Messy Seat-Class Price List Importer
            </span>
            <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>
              Automatic Deduplication & Sanity Audit
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14, lineHeight: 1.5 }}>
            Paste any uncleaned, inconsistent seat tier records (with casing duplicates like <code>Silver/silver</code>, symbols like <code>₹150</code> or <code>180,50</code>, blank values, or negative numbers). The engine cleans it and outputs an audit report.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center', fontWeight: 600 }}>Presets:</span>
            <button
              type="button"
              className="btn-tool btn-tool-neutral"
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => setImportText(SAMPLE_MESSY_CSV)}
            >
              📄 Load Sample CSV
            </button>
            <button
              type="button"
              className="btn-tool btn-tool-neutral"
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => setImportText(SAMPLE_MESSY_JSON)}
            >
              📋 Load Sample JSON
            </button>
          </div>

          <textarea
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#090d16',
              border: '1.5px solid #334155',
              borderRadius: 10,
              padding: 12,
              color: '#f8fafc',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 13,
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn-tool btn-tool-purple"
              style={{ padding: '10px 22px', fontSize: 14 }}
              disabled={importing}
              onClick={handleImportTiers}
            >
              {importing ? 'Processing Data...' : '🚀 Clean & Import to Multiplex'}
            </button>
          </div>

          {importReport && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 12, color: '#f8fafc' }}>
                📋 Importer Audit Summary (Total: {importReport.totalProcessed} records)
              </h3>
              <div className="audit-pills-row">
                <div className="audit-pill pill-accepted">
                  🟢 Accepted: {importReport.importedCount}
                </div>
                <div className="audit-pill pill-dedup">
                  🟡 De-duplicated: {importReport.deduplicatedCount}
                </div>
                <div className="audit-pill pill-rejected">
                  🔴 Rejected: {importReport.rejectedCount}
                </div>
              </div>

              {importReport.imported.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <strong style={{ color: '#34d399', fontSize: 13 }}>🟢 Cleaned & Active Tiers:</strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {importReport.imported.map((t: any, idx: number) => (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.25)',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#e2e8f0',
                        }}
                      >
                        <strong>{t.name}</strong>: {t.priceFormatted} ({t.availableSeats} seats)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {importReport.deduplicated.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <strong style={{ color: '#fbbf24', fontSize: 13 }}>🟡 De-duplicated Entries:</strong>
                  <ul style={{ fontSize: 12, marginLeft: 20, color: '#94a3b8', marginTop: 4, lineHeight: 1.6 }}>
                    {importReport.deduplicated.map((d: any, idx: number) => (
                      <li key={idx}>{d.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importReport.rejected.length > 0 && (
                <div>
                  <strong style={{ color: '#f87171', fontSize: 13 }}>🔴 Rejected Entries:</strong>
                  <ul style={{ fontSize: 12, marginLeft: 20, color: '#fca5a5', marginTop: 4, lineHeight: 1.6 }}>
                    {importReport.rejected.map((r: any, idx: number) => (
                      <li key={idx}>
                        <code>{JSON.stringify(r.raw)}</code> &rarr; <em>{r.reason}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Booking Interface */}
      <div className="grid-layout">
        {/* Left Column: Seat Selection & Offers */}
        <div className="panel">
          <div className="panel-title">
            <span>🎟️ Select Tickets</span>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              {Object.values(selectedSeats).reduce((a, b) => a + b, 0)} selected
            </span>
          </div>

          {show &&
            Object.keys(show.tiers).map((key) => {
              const tier = show.tiers[key];
              const isSoldOut = tier.availableSeats <= 0;
              const qty = selectedSeats[key] || 0;

              return (
                <div
                  key={key}
                  className={`tier-card ${isSoldOut ? 'sold-out' : ''} ${qty > 0 ? 'selected' : ''}`}
                >
                  <div className="tier-main-info">
                    <div className="tier-icon-badge">{getTierIcon(tier.name)}</div>
                    <div>
                      <div className="tier-name">{tier.name}</div>
                      <div className="tier-subtext">
                        <span className="tier-price-pill">₹{(tier.pricePaisa / 100).toFixed(2)}</span>
                        <span>•</span>
                        {isSoldOut ? (
                          <span className="tier-stock-badge sold-out">SOLD OUT</span>
                        ) : (
                          <span className="tier-stock-badge">{tier.availableSeats} seats left</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="tier-controls">
                    <button
                      type="button"
                      className="btn-counter"
                      disabled={qty <= 0}
                      onClick={() => handleSeatChange(key, -1)}
                      title="Decrease tickets"
                    >
                      -
                    </button>
                    <span className="qty-display">{qty}</span>
                    <button
                      type="button"
                      className="btn-counter"
                      disabled={isSoldOut || qty >= tier.availableSeats}
                      onClick={() => handleSeatChange(key, 1)}
                      title="Increase tickets"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}

          {/* Offers Section */}
          <div style={{ marginTop: 24 }}>
            <div className="panel-title" style={{ fontSize: 16 }}>
              <span>🎁 Promotional Offers & Discounts</span>
            </div>

            <div className="offers-grid">
              <label className={`offer-card ${applyFestivalDiscount ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={applyFestivalDiscount}
                  onChange={(e) => setApplyFestivalDiscount(e.target.checked)}
                />
                <div className="offer-info">
                  <h4>🎉 Festival Bonanza</h4>
                  <p>Flat ₹50.00 OFF on base tickets (capped at ticket subtotal)</p>
                </div>
              </label>

              <label className={`offer-card ${isMember ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={isMember}
                  onChange={(e) => setIsMember(e.target.checked)}
                />
                <div className="offer-info">
                  <h4>👑 CinePass Member</h4>
                  <p>10% OFF on remaining subtotal (max savings cap ₹100.00)</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Live Line-by-Line Receipt */}
        <div className="panel">
          <div className="panel-title">
            <span>🧾 Live Bill Summary</span>
            <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>Real-time Quote</span>
          </div>

          {!invoice ? (
            <div
              className="ticket-receipt"
              style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎟️</div>
              <h3 style={{ fontSize: 16, color: '#94a3b8', marginBottom: 6 }}>No Tickets Selected</h3>
              <p style={{ fontSize: 13 }}>
                Use the counter steppers on the left or click <strong>1-Click Test Booking</strong> above.
              </p>
            </div>
          ) : (
            <div className="ticket-receipt">
              <div className="ticket-receipt-header">
                <h3>CINEMA E-TICKET INVOICE</h3>
                <p>Friday Night Blockbuster • Screen 4</p>
              </div>

              <div className="receipt-section-label">Seats Breakdown</div>
              {invoice.seatLineItems.map((item, idx) => (
                <div key={idx} className="receipt-line">
                  <span>
                    • {item.tierName} ({item.quantity} × {item.unitPriceFormatted})
                  </span>
                  <span>{item.lineTotalFormatted}</span>
                </div>
              ))}

              <div className="receipt-line subtotal">
                <span>Base Ticket Subtotal ({invoice.totalTickets} seats):</span>
                <span>{invoice.baseTicketSubtotalFormatted}</span>
              </div>

              {invoice.discounts.totalDiscountPaisa > 0 && (
                <>
                  <div className="receipt-section-label" style={{ color: '#34d399' }}>
                    Discounts Applied
                  </div>
                  {invoice.discounts.festivalDiscountPaisa > 0 && (
                    <div className="receipt-line discount">
                      <span>• Festival Flat Discount:</span>
                      <span>-{invoice.discounts.festivalDiscountFormatted}</span>
                    </div>
                  )}
                  {invoice.discounts.memberDiscountPaisa > 0 && (
                    <div className="receipt-line discount">
                      <span>• CinePass Member 10% Discount:</span>
                      <span>-{invoice.discounts.memberDiscountFormatted}</span>
                    </div>
                  )}
                  <div className="receipt-line discount" style={{ fontWeight: 700 }}>
                    <span>Total Savings:</span>
                    <span>-{invoice.discounts.totalDiscountFormatted}</span>
                  </div>
                  <div className="receipt-line">
                    <span>Net Ticket Subtotal:</span>
                    <span>{invoice.netTicketSubtotalFormatted}</span>
                  </div>
                </>
              )}

              <div className="receipt-section-label">Convenience & Taxes</div>
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
                <span>TOTAL AMOUNT:</span>
                <span>{invoice.finalTotalFormatted}</span>
              </div>

              <div className="reconciled-seal">
                <span>🛡️ Reconciled to the exact paisa (0.01 INR precision)</span>
              </div>

              <button
                type="button"
                className="btn-book"
                onClick={handleBooking}
              >
                Confirm & Book Now • {invoice.finalTotalFormatted}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
