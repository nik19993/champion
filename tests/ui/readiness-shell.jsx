export function AppShell({ profile }) {
  return <div><span>{profile.full_name}</span><button onClick={() => window.readinessQa.client.auth.signOut()}>Тестовий вихід</button></div>;
}
