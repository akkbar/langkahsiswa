import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ZodError } from "zod";
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof ZodError)
      return res.status(400).json({
        message: "Data tidak valid",
        errors: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({
        message:
          typeof error.getResponse() === "string"
            ? error.getResponse()
            : (error.getResponse() as any).message,
      });
    if (
      ["23505", "23503", "23514", "22P02", "22007", "22008"].includes(
        error.code,
      )
    )
      return res.status(error.code === "23505" ? 409 : 400).json({
        message:
          error.code === "23505"
            ? "Data duplikat atau relasi sudah ada"
            : "Relasi atau nilai tidak valid; periksa sekolah dan data terkait",
      });
    console.error(error);
    return res.status(500).json({ message: "Terjadi kesalahan internal" });
  }
}
