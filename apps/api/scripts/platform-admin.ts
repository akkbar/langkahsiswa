import "../src/config";
import { Database } from "../src/database";
import { initializeRoles, createTenant } from "../src/auth";
import { tenantSchema } from "../../../packages/validation/src";
const db = new Database();
async function bootstrap() {
  const input = tenantSchema.parse({
    name: "LangkahSiswa Platform",
    slug: process.env.PLATFORM_SLUG || "platform",
    admin_name: process.env.PLATFORM_ADMIN_NAME || "Platform Administrator",
    admin_email: process.env.PLATFORM_ADMIN_EMAIL,
    admin_password: process.env.PLATFORM_ADMIN_PASSWORD,
  });
  await db.transaction(null, async (sql) => {
    await initializeRoles(sql);
    const tenant = await createTenant(sql, input);
    const user = (
      await sql.query("SELECT id FROM users WHERE tenant_id=$1 AND email=$2", [
        tenant.id,
        input.admin_email,
      ])
    ).rows[0];
    await sql.query(
      "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'SUPER_ADMIN')",
      [tenant.id, user.id],
    );
    console.log(`Platform administrator dibuat untuk tenant ${input.slug}.`);
  });
}
bootstrap()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.onModuleDestroy());
