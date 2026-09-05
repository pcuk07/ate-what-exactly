import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../supabase";
import { space } from "../theme";

/**
 * Sign in with Apple (design doc §10.4).
 *
 * Apple's own component is used rather than a lookalike: guideline 4.8 and the
 * Human Interface Guidelines both expect the system button, and it handles
 * localisation and the dark/light variants for free.
 *
 * The identity token goes to Supabase, which verifies it with Apple. The app
 * never sees a password and never holds a long-lived Apple credential.
 */
export function AppleSignInButton({
  dark,
  onError,
}: {
  dark: boolean;
  onError: (message: string) => void;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  if (!available) return null;

  return (
    <View style={{ marginBottom: space.sm }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          dark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={{ width: "100%", height: 48 }}
        onPress={async () => {
          try {
            const credential = await AppleAuthentication.signInAsync({
              requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
            });
            if (!credential.identityToken) {
              onError("Apple didn't return a sign-in token. Try the email code instead.");
              return;
            }
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "apple",
              token: credential.identityToken,
            });
            if (error) onError(error.message);
          } catch (err) {
            // Cancelling is a normal outcome, not a failure worth reporting.
            const code = (err as { code?: string }).code;
            if (code === "ERR_REQUEST_CANCELED") return;
            onError("Apple sign-in didn't complete. Try the email code instead.");
          }
        }}
      />
    </View>
  );
}
