// The one test product of Milestone 3. Milestone 4 loads products from Sanity.
// The price is in grosze (1000 = 10.00 PLN), so it's never a floating point number.
export const TEST_PRODUCT = {
  name: "Test product",
  price: 1000,
} as const;

export function formatPrice(grosze: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(grosze / 100);
}
