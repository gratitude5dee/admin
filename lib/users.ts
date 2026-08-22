/**
 * Server-only user directory: maps user_id uuids to a human label
 * (username, else first handle address, else a shortened uuid) so
 * operators can identify who each dashboard row belongs to.
 */
import "server-only";

import { adminGetSafe } from "@/lib/controlPlane";
import type { UsersResponse } from "@/lib/types";

export interface UserDirectory {
  label: (userId: string) => string;
}

const FALLBACK: UserDirectory = {
  label: (userId) => userId.slice(0, 8),
};

export async function fetchUserDirectory(): Promise<UserDirectory> {
  const users = await adminGetSafe<UsersResponse>("/api/admin/users");
  if (users.error !== null) return FALLBACK;
  const labels = new Map<string, string>();
  for (const user of users.data.users) {
    const label =
      user.username ?? user.handles[0]?.address ?? user.user_id.slice(0, 8);
    labels.set(user.user_id, label);
  }
  return {
    label: (userId) => labels.get(userId) ?? userId.slice(0, 8),
  };
}
