import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import type {
  DaySummary,
  Food,
  Goals,
  MealEntry,
  MealItem,
  MealType,
  Recipe,
  VisionResult,
  WeekSummary,
} from "@awe/core";

/**
 * The app's only route to the network. It talks to our own server and never
 * directly to Anthropic or Supabase's service role — the app ships no secrets
 * (design doc §10.2).
 */

const BASE_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:8080";

const CONSENT_KEY = "awe.aiConsent";

/**
 * The access token comes from the live Supabase session, which the client
 * refreshes on its own. Reading it per request rather than caching a copy
 * means an expired token is never sent after a refresh has already happened.
 */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** §10.3: consent for sending photos to Claude, recorded per device. */
export async function hasAiConsent(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONSENT_KEY)) === "granted";
}

export async function grantAiConsent(): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, "granted");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiError(
      body.message ?? "Something went wrong. Try again in a moment.",
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getDay: (date?: string) => request<DaySummary>(`/day${date ? `?date=${date}` : ""}`),
  getWeek: () => request<WeekSummary>("/week"),
  getGoals: () => request<Goals>("/goals"),
  saveGoals: (goals: Goals) =>
    request<Goals>("/goals", { method: "PUT", body: JSON.stringify(goals) }),
  getUsual: (mealType?: MealType) =>
    request<{ name: string; count: number; exemplar: MealEntry } | null>(
      `/usual${mealType ? `?mealType=${mealType}` : ""}`,
    ),
  lookupBarcode: (barcode: string) => request<Food>(`/barcode/${barcode}`),
  logBarcode: (barcode: string, grams: number, mealType?: MealType) =>
    request<MealEntry>("/meals/barcode", {
      method: "POST",
      body: JSON.stringify({ barcode, grams, mealType }),
    }),
  /** The photo never leaves the device without explicit consent (§10.3). */
  estimatePhoto: (image: { data: string; mediaType: string }, opts: { mealType?: MealType; restaurantName?: string } = {}) =>
    request<VisionResult>("/meals/estimate", {
      method: "POST",
      body: JSON.stringify({ image, aiConsent: true, ...opts }),
    }),
  logPhoto: (body: {
    result: VisionResult;
    answers: Record<string, number>;
    photoPath: string;
    mealType?: MealType;
    restaurantName?: string;
  }) => request<MealEntry>("/meals/photo", { method: "POST", body: JSON.stringify(body) }),
  getEntry: (id: string) => request<MealEntry>(`/meals/${id}`),
  repeatEntry: (id: string, mealType?: MealType) =>
    request<MealEntry>(`/meals/${id}/repeat`, {
      method: "POST",
      body: JSON.stringify({ mealType }),
    }),
  listRecipes: () => request<Recipe[]>("/recipes"),
  createRecipe: (body: { name: string; ingredients: MealItem[]; portions: number }) =>
    request<Recipe>("/recipes", { method: "POST", body: JSON.stringify(body) }),
  logRecipe: (recipeId: string, mealType?: MealType) =>
    request<MealEntry>("/meals/recipe", {
      method: "POST",
      body: JSON.stringify({ recipeId, mealType }),
    }),
  correctEntry: (id: string, patch: Record<string, unknown>) =>
    request<MealEntry>(`/meals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteEntry: (id: string) => request<void>(`/meals/${id}`, { method: "DELETE" }),
};
