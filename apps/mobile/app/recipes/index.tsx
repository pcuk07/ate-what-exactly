import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { recipePortion, type Recipe } from "@awe/core";
import { api } from "../../src/api";
import { cornerCurve, radius, space, type, usePalette } from "../../src/theme";

/**
 * Saved home-cooked meals (design doc §5.2). Weighing the ingredients once
 * buys Tier B accuracy on every re-log, so the list exists to make the fifth
 * time a single tap.
 */
export default function RecipesScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRecipes(await api.listRecipes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your recipes.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const logOne = async (recipe: Recipe) => {
    setLogging(recipe.id);
    try {
      await api.logRecipe(recipe.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log that.");
      setLogging(null);
    }
  };

  if (!recipes && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: "center" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.md, gap: space.md }}
    >
      {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}

      {recipes && recipes.length === 0 ? (
        <View style={{ gap: space.sm, paddingVertical: space.lg }}>
          <Text style={[type.headline, { color: palette.label }]}>Nothing saved yet</Text>
          <Text style={[type.body, { color: palette.label2 }]}>
            Weigh a meal's ingredients once and every future portion logs in a tap — and counts as
            weighed data, not an estimate.
          </Text>
        </View>
      ) : null}

      {recipes?.map((recipe) => {
        const perPortion = recipePortion(recipe.ingredients, recipe.portions);
        return (
          <Pressable
            key={recipe.id}
            onPress={() => logOne(recipe)}
            disabled={logging !== null}
            accessibilityRole="button"
            accessibilityLabel={`Log one portion of ${recipe.name}, ${Math.round(perPortion.kcal)} calories`}
            style={[
              {
                padding: space.md,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: palette.separator,
                opacity: logging && logging !== recipe.id ? 0.5 : 1,
                gap: space.xs,
              },
              cornerCurve,
            ]}
          >
            <Text style={[type.headline, { color: palette.label }]}>{recipe.name}</Text>
            <Text style={[type.footnote, { color: palette.label2 }]}>
              {Math.round(perPortion.kcal)} kcal a portion · {recipe.portions} portions ·{" "}
              {recipe.ingredients.length} ingredients
            </Text>
            <Text style={[type.footnote, { color: palette.accent }]}>
              {logging === recipe.id ? "Logging…" : "Tap to log one portion"}
            </Text>
          </Pressable>
        );
      })}

      <Link href="/recipes/new" asChild>
        <Pressable
          accessibilityRole="button"
          style={[
            {
              backgroundColor: palette.accent,
              paddingVertical: space.md,
              borderRadius: radius.inner,
              alignItems: "center",
            },
            cornerCurve,
          ]}
        >
          <Text style={[type.headline, { color: palette.accentInk }]}>New recipe</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
