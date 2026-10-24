export function PasswordChange({ onComplete }) {
  return <button onClick={() => { window.readinessQa.lastComplete = onComplete; onComplete(); }}>Змінити тестовий пароль</button>;
}
