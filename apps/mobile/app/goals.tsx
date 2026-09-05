import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { DEFAULT_GOALS, type Goals } from "@awe/core";
import { api } from "../src/api";
import { cornerCurve, radius, space, type, usePalette } from "../src/theme";

/**
 * Goals on one screen with sensible defaults (design doc §6.3, §7.10) —
 * deliberately not the multi-page wizard Nutracheck's own reviewers complain
 * about. "Flexible days" is credited to their "Easier Days" idea.
 */
export default function GoalsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getGoals()
      .then(setGoals)
      .catch(() => setGoals(DEFAULT_GOALS));
  }, []);

  const save = async () => {
    if (!goals) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveGoals(goals);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
      setSaving(false);
    }
  };

  if (!goals) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bgGrouped, justifyContent: "center" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const numeric = (key: keyof Omit<Goals, "flexibleDays">, label: string, unit: string) => (
    <View
      key={key}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: space.sm + 4,
        borderBottomWidth: 1,
        borderBottomColor: palette.separator,
      }}
    >
      <Text style={[type.body, { color: palette.label }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <TextInput
          value={String(goals[key])}
          onChangeText={(text) => {
            const n = Number(text.replace(/[^0-9]/g, ""));
            setGoals({ ...goals, [key]: Number.isFinite(n) ? n : 0 });
          }}
          keyboardType="number-pad"
          accessibilityLabel={`${label} goal in ${unit}`}
          style={[
            type.bodyNum,
            {
              color: palette.label,
              minWidth: 70,
              textAlign: "right",
              paddingVertical: 4,
            },
          ]}
        />
        <Text style={[type.body, { color: palette.label2 }]}>{unit}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bgGrouped }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.md, gap: space.lg }}
    >
      <View
        style={[
          { backgroundColor: palette.surface, borderRadius: radius.card, paddingHorizontal: space.md },
          cornerCurve,
        ]}
      >
        {numeric("kcal", "Daily calories", "kcal")}
        {numeric("proteinG", "Protein", "g")}
        {numeric("carbsG", "Carbs", "g")}
        {numeric("fatG", "Fat", "g")}
        {numeric("fibreG", "Fibre", "g")}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: space.sm + 4,
          }}
        >
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={[type.body, { color: palette.label }]}>Flexible days</Text>
            <Text style={[type.footnote, { color: palette.label2, marginTop: 2 }]}>
              Judge the week on its average, so one big day isn't a failure.
            </Text>
          </View>
          <Switch
            value={goals.flexibleDays}
            onValueChange={(flexibleDays) => setGoals({ ...goals, flexibleDays })}
            trackColor={{ true: palette.accent, false: palette.separator }}
          />
        </View>
      </View>

      {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}

      <Pressable
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
        style={[
          {
            backgroundColor: palette.accent,
            paddingVertical: space.md,
            borderRadius: radius.inner,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          },
          cornerCurve,
        ]}
      >
        <Text style={[type.headline, { color: palette.accentInk }]}>{saving ? "Saving…" : "Save"}</Text>
      </Pressable>
    </ScrollView>
  );
}
