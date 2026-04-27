import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const DEFAULT_API_BASE_URL = 'http://192.168.xx.xx:8000';

const normalizeApiBaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

type RatingResponse = {
  model: string;
  attractiveProbability: number;
  notAttractiveProbability: number;
  choppedScore: number;
  label: string;
  roasts: string[];
};

export default function App() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(
    normalizeApiBaseUrl(DEFAULT_API_BASE_URL)
  );

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access first.');
      return;
    }

    const photo = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!photo.canceled) {
      setImageUri(photo.assets[0].uri);
      setResult(null);
    }
  };

  const rateImage = async () => {
    if (!imageUri) return;

    if (!apiBaseUrl) {
      Alert.alert('Missing API URL', 'Set the API base URL before rating an image.');
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append(
      'file',
      {
        uri: imageUri,
        name: 'face.jpg',
        type: 'image/jpeg',
      } as any
    );

    try {
      const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}/rate`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
      }

      setResult(data);
    } catch (error: any) {
      Alert.alert('Upload failed', error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Chopped Scanner</Text>
        <Text style={styles.subtitle}>For entertainment purposes only</Text>

        <View style={styles.configCard}>
          <Text style={styles.configLabel}>API Base URL</Text>
          <TextInput
            style={styles.configInput}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.10:8000"
            placeholderTextColor="#777"
          />
        </View>

        <View style={styles.actions}>
          <Button title="Take a picture" onPress={takePhoto} />
        </View>

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        )}

        {imageUri && (
          <View style={styles.actions}>
            <Button title="Rate how chopped" onPress={rateImage} />
          </View>
        )}

        {loading && <ActivityIndicator size="large" style={styles.loader} />}

        {result && (
          <View style={styles.card}>
            <Text style={styles.score}>{result.choppedScore}/100</Text>
            <Text style={styles.label}>{result.label}</Text>

            <Text style={styles.meta}>
              attractiveProbability: {result.attractiveProbability.toFixed(4)}
            </Text>
            <Text style={styles.meta}>
              notAttractiveProbability: {result.notAttractiveProbability.toFixed(4)}
            </Text>

            <View style={styles.roastBox}>
              {result.roasts.map((line, index) => (
                <Text key={index} style={styles.roast}>
                  • {line}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#111',
  },
  container: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    marginTop: 24,
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
  },
  subtitle: {
    color: '#aaa',
    marginBottom: 8,
  },
  configCard: {
    width: '100%',
    backgroundColor: '#1b1b1b',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  configLabel: {
    color: '#cfcfcf',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  configInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    backgroundColor: '#111',
  },
  actions: {
    width: '100%',
    marginVertical: 8,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 360,
    borderRadius: 20,
    marginTop: 12,
  },
  loader: {
    marginTop: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1b1b1b',
    borderRadius: 20,
    padding: 20,
    marginTop: 24,
  },
  score: {
    fontSize: 44,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
  },
  label: {
    fontSize: 22,
    color: '#ff7b7b',
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  meta: {
    color: '#cfcfcf',
    fontSize: 14,
    marginBottom: 4,
  },
  roastBox: {
    marginTop: 16,
    gap: 8,
  },
  roast: {
    color: 'white',
    fontSize: 16,
  },
});