"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="loading-screen">
      <section className="status-card">
        <span aria-hidden="true">✦</span>
        <h1>Не вдалося відкрити цей розділ</h1>
        <p>Ваша сесія збережена. Спробуйте повторити завантаження розділу.</p>
        <button className="primary-button" type="button" onClick={reset}>Повторити</button>
      </section>
    </main>
  );
}
