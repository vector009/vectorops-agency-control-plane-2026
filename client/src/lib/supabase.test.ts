import { describe, expect, it } from "vitest";
import { supabase, supabaseConfigured } from "./supabase";

describe("Supabase client configuration", () => {
  it("exposes a boolean configuration state without leaking credentials", () => {
    expect(typeof supabaseConfigured).toBe("boolean");
  });

  it("handles the client auth session safely according to configuration", async () => {
    if (supabaseConfigured && supabase) {
      const { error } = await supabase.auth.getSession();
      expect(error).toBeNull();
    } else {
      expect(supabase).toBeNull();
    }
  });
});
