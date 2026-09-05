import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import type { WeekSummary } from "@awe/core";
import { api } from "../src/api";
import { space, type, usePalette } from "../src/theme";

/**
 * The weekly view (design doc §6.2). Bars are drawn against a single scale
 * with the target as a reference line, so "over" is visible as distance from
 * that line rather than as a colour alone.
 *
 * Under flexible days the week is judged on its average, which is the whole
 * point: one heavy Saturday is absorbed rather than flagged as a failure.
 */
const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];

export default function WeekScreen() {
  const palette = usePalette();
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void api
        .getWeek()
        .then(setWeek)
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Could not load this week."),
        );
    }, []),
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: space.lg }}>
        <Text style={[type.body, { color: palette.label }]}>{error}</Text>
      </View>
    );
  }

  if (!week) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: "center" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  // One scale for every bar and the target line, with headroom so the tallest
  // bar never touches the top of the plot.
  const peak = Math.max(week.goalKcal, ...week.days.map((d) => d.kcal), 1);
  const scaleMax = peak * 1.15;
  const PLOT_HEIGHT = 180;
  const heightFor = (kcal: number) => Math.max((kcal / scaleMax) * PLOT_HEIGHT, kcal > 0 ? 2 : 0);
  const targetOffset = (week.goalKcal / scaleMax) * PLOT_HEIGHT;

  const status =
    week.status === "on_track"
      ? "On track"
      : week.status === "over"
        ? "Running over"
        : "Running under";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.md, gap: space.lg }}
    >
      <View style={{ gap: space.xs }}>
        <Text style={[type.hero, { color: palette.label, fontSize: 34 }]}>
          {week.averageKcal.toLocaleString()}
        </Text>
        <Text style={[type.body, { color: palette.label2 }]}>
          kcal a day on average, against a goal of {week.goalKcal.toLocaleString()}
        </Text>
        <Text
          style={[
            type.subheadline,
            { color: week.status === "over" ? palette.over : palette.accent, fontWeight: "600" },
          ]}
        >
          {status}
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={`Seven day chart. Average ${week.averageKcal} calories against a goal of ${week.goalKcal}. ${week.daysOver} days over.`}
      >
        <View style={{ height: PLOT_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
          {/* The target line sits behind the bars, spanning the full plot. */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: targetOffset,
              height: 1,
              backgroundColor: palette.separator,
            }}
          />
          {week.days.map((day, index) => {
            const over = day.kcal > week.goalKcal;
            return (
              <View key={day.date} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                <Text
                  style={[
                    type.caption,
                    { color: palette.label2, marginBottom: 2, fontVariant: ["tabular-nums"] },
                  ]}
                >
                  {day.kcal > 0 ? Math.round(day.kcal) : ""}
                </Text>
                <View
                  style={{
                    width: "100%",
                    height: heightFor(day.kcal),
                    borderRadius: 4,
                    backgroundColor: over ? palette.over : palette.accent,
                  }}
                />
                <Text style={[type.caption, { color: palette.label2, marginTop: space.xs }]}>
                  {DAY_INITIAL[index]}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[type.caption, { color: palette.label2, marginTop: space.sm }]}>
          The line is your {week.goalKcal.toLocaleString()} kcal goal.
        </Text>
      </View>

      <Text style={[type.footnote, { color: palette.label2, lineHeight: 20 }]}>
        {week.daysOver === 0
          ? "No days over the goal this week."
          : week.daysOver === 1
            ? "One day over the goal. With flexible days on, the week's average is what counts."
            : `${week.daysOver} days over the goal. With flexible days on, the week's average is what counts.`}
      </Text>
    </ScrollView>
  );
}
