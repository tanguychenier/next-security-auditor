export default function Dashboard({ searchParams }: { searchParams: { q?: string } }) {
  return <main>{searchParams.q}</main>
}
