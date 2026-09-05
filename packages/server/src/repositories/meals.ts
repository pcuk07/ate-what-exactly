import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalibrationState, MealEntry } from "@awe/core";
import { fromMealEntry, toMealEntry, type MealRow } from "./mappers.js";

/**
 * The one write path for meal entries (design doc §4). Every caller — the app's
 * API and the MCP connector alike — goes through here, so there is exactly one
 * place a row is created.
 */
export class MealsRepository {
  constructor(private readonly db: SupabaseClient) {}

  async insert(entry: Omit<MealEntry, "id">): Promise<MealEntry> {
    const { data, error } = await this.db
      .from("meals")
      .insert(fromMealEntry(entry))
      .select()
      .single();
    if (error) throw new Error(`Could not save the meal: ${error.message}`);
    return toMealEntry(data as MealRow);
  }

  async getById(id: string): Promise<MealEntry | null> {
    const { data, error } = await this.db.from("meals").select().eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the meal: ${error.message}`);
    return data ? toMealEntry(data as MealRow) : null;
  }

  /** Entries in a half-open UTC range [from, to), oldest first. */
  async listBetween(from: string, to: string): Promise<MealEntry[]> {
    const { data, error } = await this.db
      .from("meals")
      .select()
      .gte("logged_at", from)
      .lt("logged_at", to)
      .order("logged_at", { ascending: true });
    if (error) throw new Error(`Could not read the diary: ${error.message}`);
    return (data as MealRow[]).map(toMealEntry);
  }

  async listRecent(limit = 100): Promise<MealEntry[]> {
    const { data, error } = await this.db
      .from("meals")
      .select()
      .order("logged_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Could not read the diary: ${error.message}`);
    return (data as MealRow[]).map(toMealEntry);
  }

  async update(id: string, patch: Partial<MealEntry>): Promise<MealEntry> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row["name"] = patch.name;
    if (patch.mealType !== undefined) row["meal_type"] = patch.mealType;
    if (patch.macros !== undefined) {
      row["kcal"] = patch.macros.kcal;
      row["protein_g"] = patch.macros.proteinG;
      row["carbs_g"] = patch.macros.carbsG;
      row["fat_g"] = patch.macros.fatG;
      row["fibre_g"] = patch.macros.fibreG;
    }
    const { data, error } = await this.db.from("meals").update(row).eq("id", id).select().single();
    if (error) throw new Error(`Could not update the meal: ${error.message}`);
    return toMealEntry(data as MealRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("meals").delete().eq("id", id);
    if (error) throw new Error(`Could not delete the meal: ${error.message}`);
  }
}

/** Per-dish calibration state (design doc §5.4). */
export class CalibrationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(userId: string, dishKey: string): Promise<CalibrationState | undefined> {
    const { data, error } = await this.db
      .from("calibrations")
      .select()
      .eq("user_id", userId)
      .eq("dish_key", dishKey)
      .maybeSingle();
    if (error) throw new Error(`Could not read calibration: ${error.message}`);
    if (!data) return undefined;
    const row = data as { dish_key: string; n: number; log_sum: number };
    return { dishKey: row.dish_key, n: row.n, logSum: row.log_sum };
  }

  async save(userId: string, state: CalibrationState): Promise<void> {
    const { error } = await this.db.from("calibrations").upsert(
      {
        user_id: userId,
        dish_key: state.dishKey,
        n: state.n,
        log_sum: state.logSum,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,dish_key" },
    );
    if (error) throw new Error(`Could not save calibration: ${error.message}`);
  }

  async recordCorrection(
    userId: string,
    mealId: string,
    dishKey: string,
    field: string,
    before: number,
    after: number,
  ): Promise<void> {
    const { error } = await this.db.from("corrections").insert({
      user_id: userId,
      meal_id: mealId,
      dish_key: dishKey,
      field,
      value_before: before,
      value_after: after,
    });
    if (error) throw new Error(`Could not record the correction: ${error.message}`);
  }
}
