'use client'

const STRIPE_SECRET_KEY = 'sk_live_placeholder'

export function CheckoutButton({ total }: { total: number }) {
  return <button data-key={STRIPE_SECRET_KEY}>Pay {total}</button>
}
