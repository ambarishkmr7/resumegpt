import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { BackHeader } from "../../src/components/ui/BackHeader";
import {
  Button,
  TextField,
  toast,
  ToastHost,
} from "../../src/components/ui";
import { color, space } from "../../src/theme";

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast.success("Password changed");
      setTimeout(() => router.back(), 800);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Change password" />
      <ScrollView
        contentContainerStyle={{ padding: space.xl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
        />
        <TextField
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
        />
        <TextField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={error}
        />
        <Button
          label="Update password"
          variant="cta"
          loading={busy}
          onPress={() => void submit()}
        />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
