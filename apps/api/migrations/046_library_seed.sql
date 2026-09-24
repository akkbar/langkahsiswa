-- Seed dummy library data for trial

DO $$
DECLARE
  v_tenant_id UUID;
  v_shelf_a UUID := gen_random_uuid();
  v_shelf_b UUID := gen_random_uuid();
  v_shelf_c UUID := gen_random_uuid();
  
  v_book_1 UUID := gen_random_uuid();
  v_book_2 UUID := gen_random_uuid();
  v_book_3 UUID := gen_random_uuid();
  v_book_4 UUID := gen_random_uuid();
  v_book_5 UUID := gen_random_uuid();
  v_book_6 UUID := gen_random_uuid();
  v_book_7 UUID := gen_random_uuid();
  v_book_8 UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
    INSERT INTO tenants (id, name, slug) VALUES (v_tenant_id, 'Yayasan Pendidikan Al-Ihsan', 'al-ihsan')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 1. Insert Shelves
  INSERT INTO shelves (tenant_id, id, code, name, description) VALUES
    (v_tenant_id, v_shelf_a, 'RAK-A1', 'Rak Sains & Matematika', 'Koleksi buku MIPA dan eksakta'),
    (v_tenant_id, v_shelf_b, 'RAK-B1', 'Rak Agama & Dakwah', 'Koleksi kitab, fiqih, dan keislaman'),
    (v_tenant_id, v_shelf_c, 'RAK-C1', 'Rak Umum & Sastra', 'Koleksi bahasa, novel, dan pengetahuan umum')
  ON CONFLICT DO NOTHING;

  -- 2. Insert Books
  INSERT INTO books (tenant_id, id, title, author, isbn, publisher, publication_year, category) VALUES
    (v_tenant_id, v_book_1, 'Matematika SMA Kelas X', 'Dr. Budi Santoso', '978-602-01-0001-1', 'Erlangga', 2023, 'Pelajaran'),
    (v_tenant_id, v_book_2, 'Fisika Dasar Mekanika', 'Prof. Yohanes Surya', '978-602-01-0002-2', 'Grasindo', 2022, 'Pelajaran'),
    (v_tenant_id, v_book_3, 'Biologi Sel & Molekuler', 'Dr. Siti Aminah', '978-602-01-0003-3', 'Gramedia', 2023, 'Pelajaran'),
    (v_tenant_id, v_book_4, 'Pemrograman TypeScript & NestJS', 'Ahmad Developer', '978-602-01-0004-4', 'Informatika', 2024, 'Teknologi'),
    (v_tenant_id, v_book_5, 'Sejarah Kebudayaan Islam (SKI)', 'Dr. H. M. Zainuddin', '978-602-01-0005-5', 'Tiga Serangkai', 2021, 'Agama'),
    (v_tenant_id, v_book_6, 'Fiqih Muamalah Kontemporer', 'Ust. Dr. Oni Sahroni', '978-602-01-0006-6', 'Republika', 2023, 'Agama'),
    (v_tenant_id, v_book_7, 'Mahir Bahasa Arab Percakapan', 'Dr. Taufik Hidayat', '978-602-01-0007-7', 'Al-Mizan', 2022, 'Bahasa'),
    (v_tenant_id, v_book_8, 'Sang Pemimpi', 'Andrea Hirata', '978-979-3062-92-2', 'Bentang Pustaka', 2006, 'Sastra')
  ON CONFLICT DO NOTHING;

  -- 3. Insert Book Copies
  INSERT INTO book_copies (tenant_id, book_id, barcode, shelf_id, status, condition) VALUES
    -- Matematika (3 copies)
    (v_tenant_id, v_book_1, 'BK-MAT-001', v_shelf_a, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_1, 'BK-MAT-002', v_shelf_a, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_1, 'BK-MAT-003', v_shelf_a, 'AVAILABLE', 'GOOD'),
    -- Fisika (3 copies)
    (v_tenant_id, v_book_2, 'BK-PHY-001', v_shelf_a, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_2, 'BK-PHY-002', v_shelf_a, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_2, 'BK-PHY-003', v_shelf_a, 'AVAILABLE', 'GOOD'),
    -- Biologi (2 copies)
    (v_tenant_id, v_book_3, 'BK-BIO-001', v_shelf_a, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_3, 'BK-BIO-002', v_shelf_a, 'AVAILABLE', 'GOOD'),
    -- TypeScript (3 copies)
    (v_tenant_id, v_book_4, 'BK-TS-001', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_4, 'BK-TS-002', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_4, 'BK-TS-003', v_shelf_c, 'AVAILABLE', 'GOOD'),
    -- SKI (3 copies)
    (v_tenant_id, v_book_5, 'BK-SKI-001', v_shelf_b, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_5, 'BK-SKI-002', v_shelf_b, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_5, 'BK-SKI-003', v_shelf_b, 'AVAILABLE', 'GOOD'),
    -- Fiqih (2 copies)
    (v_tenant_id, v_book_6, 'BK-FIQ-001', v_shelf_b, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_6, 'BK-FIQ-002', v_shelf_b, 'AVAILABLE', 'GOOD'),
    -- Bahasa Arab (3 copies)
    (v_tenant_id, v_book_7, 'BK-ARB-001', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_7, 'BK-ARB-002', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_7, 'BK-ARB-003', v_shelf_c, 'AVAILABLE', 'GOOD'),
    -- Sang Pemimpi (3 copies)
    (v_tenant_id, v_book_8, 'BK-NOV-001', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_8, 'BK-NOV-002', v_shelf_c, 'AVAILABLE', 'GOOD'),
    (v_tenant_id, v_book_8, 'BK-NOV-003', v_shelf_c, 'AVAILABLE', 'GOOD')
  ON CONFLICT DO NOTHING;

END $$;
