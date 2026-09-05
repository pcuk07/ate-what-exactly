import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { MEAL_TYPES, type DaySummary, type MealEntry, type MealType } from "@awe/core";
import { api } from "../src/api";
import { CalorieRing } from "../src/components/CalorieRing";
import { MacroMeters } from "../src/components/MacroMeters";
import { TierBadge } from "../src/components/TierBadge";
import { cornerCurve, radius, space, type, usePalette } from "../src/theme";

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/**
 * The Today screen (design doc §6.1). Opens on real data, grouped into
 * Breakfast, Lunch, Dinner and Snacks, each with its own subtotal, and every
 * entry carrying the tier it was logged at.
 */
export default function TodayScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [day, setDay] = useState<DaySummary | null>(null);
  const [usual, setUsual] = useState<{ name: string; exemplar: MealEntry } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [today, suggestion] = await Promise.all([api.getDay(), api.getUsual().catch(() => null)]);
      setDay(today);
      setUsual(suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load today.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!day && !error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.md, paddingBottom: 140, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        {error ? (
          <View style={{ gap: space.sm }}>
            <Text style={[type.body, { color: palette.label }]}>{error}</Text>
            <Pressable onPress={load} accessibilityRole="button">
              <Text style={[type.body, { color: palette.accent }]}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {day ? (
          <>
            <Link href="/goals" asChild>
              <Pressable accessibilityRole="button" accessibilityHint="Opens your goals">
                <CalorieRing consumed={day.totals.kcal} goal={day.goals.kcal} palette={palette} />
              </Pressable>
            </Link>

            <MacroMeters totals={day.totals} goals={day.goals} palette={palette} />

            {/* The zero-tap path (§7.2): most meals are repeats. */}
            {usual && day.totals.kcal === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void Haptics.selectionAsync();
                  router.push("/capture");
                }}
                style={[
                  {
                    padding: space.md,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: palette.separator,
                  },
                  cornerCurve,
                ]}
              >
                <Text style={[type.headline, { color: palette.label }]}>Your usual?</Text>
                <Text style={[type.footnote, { color: palette.label2, marginTop: 2 }]}>
                  {usual.name} · {Math.round(usual.exemplar.macros.kcal)} kcal
                </Text>
              </Pressable>
            ) : null}

            <View>
              {MEAL_TYPES.map((mealType) => {
                const group = day.byMealType[mealType];
                if (group.entries.length === 0) return null;
                return (
                  <View key={mealType} style={{ marginBottom: space.md }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingBottom: space.xs,
                      }}
                    >
                      <Text style={[type.footnote, { color: palette.label2, textTransform: "uppercase", letterSpacing: 0.5 }]}>
                        {MEAL_LABEL[mealType]}
                      </Text>
                      <Text style={[type.footnote, { color: palette.label2, fontVariant: ["tabular-nums"] }]}>
                        {Math.round(group.kcal)} kcal
                      </Text>
                    </View>
                    {group.entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} palette={palette} />
                    ))}
                  </View>
                );
              })}

              {day.totals.kcal === 0 ? (
                <Text style={[type.body, { color: palette.label2, textAlign: "center", marginTop: space.xl }]}>
                  Snap your next meal.
                </Text>
              ) : null}
            </View>

            {day.estimatedShare > 0.5 ? (
              <Text style={[type.footnote, { color: palette.label2 }]}>
                {Math.round(day.estimatedShare * 100)} % of today is photo estimates, so the total is
                approximate.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* The capture button floats above the content, always in the thumb zone (§7.5). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log a meal"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/capture");
        }}
        style={[
          {
            position: "absolute",
            bottom: space.xl,
            alignSelf: "center",
            backgroundColor: palette.accent,
            paddingHorizontal: space.xl,
            paddingVertical: space.md,
            borderRadius: radius.pill,
          },
          cornerCurve,
        ]}
      >
        <Text style={[type.headline, { color: palette.accentInk }]}>Log a meal</Text>
      </Pressable>
    </View>
  );
}

function EntryRow({ entry, palette }: { entry: MealEntry; palette: ReturnType<typeof usePalette> }) {
  const time = new Date(entry.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <View
      accessible
      accessibilityLabel={`${entry.name}, ${Math.round(entry.macros.kcal)} calories, at ${time}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: space.sm + 2,
        borderBottomWidth: 1,
        borderBottomColor: palette.separator,
      }}
    >
      <Text style={[type.footnote, { color: palette.label2, width: 46, fontVariant: ["tabular-nums"] }]}>
        {time}
      </Text>
      <Text style={[type.body, { color: palette.label, flex: 1 }]} numberOfLines={2}>
        {entry.name}
      </Text>
      <TierBadge tier={entry.tier} palette={palette} />
      <Text style={[type.bodyNum, { color: palette.label2 }]}>{Math.round(entry.macros.kcal)}</Text>
    </View>
  );
}
