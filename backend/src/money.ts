import { Paisa } from './types';

/**
 * Money Utility Helper.
 * 
 * Provides exact arithmetic, standard ROUND_HALF_UP rounding,
 * and string formatting for monetary amounts in integer Paisa (1 INR = 100 paisa).
 */
export class Money {
  /**
   * Converts INR amount (number or string) to integer Paisa.
   * Handles string decimal inputs accurately without floating-point artifacts.
   */
  static fromINR(amount: number | string): Paisa {
    if (typeof amount === 'string') {
      const trimmed = amount.trim().replace(/^₹/, '');
      if (trimmed === '') {
        throw new Error('Invalid monetary string: empty string');
      }
      const parts = trimmed.split('.');
      if (parts.length > 2) {
        throw new Error(`Invalid monetary format: '${amount}'`);
      }
      const whole = parseInt(parts[0], 10);
      if (isNaN(whole)) {
        throw new Error(`Invalid monetary number in: '${amount}'`);
      }
      let frac = 0;
      if (parts.length === 2) {
        const fracStr = parts[1].padEnd(2, '0').slice(0, 2);
        frac = parseInt(fracStr, 10);
        if (isNaN(frac)) {
          throw new Error(`Invalid fractional paisa in: '${amount}'`);
        }
      }
      const sign = trimmed.startsWith('-') ? -1 : 1;
      return Math.abs(whole) * 100 * sign + frac * sign;
    }

    if (typeof amount === 'number') {
      if (!isFinite(amount)) {
        throw new Error(`Monetary amount must be a finite number: ${amount}`);
      }
      return Money.roundHalfUp(amount * 100);
    }

    throw new Error(`Unsupported money input type: ${typeof amount}`);
  }

  /**
   * Converts integer paisa to clean decimal INR string.
   * E.g., 15050 -> "150.50", 50 -> "0.50", 5 -> "0.05", 0 -> "0.00"
   */
  static toINRString(paisa: Paisa): string {
    const isNegative = paisa < 0;
    const absPaisa = Math.abs(Math.round(paisa));
    const whole = Math.floor(absPaisa / 100);
    const fraction = absPaisa % 100;
    const sign = isNegative ? '-' : '';
    return `${sign}${whole}.${fraction.toString().padStart(2, '0')}`;
  }

  /**
   * Converts integer paisa to human-readable formatted INR currency string.
   * E.g., 15050 -> "₹150.50"
   */
  static toFormattedINR(paisa: Paisa): string {
    const isNegative = paisa < 0;
    const inrStr = Money.toINRString(Math.abs(paisa));
    return isNegative ? `-₹${inrStr}` : `₹${inrStr}`;
  }

  /**
   * Adds two paisa values.
   */
  static add(a: Paisa, b: Paisa): Paisa {
    return Math.round(a) + Math.round(b);
  }

  /**
   * Subtracts paisa value b from a.
   */
  static subtract(a: Paisa, b: Paisa): Paisa {
    return Math.round(a) - Math.round(b);
  }

  /**
   * Multiplies paisa by an integer count/factor.
   */
  static multiply(paisa: Paisa, factor: number): Paisa {
    return Money.roundHalfUp(paisa * factor);
  }

  /**
   * Calculates a percentage of paisa using documented ROUND_HALF_UP rounding.
   * E.g., 18% of 15550 paisa:
   * (15550 * 18) / 100 = 2799 paisa
   * (15525 * 18) / 100 = 2794.5 -> 2795 paisa
   */
  static calculatePercentage(paisa: Paisa, percentRate: number): Paisa {
    if (percentRate < 0) {
      throw new Error(`Percentage rate cannot be negative: ${percentRate}`);
    }
    const raw = (paisa * percentRate) / 100;
    return Money.roundHalfUp(raw);
  }

  /**
   * Performs standard financial ROUND_HALF_UP to the nearest integer paisa.
   * For non-negative values, fractional parts >= 0.5 round up to the next integer.
   */
  static roundHalfUp(val: number): Paisa {
    if (val >= 0) {
      return Math.floor(val + 0.5 + 1e-12);
    } else {
      return Math.ceil(val - 0.5 - 1e-12);
    }
  }
}
