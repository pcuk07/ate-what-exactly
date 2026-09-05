import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/auth";
import { usePalette } from "../src/theme";

/**
 * The auth gate. Everything except the sign-in screen needs a session, and a
 * returning user goes straight to Today with no flash of the login screen,
 * because the Keychain session is restored before anything renders.
 */
function Gate() {
  const palette = usePalette();
  const router = useRouter();
  const segments = useSegments();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const onSignIn = segments[0] === "sign-in";
    if (!session && !onSignIn) router.replace("/sign-in");
    else if (session && onSignIn) router.replace("/");
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: false,
        contentStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.accent,
        headerTitleStyle: { color: palette.label },
      }}
    >
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: "Today" }} />
      <Stack.Screen
        name="capture"
        options={{ title: "Log a meal", presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen name="goals" options={{ title: "Goals", presentation: "modal" }} />
      <Stack.Screen name="entry/[id]" options={{ title: "Entry" }} />
      <Stack.Screen name="week" options={{ title: "This week" }} />
      <Stack.Screen name="recipes/index" options={{ title: "Recipes", presentation: "modal" }} />
      <Stack.Screen name="recipes/new" options={{ title: "New recipe" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Gate />
    </AuthProvider>
  );
}
