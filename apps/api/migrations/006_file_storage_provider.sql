ALTER TABLE managed_files
 ADD COLUMN storage_provider text NOT NULL DEFAULT 'FILESYSTEM'
 CHECK(storage_provider IN ('FILESYSTEM','MINIO'));
