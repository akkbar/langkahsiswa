import { Inject, Injectable } from "@nestjs/common";
import type { Actor } from "../../../../../packages/shared-types/src";
import { uuid } from "../../../../../packages/validation/src";
import { Database } from "../../database/database.service";
import { record } from "../academics/academic-policy";
import { allow } from "../auth/permissions";
import {
  eventSchema,
  notifyUsers,
  recipients,
  targetTables,
} from "./notification-delivery";
@Injectable()
export class EventsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async list(actor: Actor) {
    const manage =
      actor.permissions.includes("*") ||
      actor.permissions.includes("event.write");
    const data = (
      await this.db.query(
        `SELECT e.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('type',t.type,'target_id',t.target_id)) FROM event_targets t WHERE t.tenant_id=e.tenant_id AND t.event_id=e.id),'[]') AS targets FROM events e WHERE e.tenant_id=$1 AND ($3 OR (e.status='PUBLISHED' AND EXISTS(SELECT 1 FROM notifications n WHERE n.tenant_id=e.tenant_id AND n.event_id=e.id AND n.user_id=$2))) ORDER BY e.starts_at DESC LIMIT 200`,
        [actor.tenant_id, actor.id, manage],
      )
    ).rows;
    return { data, total: data.length };
  }
  async create(actor: Actor, body: unknown) {
    allow(actor, "event.write");
    const input = eventSchema.parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      for (const target of input.targets)
        if (target.type !== "ALL")
          await record(
            sql,
            targetTables[target.type],
            actor.tenant_id,
            target.target_id!,
          );
      const event = (
        await sql.query(
          "INSERT INTO events(tenant_id,title,description,type,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            actor.tenant_id,
            input.title,
            input.description,
            input.type,
            input.starts_at,
            input.ends_at || null,
            actor.id,
          ],
        )
      ).rows[0];
      for (const target of input.targets)
        await sql.query(
          "INSERT INTO event_targets(tenant_id,event_id,type,target_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [actor.tenant_id, event.id, target.type, target.target_id || null],
        );
      return { ...event, targets: input.targets };
    });
  }
  async publish(actor: Actor, id: string) {
    allow(actor, "event.write");
    uuid.parse(id);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const event = await record(sql, "events", actor.tenant_id, id);
      if (event.status === "PUBLISHED") return event;
      const targets = (
        await sql.query(
          "SELECT type,target_id FROM event_targets WHERE tenant_id=$1 AND event_id=$2",
          [actor.tenant_id, id],
        )
      ).rows;
      const userIds: string[] = [];
      for (const target of targets)
        userIds.push(
          ...(await recipients(sql, actor.tenant_id, target)).map(
            (r) => r.user_id,
          ),
        );
      await notifyUsers(
        sql,
        actor.tenant_id,
        userIds,
        event.title,
        event.description.slice(0, 1000),
        { type: "SCHOOL_EVENT", event_id: id },
        `event:${id}`,
        id,
      );
      return (
        await sql.query(
          "UPDATE events SET status='PUBLISHED',published_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [actor.tenant_id, id],
        )
      ).rows[0];
    });
  }
}
