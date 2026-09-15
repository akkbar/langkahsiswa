import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadRequestException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { z } from "zod";
import type { Sql } from "../../database/database.service";

export const fileCategories = [
  "STUDENT_PHOTO",
  "FAMILY_CARD",
  "BIRTH_CERTIFICATE",
  "PPDB_DOCUMENT",
  "PAYMENT_PROOF",
  "WEBSITE_IMAGE",
  "REPORT_CARD",
  "SCHOOL_PHOTO",
  "OTHER",
] as const;

export const fileInput = z
  .object({
    file_name: z.string().trim().min(1).max(180),
    mime_type: z.enum(["image/png", "image/jpeg", "application/pdf"]),
    data_base64: z.string().min(4).max(6_990_508),
  })
  .strict();

export function storageFile(storageKey: string) {
  const root = resolve(process.env.STORAGE_PATH || ".local/uploads");
  const path = resolve(root, storageKey);
  if (!path.startsWith(root + sep))
    throw new BadRequestException("Lokasi berkas tidak valid");
  return path;
}

function useMinio() {
  return process.env.STORAGE_DRIVER?.toLowerCase() === "minio";
}
let minioClient: S3Client | undefined;
let bucketReady: Promise<void> | undefined;
function minio() {
  if (minioClient) return minioClient;
  minioClient = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || "http://127.0.0.1:9000",
    region: process.env.MINIO_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || "langkahsiswa",
      secretAccessKey:
        process.env.MINIO_SECRET_KEY || "langkahsiswa_dev_secret",
    },
  });
  return minioClient;
}
function ensureBucket() {
  if (!bucketReady)
    bucketReady = (async () => {
      const client = minio();
      const Bucket = process.env.MINIO_BUCKET || "langkahsiswa";
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        try {
          await client.send(new CreateBucketCommand({ Bucket }));
        } catch {
          await client.send(new HeadBucketCommand({ Bucket }));
        }
      }
    })().catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  return bucketReady;
}
async function writeStored(key: string, bytes: Buffer) {
  if (!useMinio()) {
    const path = storageFile(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    return "FILESYSTEM" as const;
  }
  await ensureBucket();
  await minio().send(
    new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET || "langkahsiswa",
      Key: key,
      Body: bytes,
    }),
  );
  return "MINIO" as const;
}
async function removeStored(key: string, provider: "FILESYSTEM" | "MINIO") {
  if (provider === "MINIO") {
    await minio().send(
      new DeleteObjectCommand({
        Bucket: process.env.MINIO_BUCKET || "langkahsiswa",
        Key: key,
      }),
    );
    return;
  }
  await unlink(storageFile(key));
}

export function decodedFile(input: z.infer<typeof fileInput>) {
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data_base64) ||
    input.data_base64.length % 4 !== 0
  )
    throw new BadRequestException("Data base64 berkas tidak valid");
  const bytes = Buffer.from(input.data_base64, "base64");
  if (
    !bytes.length ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes.toString("base64") !== input.data_base64
  )
    throw new BadRequestException("Ukuran berkas harus antara 1 byte dan 5 MB");
  const valid =
    (input.mime_type === "application/pdf" &&
      bytes.subarray(0, 5).toString() === "%PDF-") ||
    (input.mime_type === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (input.mime_type === "image/jpeg" &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9);
  if (!valid)
    throw new BadRequestException("Isi berkas tidak sesuai tipe MIME");
  return bytes;
}

export async function saveManagedFile(
  sql: Sql,
  tenantId: string,
  uploadedBy: string | null,
  category: (typeof fileCategories)[number],
  description: string,
  input: z.infer<typeof fileInput>,
) {
  const bytes = decodedFile(input);
  const id = randomUUID();
  const extension =
    input.mime_type === "application/pdf"
      ? "pdf"
      : input.mime_type === "image/png"
        ? "png"
        : "jpg";
  const storageKey = `${tenantId}/managed/${id}.${extension}`;
  const provider = await writeStored(storageKey, bytes);
  try {
    return (
      await sql.query(
        `INSERT INTO managed_files(id,tenant_id,category,file_name,mime_type,size_bytes,storage_key,storage_provider,sha256,description,uploaded_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,category,file_name,mime_type,size_bytes,description,created_at`,
        [
          id,
          tenantId,
          category,
          input.file_name,
          input.mime_type,
          bytes.length,
          storageKey,
          provider,
          createHash("sha256").update(bytes).digest("hex"),
          description,
          uploadedBy,
        ],
      )
    ).rows[0];
  } catch (error) {
    await removeStored(storageKey, provider).catch(() => {});
    throw error;
  }
}

export async function readManagedFile(
  storageKey: string,
  provider: "FILESYSTEM" | "MINIO",
) {
  if (provider === "FILESYSTEM") return readFile(storageFile(storageKey));
  await ensureBucket();
  const response = await minio().send(
    new GetObjectCommand({
      Bucket: process.env.MINIO_BUCKET || "langkahsiswa",
      Key: storageKey,
    }),
  );
  if (!response.Body) throw new Error("Isi objek kosong");
  return Buffer.from(await response.Body.transformToByteArray());
}
