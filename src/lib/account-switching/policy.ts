// Explicit account IDs, verified against the owner's four requested profiles.
// This controls the device UI, never database authorization or impersonation.
export const SWITCH_OWNER_ID = "1f4ae8f7-2a5d-4e1b-bb49-502ea25af681";
export const SWITCH_ACCOUNT_IDS = [
  SWITCH_OWNER_ID,
  "df2ce3e8-37e5-4d04-967f-a0e51bb1c85c",
  "6a3f9d49-bea4-4f6a-a7be-d56722f2bcc8",
  "7086c904-1def-4d53-8479-3f5df4552fcb",
] as readonly string[];
export type SwitchAccount = { id: string; name: string; role: string; email: string };
export function isSwitchAccount(id: string) { return SWITCH_ACCOUNT_IDS.includes(id); }
