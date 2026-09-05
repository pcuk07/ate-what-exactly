import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { usePalette } from "../src/theme";

export default function RootLayout() {
  const palette = usePalette();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerTransparent: false,
          contentStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.accent,
          headerTitleStyle: { color: palette.label },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Today" }} />
        <Stack.Screen
          name="capture"
          options={{ title: "Log a meal", presentation: "fullScreenModal", headerShown: false }}
        />
        <Stack.Screen name="goals" options={{ title: "Goals", presentation: "modal" }} />
      </Stack>
    </>
  );
}
