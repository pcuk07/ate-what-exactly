import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { itemsTotal, recipePortion, scaleMacros, type MealItem } from "@awe/core";
import { api } from "../../src/api";
import { cornerCurve, radius, space, type, usePalette } from "../../src/theme";

/**
 * The recipe builder (design doc §5.2). Ingredients come in by barcode where
 * the food has one — which keeps them label-accurate — or by hand when it
 * doesn't. Weights are entered raw, before cooking, because that is what the
 * nutrition figures describe.
 */
export default function NewRecipeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [name, setName] = useState("");
  const [portions, setPortions] = useState("4");
  const [ingredients, setIngredients] = useState<MealItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = { current: false };

  // Manual ingredient fields
  const [manualName, setManualName] = useState("");
  const [manualGrams, setManualGrams] = useState("");
  const [manualKcal, setManualKcal] = useState("");

  const portionCount = Number(portions);
  const validPortions = Number.isInteger(portionCount) && portionCount >= 1 && portionCount <= 50;
  const canSave = name.trim().length > 0 && ingredients.length > 0 && validPortions && !saving;

  const total = ingredients.length ? itemsTotal(ingredients) : null;
  const perPortion = ingredients.length && validPortions ? recipePortion(ingredients, portionCount) : null;

  const addScanned = async ({ data }: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const food = await api.lookupBarcode(data);
      setIngredients((prev) => [
        ...prev,
        { name: food.name, grams: Math.round(food.servingG ?? 100), per100g: food.per100g },
      ]);
      setScanning(false);
    } catch {
      setError("That barcode isn't in the database. Add it by hand instead.");
      setScanning(false);
    } finally {
      scannedRef.current = false;
    }
  };

  const addManual = () => {
    const grams = Number(manualGrams);
    const kcal = Number(manualKcal);
    if (!manualName.trim() || !Number.isFinite(grams) || grams <= 0 || !Number.isFinite(kcal) || kcal < 0) {
      setError("An ingredient needs a name, a weight in grams, and calories per 100 g.");
      return;
    }
    setError(null);
    setIngredients((prev) => [
      ...prev,
      {
        name: manualName.trim(),
        grams,
        // Macros unknown by hand: calories are recorded, the rest stay zero
        // rather than being invented.
        per100g: { kcal, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      },
    ]);
    setManualName("");
    setManualGrams("");
    setManualKcal("");
    void Haptics.selectionAsync();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createRecipe({ name: name.trim(), ingredients, portions: portionCount });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that recipe.");
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.md, gap: space.lg, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.label }]}>What is it?</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Batch chilli"
          placeholderTextColor={palette.label2}
          accessibilityLabel="Recipe name"
          style={[field(palette), cornerCurve]}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.label }]}>Ingredients, weighed raw</Text>

        {ingredients.map((item, index) => (
          <View
            key={`${item.name}-${index}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: palette.separator,
              gap: space.sm,
            }}
          >
            <Text style={[type.body, { color: palette.label, flex: 1 }]}>{item.name}</Text>
            <Text style={[type.footnote, { color: palette.label2, fontVariant: ["tabular-nums"] }]}>
              {Math.round(item.grams)} g · {Math.round(scaleMacros(item.per100g, item.grams).kcal)} kcal
            </Text>
            <Pressable
              onPress={() => setIngredients((prev) => prev.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
              hitSlop={10}
            >
              <Text style={[type.body, { color: palette.over }]}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={async () => {
            if (!permission?.granted) {
              const result = await requestPermission();
              if (!result.granted) {
                setError("Without the camera you can still add ingredients by hand.");
                return;
              }
            }
            setScanning(true);
          }}
          accessibilityRole="button"
          style={[
            {
              borderWidth: 1,
              borderColor: palette.accent,
              paddingVertical: space.sm + 4,
              borderRadius: radius.inner,
              alignItems: "center",
            },
            cornerCurve,
          ]}
        >
          <Text style={[type.body, { color: palette.accent, fontWeight: "600" }]}>
            Scan an ingredient
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.footnote, { color: palette.label2 }]}>Or add one by hand</Text>
        <TextInput
          value={manualName}
          onChangeText={setManualName}
          placeholder="Chicken thigh"
          placeholderTextColor={palette.label2}
          accessibilityLabel="Ingredient name"
          style={[field(palette), cornerCurve]}
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <TextInput
            value={manualGrams}
            onChangeText={setManualGrams}
            placeholder="grams"
            placeholderTextColor={palette.label2}
            keyboardType="number-pad"
            accessibilityLabel="Weight in grams"
            style={[field(palette), { flex: 1 }, cornerCurve]}
          />
          <TextInput
            value={manualKcal}
            onChangeText={setManualKcal}
            placeholder="kcal / 100 g"
            placeholderTextColor={palette.label2}
            keyboardType="number-pad"
            accessibilityLabel="Calories per 100 grams"
            style={[field(palette), { flex: 1 }, cornerCurve]}
          />
        </View>
        <Pressable onPress={addManual} accessibilityRole="button" style={{ paddingVertical: space.sm }}>
          <Text style={[type.body, { color: palette.accent }]}>Add ingredient</Text>
        </Pressable>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.label }]}>How many portions?</Text>
        <TextInput
          value={portions}
          onChangeText={setPortions}
          keyboardType="number-pad"
          accessibilityLabel="Number of portions"
          style={[field(palette), { maxWidth: 120 }, cornerCurve]}
        />
        {total && perPortion ? (
          <Text style={[type.subheadline, { color: palette.label2 }]}>
            {Math.round(total.kcal)} kcal in the batch · {Math.round(perPortion.kcal)} kcal a portion
          </Text>
        ) : null}
      </View>

      {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}

      <Pressable
        onPress={save}
        disabled={!canSave}
        accessibilityRole="button"
        style={[
          {
            backgroundColor: palette.accent,
            paddingVertical: space.md,
            borderRadius: radius.inner,
            alignItems: "center",
            opacity: canSave ? 1 : 0.4,
          },
          cornerCurve,
        ]}
      >
        <Text style={[type.headline, { color: palette.accentInk }]}>
          {saving ? "Saving…" : "Save recipe"}
        </Text>
      </Pressable>

      <Modal visible={scanning} animationType="slide" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={addScanned}
          />
          <View style={{ position: "absolute", bottom: 60, left: 0, right: 0, alignItems: "center" }}>
            <Pressable onPress={() => setScanning(false)} accessibilityRole="button" style={{ padding: space.md }}>
              <Text style={[type.body, { color: "#fff" }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function field(palette: ReturnType<typeof usePalette>) {
  return {
    ...type.body,
    color: palette.label,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.separator,
    borderRadius: radius.inner,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
  };
}
