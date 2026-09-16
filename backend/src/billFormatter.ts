import { Invoice } from './types';
import { Money } from './money';

/**
 * Formats an Invoice into a clear, audit-ready line-by-line text receipt.
 */
export class BillFormatter {
  static format(invoice: Invoice): string {
    const divider = '------------------------------------------------------------';
    const lines: string[] = [];

    lines.push(divider);
    lines.push(`  MULTIPLEX BOOKING INVOICE`);
    lines.push(`  Show: ${invoice.showName} [ID: ${invoice.showId}]`);
    lines.push(divider);
    lines.push(`  SEAT BREAKDOWN:`);

    for (const item of invoice.seatLineItems) {
      lines.push(
        `    • Tier: ${item.tierName.padEnd(10)} | Qty: ${item.quantity.toString().padStart(2)} × ${item.unitPriceFormatted.padStart(9)} = ${item.lineTotalFormatted.padStart(10)}`
      );
    }

    lines.push(`  Total Tickets: ${invoice.totalTickets}`);
    lines.push(`  Base Ticket Subtotal:                ${invoice.baseTicketSubtotalFormatted.padStart(12)}`);

    // Discounts
    if (invoice.discounts.totalDiscountPaisa > 0) {
      lines.push(divider);
      lines.push(`  DISCOUNTS APPLIED:`);
      if (invoice.discounts.festivalDiscountPaisa > 0) {
        lines.push(`    • Festival Discount:               -${invoice.discounts.festivalDiscountFormatted.padStart(11)}`);
      }
      if (invoice.discounts.memberDiscountPaisa > 0) {
        lines.push(`    • Member Discount:                 -${invoice.discounts.memberDiscountFormatted.padStart(11)}`);
      }
      lines.push(`    Total Discount:                    -${invoice.discounts.totalDiscountFormatted.padStart(11)}`);
      lines.push(`  Net Ticket Subtotal:                 ${invoice.netTicketSubtotalFormatted.padStart(12)}`);
    }

    lines.push(divider);
    lines.push(`  CONVENIENCE & TAXES:`);
    lines.push(
      `    • Convenience Fee (${invoice.totalTickets} × ₹${(invoice.convenienceFeePerTicketPaisa / 100).toFixed(2)}):   ${invoice.totalConvenienceFeeFormatted.padStart(12)}`
    );
    lines.push(`    • Taxable Base:                    ${Money.toFormattedINR(invoice.taxableAmountPaisa).padStart(12)}`);
    lines.push(
      `    • GST (${invoice.gstRatePercent}%):                     ${invoice.gstAmountFormatted.padStart(12)}`
    );

    lines.push(divider);
    lines.push(`  FINAL AMOUNT PAYABLE:                ${invoice.finalTotalFormatted.padStart(12)}`);
    lines.push(divider);

    return lines.join('\n');
  }
}
