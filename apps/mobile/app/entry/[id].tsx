import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  MEAL_TYPES,
  TIER_LABEL,
  describeTier,
  scaleMacros,
  type MealEntry,
  type MealType,
} from "@awe/core";
import { api } from "../../src/api";
import { signedPhotoUrl } from "../../src/photos";
import { TierBadge } from "../../src/components/TierBadge";
import { UndoToast } from "../../src/components/UndoToast";
import { cornerCurve, radius, space, type, usePalette } from "../../src/theme";

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * The entry detail screen — where the correction loop becomes reachable
 * (design doc §5.4). Correcting the calories of an estimate teaches the app
 * about that dish; the tier deliberately never improves, and the screen says so.
 */
export default function EntryScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<MealEntry | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [kcal, setKcal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .getEntry(id)
      .then(async (found) => {
        setEntry(found);
        setKcal(String(Math.round(found.macros.kcal)));
        if (found.photoPath) setPhotoUrl(await signedPhotoUrl(found.photoPath, 120));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load that entry."),
      );
  }, [id]);

  const saveKcal = useCallback(async () => {
    if (!entry) return;
    const next = Number(kcal);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a number of calories.");
      return;
    }
    if (Math.round(next) === Math.round(entry.macros.kcal)) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.correctEntry(entry.id, { macros: { kcal: next } });
      setEntry(updated);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that correction.");
    } finally {
      setSaving(false);
    }
  }, [entry, kcal, router]);

  const changeMealType = async (mealType: MealType) => {
    if (!entry || entry.mealType === mealType) return;
    void Haptics.selectionAsync();
    const previous = entry;
    setEntry({ ...entry, mealType }); // optimistic: the tap should feel instant
    try {
      const updated = await api.correctEntry(entry.id, { mealType });
      setEntry(updated);
    } catch {
      setEntry(previous);
      setError("Could not move that to another meal.");
    }
  };

  /** Delete commits only when the toast expires, so Undo costs nothing. */
  const commitDelete = useCallback(async () => {
    if (!entry) return;
    try {
      await api.deleteEntry(entry.id);
    } catch {
      // The row is already gone from view; surfacing this on a screen the
      // user has left would be noise. Today's list refetches on focus.
    }
    setPendingDelete(false);
    router.back();
  }, [entry, router]);

  if (error && !entry) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: space.lg }}>
        <Text style={[type.body, { color: palette.label }]}>{error}</Text>
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: "center" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const time = new Date(entry.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const band = Math.round(entry.errorBand * 100);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.md, paddingBottom: 120, gap: space.lg }}
      >
        {photoUrl ? (
          // The curve lives on the wrapper: borderCurve is a view style, and
          // clipping the image to the container gets the same result.
          <View
            style={[
              { width: "100%", height: 220, borderRadius: radius.card, overflow: "hidden" },
              cornerCurve,
            ]}
          >
            <Image
              source={{ uri: photoUrl }}
              accessibilityLabel={`Photo of ${entry.name}`}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={{ gap: space.xs }}>
          <Text style={[type.largeTitle, { color: palette.label }]}>{entry.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <TierBadge tier={entry.tier} palette={palette} />
            <Text style={[type.footnote, { color: palette.label2 }]}>
              {TIER_LABEL[entry.tier]} · about ±{band} % · logged {time}
            </Text>
          </View>
        </View>

        {/* Correcting the calories is the one edit that teaches the app. */}
        <View style={{ gap: space.sm }}>
          <Text style={[type.headline, { color: palette.label }]}>Calories</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <TextInput
              value={kcal}
              onChangeText={setKcal}
              keyboardType="number-pad"
              accessibilityLabel="Calories"
              style={[
                type.hero,
                {
                  color: palette.label,
                  fontSize: 34,
                  paddingVertical: space.sm,
                  minWidth: 120,
                },
              ]}
            />
            <Text style={[type.body, { color: palette.label2 }]}>kcal</Text>
          </View>
          {entry.tier === "D" || entry.tier === "C" ? (
            <Text style={[type.footnote, { color: palette.label2 }]}>
              Correcting this teaches awe about {entry.name.toLowerCase()}, so the next estimate
              starts closer. It stays a Tier {entry.tier} estimate either way — a corrected guess is
              still a guess.
            </Text>
          ) : (
            <Text style={[type.footnote, { color: palette.label2 }]}>
              {describeTier(entry.tier)}. Corrections here aren't used to adjust future estimates,
              because label and weighed data are already right.
            </Text>
          )}
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={[type.headline, { color: palette.label }]}>Meal</Text>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {MEAL_TYPES.map((mealType) => {
              const selected = entry.mealType === mealType;
              return (
                <Pressable
                  key={mealType}
                  onPress={() => changeMealType(mealType)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: space.sm,
                      borderRadius: radius.inner,
                      borderWidth: 1,
                      borderColor: selected ? palette.accent : palette.separator,
                      backgroundColor: selected ? palette.accent : "transparent",
                      alignItems: "center",
                    },
                    cornerCurve,
                  ]}
                >
                  <Text
                    style={[
                      type.caption,
                      { color: selected ? palette.accentInk : palette.label2, fontWeight: selected ? "600" : "400" },
                    ]}
                  >
                    {MEAL_LABEL[mealType]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {entry.items.length > 0 ? (
          <View style={{ gap: space.xs }}>
            <Text style={[type.headline, { color: palette.label }]}>What's in it</Text>
            {entry.items.map((item, index) => {
              const scaled = scaleMacros(item.per100g, item.grams);
              return (
                <View
                  key={`${item.name}-${index}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: space.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: palette.separator,
                  }}
                >
                  <Text style={[type.body, { color: palette.label, flex: 1 }]}>{item.name}</Text>
                  <Text style={[type.footnote, { color: palette.label2, fontVariant: ["tabular-nums"] }]}>
                    {Math.round(item.grams)} g · {Math.round(scaled.kcal)} kcal
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: space.xs }}>
          <Text style={[type.headline, { color: palette.label }]}>Macros</Text>
          {(
            [
              ["Protein", entry.macros.proteinG],
              ["Carbs", entry.macros.carbsG],
              ["Fat", entry.macros.fatG],
              ["Fibre", entry.macros.fibreG],
            ] as const
          ).map(([label, value]) => (
            <View
              key={label}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.xs }}
            >
              <Text style={[type.body, { color: palette.label2 }]}>{label}</Text>
              <Text style={[type.bodyNum, { color: palette.label }]}>{Math.round(value)} g</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}

        <Pressable
          onPress={saveKcal}
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
          <Text style={[type.headline, { color: palette.accentInk }]}>
            {saving ? "Saving…" : "Save correction"}
          </Text>
        </Pressable>

        {/* No confirmation dialog: the toast below is the safety net. */}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPendingDelete(true);
          }}
          accessibilityRole="button"
          style={{ alignItems: "center", padding: space.md }}
        >
          <Text style={[type.body, { color: palette.over }]}>Delete this entry</Text>
        </Pressable>
      </ScrollView>

      {pendingDelete ? (
        <UndoToast
          message={`Deleted ${entry.name}`}
          palette={palette}
          onUndo={() => setPendingDelete(false)}
          onExpire={commitDelete}
        />
      ) : null}
    </View>
  );
}
