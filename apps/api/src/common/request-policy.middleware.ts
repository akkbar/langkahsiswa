import type { RequestHandler } from "express";

export function requestPolicy(origins: readonly string[]): RequestHandler {
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    ) {
      res.status(403).json({ message: "Origin tidak diizinkan" });
      return;
    }
    next();
  };
}
