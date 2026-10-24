import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  BadgeCheck,
  Ban,
  ShieldAlert,
  ShieldQuestion,
  Sparkles,
} from 'lucide-react-native';
import DetailSection from './DetailSection';
import StatusPill from './StatusPill';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';
import {formatDate, formatDateTime, humanize, parseDate} from '../utils/format';

const FLAG_META = {
  verified: {
    label: 'ID verified',
    bg: workhorse.successSurface,
    fg: workhorse.successInk,
    Icon: BadgeCheck,
  },
  unverified: {
    label: 'Unverified',
    bg: workhorse.neutralSurface,
    fg: workhorse.neutralInk,
    Icon: ShieldQuestion,
  },
  investigation: {
    label: 'Under investigation',
    bg: workhorse.dangerSurface,
    fg: workhorse.dangerDeep,
    Icon: ShieldAlert,
  },
  banned: {
    label: 'Banned',
    bg: workhorse.dangerSurface,
    fg: workhorse.dangerDeep,
    Icon: Ban,
  },
  reliable: {
    label: 'Highly reliable',
    bg: workhorse.infoSurface,
    fg: workhorse.info,
    Icon: Sparkles,
  },
};

const errorText = (error, userId) => {
  if (error?.status === 404) {
    return 'User not found — the account may have been deleted.';
  }
  if (!userId) {
    return 'No user linked.';
  }
  return `Couldn't load this user${error?.message ? `: ${error.message}` : '.'}`;
};

/**
 * Full admin view of one user (sender / traveler / reported user):
 * identity, contact, rating, verification, moderation state and ban history.
 *
 * @param {string} title         - section title, e.g. "Sender"
 * @param {object|null} user     - GET /v1/users/{id} (admin view)
 * @param {string} [userId]      - shown when the user couldn't be loaded
 * @param {string} [fallbackName] - e.g. match.senderName if lookup failed
 * @param {Error} [error]
 */
const PersonCard = ({title, user, userId, fallbackName, error}) => {
  if (!user) {
    return (
      <DetailSection
        title={title}
        hideEmpty
        fields={[
          {label: 'Name', value: fallbackName},
          {label: 'User ID', value: userId},
        ]}>
        <Text style={styles.errorText}>{errorText(error, userId)}</Text>
      </DetailSection>
    );
  }

  const banned = user.status === 'blocked' || (!!user.bannedAt && !user.unbannedAt);
  const flags = [
    user.verified ? 'verified' : 'unverified',
    user.underInvestigation && 'investigation',
    banned && 'banned',
    user.reliabilityBadge?.highlyReliable && 'reliable',
  ].filter(Boolean);

  const phone = [user.phoneExt, user.phone].filter(Boolean).join(' ').trim();
  const rating =
    Number(user.ratingCount) > 0
      ? `${Number(user.ratings || 0).toFixed(1)} ★  (${user.ratingCount})`
      : 'No ratings yet';
  const verification = user.verified
    ? [humanize(user.verificationMethod) || 'Verified', formatDate(user.verifiedAt)]
        .filter(Boolean)
        .join(' · ')
    : 'Not verified';
  const accountStatus = [humanize(user.status), humanize(user.statusReason)]
    .filter(Boolean)
    .join(' · ');

  const hasBanHistory = !!(user.bannedAt || user.banReason);
  const hasUnban = !!(user.unbannedAt || user.unbanReason);

  return (
    <DetailSection
      title={title}
      hideEmpty
      fields={[
        {label: 'Name', value: user.name || fallbackName, fullWidth: true},
        {label: 'Phone', value: phone},
        {label: 'Email', value: user.email},
        {label: 'Rating', value: rating},
        {label: 'Completed trips', value: user.completedTrips},
        {label: 'Identity', value: verification},
        {label: 'Photo verified', value: user.photoVerified ? 'Yes' : 'No'},
        {label: 'Account status', value: accountStatus},
        {label: 'Member since', value: formatDate(user.createdAt)},
        {label: 'User ID', value: user.id || userId, fullWidth: true},
      ]}>
      <View style={styles.flags}>
        {flags.map(flag => (
          <StatusPill key={flag} meta={FLAG_META[flag]} />
        ))}
      </View>

      {user.underInvestigation && (
        <View style={[styles.callout, styles.dangerCallout]}>
          <Text style={styles.calloutTitle}>Under investigation</Text>
          {!!parseDate(user.investigationHoldSetAt) && (
            <Text style={styles.calloutText}>
              Hold set {formatDateTime(user.investigationHoldSetAt)}
            </Text>
          )}
          {!!user.investigationCaseIds?.length && (
            <Text style={styles.calloutText} selectable>
              Case IDs: {user.investigationCaseIds.join(', ')}
            </Text>
          )}
        </View>
      )}

      {(hasBanHistory || hasUnban) && (
        <View style={[styles.callout, banned ? styles.dangerCallout : styles.neutralCallout]}>
          <Text style={styles.calloutTitle}>Ban history</Text>
          {hasBanHistory && (
            <Text style={styles.calloutText} selectable>
              Banned {formatDateTime(user.bannedAt) || '(date unknown)'}
              {user.banReason ? ` — ${user.banReason}` : ''}
              {user.bannedByAdminId ? `  (by ${user.bannedByAdminId})` : ''}
            </Text>
          )}
          {hasUnban && (
            <Text style={styles.calloutText} selectable>
              Unbanned {formatDateTime(user.unbannedAt) || '(date unknown)'}
              {user.unbanReason ? ` — ${user.unbanReason}` : ''}
              {user.unbannedByAdminId ? `  (by ${user.unbannedByAdminId})` : ''}
            </Text>
          )}
        </View>
      )}
    </DetailSection>
  );
};

const styles = StyleSheet.create({
  flags: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  callout: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 3,
  },
  dangerCallout: {backgroundColor: workhorse.dangerSurface},
  neutralCallout: {backgroundColor: workhorse.neutralSurface},
  calloutTitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: workhorse.ink,
  },
  calloutText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.inkSoft,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.dangerDeep,
  },
});

export default PersonCard;
