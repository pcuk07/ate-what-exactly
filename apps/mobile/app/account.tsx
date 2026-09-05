import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../src/auth";
import { supabase } from "../src/supabase";
import { cornerCurve, radius, space, type, usePalette } from "../src/theme";

/**
 * Account and privacy (design doc §10.4). In-app deletion is required by App
 * Store guideline 5.1.1(v) — an account you can create in the app must be
 * deletable in the app, not by emailing support.
 *
 * This is the one place a confirmation is right rather than an Undo toast:
 * the deletion is immediate and irreversible, so there is nothing to undo.
 * Typing the word is friction on purpose.
 */
const CONFIRM_WORD = "delete";

export default function AccountScreen() {
  const palette = usePalette();
  const { session, signOut } = useAuth();

  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirm.trim().toLowerCase() === CONFIRM_WORD;

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      // One transaction server-side: photos, diary, calibrations, every OAuth
      // grant, then the account itself.
      const { error: rpcError } = await supabase.rpc("delete_my_account");
      if (rpcError) throw new Error(rpcError.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signOut();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Your account was not deleted: ${err.message}`
          : "Your account was not deleted. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bgGrouped }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.md, gap: space.lg }}
    >
      <View
        style={[
          { backgroundColor: palette.surface, borderRadius: radius.card, padding: space.md, gap: space.xs },
          cornerCurve,
        ]}
      >
        <Text style={[type.footnote, { color: palette.label2 }]}>Signed in as</Text>
        <Text style={[type.body, { color: palette.label }]}>{session?.user.email ?? "—"}</Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.label }]}>What awe holds</Text>
        <Text style={[type.footnote, { color: palette.label2, lineHeight: 20 }]}>
          Your diary, your goals, and the photos you've taken of meals — stored in the EU, private to
          your account. Meal photos are resized on your phone before they're uploaded, which also
          removes the location tag cameras add.
        </Text>
        <Text style={[type.footnote, { color: palette.label2, lineHeight: 20 }]}>
          When you ask for a photo estimate, that photo is sent to Anthropic's Claude to be read.
          Nothing identifying goes with it, and Anthropic does not train on it. Barcode and weighed
          logging never send anything to Claude.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL("https://atewhatexactly.app/privacy")}
          accessibilityRole="link"
        >
          <Text style={[type.body, { color: palette.accent }]}>Read the privacy policy</Text>
        </Pressable>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.over }]}>Delete your account</Text>
        <Text style={[type.footnote, { color: palette.label2, lineHeight: 20 }]}>
          This removes your diary, your photos, your goals and any connection you've made to Claude,
          immediately and permanently. There's no undo, and we can't recover it afterwards.
        </Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder={`Type "${CONFIRM_WORD}" to confirm`}
          placeholderTextColor={palette.label2}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`Type ${CONFIRM_WORD} to confirm deleting your account`}
          style={[
            {
              ...type.body,
              color: palette.label,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: armed ? palette.over : palette.separator,
              borderRadius: radius.inner,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
            },
            cornerCurve,
          ]}
        />
        {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}
        <Pressable
          onPress={deleteAccount}
          disabled={!armed || busy}
          accessibilityRole="button"
          style={[
            {
              borderWidth: 1,
              borderColor: palette.over,
              paddingVertical: space.md,
              borderRadius: radius.inner,
              alignItems: "center",
              opacity: armed && !busy ? 1 : 0.4,
            },
            cornerCurve,
          ]}
        >
          <Text style={[type.headline, { color: palette.over }]}>
            {busy ? "Deleting…" : "Delete my account"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
