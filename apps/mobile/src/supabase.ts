import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

/**
 * The app's Supabase client. It holds only the anon key, which is public by
 * design and guarded by RLS (design doc §10.2) — the service role key never
 * comes near the device.
 *
 * The session lives in the Keychain rather than AsyncStorage, device-only and
 * unreadable while the phone is locked (§10.1).
 */

const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const anonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

/**
 * SecureStore caps a value at 2048 bytes, and a Supabase session (two JWTs)
 * can exceed that. Values are split across numbered chunks so a long session
 * still round-trips instead of silently failing to save.
 */
const CHUNK_SIZE = 1800;

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;

const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(`${key}.0`, options);
    if (head === null) return null;
    let value = head;
    for (let i = 1; ; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`, options);
      if (part === null) break;
      value += part;
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await keychainStorage.removeItem(key);
    for (let i = 0; i * CHUNK_SIZE < value.length; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        options,
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    for (let i = 0; ; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`, options);
      if (part === null) break;
      await SecureStore.deleteItemAsync(`${key}.${i}`, options);
    }
  },
};

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    storage: keychainStorage,
    persistSession: true,
    autoRefreshToken: true,
    // The app has no URL-based auth callback; OTP codes are typed in.
    detectSessionInUrl: false,
  },
});

/** True when the app is pointed at a real project, so we can say so plainly. */
export const isConfigured = url.length > 0 && anonKey.length > 0;
