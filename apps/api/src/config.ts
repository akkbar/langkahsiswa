import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env"), quiet: true } as any);
config({ path: resolve(process.cwd(), "../../.env"), quiet: true } as any);
config({ path: resolve(__dirname, "../../../.env"), quiet: true } as any);
export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET wajib diisi minimal 32 karakter");
  return secret;
}
