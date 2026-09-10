export async function getServerSideProps(context: { query: { user?: string } }) {
  return { props: { user: context.query.user ?? 'anonymous' } }
}

export default function AccountPage({ user }: { user: string }) {
  return <main>{user}</main>
}
