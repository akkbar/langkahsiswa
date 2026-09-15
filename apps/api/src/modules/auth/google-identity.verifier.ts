import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client, TokenPayload } from "google-auth-library";

export function googleClientIds() {
  return (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

// Only a cryptographically verified payload may reach account resolution.
export function googleIdentity(payload: TokenPayload | undefined) {
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new UnauthorizedException("Email Google belum terverifikasi");
  }
  const email = payload.email.trim().toLowerCase();
  return {
    subject: payload.sub,
    email,
    authoritative: email.endsWith("@gmail.com") || Boolean(payload.hd),
  };
}

@Injectable()
export class GoogleIdentityVerifier {
  private readonly client = new OAuth2Client();

  async verify(credential: string) {
    const audience = googleClientIds();
    if (!audience.length)
      throw new ServiceUnavailableException(
        "Login Google belum dikonfigurasi oleh administrator",
      );
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience,
      });
      return googleIdentity(ticket.getPayload());
    } catch {
      throw new UnauthorizedException(
        "Token Google tidak valid, kedaluwarsa, atau email belum terverifikasi",
      );
    }
  }
}
