import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { apiFetch } from "../lib/api";

const PALETTE = {
  blueDark: "#053F7C",
  blue: "#0061A8",
  gold: "#FFC727",
  white: "#FFFFFF",
  textDark: "#001B33",
  subtext: "#4B5563",
};

const DRAFT_LABEL = "Draft outline — edit before you use it";
const WEAK_OVERLAP =
  "We found little connection between your résumé and this program's faculty or courses. The draft will leave those parts for you to write.";

export default function StatementScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const schoolId = route.params?.schoolId;
  const schoolName = route.params?.schoolName ?? "This school";
  const programName = route.params?.programName ?? "";

  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [pastedPrompt, setPastedPrompt] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [draft, setDraft] = useState("");
  const [report, setReport] = useState(null);
  const [removedIds, setRemovedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (schoolId == null) {
        setLoadError("Open this screen from a matched or saved school.");
        return;
      }
      setStatus(null);
      setLoadError("");
      try {
        const res = await apiFetch("/api/sop/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schoolId }),
        });
        if (!res.ok) {
          if (!cancelled) setLoadError("We couldn't check this program's statement requirement.");
          return;
        }
        const body = await res.json();
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) setLoadError("We couldn't check this program's statement requirement.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [schoolId, reloadKey]);

  const noStatement = status?.sopRequired === false;
  const unverified = status && status.sopRequired == null;
  const canRetry =
    schoolId != null &&
    (Boolean(loadError) || status?.pageStatus === "error" || status?.pageStatus === "unavailable");

  async function uploadFile() {
    setActionError("");
    let DocumentPicker;
    try {
      DocumentPicker = await import("expo-document-picker");
    } catch {
      setActionError("File upload is unavailable here. Paste the resume text instead.");
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/plain"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const form = new FormData();
    form.append("schoolId", String(schoolId));
    if (asset.file) {
      form.append("file", asset.file, asset.name || "resume");
    } else {
      form.append("file", {
        uri: asset.uri,
        name: asset.name || "resume",
        type: asset.mimeType || "application/octet-stream",
      });
    }
    const res = await apiFetch("/api/sop/resume", { method: "POST", body: form });
    if (!res.ok) {
      setActionError("That resume could not be stored. Paste the text instead.");
      return;
    }
    setFileName(asset.name || "Resume uploaded");
  }

  async function storePastedResume() {
    if (!resumeText.trim()) return true;
    const resumeRes = await apiFetch("/api/sop/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, text: resumeText.trim() }),
    });
    if (!resumeRes.ok) {
      setActionError("The resume text could not be stored.");
      return false;
    }
    return true;
  }

  function togglePair(pairId) {
    setRemovedIds((current) =>
      current.includes(pairId) ? current.filter((id) => id !== pairId) : [...current, pairId],
    );
  }

  async function onFindMatches() {
    setActionError("");
    setMatching(true);
    try {
      if (!(await storePastedResume())) return;
      const res = await apiFetch("/api/sop/overlap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId }),
      });
      if (!res.ok) {
        setActionError("Matches could not be loaded right now.");
        return;
      }
      const body = await res.json();
      setReport(body);
      setRemovedIds([]);
    } catch {
      setActionError("Matches could not be loaded right now.");
    } finally {
      setMatching(false);
    }
  }

  async function onDraft() {
    setActionError("");
    setBusy(true);
    try {
      if (!(await storePastedResume())) return;
      const payload = {
        schoolId,
        mode: noStatement ? "motivation" : "opening",
        pastedPrompt: pastedPrompt.trim(),
      };
      if (report) {
        payload.pairIds = (report.pairs ?? [])
          .filter((pair) => !removedIds.includes(pair.pairId))
          .map((pair) => pair.pairId);
      }
      const res = await apiFetch("/api/sop/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setActionError("A draft could not be written right now.");
        return;
      }
      const body = await res.json();
      setDraft(body.paragraph || "");
    } catch {
      setActionError("A draft could not be written right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back">
        <Text style={s.back}>Back</Text>
      </Pressable>
      <Text style={s.title}>{schoolName}</Text>
      {programName ? <Text style={s.sub}>{programName}</Text> : null}

      {!status && !loadError ? <ActivityIndicator color={PALETTE.blue} /> : null}
      {loadError ? <Text style={s.error}>{loadError}</Text> : null}

      {noStatement ? (
        <Text style={s.banner}>No statement required</Text>
      ) : null}
      {unverified ? (
        <Text style={s.note}>
          Whether this program asks for a statement is not verified from a public page.
        </Text>
      ) : null}
      {status?.message ? <Text style={s.note}>{status.message}</Text> : null}
      {typeof status?.verifiedAsOf === "string" && status.verifiedAsOf !== "" ? (
        <Text style={s.note}>{`Verified as of ${status.verifiedAsOf}`}</Text>
      ) : null}
      {canRetry ? (
        <Pressable
          style={s.secondary}
          onPress={() => setReloadKey((key) => key + 1)}
          accessibilityLabel="Try again"
        >
          <Text style={s.secondaryText}>Try again</Text>
        </Pressable>
      ) : null}

      {status ? (
        <View>
          {noStatement ? (
            <Text style={s.note}>
              You can still draft an optional motivation paragraph. It is an outline to edit, not an essay to submit.
            </Text>
          ) : (
            <Text style={s.note}>
              Upload a resume and, if the application prompt is behind a login, paste that prompt. The draft is a full statement you can edit.
            </Text>
          )}

          <Pressable style={s.secondary} onPress={uploadFile} accessibilityLabel="Upload resume">
            <Text style={s.secondaryText}>{fileName || "Upload resume"}</Text>
          </Pressable>

          <Text style={s.label}>Or paste resume text</Text>
          <TextInput
            value={resumeText}
            onChangeText={setResumeText}
            multiline
            placeholder="Projects, courses, or jobs"
            style={s.input}
            accessibilityLabel="Resume text"
          />

          {noStatement ? null : (
            <>
              <Text style={s.label}>Pasted prompt (optional)</Text>
              <TextInput
                value={pastedPrompt}
                onChangeText={setPastedPrompt}
                multiline
                placeholder="Only if you copied it from the application"
                style={s.input}
                accessibilityLabel="Pasted prompt"
              />
            </>
          )}

          <Pressable
            style={s.secondary}
            onPress={onFindMatches}
            disabled={busy || matching}
            accessibilityLabel="Find matches"
          >
            <Text style={s.secondaryText}>Find matches</Text>
          </Pressable>
          {report?.weak ? <Text style={s.note}>{WEAK_OVERLAP}</Text> : null}
          {report?.pairs?.map((pair) => {
            const removed = removedIds.includes(pair.pairId);
            return (
              <View key={pair.pairId} style={s.matchCard}>
                <Text style={s.matchName}>{pair.factName}</Text>
                <Text style={s.note}>{pair.resumeText}</Text>
                <Text
                  style={s.link}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(pair.sourceUrl)}
                >
                  {pair.sourceUrl}
                </Text>
                <Pressable
                  style={s.secondary}
                  onPress={() => togglePair(pair.pairId)}
                  accessibilityLabel={`${removed ? "Restore" : "Remove"} ${pair.factName}`}
                >
                  <Text style={s.secondaryText}>{removed ? "Restore" : "Remove"}</Text>
                </Pressable>
              </View>
            );
          })}

          <Pressable style={s.primary} onPress={onDraft} disabled={busy || matching}>
            <Text style={s.primaryText}>
              {busy ? "Drafting..." : noStatement ? "Draft optional motivation" : "Draft full statement"}
            </Text>
          </Pressable>
          {actionError ? <Text style={s.error}>{actionError}</Text> : null}

          {draft ? (
            <View style={s.draftCard}>
              <Text style={s.draftLabel}>{DRAFT_LABEL}</Text>
              <Text style={s.draftBody} selectable>
                {draft}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.white },
  content: { padding: 20, paddingBottom: 48 },
  back: { color: PALETTE.blue, fontWeight: "700", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", color: PALETTE.blueDark },
  sub: { marginTop: 4, color: PALETTE.subtext, marginBottom: 12 },
  banner: {
    marginTop: 12,
    backgroundColor: "#E8F6EE",
    color: "#0B6B3A",
    fontWeight: "800",
    padding: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  note: { marginTop: 10, color: PALETTE.textDark, lineHeight: 20 },
  label: { marginTop: 16, fontWeight: "700", color: PALETTE.blueDark },
  input: {
    marginTop: 8,
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#DCE8F2",
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
  },
  secondary: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: "#E6F8FF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { color: PALETTE.blueDark, fontWeight: "700" },
  primary: {
    marginTop: 16,
    backgroundColor: PALETTE.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: PALETTE.white, fontWeight: "800" },
  error: { marginTop: 12, color: "#B00020", fontWeight: "600" },
  draftCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: PALETTE.gold,
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 14,
  },
  draftLabel: { fontWeight: "800", color: PALETTE.blueDark, marginBottom: 8 },
  draftBody: { color: PALETTE.textDark, lineHeight: 22 },
  matchCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#DCE8F2",
    borderRadius: 12,
    padding: 12,
  },
  matchName: { fontWeight: "800", color: PALETTE.blueDark },
  link: { marginTop: 6, color: PALETTE.blue, fontWeight: "700" },
});
