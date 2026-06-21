import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import Constants from 'expo-constants';

const CUSTOMER_TAG = 'Dolce Sicilia Customer Base';
const CUSTOMER_ORG = 'Dolce Sicilia';

// On a physical device, replace with your computer's LAN IP, e.g. http://192.168.1.10:3001
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3001';

interface ExtractedContact {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
  previewUri?: string;
}

export default function App() {
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to select screenshots.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    setLoading(true);
    setStatus('Uploading and scanning images...');
    const uris = result.assets.map((a) => a.uri);
    setPreviews((prev) => [...prev, ...uris]);

    try {
      const formData = new FormData();
      for (const asset of result.assets) {
        const filename = asset.uri.split('/').pop() || 'screenshot.jpg';
        formData.append('images', {
          uri: asset.uri,
          name: filename,
          type: 'image/jpeg',
        } as unknown as Blob);
      }

      const res = await fetch(`${API_URL}/api/ocr`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('OCR request failed');

      const data = await res.json();
      const newContacts: ExtractedContact[] = (data.contacts || []).map(
        (c: { id: string; name: string; phone: string }) => ({
          ...c,
          selected: true,
          previewUri: uris[0],
        })
      );

      setContacts((prev) => {
        const seen = new Set(prev.map((c) => c.phone));
        const merged = [...prev];
        for (const c of newContacts) {
          if (!seen.has(c.phone)) {
            seen.add(c.phone);
            merged.push(c);
          }
        }
        return merged;
      });

      setStatus(`Found ${newContacts.length} contact(s). Review and save to your phone.`);
    } catch {
      setStatus('Could not reach API. Start the server and set your LAN IP in app.json extra.apiUrl.');
      Alert.alert(
        'Server unreachable',
        `Make sure the API is running at ${API_URL}. On a real phone, use your computer's local IP instead of localhost.`
      );
    } finally {
      setLoading(false);
    }
  };

  const updateContact = (id: string, field: 'name' | 'phone', value: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const toggleSelect = (id: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  const saveToPhoneContacts = async () => {
    const selected = contacts.filter((c) => c.selected);
    if (selected.length === 0) {
      Alert.alert('No contacts', 'Select at least one contact to save.');
      return;
    }

    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow contacts access to save customers.');
      return;
    }

    let saved = 0;
    for (const contact of selected) {
      try {
        await Contacts.addContactAsync({
          contactType: Contacts.ContactTypes.Person,
          name: contact.name,
          firstName: contact.name.split(' ')[0] || contact.name,
          lastName: contact.name.split(' ').slice(1).join(' ') || '',
          company: CUSTOMER_ORG,
          note: CUSTOMER_TAG,
          phoneNumbers: [
            {
              label: 'mobile',
              number: contact.phone,
            },
          ],
        });
        saved++;
      } catch {
        // skip duplicates or invalid entries
      }
    }

    try {
      await fetch(`${API_URL}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: selected }),
      });
    } catch {
      // phone save succeeded even if API sync fails
    }

    setContacts((prev) => prev.filter((c) => !c.selected));
    setStatus(`Saved ${saved} contact(s) to your phone with tag "${CUSTOMER_TAG}".`);
    Alert.alert('Done', `Saved ${saved} contact(s) to your contact list.`);
  };

  const selectedCount = contacts.filter((c) => c.selected).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.brand}>Dolce Sicilia</Text>
          <Text style={styles.title}>Customer Import</Text>
          <Text style={styles.subtitle}>
            Select screenshots from your camera roll. OCR extracts names and phone numbers, then saves them tagged as{' '}
            {CUSTOMER_TAG}.
          </Text>
        </View>

        <Pressable style={styles.primaryBtn} onPress={pickImages} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Select from Camera Roll</Text>
          )}
        </Pressable>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {previews.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
            {previews.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.preview} />
            ))}
          </ScrollView>
        )}

        {contacts.length > 0 && (
          <>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>Review ({selectedCount} selected)</Text>
              <Pressable
                style={[styles.saveBtn, selectedCount === 0 && styles.disabled]}
                onPress={saveToPhoneContacts}
                disabled={selectedCount === 0}
              >
                <Text style={styles.saveBtnText}>Save to Contacts</Text>
              </Pressable>
            </View>

            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={[styles.card, item.selected && styles.cardSelected]}>
                  <Pressable onPress={() => toggleSelect(item.id)} style={styles.checkbox}>
                    <Text style={styles.checkboxText}>{item.selected ? '☑' : '☐'}</Text>
                  </Pressable>
                  <View style={styles.cardFields}>
                    <TextInput
                      style={styles.input}
                      value={item.name}
                      onChangeText={(v) => updateContact(item.id, 'name', v)}
                      placeholder="Name"
                    />
                    <TextInput
                      style={styles.input}
                      value={item.phone}
                      onChangeText={(v) => updateContact(item.id, 'phone', v)}
                      placeholder="Phone"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              )}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFCF0' },
  scroll: { padding: 20, paddingBottom: 40 },
  header: {
    backgroundColor: '#004080',
    marginHorizontal: -20,
    marginTop: -20,
    padding: 24,
    marginBottom: 24,
  },
  brand: { color: '#99CEF2', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '600', marginTop: 4 },
  subtitle: { color: '#E6F4FC', fontSize: 14, marginTop: 8, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: '#005FBF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  status: { marginTop: 16, color: '#3D3D3D', fontSize: 14 },
  previewRow: { marginTop: 16 },
  preview: { width: 72, height: 72, borderRadius: 8, marginRight: 8 },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  reviewTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  saveBtn: { backgroundColor: '#004F9F', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabled: { opacity: 0.4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EBE0C8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardSelected: { borderColor: '#6CB5E8', backgroundColor: '#E6F4FC' },
  checkbox: { marginRight: 10 },
  checkboxText: { fontSize: 20 },
  cardFields: { flex: 1, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#EBE0C8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#FEFDF7',
  },
});
