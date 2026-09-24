import React, { useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { can, type Catalog } from "../components";
import { AdmissionsQueueTab } from "./admissions-queue-tab";
import { AdmissionsSettingsTab } from "./admissions-settings-tab";

type PpdbTab = "queue" | "settings";

export function AdmissionsPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const write = can(user, "admission.write");
  const [activeTab, setActiveTab] = useState<PpdbTab>("queue");

  return (
    <>
      <div className="page-title">
        <div>
          <h1>PPDB</h1>
        </div>
        <div
          className="view-toggle has-text"
          role="group"
          aria-label="Tab PPDB"
          style={{ marginLeft: "auto" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "queue"}
            aria-pressed={activeTab === "queue"}
            className={activeTab === "queue" ? "active" : ""}
            onClick={() => setActiveTab("queue")}
            title="Antrean Pendaftar"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="15" x2="15" y2="15" />
              <line x1="9" y1="21" x2="15" y2="21" />
            </svg>
            <span>Antrean</span>
          </button>
          {write && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              aria-pressed={activeTab === "settings"}
              className={activeTab === "settings" ? "active" : ""}
              onClick={() => setActiveTab("settings")}
              title="Pengaturan PPDB"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33 1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Pengaturan</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === "queue" && (
        <AdmissionsQueueTab user={user} catalog={catalog} />
      )}
      {activeTab === "settings" && (
        <AdmissionsSettingsTab user={user} catalog={catalog} />
      )}
    </>
  );
}
