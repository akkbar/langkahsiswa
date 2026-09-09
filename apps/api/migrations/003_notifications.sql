CREATE TABLE events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 150), description text NOT NULL DEFAULT '',
 type text NOT NULL CHECK(type IN ('EXAM','HOLIDAY','SCHOOL_EVENT','PARENT_MEETING','PAYMENT_DEADLINE','REPORT_PUBLICATION','ANNOUNCEMENT')),
 starts_at timestamptz NOT NULL, ends_at timestamptz, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
 UNIQUE(tenant_id,id), CHECK(ends_at IS NULL OR ends_at>=starts_at),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE event_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), event_id uuid NOT NULL,
 type text NOT NULL CHECK(type IN ('ALL','SCHOOL','GRADE','CLASS','STUDENT','TEACHER','PARENT')), target_id uuid,
 CHECK((type='ALL' AND target_id IS NULL) OR (type<>'ALL' AND target_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,event_id) REFERENCES events(tenant_id,id)
);
CREATE UNIQUE INDEX event_target_unique ON event_targets(tenant_id,event_id,type,COALESCE(target_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 event_id uuid, title text NOT NULL, body text NOT NULL, data jsonb NOT NULL DEFAULT '{}', dedupe_key text,
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,user_id,dedupe_key),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,event_id) REFERENCES events(tenant_id,id)
);
CREATE TABLE device_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 token text NOT NULL, platform text NOT NULL CHECK(platform IN ('ANDROID','IOS','WEB')), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,user_id,token),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX device_token_active ON device_tokens(token) WHERE active;
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), notification_id uuid NOT NULL, device_token_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED')), attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, last_error text, provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,notification_id,device_token_id),
 FOREIGN KEY(tenant_id,notification_id) REFERENCES notifications(tenant_id,id), FOREIGN KEY(tenant_id,device_token_id) REFERENCES device_tokens(tenant_id,id)
);
CREATE INDEX notifications_inbox ON notifications(tenant_id,user_id,created_at DESC);
CREATE INDEX delivery_queue ON notification_deliveries(status,next_attempt_at);
CREATE INDEX events_date ON events(tenant_id,starts_at);
