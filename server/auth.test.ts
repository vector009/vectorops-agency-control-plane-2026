import { describe, expect, it } from "vitest";
import { createServiceClient } from "./index";

describe("Supabase server auth configuration", () => {
  it("can reach the Auth admin endpoint with the server-only key", async () => {
    const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(error).toBeNull();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
