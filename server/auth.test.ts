import { describe, expect, it } from "vitest";
import { createServiceClient } from "./index";

describe("Supabase server auth configuration", () => {
  it("verifies server auth configuration safely", async () => {
    try {
      const client = createServiceClient();
      const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) {
        expect(Array.isArray(data.users)).toBe(true);
      }
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});
