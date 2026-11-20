import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { scanDocument } from 'expo-document-scanner';
import { recognizeText } from 'expo-ocr-kit';
import { fields, readContact } from './contact.mjs';

const storageKey = 'cardfolio.cards.v1';
const ink = '#162b25';
const muted = '#50645a';
const accent = '#174c3c';
const imageFile = card => new File(Paths.document, 'cardfolio-' + card.id + '.' + card.extension);
const titleFor = card => card.name || card.company || 'Untitled card';

function Button({ label, onPress, secondary, disabled }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.faded]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

function CardPhoto({ uri, compact = false }) {
  const [ratio, setRatio] = useState(1.65);
  useEffect(() => {
    if (compact) return;
    let active = true;
    Image.getSize(uri).then(({ width, height }) => {
      if (active && width && height) setRatio(Math.max(0.7, Math.min(3, width / height)));
    }).catch(() => {});
    return () => { active = false; };
  }, [uri, compact]);

  return <Image accessibilityLabel="Scanned business card" source={{ uri }}
    resizeMode={compact ? 'cover' : 'contain'}
    style={[styles.photo, compact ? styles.thumb : { width: '100%', aspectRatio: ratio }]} />;
}

function CardFolio() {
  const [cards, setCards] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const operation = useRef(false);

  async function load() {
    setLoadFailed(false);
    try {
      const data = await AsyncStorage.getItem(storageKey);
      const saved = data ? JSON.parse(data) : [];
      if (!Array.isArray(saved)) throw new Error('Invalid library');
      setCards(saved);
      setReady(true);
    } catch {
      setLoadFailed(true);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(message, action) {
    if (operation.current) return;
    operation.current = true;
    setBusy(message);
    try {
      await action();
    } finally {
      operation.current = false;
      setBusy('');
    }
  }

  function capture(mode) {
    return run('Preparing your scan…', async () => {
      try {
        let uri;
        if (mode === 'scan') {
          const result = await scanDocument({ quality: 1, maxNumDocuments: 1, scannerMode: 'base_with_filter' });
          uri = result.pages[0]?.uri;
        } else {
          const options = { mediaTypes: ['images'], quality: 1 };
          if (mode === 'camera') {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Camera access required', 'Allow camera access in your phone settings, or import a photo.');
              return;
            }
          }
          const result = mode === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
          if (!result.canceled) uri = result.assets[0]?.uri;
        }
        if (!uri) return;
        setBusy('Reading the card…');
        let text = '';
        let warning = '';
        try {
          text = (await recognizeText(uri)).text.trim();
          if (!text) warning = 'No text was detected. Enter the details or try a sharper photo.';
        } catch {
          warning = 'Text recognition was unavailable. You can still enter the details and save the image.';
        }
        setDraft({ uri, contact: readContact(text), warning });
      } catch (error) {
        if (/cancel/i.test(String(error))) return;
        if (mode === 'scan') {
          Alert.alert('Scanner unavailable', 'You can still photograph the card with your camera.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open camera', onPress: () => void capture('camera') },
          ]);
        } else {
          Alert.alert('Could not open the photo', 'Please try again.');
        }
      }
    });
  }

  function save() {
    if (!draft) return;
    return run('Saving your card…', async () => {
      const id = draft.id ?? randomUUID();
      const extension = draft.extension ?? (/\.(png|jpe?g|heic|heif|webp|gif|bmp|avif)(?:[?#]|$)/i.exec(draft.uri)?.[1].toLowerCase() || 'jpg');
      const destination = imageFile({ id, extension });
      try {
        if (!draft.id) new File(draft.uri).copy(destination);
        const contact = Object.fromEntries(Object.entries(draft.contact).map(([key, value]) => [key, value.trim()]));
        const card = { ...contact, id, extension };
        const next = draft.id ? cards.map(item => item.id === id ? card : item) : [card, ...cards];
        await AsyncStorage.setItem(storageKey, JSON.stringify(next));
        setCards(next);
        setDraft(null);
        setSelected(id);
      } catch {
        if (!draft.id) {
          try { if (destination.exists) destination.delete(); } catch {}
        }
        Alert.alert('Could not save the card', 'Your edits are still available. Please try again.');
      }
    });
  }

  function remove(card) {
    Alert.alert('Delete this card?', 'This removes the scan and contact from CardFolio.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run('Deleting card…', async () => {
        try {
          const next = cards.filter(item => item.id !== card.id);
          await AsyncStorage.setItem(storageKey, JSON.stringify(next));
          setCards(next);
          setSelected(null);
        } catch {
          Alert.alert('Could not delete the card', 'Please try again.');
          return;
        }
        try {
          const file = imageFile(card);
          if (file.exists) file.delete();
        } catch {
          Alert.alert('Card removed from the library', 'The scan file could not be removed from local storage.');
        }
      }) },
    ]);
  }

  const card = cards.find(item => item.id === selected);
  const matching = cards.filter(item => Object.keys(fields).some(key =>
    item[key]?.toLowerCase().includes(query.trim().toLowerCase())
  ));

  function openField(key, value) {
    const tel = value.replace(/[^+0-9]/g, '');
    const link = key === 'email' ? 'mailto:' + encodeURIComponent(value).replace(/%40/g, '@')
      : ['phone', 'mobile'].includes(key) ? 'tel:' + tel
      : /^https?:\/\//i.test(value) ? value : 'https://' + value;
    Linking.openURL(link).catch(() => Alert.alert('Could not open this contact detail'));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.mark}><Text style={styles.markText}>CF</Text></View>
            <Text style={styles.brand}>CardFolio</Text>
          </View>
          {busy ? <View accessibilityLiveRegion="polite" style={styles.busy}><ActivityIndicator color={accent} /><Text style={styles.muted}>{busy}</Text></View> : null}
          {!ready ? (
            loadFailed ? <><Text style={styles.heading}>Could not open your library</Text><Button label="Try again" onPress={load} /></>
              : <ActivityIndicator color={accent} />
          ) : draft ? (
            <>
              <Text style={styles.heading}>{draft.id ? 'Edit contact' : 'Review your scan'}</Text>
              <CardPhoto uri={draft.uri} />
              <Text style={styles.muted}>{draft.warning || 'Check small print, glare, and the contact details before saving.'}</Text>
              {Object.entries(fields).map(([key, label]) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.label}>{label}</Text>
                  <TextInput accessibilityLabel={label} style={styles.input} editable={!busy} value={draft.contact[key]}
                    autoCapitalize={key === 'email' || key === 'website' ? 'none' : 'sentences'}
                    keyboardType={key === 'email' ? 'email-address' : ['phone', 'mobile'].includes(key) ? 'phone-pad' : key === 'website' ? 'url' : 'default'}
                    multiline={key === 'notes'}
                    onChangeText={value => setDraft(current => ({ ...current, contact: { ...current.contact, [key]: value } }))} />
                </View>
              ))}
              <Button label="Save card" onPress={save} disabled={!!busy} />
              <Button label={draft.id ? 'Cancel' : 'Discard scan'} onPress={() => setDraft(null)} secondary disabled={!!busy} />
            </>
          ) : card ? (
            <>
              <Button label="Back to collection" onPress={() => setSelected(null)} secondary disabled={!!busy} />
              <Text style={styles.heading}>{titleFor(card)}</Text>
              <CardPhoto uri={imageFile(card).uri} />
              {Object.entries(fields).filter(([key]) => card[key]).map(([key, label]) => {
                const linked = ['email', 'phone', 'mobile', 'website'].includes(key);
                return (
                  <View key={key} style={styles.field}>
                    <Text style={styles.label}>{label}</Text>
                    <Text accessibilityRole={linked ? 'link' : undefined}
                      onPress={linked ? () => openField(key, card[key]) : undefined}
                      style={[styles.value, linked && styles.link]}>{card[key]}</Text>
                  </View>
                );
              })}
              <Button label="Edit details" onPress={() => setDraft({ id: card.id, extension: card.extension, uri: imageFile(card).uri, contact: Object.fromEntries(Object.keys(fields).map(key => [key, card[key] ?? ''])) })} disabled={!!busy} />
              <Button label="Delete card" onPress={() => remove(card)} secondary disabled={!!busy} />
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <Text style={styles.heading}>Your card collection</Text>
                <Text style={styles.muted}>Scan a business card and keep its original design alongside searchable contact details.</Text>
                <Button label="Scan a card" onPress={() => capture('scan')} disabled={!!busy} />
                <Button label="Import a photo" onPress={() => capture('import')} secondary disabled={!!busy} />
              </View>
              {cards.length > 0 ? (
                <>
                  <TextInput accessibilityLabel="Search cards" placeholder="Search cards" placeholderTextColor={muted}
                    style={styles.input} value={query} onChangeText={setQuery} returnKeyType="search" />
                  {matching.length === 0 ? <Text style={styles.muted}>No cards match your search.</Text> : null}
                  {matching.map(item => (
                    <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Open ' + titleFor(item)}
                      style={styles.row} onPress={() => setSelected(item.id)}>
                      <CardPhoto compact uri={imageFile(item).uri} />
                      <View style={styles.rowText}>
                        <Text style={styles.value}>{titleFor(item)}</Text>
                        <Text style={styles.muted}>{[item.name && item.company, item.title].filter(Boolean).join(' · ') || item.email}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : <Text style={styles.muted}>Saved cards will appear here.</Text>}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><CardFolio /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5ed' },
  content: { padding: 22, paddingBottom: 38, gap: 14, width: '100%', maxWidth: 670, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  mark: { backgroundColor: accent, borderRadius: 9, padding: 8 },
  markText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  brand: { color: ink, fontWeight: '800', fontSize: 23 },
  hero: { padding: 17, borderRadius: 19, gap: 11, backgroundColor: '#e6eee2' },
  heading: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: ink },
  muted: { fontSize: 15, lineHeight: 22, color: muted },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: accent, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: accent },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: 'transparent', borderColor: '#718879' },
  secondaryText: { color: accent },
  faded: { opacity: 0.55 },
  field: { gap: 5 },
  label: { fontSize: 14, color: muted, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#9eaea1', borderRadius: 10, padding: 12, fontSize: 16, color: ink, backgroundColor: '#fff' },
  photo: { borderRadius: 10, backgroundColor: '#e1e7dc' },
  thumb: { width: 72, height: 48 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderRadius: 12, backgroundColor: '#fff' },
  rowText: { flex: 1 },
  value: { fontSize: 17, color: ink, fontWeight: '700' },
  link: { color: accent, textDecorationLine: 'underline' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

