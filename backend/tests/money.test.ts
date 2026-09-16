import { Money } from '../src/money';

describe('Money Utility Module (Paisa Handling)', () => {
  describe('fromINR conversions', () => {
    it('converts string INR amounts to exact integer paisa', () => {
      expect(Money.fromINR('150.00')).toBe(15000);
      expect(Money.fromINR('150.50')).toBe(15050);
      expect(Money.fromINR('0.05')).toBe(5);
      expect(Money.fromINR('0.00')).toBe(0);
      expect(Money.fromINR('₹250.75')).toBe(25075);
      expect(Money.fromINR('100')).toBe(10000);
    });

    it('converts number INR amounts to exact integer paisa', () => {
      expect(Money.fromINR(150)).toBe(15000);
      expect(Money.fromINR(150.5)).toBe(15050);
      expect(Money.fromINR(0.01)).toBe(1);
    });

    it('throws on invalid money input strings', () => {
      expect(() => Money.fromINR('')).toThrow();
      expect(() => Money.fromINR('abc')).toThrow();
      expect(() => Money.fromINR('10.20.30')).toThrow();
    });
  });

  describe('toINRString and toFormattedINR', () => {
    it('formats paisa to decimal INR string with 2 decimal places', () => {
      expect(Money.toINRString(15050)).toBe('150.50');
      expect(Money.toINRString(15000)).toBe('150.00');
      expect(Money.toINRString(5)).toBe('0.05');
      expect(Money.toINRString(0)).toBe('0.00');
    });

    it('formats paisa to human-readable ₹ currency string', () => {
      expect(Money.toFormattedINR(15050)).toBe('₹150.50');
      expect(Money.toFormattedINR(0)).toBe('₹0.00');
      expect(Money.toFormattedINR(99)).toBe('₹0.99');
    });
  });

  describe('arithmetic operations', () => {
    it('adds and subtracts paisa accurately without float errors', () => {
      expect(Money.add(10000, 5050)).toBe(15050);
      expect(Money.subtract(15050, 5050)).toBe(10000);
    });

    it('multiplies paisa by integer quantity correctly', () => {
      expect(Money.multiply(15000, 3)).toBe(45000);
      expect(Money.multiply(25050, 2)).toBe(50100);
    });
  });

  describe('percentage calculations with ROUND_HALF_UP', () => {
    it('calculates exact percentage when product is integer', () => {
      // 18% of 10000 paisa (₹100) = 1800 paisa (₹18)
      expect(Money.calculatePercentage(10000, 18)).toBe(1800);
    });

    it('rounds half-up on .5 fractional paisa boundary', () => {
      // (15525 * 18) / 100 = 2794.5 paisa -> rounds UP to 2795 paisa
      expect(Money.calculatePercentage(15525, 18)).toBe(2795);
    });

    it('rounds down when fractional paisa is below .5', () => {
      // (15520 * 18) / 100 = 2793.6 paisa -> rounds to 2794
      // Let's test a case with < .5:
      // (10001 * 18) / 100 = 1800.18 paisa -> rounds down to 1800 paisa
      expect(Money.calculatePercentage(10001, 18)).toBe(1800);
    });

    it('throws if percentage rate is negative', () => {
      expect(() => Money.calculatePercentage(10000, -5)).toThrow();
    });
  });
});
