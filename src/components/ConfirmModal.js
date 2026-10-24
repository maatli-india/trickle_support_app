import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import fonts from '../constants/fonts';
import { workhorse } from '../constants/colors';

const displayMessage = (value) => typeof value === 'string' ? value.replace(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}):\d{2}/g, '$1') : value;

const ConfirmModal = ({ visible, title, message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, destructive = false, singleAction = false }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <View style={[styles.accent, destructive && styles.accentDestructive]} />
        <Text style={styles.eyebrow}>TRICKLE</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{displayMessage(message)}</Text>
        <View style={[styles.actions, singleAction && styles.singleAction]}>
          {!singleAction && <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>}
          <Pressable onPress={onConfirm} style={({ pressed }) => [styles.confirmButton, singleAction && styles.singleConfirmButton, destructive && styles.confirmDestructive, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[styles.confirmText, destructive && styles.confirmDestructiveText]}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16, 24, 40, 0.45)' },
  modal: { width: '100%', maxWidth: 370, maxHeight: '90%', overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: workhorse.border, backgroundColor: workhorse.surface, padding: 22 },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: workhorse.warning },
  accentDestructive: { backgroundColor: workhorse.danger },
  eyebrow: { fontFamily: fonts.mansfield, fontSize: 9, letterSpacing: 1.6, color: workhorse.danger },
  title: { fontFamily: fonts.display, fontSize: 25, color: workhorse.ink, marginTop: 8 },
  message: { fontFamily: fonts.mansfield, fontSize: 14, lineHeight: 21, color: workhorse.inkSoft, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  singleAction: { flexDirection: 'column' },
  cancelButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: workhorse.border },
  cancelText: { fontFamily: fonts.mansfield, fontSize: 13, color: workhorse.ink },
  confirmButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: workhorse.warning },
  singleConfirmButton: { flex: 0, width: '100%' },
  confirmDestructive: { backgroundColor: workhorse.danger },
  confirmText: { fontFamily: fonts.mansfield, fontSize: 13, color: workhorse.ink },
  confirmDestructiveText: { color: workhorse.surface },
  pressed: { opacity: 0.68 },
});

export default ConfirmModal;
