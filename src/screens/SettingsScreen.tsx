import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { isDeliverableEmail, isSyntheticEmail, looksLikeEmail } from "../lib/email";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PALETTE = {
  blueDark: "#053F7C",
  blue: "#0061A8",
  gold: "#FFC727",
  white: "#FFFFFF",
  textDark: "#001B33",
  subtext: "#4B5563",
  danger: "#B00020",
  cardBorder: "#DCE8F2",
};

type AnyObj = Record<string, unknown>;
const TUTORIAL_KEY = "tutorial:completed";

function first<T>(...args: T[]) {
  for (const a of args) if (a !== undefined && a !== null && a !== "") return a as T;
  return "" as unknown as T;
}

function pickAvatar(me?: AnyObj) {
  if (!me) return "";
  const flat = first<string>(
    me["avatarUrl"] as any,
    me["avatar_url"] as any,
    me["picture"] as any,
    me["avatar"] as any
  );
  if (flat) return flat;
  if (me["github"] && typeof me["github"] === "object") {
    const gh = me["github"] as AnyObj;
    return first<string>(gh["avatarUrl"] as any, gh["avatar_url"] as any);
  }
  return "";
}

function pickUsername(me?: AnyObj) {
  if (!me) return "";

  const flat = first<string>(
    me["name"] as any,
    me["login"] as any,
    me["username"] as any,
    me["githubUsername"] as any
  );
  if (flat) return flat;

  if (me["github"] && typeof me["github"] === "object") {
    const gh = me["github"] as AnyObj;
    if (typeof gh["login"] === "string") {
      return gh["login"] as string;
    }
  }

  return first<string>(me["email"] as any, "Unknown User");
}

function pickEmail(me?: AnyObj | null) {
  if (!me) return "";
  const email = me["email"];
  return typeof email === "string" ? email : "";
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const route = useRoute() as any;

  const { me: authMe, refresh, logout, setMe } = useAuth();
  const me = authMe as AnyObj | null;
  const [busy, setBusy] = React.useState(false);
  const [tutorialGate, setTutorialGate] = React.useState(false);

  const fromTutorial = !!(route?.params && (route.params as any).tutorialMode);
  const promptEmail = !!(route?.params && (route.params as any).promptEmail);

  const currentEmail = pickEmail(me);
  const needsRealEmail =
    !!me?.authenticated && !isDeliverableEmail(currentEmail, me as any);

  const [emailDraft, setEmailDraft] = React.useState("");
  const [editingEmail, setEditingEmail] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [emailSavedNote, setEmailSavedNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (needsRealEmail || promptEmail) {
      setEditingEmail(true);
      setEmailDraft("");
    } else {
      setEditingEmail(false);
    }
  }, [needsRealEmail, promptEmail, currentEmail]);

  const load = React.useCallback(async () => {
    await refresh();
  }, [refresh]);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return;
    }, [load])
  );

  React.useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem(TUTORIAL_KEY);
      const done = v === "1";
      setTutorialGate(fromTutorial && !done);
    })();
  }, [fromTutorial]);

  const onLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
      (navigation as any).reset({
        index: 0,
        routes: [{ name: "Home" as never }],
      } as any);
    }
  };

  const onAdjustPreferences = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_KEY, "1");
    } catch {}
    setTutorialGate(false);
    (navigation as any).navigate("ProfileIntake" as never);
  };

  const onSaveEmail = async () => {
    setEmailError(null);
    setEmailSavedNote(null);
    const next = emailDraft.trim();
    if (!looksLikeEmail(next)) {
      setEmailError("Enter a real email address (not a noreply address).");
      return;
    }
    setEmailBusy(true);
    try {
      // Planned contract: PATCH /api/me { email }. BE may not be merged yet.
      const res = await apiFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 404 || res.status === 405) {
          setEmailError(
            "Saving email isn’t available on the server yet. Try again after the Back-End update."
          );
        } else {
          setEmailError(text || "We couldn’t save that email. Please try again.");
        }
        return;
      }
      let data: AnyObj | null = null;
      try {
        data = await res.json();
      } catch {}
      if (data && typeof data === "object") {
        setMe({ ...(me || {}), ...data, email: (data.email as string) || next });
      } else {
        setMe({ ...(me || {}), email: next, emailDeliverable: true });
      }
      await refresh();
      setEditingEmail(false);
      setEmailSavedNote("Email saved. Deadline reminders can go to this address.");
    } catch {
      setEmailError("We couldn’t save that email. Please try again.");
    } finally {
      setEmailBusy(false);
    }
  };

  const avatarSrc =
    pickAvatar(me || {}) ||
    "https://ui-avatars.com/api/?name=U&background=EEE&color=7C7C7C";

  const username = me ? pickUsername(me) || "Unknown User" : "Loading…";
  const showEmailSection = !!me?.authenticated;
  const showEmailForm = editingEmail || needsRealEmail || promptEmail;

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.headerTitle}>Settings</Text>
        <Image
          source={require("../../assets/gradquest_logo.png")}
          style={s.logo}
        />
      </View>

      <View style={s.headerAccent} />

      <View style={s.card}>
        <View style={s.profileRow}>
          <Image source={{ uri: avatarSrc }} style={s.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={s.username}>{username}</Text>
            <Text style={s.subtext}>Signed in</Text>
          </View>
        </View>

        {showEmailSection ? (
          <View style={s.emailBlock}>
            <Text style={s.sectionLabel}>Email for deadline reminders</Text>
            {needsRealEmail || promptEmail ? (
              <Text style={s.emailHint} accessibilityRole="alert">
                Add a real email so GradQuest can send deadline reminders. OAuth
                noreply addresses can’t receive mail.
              </Text>
            ) : (
              <Text style={s.emailHint}>
                Saving a school turns on deadline reminder emails to this address
                (about 2 weeks before the deadline).
              </Text>
            )}
            {currentEmail ? (
              <Text
                style={needsRealEmail ? s.emailSynthetic : s.emailCurrent}
                accessibilityLabel={`Email ${currentEmail}`}
              >
                {needsRealEmail
                  ? `Current: ${currentEmail} (can’t receive mail)`
                  : currentEmail}
              </Text>
            ) : (
              <Text style={s.emailSynthetic}>No email on file</Text>
            )}

            {showEmailForm ? (
              <>
                <TextInput
                  style={s.emailInput}
                  value={emailDraft}
                  onChangeText={setEmailDraft}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  accessibilityLabel="Email address"
                  editable={!emailBusy}
                />
                <Pressable
                  style={[s.primaryButton, emailBusy && { opacity: 0.7 }]}
                  onPress={onSaveEmail}
                  disabled={emailBusy}
                  accessibilityLabel="Save email"
                >
                  {emailBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.primaryButtonText}>Save email</Text>
                  )}
                </Pressable>
                {!needsRealEmail && !promptEmail ? (
                  <Pressable
                    onPress={() => {
                      setEditingEmail(false);
                      setEmailError(null);
                    }}
                    accessibilityLabel="Cancel email edit"
                  >
                    <Text style={s.changeLink}>Cancel</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setEmailDraft(currentEmail);
                  setEditingEmail(true);
                  setEmailError(null);
                  setEmailSavedNote(null);
                }}
                accessibilityLabel="Change email"
              >
                <Text style={s.changeLink}>Change email</Text>
              </Pressable>
            )}

            {emailError ? (
              <Text style={s.emailError} accessibilityRole="alert">
                {emailError}
              </Text>
            ) : null}
            {emailSavedNote ? (
              <Text style={s.emailOk}>{emailSavedNote}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.buttonColumn}>
          <Pressable style={s.primaryButton} onPress={onAdjustPreferences}>
            <Text style={s.primaryButtonText}>Adjust Preferences</Text>
          </Pressable>

          <Pressable style={s.logoutButton} onPress={onLogout} disabled={busy}>
            <Text style={s.logoutText}>{busy ? "Logging out..." : "Log out"}</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={tutorialGate} transparent animationType="fade">
        <View style={s.gateOverlay}>
          <View style={s.gateCard}>
            <Text style={s.gateTitle}>Finish setup</Text>
            <Text style={s.gateBody}>
              Press{" "}
              <Text style={{ fontWeight: "800" }}>Adjust Preferences</Text> to complete setup.
            </Text>
            <Pressable style={s.primaryButton} onPress={onAdjustPreferences}>
              <Text style={s.primaryButtonText}>Adjust Preferences</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PALETTE.white,
  },

  header: {
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: PALETTE.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerAccent: {
    height: 4,
    backgroundColor: PALETTE.gold,
    width: "100%",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: PALETTE.blueDark,
  },
  logo: {
    width: 52,
    height: 52,
    resizeMode: "contain",
  },

  card: {
    backgroundColor: PALETTE.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    padding: 20,
    margin: 16,
  },

  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eee",
    marginRight: 12,
  },

  username: { fontSize: 20, fontWeight: "800", color: PALETTE.textDark },
  subtext: { marginTop: 2, color: PALETTE.subtext },

  emailBlock: {
    marginBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: PALETTE.cardBorder,
  },
  sectionLabel: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "800",
    color: PALETTE.textDark,
  },
  emailHint: {
    marginTop: 6,
    color: PALETTE.subtext,
    lineHeight: 20,
  },
  emailCurrent: {
    marginTop: 8,
    fontWeight: "700",
    color: PALETTE.blueDark,
  },
  emailSynthetic: {
    marginTop: 8,
    color: PALETTE.subtext,
    fontStyle: "italic",
  },
  emailInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: PALETTE.textDark,
  },
  changeLink: {
    marginTop: 10,
    color: PALETTE.blue,
    fontWeight: "700",
  },
  emailError: {
    marginTop: 8,
    color: PALETTE.danger,
    fontWeight: "600",
  },
  emailOk: {
    marginTop: 8,
    color: "#047857",
    fontWeight: "600",
  },

  buttonColumn: {
    marginTop: 10,
    flexDirection: "column",
    gap: 12,
  },

  primaryButton: {
    backgroundColor: PALETTE.blue,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  logoutButton: {
    backgroundColor: "#FFF5F5",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutText: {
    color: PALETTE.danger,
    fontWeight: "700",
    fontSize: 16,
  },

  gateOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  gateCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: PALETTE.textDark,
    marginBottom: 8,
  },
  gateBody: { color: PALETTE.subtext, marginBottom: 16 },
});
