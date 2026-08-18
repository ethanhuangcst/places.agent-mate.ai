import fs from "node:fs";
import path from "node:path";

let cachedDataUri: string | null = null;

export function adminMailLogoDataUri(): string {
  if (cachedDataUri) return cachedDataUri;
  const file = path.join(process.cwd(), "public", "agent-logo.png");
  const buf = fs.readFileSync(file);
  cachedDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedDataUri;
}
