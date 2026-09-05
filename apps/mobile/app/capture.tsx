import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { VisionResult } from "@awe/core";
import { api, grantAiConsent, hasAiConsent } from "../src/api";
import { ConsentSheet } from "../src/components/ConsentSheet";
import { QuestionSheet } from "../src/components/QuestionSheet";
import { cornerCurve, radius, space, type, usePalette } from "../src/theme";

/**
 * One capture surface (design doc §7.2): the camera recognises a barcode or a
 * plate itself, so there is no mode to choose before every log. A barcode
 * skips the questions entirely and lands as Tier A.
 *
 * Photos are downscaled to 1568 px on the long edge before upload — Anthropic's
 * documented optimum — which also strips EXIF, so no GPS tag leaves the device
 * (§10.1).
 */
const MAX_EDGE = 1568;

type Phase = "camera" | "reading" | "questions" | "saving";

export default function CaptureScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>("camera");
  const [result, setResult] = useState<VisionResult | null>(null);
  const [photoPath, setPhotoPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [askingConsent, setAskingConsent] = useState(false);
  const scannedRef = useRef(false);

  if (!permission) {
    return <Centered palette={palette}><ActivityIndicator color={palette.accent} /></Centered>;
  }

  if (!permission.granted) {
    return (
      <Centered palette={palette}>
        <Text style={[type.body, { color: palette.label, textAlign: "center", marginBottom: space.md }]}>
          To log a meal from a photo or a barcode, the app needs the camera.
        </Text>
        <PrimaryButton label="Allow camera" palette={palette} onPress={requestPermission} />
        <Pressable onPress={() => router.back()} style={{ padding: space.md }}>
          <Text style={[type.body, { color: palette.label2 }]}>Not now</Text>
        </Pressable>
      </Centered>
    );
  }

  /** A barcode short-circuits everything: no photo, no questions, no AI call. */
  const onBarcode = async ({ data }: BarcodeScanningResult) => {
    if (scannedRef.current || phase !== "camera") return;
    scannedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("saving");
    try {
      const food = await api.lookupBarcode(data);
      await api.logBarcode(data, food.servingG ?? 100);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setError("That barcode isn't in the database yet. Try a photo instead.");
      setPhase("camera");
      scannedRef.current = false;
    }
  };

  const capture = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!(await hasAiConsent())) {
      setAskingConsent(true);
      return;
    }
    await runEstimate();
  };

  const runEstimate = async () => {
    setError(null);
    setPhase("reading");
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8, skipProcessing: true });
      if (!photo) throw new Error("no photo");

      // Downscale on device: smaller upload, no EXIF, and the size Anthropic
      // reads best anyway.
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: MAX_EDGE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!resized.base64) throw new Error("no image data");

      const vision = await api.estimatePhoto({ data: resized.base64, mediaType: "image/jpeg" });
      setResult(vision);
      setPhotoPath(resized.uri);
      setPhase("questions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setPhase("camera");
    }
  };

  const confirm = async (answers: Record<string, number>) => {
    if (!result) return;
    setPhase("saving");
    try {
      await api.logPhoto({ result, answers, photoPath });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that. Try again.");
      setPhase("questions");
    }
  };

  if (phase === "questions" && result) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentInsetAdjustmentBehavior="automatic">
        <QuestionSheet
          result={result}
          palette={palette}
          onConfirm={confirm}
          onCancel={() => {
            setResult(null);
            setPhase("camera");
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={onBarcode}
      />

      <View style={{ position: "absolute", top: 60, left: 0, right: 0, alignItems: "center" }}>
        <Text style={[type.footnote, { color: "rgba(255,255,255,0.8)" }]}>
          {phase === "reading" ? "Reading the plate…" : "Point at a plate or a barcode"}
        </Text>
      </View>

      {error ? (
        <View style={{ position: "absolute", top: 100, left: space.md, right: space.md }}>
          <Text style={[type.footnote, { color: "#fff", textAlign: "center" }]}>{error}</Text>
        </View>
      ) : null}

      <View style={{ position: "absolute", bottom: 60, left: 0, right: 0, alignItems: "center", gap: space.md }}>
        {phase === "reading" || phase === "saving" ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take a photo of this meal"
            onPress={capture}
            style={{
              width: 74,
              height: 74,
              borderRadius: 37,
              borderWidth: 4,
              borderColor: "#fff",
              backgroundColor: "rgba(255,255,255,0.25)",
            }}
          />
        )}
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ padding: space.sm }}>
          <Text style={[type.body, { color: "rgba(255,255,255,0.9)" }]}>Cancel</Text>
        </Pressable>
      </View>

      <Modal visible={askingConsent} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: "center" }}>
          <ConsentSheet
            palette={palette}
            onAccept={async () => {
              await grantAiConsent();
              setAskingConsent(false);
              await runEstimate();
            }}
            onDecline={() => {
              setAskingConsent(false);
              setError("No problem — scan a barcode instead, or add it by hand.");
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function Centered({ children, palette }: { children: React.ReactNode; palette: ReturnType<typeof usePalette> }) {
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: "center", alignItems: "center", padding: space.lg }}>
      {children}
    </View>
  );
}

function PrimaryButton({
  label,
  palette,
  onPress,
}: {
  label: string;
  palette: ReturnType<typeof usePalette>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        {
          backgroundColor: palette.accent,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
          borderRadius: radius.inner,
        },
        cornerCurve,
      ]}
    >
      <Text style={[type.headline, { color: palette.accentInk }]}>{label}</Text>
    </Pressable>
  );
}
