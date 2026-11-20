import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";

const PALETTE = {
  textDark: "#001B33",
  subtext: "#4B5563",
  blue: "#0061A8",
  danger: "#B00020",
};

/**
 * Confirm before unsaving a school (cancels deadline reminder emails).
 * Copy locked in email-deadline-reminders plan.
 */
export default function UnsaveConfirmModal({
  visible,
  schoolName,
  onConfirm,
  onCancel,
  busy = false,
}) {
  const name = schoolName?.trim() ? schoolName.trim() : "this school";
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.overlay}>
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.title}>Unsave {name}?</Text>
          <Text style={s.body}>
            You won’t get deadline reminder emails for this school anymore.
          </Text>
          <View style={s.row}>
            <Pressable
              style={s.cancelBtn}
              onPress={onCancel}
              disabled={busy}
              accessibilityLabel="Cancel unsave"
            >
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={s.confirmBtn}
              onPress={onConfirm}
              disabled={busy}
              accessibilityLabel={`Confirm unsave ${name}`}
            >
              <Text style={s.confirmText}>{busy ? "Removing…" : "Unsave"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: PALETTE.textDark,
    marginBottom: 8,
  },
  body: {
    color: PALETTE.subtext,
    marginBottom: 16,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  cancelText: {
    fontWeight: "700",
    color: PALETTE.textDark,
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FFE8E8",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  confirmText: {
    fontWeight: "700",
    color: PALETTE.danger,
  },
});
