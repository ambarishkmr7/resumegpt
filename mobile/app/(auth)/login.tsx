import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import {
  googleSignInAvailable,
  signInWithGoogle,
} from "../../src/auth/googleSignIn";
import { useAuth } from "../../src/auth/store";
import { Button, TextField, toast } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

export default function Login() {
  const insets = useSafeAreaInsets();
  const setSession = useAuth((s) => s.setSession);
  const sessionExpired = useAuth((s) => s.sessionExpired);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"login" | "guest" | "google" | null>(null);

  const doLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError("");
    setBusy("login");
    try {
      const auth = await api.login(email.trim(), password);
      await setSession(auth);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doGuest = async () => {
    setBusy("guest");
    try {
      const auth = await api.guestRegister();
      await setSession(auth);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doGoogle = async () => {
    setBusy("google");
    try {
      const auth = await signInWithGoogle();
      await setSession(auth);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>resumesGPT</Text>
        <Text style={styles.tagline}>Your AI career copilot</Text>

        {sessionExpired ? (
          <View style={styles.expired}>
            <Text style={[text.caption, { color: color.warn }]}>
              Your session expired — please sign in again.
            </Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <TextField
            testID="login-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField
            testID="login-password"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            error={error}
          />
          <Link href="/(auth)/forgot-password" style={styles.forgot}>
            Forgot password?
          </Link>
          <Button
            testID="login-submit"
            label="Sign in"
            variant="cta"
            size="lg"
            loading={busy === "login"}
            disabled={busy !== null}
            onPress={() => void doLogin()}
          />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={text.caption}>or</Text>
          <View style={styles.divider} />
        </View>

        {googleSignInAvailable() ? (
          <Button
            label="Continue with Google"
            variant="ghost"
            icon={<Text style={{ fontSize: 16 }}>🔵</Text>}
            loading={busy === "google"}
            disabled={busy !== null}
            onPress={() => void doGoogle()}
          />
        ) : null}
        <Button
          testID="login-guest"
          label="Continue as guest"
          variant="secondary"
          loading={busy === "guest"}
          disabled={busy !== null}
          onPress={() => void doGuest()}
        />

        <View style={styles.footer}>
          <Text style={text.body}>New here? </Text>
          <Link href="/(auth)/register" style={styles.link} testID="login-to-register">
            Create a free account
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, gap: space.md },
  brand: {
    fontFamily: fontFamily.displayBold,
    fontSize: 34,
    color: color.primary,
    textAlign: "center",
  },
  tagline: {
    ...text.caption,
    textAlign: "center",
    marginBottom: space.xl,
    fontSize: 14,
  },
  expired: {
    backgroundColor: color.warnSoft,
    borderRadius: 10,
    padding: space.md,
    alignItems: "center",
  },
  form: { gap: space.md },
  forgot: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13.5,
    color: color.primary,
    alignSelf: "flex-end",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.sm,
  },
  divider: { flex: 1, height: 1, backgroundColor: color.line },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: space.lg,
  },
  link: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: color.primary,
  },
});
