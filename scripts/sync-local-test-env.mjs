import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const file = ".env.test.local";
const output = execFileSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd supabase status --workdir test-environment --output env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const values = Object.fromEntries(
  output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^"|"$/g, "")]];
  }),
);

const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
for (const key of required) {
  if (!values[key]) throw new Error(`Local Supabase did not report ${key}.`);
}

const replacements = {
  NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
};

let source = readFileSync(file, "utf8");
for (const [key, value] of Object.entries(replacements)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  source = pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}
writeFileSync(file, source);
console.log("Updated .env.test.local with the running local Supabase URL and keys.");
