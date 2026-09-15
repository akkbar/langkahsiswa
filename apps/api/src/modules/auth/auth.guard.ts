import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { uuid } from "../../../../../packages/validation/src";
import { jwtSecret } from "../../config";
import { AuthService } from "./auth.service";
import { AuthRequest } from "./auth.types";
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException("Silakan masuk");
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, jwtSecret(), {
        algorithms: ["HS256"],
        issuer: "langkahsiswa",
        audience: "langkahsiswa",
      }) as jwt.JwtPayload;
      uuid.parse(claims.sub);
      uuid.parse(claims.tenant_id);
      uuid.parse(claims.sid);
    } catch {
      throw new UnauthorizedException("Token tidak valid atau kedaluwarsa");
    }
    const resolved = await this.auth.resolveTenant(req);
    if (resolved && resolved !== claims.tenant_id)
      throw new ForbiddenException("Token berasal dari tenant lain");
    const session = (
      await this.auth.db.query(
        "SELECT id FROM user_sessions WHERE tenant_id=$1 AND user_id=$2 AND id=$3 AND status='ACTIVE' AND expires_at>now()",
        [claims.tenant_id, claims.sub, claims.sid],
      )
    ).rows[0];
    if (!session) throw new UnauthorizedException("Sesi telah dicabut");
    await this.auth.db.query(
      "UPDATE user_sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '5 minutes'",
      [session.id],
    );
    req.actor = await this.auth.actor(claims.sub!, claims.tenant_id);
    return true;
  }
}
