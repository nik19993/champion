export function TestEnvironmentNotice() {
  if (process.env.NEXT_PUBLIC_TEST_ENVIRONMENT !== "true") return null;
  return <aside className="test-environment-notice" role="note"><strong>Тестова версія «Клуб Чемпіон»</strong><span>Окрема база · вигадані дані. Робочий застосунок не підключений.</span></aside>;
}
