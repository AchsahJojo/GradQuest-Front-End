import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Linking,
  Image,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSavedApps } from "../context/SavedAppsContext";
import UnsaveConfirmModal from "../components/UnsaveConfirmModal";

const PALETTE = {
  blueDark: "#053F7C",
  blue: "#0061A8",
  gold: "#FFC727",
  white: "#FFFFFF",
  textDark: "#001B33",
  subtext: "#4B5563",
};

export default function SavedApplicationsScreen() {
  const navigation = useNavigation<any>();
  const { savedApps, removeSchool, reloadSaved } = useSavedApps();
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [unsaveTarget, setUnsaveTarget] = React.useState<{
    id: number;
    name: string;
  } | null>(null);
  const [unsaveBusy, setUnsaveBusy] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      reloadSaved();
    }, [reloadSaved])
  );

  const requestRemove = (item: { id: number; name: string }) => {
    setRemoveError(null);
    setUnsaveTarget({ id: item.id, name: item.name });
  };

  const confirmUnsave = async () => {
    if (!unsaveTarget) return;
    setUnsaveBusy(true);
    setRemoveError(null);
    try {
      if (!(await removeSchool(unsaveTarget.id))) {
        setRemoveError("We couldn't remove that school. Please try again.");
      }
      setUnsaveTarget(null);
    } finally {
      setUnsaveBusy(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{item.name}</Text>
        <Text style={s.cardSub}>{item.company}</Text>
      </View>

      {item.link ? (
        <Pressable style={s.visitBtn} onPress={() => Linking.openURL(item.link)}>
          <Text style={s.visitBtnText}>Visit</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={s.statementBtn}
        onPress={() =>
          navigation.navigate("Statement", {
            schoolId: item.id,
            schoolName: item.name,
            programName: item.company,
          })
        }
        accessibilityLabel={`Draft statement for ${item.name}`}
      >
        <Text style={s.statementBtnText}>Statement</Text>
      </Pressable>

      <Pressable
        style={s.removeBtn}
        onPress={() => requestRemove(item)}
        accessibilityLabel={`Remove ${item.name}`}
      >
        <Text style={s.removeBtnText}>Remove</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.headerTitle}>Saved Apps</Text>
        <Image
          source={require("../../assets/gradquest_logo.png")}
          style={s.logo}
        />
      </View>
      <View style={s.headerAccent} />

      {removeError ? (
        <Text style={s.errorText} accessibilityRole="alert">
          {removeError}
        </Text>
      ) : null}

      {savedApps.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyTitle}>No Saved Applications</Text>
          <Text style={s.emptySubtitle}>Tap “Save” on any college to track it here.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
          data={savedApps}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
        />
      )}

      <UnsaveConfirmModal
        visible={!!unsaveTarget}
        schoolName={unsaveTarget?.name}
        onCancel={() => !unsaveBusy && setUnsaveTarget(null)}
        onConfirm={confirmUnsave}
        busy={unsaveBusy}
      />
    </View>
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
  logo: {
    width: 52,
    height: 52,
    resizeMode: "contain",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: PALETTE.blueDark,
  },
  errorText: {
    color: "#B00020",
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: PALETTE.textDark,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: PALETTE.subtext,
    textAlign: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: PALETTE.white,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE8F2",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: PALETTE.textDark,
  },
  cardSub: {
    color: PALETTE.subtext,
    marginTop: 3,
  },
  visitBtn: {
    backgroundColor: PALETTE.blue,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  visitBtnText: {
    color: PALETTE.white,
    fontWeight: "700",
  },
  statementBtn: {
    backgroundColor: "#FFF8E1",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  statementBtnText: {
    color: PALETTE.blueDark,
    fontWeight: "700",
  },
  removeBtn: {
    backgroundColor: "#FFE8E8",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  removeBtnText: {
    fontWeight: "700",
  },
});
