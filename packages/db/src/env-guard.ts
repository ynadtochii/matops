export function assertDevDatabase(action: string, env = process.env): void {
  if (env.ALLOW_PROD_WRITE === "1") return;
  if (env.CI) return;
  if (env.DB_ENV === "dev") return;

  throw new Error(
    `Refusing to ${action}: DB_ENV is ${env.DB_ENV ? `"${env.DB_ENV}"` : "unset"}, not "dev".\n` +
      `  Your .env must point at the Neon DEV branch and carry DB_ENV=dev.\n` +
      `  Production migrations run in the deploy pipeline, not from here.\n` +
      `  An unset DB_ENV refuses on purpose: a .env with a pasted production\n` +
      `  string has no DB_ENV line at all.\n` +
      `  For a deliberate one-off against production, prefix ALLOW_PROD_WRITE=1.`,
  );
}
