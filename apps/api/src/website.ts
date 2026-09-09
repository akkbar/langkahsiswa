import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";
import { allow, AuthGuard, type AuthRequest } from "./auth";
import { Database, type Sql } from "./database";
import { fileInput, readManagedFile, saveManagedFile } from "./file-storage";

const uuid = z.string().uuid();
const short = z.string().trim().min(1).max(200);
const optionalShort = z.string().trim().max(300).default("");
const link = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      !value ||
      value.startsWith("/") ||
      value.startsWith("https://") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:"),
    "Tautan harus berupa path internal, HTTPS, email, atau telepon",
  )
  .default("");
const blockId = uuid.default(() => randomUUID());
const assetId = uuid.nullable().default(null);
const hero = z.object({
  id: blockId,
  type: z.literal("hero"),
  props: z
    .object({
      eyebrow: optionalShort,
      title: short,
      subtitle: z.string().trim().max(1000).default(""),
      cta_label: optionalShort,
      cta_url: link,
      asset_id: assetId,
    })
    .strict(),
});
const textBlock = z.object({
  id: blockId,
  type: z.literal("text"),
  props: z
    .object({
      heading: optionalShort,
      body: z.string().trim().min(1).max(10000),
      alignment: z.enum(["left", "center"]).default("left"),
    })
    .strict(),
});
const imageBlock = z.object({
  id: blockId,
  type: z.literal("image"),
  props: z.object({ asset_id: uuid, caption: optionalShort }).strict(),
});
const gallery = z.object({
  id: blockId,
  type: z.literal("gallery"),
  props: z
    .object({ heading: optionalShort, asset_ids: z.array(uuid).max(12) })
    .strict(),
});
const news = z.object({
  id: blockId,
  type: z.literal("news"),
  props: z
    .object({
      heading: optionalShort,
      items: z
        .array(
          z
            .object({
              title: short,
              excerpt: z.string().trim().max(1000).default(""),
              date: z.string().date().optional(),
              url: link,
            })
            .strict(),
        )
        .max(12),
    })
    .strict(),
});
const announcement = z.object({
  id: blockId,
  type: z.literal("announcement"),
  props: z
    .object({
      heading: optionalShort,
      items: z
        .array(
          z
            .object({ title: short, body: z.string().trim().max(2000) })
            .strict(),
        )
        .max(12),
    })
    .strict(),
});
const eventBlock = z.object({
  id: blockId,
  type: z.literal("event"),
  props: z
    .object({
      heading: optionalShort,
      items: z
        .array(
          z
            .object({ title: short, date: short, location: optionalShort })
            .strict(),
        )
        .max(12),
    })
    .strict(),
});
const teacher = z.object({
  id: blockId,
  type: z.literal("teacher"),
  props: z
    .object({
      heading: optionalShort,
      items: z
        .array(
          z
            .object({ name: short, role: optionalShort, asset_id: assetId })
            .strict(),
        )
        .max(20),
    })
    .strict(),
});
const contact = z.object({
  id: blockId,
  type: z.literal("contact"),
  props: z
    .object({
      heading: optionalShort,
      address: z.string().trim().max(1000).default(""),
      phone: optionalShort,
      email: z.union([z.literal(""), z.string().email().max(200)]).default(""),
    })
    .strict(),
});
const map = z.object({
  id: blockId,
  type: z.literal("map"),
  props: z
    .object({
      heading: optionalShort,
      embed_url: z
        .string()
        .url()
        .max(1000)
        .refine(
          (value) =>
            value.startsWith("https://www.google.com/maps/embed?") ||
            value.startsWith("https://maps.google.com/maps?"),
          "Gunakan URL embed Google Maps",
        ),
    })
    .strict(),
});
const footer = z.object({
  id: blockId,
  type: z.literal("footer"),
  props: z
    .object({
      text: z.string().trim().max(1000).default(""),
      links: z.array(z.object({ label: short, url: link }).strict()).max(10),
    })
    .strict(),
});
export const websiteContentSchema = z
  .object({
    seo: z
      .object({
        title: z.string().trim().max(70).default(""),
        description: z.string().trim().max(170).default(""),
      })
      .strict()
      .default({ title: "", description: "" }),
    blocks: z
      .array(
        z.discriminatedUnion("type", [
          hero,
          textBlock,
          imageBlock,
          gallery,
          news,
          announcement,
          eventBlock,
          teacher,
          contact,
          map,
          footer,
        ]),
      )
      .max(30),
  })
  .strict();

function assetIds(content: z.infer<typeof websiteContentSchema>) {
  const ids: string[] = [];
  for (const block of content.blocks) {
    const props = block.props as Record<string, any>;
    if (props.asset_id) ids.push(props.asset_id);
    if (Array.isArray(props.asset_ids)) ids.push(...props.asset_ids);
    if (Array.isArray(props.items))
      for (const item of props.items)
        if (item.asset_id) ids.push(item.asset_id);
  }
  return [...new Set(ids)];
}
async function validateAssets(
  sql: Sql,
  tenantId: string,
  content: z.infer<typeof websiteContentSchema>,
) {
  const ids = assetIds(content);
  if (!ids.length) return;
  const count = Number(
    (
      await sql.query(
        `SELECT count(*) FROM website_assets a JOIN managed_files f
         ON f.tenant_id=a.tenant_id AND f.id=a.file_id
         WHERE a.tenant_id=$1 AND a.id=ANY($2::uuid[]) AND f.deleted_at IS NULL`,
        [tenantId, ids],
      )
    ).rows[0].count,
  );
  if (count !== ids.length)
    throw new BadRequestException(
      "Aset website tidak ditemukan pada sekolah ini",
    );
}
async function refreshPublishedAssets(sql: Sql, tenantId: string) {
  const versions = (
    await sql.query(
      `SELECT v.content FROM website_pages p JOIN website_page_versions v
       ON v.tenant_id=p.tenant_id AND v.id=p.published_version_id
       WHERE p.tenant_id=$1 AND p.status='PUBLISHED'`,
      [tenantId],
    )
  ).rows;
  const ids = [...new Set(versions.flatMap((row) => assetIds(row.content)))];
  await sql.query(
    "UPDATE website_assets SET published=false WHERE tenant_id=$1",
    [tenantId],
  );
  if (ids.length)
    await sql.query(
      "UPDATE website_assets SET published=true WHERE tenant_id=$1 AND id=ANY($2::uuid[])",
      [tenantId, ids],
    );
}

@Controller("api/v1/public/websites")
export class PublicWebsiteController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get(":tenant/pages/:slug") async page(
    @Param("tenant") tenantSlug: string,
    @Param("slug") slug: string,
  ) {
    const page = (
      await this.db.query(
        `SELECT p.id,p.title,p.slug,v.version_number,v.content,v.published_at,
         COALESCE(ws.site_name,s.name) AS site_name,COALESCE(ws.tagline,'') AS tagline,
         COALESCE(ws.primary_color,'#004aad') AS primary_color,s.address,s.phone,
         (SELECT json_agg(json_build_object('title',n.title,'slug',n.slug) ORDER BY n.slug='home' DESC,n.title)
          FROM website_pages n WHERE n.tenant_id=p.tenant_id AND n.status='PUBLISHED') AS navigation
         FROM website_pages p JOIN tenants t ON t.id=p.tenant_id AND t.status='ACTIVE'
         JOIN schools s ON s.tenant_id=p.tenant_id AND s.id=p.school_id
         JOIN website_page_versions v ON v.tenant_id=p.tenant_id AND v.id=p.published_version_id
         LEFT JOIN website_settings ws ON ws.tenant_id=p.tenant_id
         WHERE t.slug=$1 AND p.slug=$2 AND p.status='PUBLISHED'`,
        [tenantSlug.toLowerCase(), slug.toLowerCase()],
      )
    ).rows[0];
    if (!page) throw new NotFoundException("Halaman website tidak ditemukan");
    return page;
  }

  @Get("domains/:domain/pages/:slug") async domainPage(
    @Param("domain") domain: string,
    @Param("slug") slug: string,
  ) {
    const page = (
      await this.db.query(
        `SELECT p.id,p.title,p.slug,v.version_number,v.content,v.published_at,
         COALESCE(ws.site_name,s.name) AS site_name,COALESCE(ws.tagline,'') AS tagline,
         COALESCE(ws.primary_color,'#004aad') AS primary_color,s.address,s.phone,t.slug AS tenant_slug,
         (SELECT json_agg(json_build_object('title',n.title,'slug',n.slug) ORDER BY n.slug='home' DESC,n.title)
          FROM website_pages n WHERE n.tenant_id=p.tenant_id AND n.status='PUBLISHED') AS navigation
         FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id AND t.status='ACTIVE'
         JOIN website_pages p ON p.tenant_id=d.tenant_id AND p.slug=$2 AND p.status='PUBLISHED'
         JOIN schools s ON s.tenant_id=p.tenant_id AND s.id=p.school_id
         JOIN website_page_versions v ON v.tenant_id=p.tenant_id AND v.id=p.published_version_id
         LEFT JOIN website_settings ws ON ws.tenant_id=p.tenant_id
         WHERE d.domain=$1 AND d.verified_at IS NOT NULL`,
        [domain.toLowerCase(), slug.toLowerCase()],
      )
    ).rows[0];
    if (!page) throw new NotFoundException("Halaman website tidak ditemukan");
    return page;
  }

  @Get(":tenant/assets/:id") async asset(
    @Param("tenant") tenantSlug: string,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    uuid.parse(id);
    const row = (
      await this.db.query(
        `SELECT f.* FROM website_assets a JOIN tenants t ON t.id=a.tenant_id AND t.status='ACTIVE'
         JOIN managed_files f ON f.tenant_id=a.tenant_id AND f.id=a.file_id
         WHERE t.slug=$1 AND a.id=$2 AND a.published AND f.deleted_at IS NULL`,
        [tenantSlug.toLowerCase(), id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Aset website tidak ditemukan");
    let bytes: Buffer;
    try {
      bytes = await readManagedFile(row.storage_key, row.storage_provider);
      if (
        bytes.length !== row.size_bytes ||
        createHash("sha256").update(bytes).digest("hex") !== row.sha256
      )
        throw new Error("Checksum tidak sesuai");
    } catch {
      throw new NotFoundException("Isi aset website tidak ditemukan");
    }
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("ETag", `"${row.sha256}"`);
    res.send(bytes);
  }
}

@Controller("api/v1/website")
@UseGuards(AuthGuard)
export class WebsiteController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get("settings") async settings(@Req() req: AuthRequest) {
    allow(req.actor, "website.read");
    return (
      await this.db.query(
        `SELECT ws.*,t.slug AS tenant_slug FROM website_settings ws JOIN tenants t ON t.id=ws.tenant_id WHERE ws.tenant_id=$1
         UNION ALL SELECT $1,s.id,s.name,'','#004aad',now(),t.slug FROM schools s JOIN tenants t ON t.id=s.tenant_id
         WHERE s.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM website_settings WHERE tenant_id=$1)
         ORDER BY updated_at DESC LIMIT 1`,
        [req.actor.tenant_id],
      )
    ).rows[0];
  }

  @Put("settings") async updateSettings(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "website.write");
    const x = z
      .object({
        school_id: uuid,
        site_name: short,
        tagline: z.string().trim().max(300).default(""),
        primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        `INSERT INTO website_settings(tenant_id,school_id,site_name,tagline,primary_color)
         SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM schools WHERE tenant_id=$1 AND id=$2)
         ON CONFLICT(tenant_id) DO UPDATE SET school_id=EXCLUDED.school_id,site_name=EXCLUDED.site_name,
         tagline=EXCLUDED.tagline,primary_color=EXCLUDED.primary_color,updated_at=now() RETURNING *`,
        [
          req.actor.tenant_id,
          x.school_id,
          x.site_name,
          x.tagline,
          x.primary_color,
        ],
      )
    ).rows[0];
    if (!row) throw new BadRequestException("Sekolah tidak ditemukan");
    return (
      await this.db.query(
        "SELECT ws.*,t.slug AS tenant_slug FROM website_settings ws JOIN tenants t ON t.id=ws.tenant_id WHERE ws.tenant_id=$1",
        [req.actor.tenant_id],
      )
    ).rows[0];
  }

  @Get("assets/:id/file") async assetFile(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    allow(req.actor, "website.read");
    uuid.parse(id);
    const row = (
      await this.db.query(
        `SELECT f.* FROM website_assets a JOIN managed_files f
         ON f.tenant_id=a.tenant_id AND f.id=a.file_id
         WHERE a.tenant_id=$1 AND a.id=$2 AND f.deleted_at IS NULL`,
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Aset website tidak ditemukan");
    try {
      const bytes = await readManagedFile(
        row.storage_key,
        row.storage_provider,
      );
      if (
        bytes.length !== row.size_bytes ||
        createHash("sha256").update(bytes).digest("hex") !== row.sha256
      )
        throw new Error("Checksum tidak sesuai");
      res.setHeader("Content-Type", row.mime_type);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("ETag", `"${row.sha256}"`);
      res.send(bytes);
    } catch {
      throw new NotFoundException("Isi aset website tidak ditemukan");
    }
  }

  @Get("pages") async pages(@Req() req: AuthRequest) {
    allow(req.actor, "website.read");
    const data = (
      await this.db.query(
        `SELECT p.*,s.name AS school_name,
         (SELECT max(version_number) FROM website_page_versions v WHERE v.tenant_id=p.tenant_id AND v.page_id=p.id) AS latest_version
         FROM website_pages p JOIN schools s ON s.tenant_id=p.tenant_id AND s.id=p.school_id
         WHERE p.tenant_id=$1 ORDER BY p.slug='home' DESC,p.title`,
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length };
  }

  @Post("pages") async createPage(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "website.write");
    const x = z
      .object({
        school_id: uuid,
        title: short,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(100),
        content: websiteContentSchema,
      })
      .strict()
      .parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      if (
        !(
          await sql.query(
            "SELECT 1 FROM schools WHERE tenant_id=$1 AND id=$2",
            [req.actor.tenant_id, x.school_id],
          )
        ).rows[0]
      )
        throw new BadRequestException("Sekolah tidak ditemukan");
      await validateAssets(sql, req.actor.tenant_id, x.content);
      const page = (
        await sql.query(
          "INSERT INTO website_pages(tenant_id,school_id,title,slug,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [req.actor.tenant_id, x.school_id, x.title, x.slug, req.actor.id],
        )
      ).rows[0];
      const version = (
        await sql.query(
          "INSERT INTO website_page_versions(tenant_id,page_id,version_number,content,created_by) VALUES($1,$2,1,$3,$4) RETURNING *",
          [
            req.actor.tenant_id,
            page.id,
            JSON.stringify(x.content),
            req.actor.id,
          ],
        )
      ).rows[0];
      return { ...page, version };
    });
  }

  @Get("pages/:id") async page(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "website.read");
    uuid.parse(id);
    const page = (
      await this.db.query(
        "SELECT * FROM website_pages WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!page) throw new NotFoundException("Halaman tidak ditemukan");
    page.versions = (
      await this.db.query(
        "SELECT * FROM website_page_versions WHERE tenant_id=$1 AND page_id=$2 ORDER BY version_number DESC",
        [req.actor.tenant_id, id],
      )
    ).rows;
    return page;
  }

  @Post("pages/:id/versions") async version(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "website.write");
    uuid.parse(id);
    const content = websiteContentSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const page = (
        await sql.query(
          "SELECT * FROM website_pages WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!page || page.status === "ARCHIVED")
        throw new ConflictException("Halaman tidak dapat diedit");
      await validateAssets(sql, req.actor.tenant_id, content);
      return (
        await sql.query(
          `INSERT INTO website_page_versions(tenant_id,page_id,version_number,content,created_by)
           SELECT $1,$2,COALESCE(max(version_number),0)+1,$3,$4 FROM website_page_versions
           WHERE tenant_id=$1 AND page_id=$2 RETURNING *`,
          [req.actor.tenant_id, id, JSON.stringify(content), req.actor.id],
        )
      ).rows[0];
    });
  }

  @Post("pages/:id/publish") async publish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "website.write");
    uuid.parse(id);
    const x = z.object({ version_id: uuid }).strict().parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const version = (
        await sql.query(
          `SELECT v.* FROM website_page_versions v JOIN website_pages p
           ON p.tenant_id=v.tenant_id AND p.id=v.page_id
           WHERE v.tenant_id=$1 AND v.id=$2 AND p.id=$3 AND p.status<>'ARCHIVED' FOR UPDATE OF p`,
          [req.actor.tenant_id, x.version_id, id],
        )
      ).rows[0];
      if (!version)
        throw new NotFoundException("Versi halaman tidak ditemukan");
      await validateAssets(
        sql,
        req.actor.tenant_id,
        websiteContentSchema.parse(version.content),
      );
      await sql.query(
        "UPDATE website_page_versions SET published_at=COALESCE(published_at,now()) WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, version.id],
      );
      const page = (
        await sql.query(
          "UPDATE website_pages SET status='PUBLISHED',published_version_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [req.actor.tenant_id, id, version.id],
        )
      ).rows[0];
      await refreshPublishedAssets(sql, req.actor.tenant_id);
      return page;
    });
  }

  @Post("pages/:id/unpublish") async unpublish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "website.write");
    uuid.parse(id);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const row = (
        await sql.query(
          "UPDATE website_pages SET status='DRAFT',published_version_id=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PUBLISHED' RETURNING *",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row)
        throw new ConflictException("Halaman tidak sedang dipublikasikan");
      await refreshPublishedAssets(sql, req.actor.tenant_id);
      return row;
    });
  }

  @Get("assets") async assets(@Req() req: AuthRequest) {
    allow(req.actor, "website.read");
    const data = (
      await this.db.query(
        `SELECT a.*,f.file_name,f.mime_type,f.size_bytes,f.deleted_at FROM website_assets a
         JOIN managed_files f ON f.tenant_id=a.tenant_id AND f.id=a.file_id
         WHERE a.tenant_id=$1 ORDER BY a.created_at DESC`,
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length };
  }

  @Post("assets") async addAsset(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "website.write");
    const x = fileInput
      .extend({ name: short, alt_text: z.string().trim().max(300).default("") })
      .refine(
        (value) => value.mime_type !== "application/pdf",
        "Aset website harus berupa PNG atau JPEG",
      )
      .parse(body);
    const file = await saveManagedFile(
      this.db,
      req.actor.tenant_id,
      req.actor.id,
      "WEBSITE_IMAGE",
      x.alt_text,
      x,
    );
    try {
      return (
        await this.db.query(
          `INSERT INTO website_assets(tenant_id,file_id,name,alt_text,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [req.actor.tenant_id, file.id, x.name, x.alt_text, req.actor.id],
        )
      ).rows[0];
    } catch (error) {
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, file.id],
      );
      throw error;
    }
  }
}
