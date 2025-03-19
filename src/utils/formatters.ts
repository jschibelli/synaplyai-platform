/**
 * Formats a number with thousands separators
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * Formats a currency value
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(value);
}

/**
 * Formats a date to a readable string
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}