import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { Database } from "../../database/database.service";
import { type AuthRequest } from "../auth/auth.types";
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(Database) private readonly db: Database) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
      return next.handle();
    return next.handle().pipe(
      mergeMap(async (value) => {
        if (!req.actor) return value;
        const parts = req.path.split("/").filter(Boolean);
        const offset = parts[0] === "api" && parts[1] === "v1" ? 2 : 0;
        const entityType = parts[offset] || "unknown";
        const entityId = req.params?.id || value?.id || null;
        try {
          await this.db.query(
            `INSERT INTO audit_logs(tenant_id,user_id,action,method,path,entity_type,entity_id,ip_address,user_agent,metadata)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              req.actor.tenant_id,
              req.actor.id,
              `${req.method} ${entityType}`,
              req.method,
              req.path,
              entityType,
              entityId,
              req.ip || null,
              req.header("user-agent") || null,
              JSON.stringify({ status: "SUCCESS" }),
            ],
          );
        } catch (error) {
          console.error("Audit log gagal disimpan", error);
        }
        return value;
      }),
    );
  }
}
