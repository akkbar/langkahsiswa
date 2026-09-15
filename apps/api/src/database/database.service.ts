import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResult, types } from "pg";
import "../config";
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => Number(v));
export type Sql = {
  query(text: string, values?: any[]): Promise<QueryResult<any>>;
};
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    connectionTimeoutMillis: 5000,
  });
  query(text: string, values: unknown[] = []) {
    return this.pool.query(text, values);
  }
  async transaction<T>(
    tenantId: string | null,
    fn: (sql: Sql) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize mutations inside each tenant. Different tenants remain concurrent.
      if (tenantId)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [tenantId],
        );
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
