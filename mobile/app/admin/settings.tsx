import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Screen, SkeletonCard, TextField, toast } from "../../src/components/ui";
import { space, text } from "../../src/theme";

export default function AdminSettings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: api.adminSettings });

  const [trialSeconds, setTrialSeconds] = useState("");
  const [usdRate, setUsdRate] = useState("");
  const [hardCap, setHardCap] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setTrialSeconds(String(settings.data.free_trial_interview_seconds));
      setUsdRate(String(settings.data.usd_to_inr_rate));
      setHardCap(String(settings.data.interview_hard_cap_seconds));
    }
  }, [settings.data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateSettings({
        free_trial_interview_seconds: parseInt(trialSeconds, 10) || 0,
        usd_to_inr_rate: parseFloat(usdRate) || 0,
        interview_hard_cap_seconds: parseInt(hardCap, 10) || 0,
      });
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Settings" />
      <Screen scroll padded>
        <Text style={[text.caption, { marginBottom: space.lg }]}>
          These apply platform-wide, immediately, for every user.
        </Text>
        {settings.isLoading ? (
          <SkeletonCard lines={3} />
        ) : (
          <Card style={{ gap: space.md }}>
            <TextField
              label="Free trial interview seconds"
              value={trialSeconds}
              onChangeText={setTrialSeconds}
              keyboardType="numeric"
            />
            <TextField label="USD → INR rate" value={usdRate} onChangeText={setUsdRate} keyboardType="numeric" />
            <TextField
              label="Interview hard cap (seconds)"
              value={hardCap}
              onChangeText={setHardCap}
              keyboardType="numeric"
            />
            <Button label="Save settings" variant="cta" loading={saving} onPress={() => void save()} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
