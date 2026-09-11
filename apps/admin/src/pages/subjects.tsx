import React from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import type { Catalog } from "../components";
import { ResourcePage } from "./resources";

export function SubjectsPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  return (
    <ResourcePage
      resource="subjects"
      user={user}
      catalog={catalog}
      refresh={refresh}
    />
  );
}
