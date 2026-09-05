import type { SupabaseClient } from "@supabase/supabase-js";
import type { Food, Goals, Recipe, RestaurantItem } from "@awe/core";
import { DEFAULT_GOALS } from "@awe/core";
import {
  fromFood,
  toFood,
  toGoals,
  toRecipe,
  toRestaurantItem,
  type FoodRow,
  type GoalsRow,
  type RecipeRow,
  type RestaurantItemRow,
} from "./mappers.js";

/** Shared food tables. Readable by everyone, written only by the service role. */
export class FoodsRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** An Irish override, if we have one. These win over Open Food Facts. */
  async findOverride(barcode: string): Promise<Food | null> {
    const { data, error } = await this.db
      .from("foods")
      .select()
      .eq("barcode", barcode)
      .eq("source", "override")
      .maybeSingle();
    if (error) throw new Error(`Could not read the food table: ${error.message}`);
    return data ? toFood(data as FoodRow) : null;
  }

  /** A previously cached Open Food Facts row, to avoid re-fetching. */
  async findCached(barcode: string): Promise<Food | null> {
    const { data, error } = await this.db
      .from("foods")
      .select()
      .eq("barcode", barcode)
      .order("source", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not read the food table: ${error.message}`);
    return data ? toFood(data as FoodRow) : null;
  }

  /** Cache a fetched product. Service-role only. */
  async cache(food: Food): Promise<void> {
    const { error } = await this.db
      .from("foods")
      .upsert(fromFood(food), { onConflict: "barcode,source" });
    if (error) throw new Error(`Could not cache the food: ${error.message}`);
  }

  /**
   * Chain menu items with voluntarily published nutrition (design doc §5.3).
   * Matching is deliberately narrow: an exact-ish name match on a named
   * restaurant, never a fuzzy guess that would silently upgrade a Tier D
   * estimate to a Tier C claim.
   */
  async findMenuItem(restaurantName: string, itemName: string): Promise<RestaurantItem | null> {
    const { data, error } = await this.db
      .from("restaurant_items")
      .select()
      .ilike("restaurant_name", restaurantName)
      .ilike("item_name", itemName)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not read menu data: ${error.message}`);
    return data ? toRestaurantItem(data as RestaurantItemRow) : null;
  }

  async searchMenu(restaurantName: string, limit = 20): Promise<RestaurantItem[]> {
    const { data, error } = await this.db
      .from("restaurant_items")
      .select()
      .ilike("restaurant_name", `%${restaurantName}%`)
      .limit(limit);
    if (error) throw new Error(`Could not read menu data: ${error.message}`);
    return (data as RestaurantItemRow[]).map(toRestaurantItem);
  }
}

export class RecipesRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<Recipe[]> {
    const { data, error } = await this.db.from("recipes").select().order("name");
    if (error) throw new Error(`Could not read your recipes: ${error.message}`);
    return (data as RecipeRow[]).map(toRecipe);
  }

  async getById(id: string): Promise<Recipe | null> {
    const { data, error } = await this.db.from("recipes").select().eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the recipe: ${error.message}`);
    return data ? toRecipe(data as RecipeRow) : null;
  }

  async create(recipe: Omit<Recipe, "id">): Promise<Recipe> {
    const { data, error } = await this.db
      .from("recipes")
      .insert({
        user_id: recipe.userId,
        name: recipe.name,
        ingredients: recipe.ingredients,
        portions: recipe.portions,
      })
      .select()
      .single();
    if (error) throw new Error(`Could not save the recipe: ${error.message}`);
    return toRecipe(data as RecipeRow);
  }
}

export class GoalsRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** Falls back to sensible defaults, so a new account has a working ring. */
  async get(userId: string): Promise<Goals> {
    const { data, error } = await this.db
      .from("goals")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Could not read your goals: ${error.message}`);
    return data ? toGoals(data as GoalsRow) : DEFAULT_GOALS;
  }

  async save(userId: string, goals: Goals): Promise<Goals> {
    const { data, error } = await this.db
      .from("goals")
      .upsert(
        {
          user_id: userId,
          kcal: goals.kcal,
          protein_g: goals.proteinG,
          carbs_g: goals.carbsG,
          fat_g: goals.fatG,
          fibre_g: goals.fibreG,
          flexible_days: goals.flexibleDays,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(`Could not save your goals: ${error.message}`);
    return toGoals(data as GoalsRow);
  }
}
