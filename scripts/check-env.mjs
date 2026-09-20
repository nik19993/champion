const required = [
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
if (!["local", "staging", "production"].includes(appEnv)) {
  console.error("NEXT_PUBLIC_APP_ENV must be local, staging, or production");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^https:\/\/.+\.supabase\.co$/i.test(url) && appEnv !== "local") {
  console.error("Supabase URL is invalid for a remote environment");
  process.exit(1);
}

const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (key.includes("replace_me") || key.length < 20) {
  console.error("Supabase publishable key is still a placeholder");
  process.exit(1);
}

const forbidden = Object.keys(process.env).filter((name) => /SERVICE_ROLE|SUPABASE_SECRET/i.test(name));
if (forbidden.length) {
  console.error(`Server secrets must not be present in the frontend environment: ${forbidden.join(", ")}`);
  process.exit(1);
}

console.log(`Environment configuration is valid for ${appEnv}.`);
